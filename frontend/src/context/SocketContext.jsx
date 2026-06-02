import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);
const BACKEND_URL = 'https://randomchat-backend-0ph8.onrender.com';

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('idle'); // idle | waking | connecting | connected | error
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    let s = null;

    async function wakeAndConnect() {
      setConnectionStatus('waking');
      setErrorMsg(null);

      try {
        // STEP 1: Sveglia il backend con una richiesta HTTP (Render free si sveglia solo con HTTP)
        const wakeRes = await fetch(`${BACKEND_URL}/health`, {
          method: 'GET',
          mode: 'cors',
          cache: 'no-store'
        });
        if (wakeRes.ok) {
          console.log('Backend svegliato!');
        }
      } catch (e) {
        console.warn('Wake up fallito (backend potrebbe essere dormiente):', e);
      }

      // STEP 2: Aspetta 2 secondi che Render si avvii completamente
      await new Promise(r => setTimeout(r, 2000));

      setConnectionStatus('connecting');

      // STEP 3: Connetti Socket.io
      s = io(BACKEND_URL, {
        transports: ['websocket', 'polling'], // fallback se websocket fallisce
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
        console.log('Socket disconnesso:', reason);
      });

      s.on('connect_error', (err) => {
        setConnected(false);
        setConnectionStatus('error');
        setErrorMsg(`Errore connessione: ${err.message}`);
        console.error('Errore connessione:', err.message);
      });

      s.on('session_created', ({ sessionId }) => setSessionId(sessionId));
    }

    wakeAndConnect();

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
