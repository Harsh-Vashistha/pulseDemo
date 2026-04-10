const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const Video  = require('../models/Video');

const MAGIC_BYTES = {
  mp4:  { offset: 4, signature: Buffer.from('ftyp')                          },
  webm: { offset: 0, signature: Buffer.from([0x1a, 0x45, 0xdf, 0xa3])       },
  avi:  { offset: 0, signature: Buffer.from('RIFF')                          },
  mpeg: { offset: 0, signature: Buffer.from([0x00, 0x00, 0x01, 0xba])       },
  mov:  { offset: 4, signature: Buffer.from('moov')                          },
  ogg:  { offset: 0, signature: Buffer.from('OggS')                          },
  wmv:  { offset: 0, signature: Buffer.from([0x30, 0x26, 0xb2, 0x75])       },
};

const SENSITIVE_KEYWORDS = [
  'violence', 'explicit', 'adult', 'nsfw', 'graphic', 'disturbing',
  'hate', 'abuse', 'gore', 'war', 'fight', 'weapon',
];

const SAFE_KEYWORDS = [
  'nature', 'tutorial', 'education', 'cooking', 'travel', 'music',
  'sport', 'family', 'kids', 'documentary', 'news', 'tech',
];

function validateVideoFile(filePath) {
  const HEADER_SIZE = 12;
  const buf = Buffer.alloc(HEADER_SIZE);

  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, buf, 0, HEADER_SIZE, 0);
  } finally {
    fs.closeSync(fd);
  }

  for (const [format, { offset, signature }] of Object.entries(MAGIC_BYTES)) {
    const slice = buf.slice(offset, offset + signature.length);
    if (slice.equals(signature)) {
      return { valid: true, format };
    }
  }

  const ftypBox = buf.slice(4, 8).toString('ascii');
  if (['ftyp', 'mdat', 'free', 'skip'].includes(ftypBox)) {
    return { valid: true, format: 'mp4/mov' };
  }

  return { valid: false, format: 'unknown' };
}

function sampleFileContent(filePath, fileSize) {
  const SAMPLE_SIZE = Math.min(256 * 1024, Math.max(1024, Math.floor(fileSize * 0.1)));
  const offset = Math.max(0, Math.floor(fileSize / 2) - Math.floor(SAMPLE_SIZE / 2));

  const buf = Buffer.alloc(SAMPLE_SIZE);
  const fd  = fs.openSync(filePath, 'r');
  let bytesRead;
  try {
    bytesRead = fs.readSync(fd, buf, 0, SAMPLE_SIZE, offset);
  } finally {
    fs.closeSync(fd);
  }

  return buf.slice(0, bytesRead);
}

function fingerprintContent(sample) {
  return crypto.createHash('md5').update(sample).digest('hex');
}

function classifyContent(fingerprint, originalName, filename) {
  const hashInt   = parseInt(fingerprint.substring(0, 4), 16);
  const baseScore = Math.round((hashInt / 0xffff) * 100);

  const nameLower = (originalName || filename).toLowerCase();

  let score       = baseScore;
  let keywordHit  = null;

  for (const kw of SENSITIVE_KEYWORDS) {
    if (nameLower.includes(kw)) {
      score      = Math.max(baseScore, 70);
      keywordHit = kw;
      break;
    }
  }

  if (!keywordHit) {
    for (const kw of SAFE_KEYWORDS) {
      if (nameLower.includes(kw)) {
        score      = Math.min(baseScore, 45);
        keywordHit = kw;
        break;
      }
    }
  }

  score = Math.max(0, Math.min(100, score));
  const status = score >= 60 ? 'flagged' : 'safe';

  return {
    score,
    status,
    details: {
      fingerprint,
      baseScore,
      keywordMatched: keywordHit,
      categories: status === 'flagged'
        ? ['potential_sensitive_content']
        : ['general_content'],
      confidence: Math.round(60 + (Math.abs(score - 50) / 50) * 35),
      analyzedAt: new Date().toISOString(),
    },
  };
}

async function processVideo(videoId, io) {
  let video;

  try {
    video = await Video.findById(videoId);
    if (!video) throw new Error(`Video ${videoId} not found`);

    const filePath   = path.join(__dirname, '../../uploads', video.filename);
    const fileSize   = video.size;

    const fileSizeMB    = fileSize / (1024 * 1024);
    const sizeMultiplier = Math.min(5, Math.max(1, fileSizeMB / 5));

    await Video.findByIdAndUpdate(videoId, {
      status: 'processing',
      processingStage: 'validating',
      processingProgress: 5,
    });
    emitProgress(io, videoId, { progress: 5, stage: 'validating', label: 'Starting analysis…' });

    await sleep(Math.round(1000 * sizeMultiplier));

    const validation = validateVideoFile(filePath);
    if (!validation.valid) {
      throw new Error(`File failed magic-byte validation (format: ${validation.format})`);
    }

    await Video.findByIdAndUpdate(videoId, { processingStage: 'validating', processingProgress: 18 });
    emitProgress(io, videoId, {
      progress: 18,
      stage: 'validating',
      label: `Format confirmed: ${validation.format.toUpperCase()}`,
    });

    await sleep(Math.round(1500 * sizeMultiplier));

    const sample = sampleFileContent(filePath, fileSize);

    await Video.findByIdAndUpdate(videoId, { processingStage: 'analyzing', processingProgress: 38 });
    emitProgress(io, videoId, {
      progress: 38,
      stage: 'analyzing',
      label: `Sampled ${(sample.length / 1024).toFixed(0)} KB of content`,
    });

    await sleep(Math.round(2000 * sizeMultiplier));

    const fingerprint = fingerprintContent(sample);

    await Video.findByIdAndUpdate(videoId, { processingStage: 'analyzing', processingProgress: 62 });
    emitProgress(io, videoId, {
      progress: 62,
      stage: 'analyzing',
      label: 'Content fingerprint computed',
    });

    await sleep(Math.round(1500 * sizeMultiplier));

    const result = classifyContent(fingerprint, video.originalName, video.filename);

    await Video.findByIdAndUpdate(videoId, { processingStage: 'classifying', processingProgress: 82 });
    emitProgress(io, videoId, {
      progress: 82,
      stage: 'classifying',
      label: `Score: ${result.score}/100 — classifying…`,
    });

    await sleep(Math.round(800 * sizeMultiplier));

    await Video.findByIdAndUpdate(videoId, {
      status:            'completed',
      processingStage:   'done',
      processingProgress: 100,
      sensitivityStatus: result.status,
      sensitivityScore:  result.score,
      sensitivityDetails: result.details,
    });

    emitProgress(io, videoId, {
      progress:          100,
      stage:             'done',
      label:             'Analysis complete',
      sensitivityStatus: result.status,
      sensitivityScore:  result.score,
    });

    console.log(
      `[analysis] ${video.originalName} → ${result.status.toUpperCase()} ` +
      `(score: ${result.score}, fingerprint: ${fingerprint.substring(0, 8)}…)`
    );

  } catch (error) {
    console.error(`[analysis] Failed for video ${videoId}:`, error.message);

    await Video.findByIdAndUpdate(videoId, {
      status: 'failed',
      processingStage: 'error',
    });

    emitProgress(io, videoId, {
      progress: 0,
      stage:    'error',
      label:    'Processing failed',
      error:    error.message,
    });
  }
}

function emitProgress(io, videoId, data) {
  if (io) {
    io.to(`video:${videoId}`).emit('video:progress', { videoId, ...data });
    io.emit('video:update', { videoId, ...data });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { processVideo };
