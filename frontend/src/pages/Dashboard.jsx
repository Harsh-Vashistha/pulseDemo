import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { videoAPI, adminAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import VideoUpload from '../components/VideoUpload';
import ProcessingCard from '../components/ProcessingCard';

export default function Dashboard() {
  const { user, isAdmin, isEditor } = useAuth();
  const { onVideoUpdate } = useSocket();
  const [recentVideos, setRecentVideos] = useState([]);
  const [processingVideos, setProcessingVideos] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [videosRes, processingRes] = await Promise.all([
        videoAPI.list({ limit: 6, sortBy: 'createdAt', sortOrder: 'desc' }),
        videoAPI.list({ status: 'processing', limit: 10 }),
      ]);

      setRecentVideos(videosRes.data.data);
      setProcessingVideos(processingRes.data.data);

      if (isAdmin) {
        const statsRes = await adminAPI.getStats();
        setStats(statsRes.data.data);
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Listen for real-time updates to refresh processing list
  useEffect(() => {
    const cleanup = onVideoUpdate((data) => {
      if (data.stage === 'done' || data.stage === 'error') {
        // Refresh lists when a video finishes processing
        fetchData();
      } else {
        // Update progress in existing processing cards
        setProcessingVideos((prev) =>
          prev.map((v) =>
            v._id === data.videoId
              ? { ...v, processingProgress: data.progress, processingStage: data.stage }
              : v
          )
        );
      }
    });
    return cleanup;
  }, [onVideoUpdate, fetchData]);

  const handleUploadComplete = (video) => {
    setShowUpload(false);
    setProcessingVideos((prev) => [video, ...prev]);
    setRecentVideos((prev) => [video, ...prev.slice(0, 5)]);
  };

  const statusColors = {
    completed: 'text-green-400',
    processing: 'text-blue-400',
    pending: 'text-yellow-400',
    failed: 'text-red-400',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">Welcome back, {user?.username}</p>
        </div>
        {isEditor && (
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors"
          >
            {showUpload ? 'Cancel' : '+ Upload Video'}
          </button>
        )}
      </div>

      {/* Upload panel */}
      {showUpload && (
        <div className="mb-8">
          <VideoUpload onUploadComplete={handleUploadComplete} />
        </div>
      )}

      {/* Admin stats */}
      {isAdmin && stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {[
            { label: 'Total Users', value: stats.totalUsers, color: 'text-blue-400' },
            { label: 'Total Videos', value: stats.totalVideos, color: 'text-purple-400' },
            { label: 'Processing', value: stats.processingVideos, color: 'text-yellow-400' },
            { label: 'Safe', value: stats.safeVideos, color: 'text-green-400' },
            { label: 'Flagged', value: stats.flaggedVideos, color: 'text-red-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-gray-500 text-xs mt-1">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Currently processing */}
      {processingVideos.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">Currently Processing</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {processingVideos.map((video) => (
              <ProcessingCard
                key={video._id}
                video={video}
                onComplete={fetchData}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recent videos */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Recent Videos</h2>
          <Link to="/library" className="text-blue-400 hover:text-blue-300 text-sm">View all →</Link>
        </div>

        {recentVideos.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
            <p className="text-4xl mb-3">🎬</p>
            <p className="text-gray-400">No videos yet.</p>
            {isEditor && (
              <button
                onClick={() => setShowUpload(true)}
                className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
              >
                Upload your first video
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {recentVideos.map((video) => (
              <Link
                key={video._id}
                to={`/videos/${video._id}`}
                className="flex items-center gap-4 bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl p-4 transition-colors"
              >
                <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span>🎬</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{video.title}</p>
                  <p className="text-gray-500 text-xs">{(video.size / (1024 * 1024)).toFixed(1)} MB</p>
                </div>
                <span className={`text-xs font-medium capitalize ${statusColors[video.status]}`}>{video.status}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
