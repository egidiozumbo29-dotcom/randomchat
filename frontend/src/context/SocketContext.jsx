import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Se deployato sulla stessa origine del backend, usa l'URL corrente
    const apiUrl = import.meta.env.VITE_API_URL || undefined;
    const s = io(apiUrl);
    setSocket(s);

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('session_created', ({ sessionId }) => setSessionId(sessionId));

    return () => {
      s.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, sessionId, connected }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
