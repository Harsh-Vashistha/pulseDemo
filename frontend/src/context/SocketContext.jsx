import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');

    socketRef.current = io('/', {
      auth: { token },
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    socketRef.current.on('connect', () => setConnected(true));
    socketRef.current.on('disconnect', () => setConnected(false));

    return () => {
      socketRef.current?.disconnect();
    };
  }, [user]);

  const joinVideoRoom = (videoId) => {
    socketRef.current?.emit('video:join', videoId);
  };

  const leaveVideoRoom = (videoId) => {
    socketRef.current?.emit('video:leave', videoId);
  };

  const onVideoProgress = (callback) => {
    socketRef.current?.on('video:progress', callback);
    return () => socketRef.current?.off('video:progress', callback);
  };

  const onVideoUpdate = (callback) => {
    socketRef.current?.on('video:update', callback);
    return () => socketRef.current?.off('video:update', callback);
  };

  return (
    <SocketContext.Provider value={{
      socket: socketRef.current,
      connected,
      joinVideoRoom,
      leaveVideoRoom,
      onVideoProgress,
      onVideoUpdate,
    }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
};
