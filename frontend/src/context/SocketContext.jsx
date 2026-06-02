import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);
const BACKEND_URL = 'https://lectures-ellis-coast-overall.trycloudflare.com';

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    let s = null;

    async function connectSocket() {
      setConnectionStatus('connecting');
      setErrorMsg(null);

      s = io(BACKEND_URL, {
        transports: ['websocket', 'polling'],
        timeout: 20000,
        reconnectionAttempts: 5,
        reconnectionDelay: 2000
      });
      setSocket(s);

      s.on('connect', () => {
        setConnected(true);
        setConnectionStatus('connected');
        setErrorMsg(null);
        console.log('Socket connesso! ID:', s.id);
      });

      s.on('disconnect', (reason) => {
        setConnected(false);
        setConnectionStatus('error');
        setErrorMsg(`Disconnesso: ${reason}`);
      });

      s.on('connect_error', (err) => {
        setConnected(false);
        setConnectionStatus('error');
        setErrorMsg(`Errore: ${err.message}`);
      });

      s.on('session_created', ({ sessionId }) => setSessionId(sessionId));
    }

    connectSocket();

    return () => {
      if (s) s.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, sessionId, connected, connectionStatus, errorMsg }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
