import React, { useState, useEffect, useCallback } from 'react';
import { videoAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import VideoCard from '../components/VideoCard';
import VideoUpload from '../components/VideoUpload';

export default function Library() {
  const { isEditor } = useAuth();
  const { onVideoUpdate } = useSocket();
  const [videos, setVideos] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [filters, setFilters] = useState({
    status: '',
    sensitivityStatus: '',
    search: '',
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });
  const [page, setPage] = useState(1);

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 12, ...filters };
      Object.keys(params).forEach((k) => !params[k] && delete params[k]);
      const res = await videoAPI.list(params);
      setVideos(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) {
      console.error('Library fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  useEffect(() => {
    const cleanup = onVideoUpdate((data) => {
      setVideos((prev) =>
        prev.map((v) =>
          v._id === data.videoId
            ? {
                ...v,
                processingProgress: data.progress,
                processingStage: data.stage,
                status: data.stage === 'done' ? 'completed' : data.stage === 'error' ? 'failed' : v.status,
                sensitivityStatus: data.sensitivityStatus || v.sensitivityStatus,
              }
            : v
        )
      );
    });
    return cleanup;
  }, [onVideoUpdate]);

  const handleDelete = async (videoId) => {
    if (!confirm('Delete this video?')) return;
    try {
      await videoAPI.delete(videoId);
      setVideos((prev) => prev.filter((v) => v._id !== videoId));
    } catch (err) {
      alert('Failed to delete video.');
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Video Library</h1>
          <p className="text-gray-400 text-sm mt-1">{pagination.total} videos total</p>
        </div>
        {isEditor && (
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors"
          >
            {showUpload ? 'Cancel' : '+ Upload'}
          </button>
        )}
      </div>

      {showUpload && (
        <div className="mb-6">
          <VideoUpload onUploadComplete={(v) => { setShowUpload(false); fetchVideos(); }} />
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          placeholder="Search videos..."
          value={filters.search}
          onChange={(e) => handleFilterChange('search', e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 flex-1 min-w-48"
        />

        <select
          value={filters.status}
          onChange={(e) => handleFilterChange('status', e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>

        <select
          value={filters.sensitivityStatus}
          onChange={(e) => handleFilterChange('sensitivityStatus', e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
        >
          <option value="">All content</option>
          <option value="safe">Safe</option>
          <option value="flagged">Flagged</option>
          <option value="unknown">Unknown</option>
        </select>

        <select
          value={`${filters.sortBy}:${filters.sortOrder}`}
          onChange={(e) => {
            const [sortBy, sortOrder] = e.target.value.split(':');
            setFilters((prev) => ({ ...prev, sortBy, sortOrder }));
            setPage(1);
          }}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
        >
          <option value="createdAt:desc">Newest first</option>
          <option value="createdAt:asc">Oldest first</option>
          <option value="title:asc">Title A-Z</option>
          <option value="size:desc">Largest first</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : videos.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-4xl mb-3">🎬</p>
          <p>No videos found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {videos.map((video) => (
            <VideoCard key={video._id} video={video} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button
            onClick={() => setPage((p) => p - 1)}
            disabled={page === 1}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-white rounded-lg text-sm transition-colors"
          >
            ← Prev
          </button>
          <span className="text-gray-400 text-sm">Page {page} of {pagination.pages}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page === pagination.pages}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-white rounded-lg text-sm transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
