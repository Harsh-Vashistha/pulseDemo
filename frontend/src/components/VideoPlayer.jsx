import React, { useRef, useState, useEffect } from 'react';
import { videoAPI } from '../api';

export default function VideoPlayer({ video }) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState('');

  const token = localStorage.getItem('token');
  const streamUrl = `${videoAPI.getStreamUrl(video._id)}`;

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (playing) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(() => setError('Playback failed. Please try again.'));
    }
  };

  const handleSeek = (e) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) videoRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) videoRef.current.volume = val;
    setMuted(val === 0);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !muted;
    setMuted(!muted);
  };

  const toggleFullscreen = () => {
    const el = videoRef.current?.parentElement;
    if (!document.fullscreenElement) {
      el?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFSChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFSChange);
    return () => document.removeEventListener('fullscreenchange', handleFSChange);
  }, []);

  const formatTime = (s) => {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  if (video.sensitivityStatus === 'flagged') {
    return (
      <div className="rounded-xl bg-red-900/20 border border-red-500/30 p-8 text-center">
        <p className="text-4xl mb-3">⚠️</p>
        <h3 className="text-red-400 font-semibold text-lg">Content Flagged</h3>
        <p className="text-gray-400 text-sm mt-2">This video has been flagged for potentially sensitive content and cannot be played.</p>
      </div>
    );
  }

  return (
    <div className="relative bg-black rounded-xl overflow-hidden group">
      <video
        ref={videoRef}
        src={`/api/videos/${video._id}/stream`}
        className="w-full max-h-[500px] object-contain"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
        onError={() => setError('Failed to load video. Please try again.')}
        preload="metadata"
      />

      {/* Controls overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Progress bar */}
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-1 mb-3 accent-blue-500 cursor-pointer"
        />

        <div className="flex items-center gap-3">
          <button onClick={togglePlay} className="text-white text-xl w-8 h-8 flex items-center justify-center hover:text-blue-400 transition-colors">
            {playing ? '⏸' : '▶'}
          </button>

          <div className="flex items-center gap-2">
            <button onClick={toggleMute} className="text-white text-sm hover:text-blue-400">
              {muted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-20 h-1 accent-blue-500 cursor-pointer"
            />
          </div>

          <span className="text-gray-400 text-xs ml-1">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <button onClick={toggleFullscreen} className="ml-auto text-white text-sm hover:text-blue-400">
            {fullscreen ? '⊡' : '⛶'}
          </button>
        </div>
      </div>

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}
