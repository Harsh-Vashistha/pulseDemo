import React, { useState, useRef, useCallback } from 'react';
import { videoAPI } from '../api';

export default function VideoUpload({ onUploadComplete }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleFile = (selected) => {
    if (!selected) return;
    if (!selected.type.startsWith('video/')) {
      setError('Please select a valid video file.');
      return;
    }
    if (selected.size > 500 * 1024 * 1024) {
      setError('File size must be under 500MB.');
      return;
    }
    setFile(selected);
    setError('');
    if (!title) setTitle(selected.name.replace(/\.[^/.]+$/, ''));
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    handleFile(dropped);
  }, [title]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return setError('Please select a video file.');
    if (!title.trim()) return setError('Please enter a title.');

    setUploading(true);
    setError('');
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('video', file);
      formData.append('title', title.trim());
      if (description) formData.append('description', description.trim());
      if (tags) formData.append('tags', tags);

      const res = await videoAPI.upload(formData, (progressEvent) => {
        const pct = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        setUploadProgress(pct);
      });

      onUploadComplete?.(res.data.data);
      setFile(null);
      setTitle('');
      setDescription('');
      setTags('');
      setUploadProgress(0);
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <h2 className="text-lg font-semibold text-white mb-4">Upload Video</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Drop zone */}
        <div
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            dragging ? 'border-blue-500 bg-blue-500/10' : file ? 'border-green-500 bg-green-500/10' : 'border-gray-700 hover:border-gray-500'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files[0])}
          />
          {file ? (
            <div>
              <p className="text-green-400 font-medium">✓ {file.name}</p>
              <p className="text-gray-500 text-sm mt-1">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
            </div>
          ) : (
            <div>
              <p className="text-4xl mb-2">🎬</p>
              <p className="text-gray-300 font-medium">Drop your video here</p>
              <p className="text-gray-500 text-sm mt-1">or click to browse · MP4, MOV, AVI, WebM · Max 500MB</p>
            </div>
          )}
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter video title"
            maxLength={100}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            rows={2}
            maxLength={500}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Tags (comma-separated)</label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="e.g. nature, travel, tutorial"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        {/* Upload progress */}
        {uploading && (
          <div>
            <div className="flex justify-between text-sm text-gray-400 mb-1">
              <span>Uploading…</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={uploading || !file}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
        >
          {uploading ? 'Uploading...' : 'Upload Video'}
        </button>
      </form>
    </div>
  );
}
