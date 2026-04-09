import React from 'react';
import { Link } from 'react-router-dom';

const statusColors = {
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  processing: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  completed: 'bg-green-500/20 text-green-400 border-green-500/30',
  failed: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const sensitivityColors = {
  safe: 'bg-green-500/20 text-green-400',
  flagged: 'bg-red-500/20 text-red-400',
  unknown: 'bg-gray-500/20 text-gray-400',
};

export default function VideoCard({ video, onDelete }) {
  const formatSize = (bytes) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 transition-all group">
      {/* Thumbnail area */}
      <div className="relative h-40 bg-gray-800 flex items-center justify-center">
        <span className="text-5xl opacity-30">🎬</span>
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 to-transparent" />

        {/* Status badge */}
        <span className={`absolute top-2 right-2 text-xs px-2 py-0.5 rounded-full border ${statusColors[video.status] || statusColors.pending}`}>
          {video.status}
        </span>

        {video.status === 'processing' && (
          <div className="absolute bottom-2 left-2 right-2">
            <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${video.processingProgress || 0}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className="text-white font-medium truncate mb-1" title={video.title}>{video.title}</h3>
        <p className="text-gray-500 text-xs mb-3">{formatDate(video.createdAt)} · {formatSize(video.size)}</p>

        <div className="flex items-center justify-between">
          {video.sensitivityStatus !== 'unknown' && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${sensitivityColors[video.sensitivityStatus]}`}>
              {video.sensitivityStatus === 'safe' ? '✓ Safe' : '⚠ Flagged'}
            </span>
          )}

          <div className="flex gap-2 ml-auto">
            {video.status === 'completed' && (
              <Link
                to={`/videos/${video._id}`}
                className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Play
              </Link>
            )}
            <Link
              to={`/videos/${video._id}`}
              className="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              View
            </Link>
          </div>
        </div>

        {video.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {video.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">{tag}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
