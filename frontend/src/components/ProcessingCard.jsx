import React, { useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext';

const stageLabels = {
  queued: 'Queued',
  validating: 'Validating file',
  analyzing: 'Analyzing content',
  classifying: 'Classifying',
  finalizing: 'Finalizing',
  done: 'Complete',
  error: 'Failed',
};

export default function ProcessingCard({ video: initialVideo, onComplete }) {
  const { joinVideoRoom, onVideoProgress } = useSocket();
  const [video, setVideo] = useState(initialVideo);

  useEffect(() => {
    setVideo(initialVideo);
  }, [initialVideo]);

  useEffect(() => {
    if (video.status === 'completed' || video.status === 'failed') return;

    joinVideoRoom(video._id);

    const cleanup = onVideoProgress((data) => {
      if (data.videoId === video._id) {
        setVideo((prev) => ({
          ...prev,
          processingProgress: data.progress,
          processingStage: data.stage,
          status: data.stage === 'done' ? 'completed' : data.stage === 'error' ? 'failed' : 'processing',
          sensitivityStatus: data.sensitivityStatus || prev.sensitivityStatus,
        }));

        if (data.stage === 'done') {
          onComplete?.(video._id);
        }
      }
    });

    return cleanup;
  }, [video._id, video.status]);

  const progress = video.processingProgress || 0;
  const stage = video.processingStage || 'queued';
  const isDone = video.status === 'completed';
  const isFailed = video.status === 'failed';

  return (
    <div className={`bg-gray-900 border rounded-xl p-4 ${isFailed ? 'border-red-500/30' : isDone ? 'border-green-500/30' : 'border-blue-500/30'}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="text-white text-sm font-medium truncate max-w-xs">{video.title}</h4>
          <p className="text-gray-500 text-xs mt-0.5">{stageLabels[stage] || stage}</p>
        </div>
        <span className={`text-xs font-bold ${isFailed ? 'text-red-400' : isDone ? 'text-green-400' : 'text-blue-400'}`}>
          {isFailed ? 'Failed' : isDone ? '100%' : `${progress}%`}
        </span>
      </div>

      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${isFailed ? 'bg-red-500' : isDone ? 'bg-green-500' : 'bg-blue-500 animate-pulse'}`}
          style={{ width: `${isDone ? 100 : progress}%` }}
        />
      </div>

      {isDone && video.sensitivityStatus && (
        <p className={`text-xs mt-2 ${video.sensitivityStatus === 'safe' ? 'text-green-400' : 'text-red-400'}`}>
          {video.sensitivityStatus === 'safe' ? '✓ Classified as safe' : '⚠ Flagged for review'}
        </p>
      )}
    </div>
  );
}
