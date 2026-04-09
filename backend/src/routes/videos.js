const express = require('express');
const fs = require('fs');
const path = require('path');
const { body, query, validationResult } = require('express-validator');
const Video = require('../models/Video');
const upload = require('../config/multer');
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { processVideo } = require('../services/sensitivityAnalysis');
const { getIO } = require('../socket');

const router = express.Router();

// All routes require authentication
router.use(protect);

// GET /api/videos - list videos with filtering
router.get(
  '/',
  [
    query('status').optional().isIn(['pending', 'processing', 'completed', 'failed']),
    query('sensitivityStatus').optional().isIn(['unknown', 'safe', 'flagged']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
  ],
  async (req, res) => {
    try {
      const { status, sensitivityStatus, search, page = 1, limit = 12, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

      const filter = { isDeleted: false };

      // Multi-tenant: non-admins only see their own videos
      if (req.user.role !== 'admin') {
        filter.uploadedBy = req.user._id;
      }

      if (status) filter.status = status;
      if (sensitivityStatus) filter.sensitivityStatus = sensitivityStatus;
      if (search) {
        filter.$or = [
          { title: { $regex: search, $options: 'i' } },
          { originalName: { $regex: search, $options: 'i' } },
          { tags: { $in: [new RegExp(search, 'i')] } },
        ];
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const sortObj = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

      const [videos, total] = await Promise.all([
        Video.find(filter)
          .populate('uploadedBy', 'username email')
          .sort(sortObj)
          .skip(skip)
          .limit(parseInt(limit)),
        Video.countDocuments(filter),
      ]);

      res.json({
        success: true,
        data: videos,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error('List videos error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch videos.' });
    }
  }
);

// POST /api/videos/upload - upload a video (editors and admins)
router.post(
  '/upload',
  requireRole('editor', 'admin'),
  (req, res, next) => {
    upload.single('video')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ success: false, message: err.message });
      }
      next();
    });
  },
  [
    body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 100 }),
    body('description').optional().trim().isLength({ max: 500 }),
    body('tags').optional(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Clean up uploaded file on validation error
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No video file provided.' });
    }

    try {
      const { title, description, tags } = req.body;
      const parsedTags = tags ? (Array.isArray(tags) ? tags : tags.split(',').map((t) => t.trim())) : [];

      const video = await Video.create({
        title,
        description,
        tags: parsedTags,
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        uploadedBy: req.user._id,
        organizationId: req.user.organizationId,
      });

      // Start async processing (don't await - returns immediately)
      setImmediate(() => {
        try {
          const io = getIO();
          processVideo(video._id.toString(), io);
        } catch (e) {
          processVideo(video._id.toString(), null);
        }
      });

      res.status(201).json({
        success: true,
        message: 'Video uploaded successfully. Processing started.',
        data: video,
      });
    } catch (error) {
      if (req.file) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      console.error('Upload error:', error);
      res.status(500).json({ success: false, message: 'Failed to save video.' });
    }
  }
);

// GET /api/videos/:id - get single video
router.get('/:id', async (req, res) => {
  try {
    const video = await Video.findOne({ _id: req.params.id, isDeleted: false }).populate('uploadedBy', 'username email');

    if (!video) {
      return res.status(404).json({ success: false, message: 'Video not found.' });
    }

    // Access control: non-admin can only access their own videos
    if (req.user.role !== 'admin' && video.uploadedBy._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    res.json({ success: true, data: video });
  } catch (error) {
    console.error('Get video error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch video.' });
  }
});

// PATCH /api/videos/:id - update video metadata (editors and admins)
router.patch(
  '/:id',
  requireRole('editor', 'admin'),
  [
    body('title').optional().trim().notEmpty().isLength({ max: 100 }),
    body('description').optional().trim().isLength({ max: 500 }),
    body('tags').optional(),
  ],
  async (req, res) => {
    try {
      const video = await Video.findOne({ _id: req.params.id, isDeleted: false });

      if (!video) {
        return res.status(404).json({ success: false, message: 'Video not found.' });
      }

      if (req.user.role !== 'admin' && video.uploadedBy.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }

      const { title, description, tags } = req.body;
      if (title !== undefined) video.title = title;
      if (description !== undefined) video.description = description;
      if (tags !== undefined) {
        video.tags = Array.isArray(tags) ? tags : tags.split(',').map((t) => t.trim());
      }

      await video.save();

      res.json({ success: true, data: video });
    } catch (error) {
      console.error('Update video error:', error);
      res.status(500).json({ success: false, message: 'Failed to update video.' });
    }
  }
);

// DELETE /api/videos/:id - soft delete (editors and admins)
router.delete('/:id', requireRole('editor', 'admin'), async (req, res) => {
  try {
    const video = await Video.findOne({ _id: req.params.id, isDeleted: false });

    if (!video) {
      return res.status(404).json({ success: false, message: 'Video not found.' });
    }

    if (req.user.role !== 'admin' && video.uploadedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    video.isDeleted = true;
    await video.save();

    res.json({ success: true, message: 'Video deleted successfully.' });
  } catch (error) {
    console.error('Delete video error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete video.' });
  }
});

// GET /api/videos/:id/stream - stream video with range request support
router.get('/:id/stream', async (req, res) => {
  try {
    const video = await Video.findOne({ _id: req.params.id, isDeleted: false });

    if (!video) {
      return res.status(404).json({ success: false, message: 'Video not found.' });
    }

    // Access control
    if (req.user.role !== 'admin' && video.uploadedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    if (video.status !== 'completed') {
      return res.status(400).json({ success: false, message: 'Video is not ready for streaming.' });
    }

    const videoPath = path.join(__dirname, '../../uploads', video.filename);

    if (!fs.existsSync(videoPath)) {
      return res.status(404).json({ success: false, message: 'Video file not found on server.' });
    }

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      // Parse range header
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      if (start >= fileSize || end >= fileSize) {
        return res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
      }

      const fileStream = fs.createReadStream(videoPath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': video.mimetype,
      });

      fileStream.pipe(res);
    } else {
      // Full file
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': video.mimetype,
        'Accept-Ranges': 'bytes',
      });

      fs.createReadStream(videoPath).pipe(res);
    }
  } catch (error) {
    console.error('Stream error:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Streaming failed.' });
    }
  }
});

module.exports = router;
