const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    filename: {
      type: String,
      required: true,
    },
    originalName: {
      type: String,
      required: true,
    },
    mimetype: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    organizationId: {
      type: String,
      required: true,
    },
    // Processing status
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    processingProgress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    processingStage: {
      type: String,
      enum: ['queued', 'validating', 'analyzing', 'classifying', 'finalizing', 'done', 'error'],
      default: 'queued',
    },
    // Sensitivity analysis result
    sensitivityStatus: {
      type: String,
      enum: ['unknown', 'safe', 'flagged'],
      default: 'unknown',
    },
    sensitivityScore: {
      type: Number,
      default: null,
    },
    sensitivityDetails: {
      type: Object,
      default: null,
    },
    // Video metadata
    duration: {
      type: Number,
      default: null,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    tags: {
      type: [String],
      default: [],
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Index for filtering
videoSchema.index({ uploadedBy: 1, status: 1 });
videoSchema.index({ organizationId: 1 });
videoSchema.index({ sensitivityStatus: 1 });

module.exports = mongoose.model('Video', videoSchema);
