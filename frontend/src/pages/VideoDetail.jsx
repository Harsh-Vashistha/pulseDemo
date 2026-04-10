import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { videoAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import VideoPlayer from '../components/VideoPlayer';
import ProcessingCard from '../components/ProcessingCard';

export default function VideoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isEditor, isAdmin } = useAuth();
  const { joinVideoRoom } = useSocket();
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', description: '', tags: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    videoAPI.get(id)
      .then((res) => {
        setVideo(res.data.data);
        setEditForm({
          title: res.data.data.title,
          description: res.data.data.description || '',
          tags: res.data.data.tags?.join(', ') || '',
        });
        if (res.data.data.status !== 'completed') {
          joinVideoRoom(id);
        }
      })
      .catch(() => setError('Video not found or access denied.'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await videoAPI.update(id, {
        title: editForm.title,
        description: editForm.description,
        tags: editForm.tags,
      });
      setVideo(res.data.data);
      setEditing(false);
    } catch (err) {
      setError('Failed to update video.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this video permanently?')) return;
    try {
      await videoAPI.delete(id);
      navigate('/library');
    } catch {
      setError('Failed to delete video.');
    }
  };

  const canEdit = isAdmin || (isEditor && video?.uploadedBy?._id === user?.id);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-400">{error || 'Video not found.'}</p>
        <Link to="/library" className="text-blue-400 hover:underline mt-4 inline-block">Back to Library</Link>
      </div>
    );
  }

  const sensitivityBadge = {
    safe: 'bg-green-500/20 text-green-400 border-green-500/30',
    flagged: 'bg-red-500/20 text-red-400 border-red-500/30',
    unknown: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link to="/library" className="text-gray-400 hover:text-white text-sm mb-6 inline-block">← Back to Library</Link>

      <div className="mb-6">
        {video.status === 'completed' ? (
          <VideoPlayer video={video} />
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <ProcessingCard
              video={video}
              onComplete={() => videoAPI.get(id).then((r) => setVideo(r.data.data))}
            />
          </div>
        )}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        {editing ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Title</label>
              <input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Description</label>
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                rows={3}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Tags (comma-separated)</label>
              <input
                value={editForm.tags}
                onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-xl font-bold text-white">{video.title}</h1>
              <div className="flex gap-2">
                {canEdit && (
                  <>
                    <button onClick={() => setEditing(true)} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">Edit</button>
                    <button onClick={handleDelete} className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg text-sm">Delete</button>
                  </>
                )}
              </div>
            </div>

            {video.description && <p className="text-gray-400 text-sm mt-2">{video.description}</p>}

            <div className="flex flex-wrap gap-3 mt-4">
              <span className={`text-xs px-3 py-1 rounded-full border ${sensitivityBadge[video.sensitivityStatus]}`}>
                {video.sensitivityStatus === 'safe' ? '✓ Safe' : video.sensitivityStatus === 'flagged' ? '⚠ Flagged' : 'Analyzing...'}
              </span>
              {video.sensitivityScore !== null && (
                <span className="text-xs px-3 py-1 rounded-full bg-gray-700 text-gray-300">
                  Score: {video.sensitivityScore}/100
                </span>
              )}
              <span className="text-xs px-3 py-1 rounded-full bg-gray-700 text-gray-300 capitalize">{video.status}</span>
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              {[
                { label: 'Uploaded by', value: video.uploadedBy?.username || 'Unknown' },
                { label: 'File size', value: `${(video.size / (1024 * 1024)).toFixed(1)} MB` },
                { label: 'Type', value: video.mimetype },
                { label: 'Uploaded', value: new Date(video.createdAt).toLocaleDateString() },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-800 rounded-lg p-3">
                  <p className="text-gray-500 text-xs">{label}</p>
                  <p className="text-white text-sm mt-0.5 truncate">{value}</p>
                </div>
              ))}
            </div>

            {video.tags?.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {video.tags.map((tag) => (
                  <span key={tag} className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded">{tag}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
