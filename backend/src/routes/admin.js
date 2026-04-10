const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Video = require('../models/Video');
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

const router = express.Router();

router.use(protect, requireRole('admin'));

router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20, role, search } = req.query;
    const filter = {};

    if (role) filter.role = role;
    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      User.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: users,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch users.' });
  }
});

router.patch(
  '/users/:id/role',
  [body('role').isIn(['viewer', 'editor', 'admin']).withMessage('Invalid role')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      if (req.params.id === req.user._id.toString()) {
        return res.status(400).json({ success: false, message: 'You cannot change your own role.' });
      }

      const user = await User.findByIdAndUpdate(req.params.id, { role: req.body.role }, { new: true });

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }

      res.json({ success: true, data: user });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to update role.' });
    }
  }
);

router.patch('/users/:id/status', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: req.body.isActive },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update status.' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const [
      totalUsers,
      totalVideos,
      processingVideos,
      flaggedVideos,
      safeVideos,
    ] = await Promise.all([
      User.countDocuments(),
      Video.countDocuments({ isDeleted: false }),
      Video.countDocuments({ status: 'processing', isDeleted: false }),
      Video.countDocuments({ sensitivityStatus: 'flagged', isDeleted: false }),
      Video.countDocuments({ sensitivityStatus: 'safe', isDeleted: false }),
    ]);

    res.json({
      success: true,
      data: { totalUsers, totalVideos, processingVideos, flaggedVideos, safeVideos },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch stats.' });
  }
});

module.exports = router;
