/**
 * Simulated video sensitivity analysis service.
 *
 * In a real implementation, this would integrate with a video AI API
 * (e.g., AWS Rekognition, Google Video Intelligence, or a custom ML model).
 * Here we simulate the processing pipeline with realistic timing and logic.
 */

const Video = require('../models/Video');

// Keywords that suggest potentially sensitive content in filenames
const SENSITIVE_KEYWORDS = [
  'violence', 'explicit', 'adult', 'nsfw', 'graphic', 'disturbing',
  'hate', 'abuse', 'gore', 'war', 'fight', 'weapon',
];

const SAFE_KEYWORDS = [
  'nature', 'tutorial', 'education', 'cooking', 'travel', 'music',
  'sport', 'family', 'kids', 'documentary', 'news', 'tech',
];

/**
 * Determines sensitivity classification based on filename heuristics + randomness.
 * Returns { score: 0-100, status: 'safe'|'flagged', details }
 */
function analyzeContent(filename, originalName) {
  const nameLower = (originalName || filename).toLowerCase();

  let score = Math.random() * 40 + 20; // base: 20-60

  // Bump score if sensitive keywords found
  for (const kw of SENSITIVE_KEYWORDS) {
    if (nameLower.includes(kw)) {
      score += 40;
      break;
    }
  }

  // Lower score if safe keywords found
  for (const kw of SAFE_KEYWORDS) {
    if (nameLower.includes(kw)) {
      score -= 20;
      break;
    }
  }

  score = Math.max(0, Math.min(100, score));

  const status = score >= 60 ? 'flagged' : 'safe';

  return {
    score: Math.round(score),
    status,
    details: {
      categories: status === 'flagged'
        ? ['potential_sensitive_content']
        : ['general_content'],
      confidence: Math.round(70 + Math.random() * 25),
      analyzedAt: new Date().toISOString(),
    },
  };
}

/**
 * Processes a video through the sensitivity analysis pipeline.
 * Emits Socket.io progress events during processing.
 */
async function processVideo(videoId, io) {
  const stages = [
    { stage: 'validating', progress: 10, label: 'Validating file format', delay: 1500 },
    { stage: 'analyzing', progress: 30, label: 'Extracting video frames', delay: 2500 },
    { stage: 'analyzing', progress: 55, label: 'Running content analysis', delay: 3000 },
    { stage: 'classifying', progress: 75, label: 'Classifying content', delay: 2000 },
    { stage: 'finalizing', progress: 90, label: 'Finalizing results', delay: 1500 },
  ];

  try {
    // Mark as processing
    await Video.findByIdAndUpdate(videoId, {
      status: 'processing',
      processingStage: 'validating',
      processingProgress: 5,
    });

    emitProgress(io, videoId, { progress: 5, stage: 'validating', label: 'Starting analysis...' });

    // Run through stages
    for (const { stage, progress, label, delay } of stages) {
      await sleep(delay);

      await Video.findByIdAndUpdate(videoId, {
        processingStage: stage,
        processingProgress: progress,
      });

      emitProgress(io, videoId, { progress, stage, label });
    }

    // Perform the actual classification
    const video = await Video.findById(videoId);
    if (!video) throw new Error('Video not found');

    const result = analyzeContent(video.filename, video.originalName);

    await sleep(1000);

    // Save final results
    await Video.findByIdAndUpdate(videoId, {
      status: 'completed',
      processingStage: 'done',
      processingProgress: 100,
      sensitivityStatus: result.status,
      sensitivityScore: result.score,
      sensitivityDetails: result.details,
    });

    emitProgress(io, videoId, {
      progress: 100,
      stage: 'done',
      label: 'Analysis complete',
      sensitivityStatus: result.status,
      sensitivityScore: result.score,
    });

    console.log(`Video ${videoId} processed: ${result.status} (score: ${result.score})`);
  } catch (error) {
    console.error(`Error processing video ${videoId}:`, error.message);

    await Video.findByIdAndUpdate(videoId, {
      status: 'failed',
      processingStage: 'error',
    });

    emitProgress(io, videoId, {
      progress: 0,
      stage: 'error',
      label: 'Processing failed',
      error: error.message,
    });
  }
}

function emitProgress(io, videoId, data) {
  if (io) {
    io.to(`video:${videoId}`).emit('video:progress', { videoId, ...data });
    // Also emit to general room for dashboard
    io.emit('video:update', { videoId, ...data });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { processVideo };
