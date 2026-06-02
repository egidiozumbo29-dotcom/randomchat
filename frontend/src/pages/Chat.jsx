import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Send, SkipForward, AlertTriangle, MessageCircle,
  Mic, MicOff, Video, VideoOff, Power, Camera,
  ShieldCheck, Eye, Users, Lock
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import AdSlot from '../components/AdSlot';
import ReportModal from '../components/ReportModal';

const Chat = () => {
  const navigate = useNavigate();
  const { socket } = useSocket();

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const roomIdRef = useRef(null);

  // App states
  const [appState, setAppState] = useState('landing'); // landing | waiting | matched | banned | timeout
  const [roomId, setRoomId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [toast, setToast] = useState(null);
  const [onlineCount, setOnlineCount] = useState(0);
  const [showAdminHint, setShowAdminHint] = useState(false);

  // Media states
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [camDenied, setCamDenied] = useState(false);

  // Keep refs in sync
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);

  // Socket listeners
  useEffect(() => {
    if (!socket) return;

    const onWaiting = () => setAppState('waiting');
    const onMatched = ({ roomId, isInitiator }) => {
      setRoomId(roomId);
      setAppState('matched');
      setMessages([]);
      startPeerConnection(isInitiator, roomId);
    };
    const onPartnerLeft = () => {
      setMessages(prev => [...prev, { system: true, text: "L'utente ha abbandonato la chat." }]);
      closePeerConnection();
      setRemoteStream(null);
      setAppState('waiting');
      setRoomId(null);
      socket.emit('find_partner');
    };
    const onReceiveMessage = ({ sender, text, isMe, warning }) => {
      setMessages(prev => [...prev, { sender, text, isMe, warning }]);
    };
    const onPartnerTyping = () => {
      setTyping(true);
      setTimeout(() => setTyping(false), 1500);
    };
    const onMessageBlocked = ({ reason }) => {
      setToast(reason === 'rate_limit' ? 'Troppi messaggi. Attendi.' : 'Messaggio bloccato dal filtro.');
      setTimeout(() => setToast(null), 3000);
    };
    const onTimeout = () => { closePeerConnection(); setAppState('timeout'); };
    const onBanned = () => { closePeerConnection(); setAppState('banned'); };
    const onReportSent = () => { setToast('Segnalazione inviata.'); setTimeout(() => setToast(null), 3000); };
    const onOnlineCount = (count) => setOnlineCount(count);

    // WebRTC signaling
    const onOffer = async ({ offer }) => {
      try {
        const peer = createPeerConnection(roomIdRef.current);
        await peer.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socket.emit('webrtc-answer', { roomId: roomIdRef.current, answer });
      } catch (e) { console.error(e); }
    };
    const onAnswer = async ({ answer }) => {
      try {
        const peer = pcRef.current;
        if (peer && peer.signalingState !== 'closed') {
          await peer.setRemoteDescription(new RTCSessionDescription(answer));
        }
      } catch (e) { console.error(e); }
    };
    const onIce = async ({ candidate }) => {
      try {
        const peer = pcRef.current;
        if (peer && peer.signalingState !== 'closed') {
          await peer.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (e) { console.error(e); }
    };

    socket.on('waiting', onWaiting);
    socket.on('matched', onMatched);
    socket.on('partner_left', onPartnerLeft);
    socket.on('receive_message', onReceiveMessage);
    socket.on('partner_typing', onPartnerTyping);
    socket.on('message_blocked', onMessageBlocked);
    socket.on('timeout', onTimeout);
    socket.on('banned', onBanned);
    socket.on('report_sent', onReportSent);
    socket.on('online_count', onOnlineCount);
    socket.on('webrtc-offer', onOffer);
    socket.on('webrtc-answer', onAnswer);
    socket.on('webrtc-ice-candidate', onIce);

    return () => {
      socket.off('waiting', onWaiting);
      socket.off('matched', onMatched);
      socket.off('partner_left', onPartnerLeft);
      socket.off('receive_message', onReceiveMessage);
      socket.off('partner_typing', onPartnerTyping);
      socket.off('message_blocked', onMessageBlocked);
      socket.off('timeout', onTimeout);
      socket.off('banned', onBanned);
      socket.off('report_sent', onReportSent);
      socket.off('online_count', onOnlineCount);
      socket.off('webrtc-offer', onOffer);
      socket.off('webrtc-answer', onAnswer);
      socket.off('webrtc-ice-candidate', onIce);
    };
  }, [socket]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Bind video elements
  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream]);
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  // === CAMERA: richiesta UNA SOLA VOLTA ===
  async function requestCamera() {
    if (localStreamRef.current) return; // già attiva
    try {
      setCamDenied(false);
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      localStreamRef.current = stream;
    } catch (err) {
      console.warn('Camera non disponibile:', err);
      setCamDenied(true);
    }
  }

  // === PEER CONNECTION: crea/chiudi senza toccare la camera ===
  function createPeerConnection(currentRoomId) {
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]
    });
    peer.onicecandidate = (event) => {
      if (event.candidate) socket.emit('webrtc-ice-candidate', { roomId: currentRoomId, candidate: event.candidate });
    };
    peer.ontrack = (event) => {
      if (event.streams && event.streams[0]) setRemoteStream(event.streams[0]);
    };
    // Aggiunge i track locali
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        if (!peer.getSenders().find(s => s.track === track)) {
          peer.addTrack(track, localStreamRef.current);
        }
      });
    }
    pcRef.current = peer;
    return peer;
  }

  async function startPeerConnection(initiator, currentRoomId) {
    const peer = createPeerConnection(currentRoomId);
    if (initiator) {
      try {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socket.emit('webrtc-offer', { roomId: currentRoomId, offer });
      } catch (e) { console.error(e); }
    }
  }

  function closePeerConnection() {
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    setRemoteStream(null);
  }

  function cleanupAll() {
    closePeerConnection();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
    setCamDenied(false);
    setMicOn(true);
    setCamOn(true);
  }

  function toggleMic() {
    if (localStreamRef.current) {
      const t = localStreamRef.current.getAudioTracks()[0];
      if (t) { t.enabled = !t.enabled; setMicOn(t.enabled); }
    }
  }
  function toggleCam() {
    if (localStreamRef.current) {
      const t = localStreamRef.current.getVideoTracks()[0];
      if (t) { t.enabled = !t.enabled; setCamOn(t.enabled); }
    }
  }

  // === ACTIONS ===
  async function handleStart() {
    await requestCamera(); // richiede camera UNA SOLA VOLTA
    setAppState('waiting');
    socket.emit('find_partner');
  }

  function handleNext() {
    closePeerConnection();
    setRemoteStream(null);
    setMessages([]);
    setRoomId(null);
    setAppState('waiting');
    socket.emit('find_partner');
  }

  function handleSend() {
    if (!input.trim() || !roomId || appState !== 'matched') return;
    socket.emit('send_message', { roomId, text: input.trim() });
    setInput('');
    inputRef.current?.focus();
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (roomId) socket.emit('typing', { roomId });
  }

  function handleReport(reason) {
    if (roomId) socket.emit('report_user', { roomId, reason });
  }

  // === RENDERS ===
  const StatusDot = ({ color }) => <span className={`inline-block w-2 h-2 rounded-full animate-pulse ${color}`} />;

  // Top bar con occhio + contatore (condiviso tra tutti gli stati)
  const TopBar = ({ children }) => (
    <header className="h-11 sm:h-12 border-b border-dark-700 bg-dark-800 flex items-center justify-between px-3 shrink-0 z-20">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate('/')} className="flex items-center gap-1.5 text-white hover:opacity-80 transition">
          <MessageCircle size={16} className="text-brand-primary" />
          <span className="font-bold text-xs sm:text-sm hidden sm:inline">RandomChat</span>
        </button>
        <div className="flex items-center gap-1.5 ml-2 sm:ml-4 bg-dark-700/60 px-2 py-1 rounded-full">
          <Eye size={13} className="text-brand-accent" />
          <span className="text-[11px] sm:text-xs text-gray-300 font-medium">{onlineCount}</span>
          <span className="text-[10px] text-gray-500 hidden sm:inline">online</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {children}
        <button
          onClick={() => setShowAdminHint(!showAdminHint)}
          className="flex items-center gap-1 px-2 py-1 text-[10px] sm:text-xs text-gray-400 hover:text-white bg-dark-700/40 hover:bg-dark-700 rounded-md transition"
          title="Moderazione"
        >
          <Lock size={12} />
          <span className="hidden sm:inline">Admin</span>
        </button>
      </div>
    </header>
  );

  // Admin hint popup
  const AdminHint = () => (
    <div className="absolute top-12 right-2 bg-dark-800 border border-dark-600 rounded-lg p-3 shadow-xl z-30 w-64">
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck size={16} className="text-brand-primary" />
        <span className="text-sm font-semibold text-white">Accesso Moderazione</span>
      </div>
      <p className="text-xs text-gray-400 mb-2">Vai su <code className="text-brand-primary">/admin</code> o clicca qui:</p>
      <button
        onClick={() => navigate('/admin')}
        className="w-full py-1.5 bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary rounded text-xs font-medium transition mb-2"
      >
        Apri Admin Panel
      </button>
      <div className="text-[10px] text-gray-500 border-t border-dark-600 pt-2">
        <p>Password: <span className="text-gray-300 font-mono">admin123</span></p>
      </div>
    </div>
  );

  // LANDING
  if (appState === 'landing') {
    return (
      <div className="h-[100dvh] flex flex-col bg-dark-900">
        <TopBar>
          <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-gray-400">
            <StatusDot color="bg-gray-500" />
            Pronto
          </div>
        </TopBar>
        {showAdminHint && <AdminHint />}

        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <AdSlot label="Ad Slot - Pre Chat" className="w-full max-w-md h-40 mb-8" />

          <div className="w-full max-w-sm bg-dark-800 border border-dark-700 rounded-2xl p-8 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-brand-primary/10 flex items-center justify-center mx-auto mb-4">
              <Camera size={28} className="text-brand-primary" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Chat Video Anonima</h2>
            <p className="text-gray-400 text-sm mb-6">
              Clicca per iniziare. Ti connetteremo con uno sconosciuto in modo sicuro.
            </p>
            <button
              onClick={handleStart}
              className="w-full py-3.5 bg-gradient-to-r from-brand-primary to-brand-secondary hover:from-indigo-500 hover:to-violet-500 text-white font-semibold rounded-xl transition shadow-lg shadow-brand-primary/20"
            >
              Inizia a Chattare
            </button>
            <p className="text-xs text-gray-600 mt-4">
              Servizio moderato automaticamente. Rispetta le regole.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // WAITING
  if (appState === 'waiting') {
    return (
      <div className="h-[100dvh] flex flex-col bg-dark-900">
        <TopBar>
          <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-gray-400">
            <StatusDot color="bg-brand-primary" />
            In attesa...
          </div>
        </TopBar>
        {showAdminHint && <AdminHint />}

        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <AdSlot label="Ad Slot - Connecting" className="w-full max-w-md h-40 mb-8" />
          <div className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-300 font-medium">Cerchiamo qualcuno...</p>
          <button onClick={() => { cleanupAll(); setAppState('landing'); }} className="mt-6 text-gray-500 hover:text-white text-sm transition">
            Annulla
          </button>
        </div>
      </div>
    );
  }

  // BANNED / TIMEOUT
  if (appState === 'banned' || appState === 'timeout') {
    return (
      <div className="h-[100dvh] flex flex-col bg-dark-900">
        <TopBar />
        {showAdminHint && <AdminHint />}

        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
            <Power size={32} className="text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">{appState === 'banned' ? 'Account Bannato' : 'Timeout'}</h2>
          <p className="text-gray-400 text-center max-w-md text-sm mb-6">
            {appState === 'banned'
              ? 'Hai ricevuto troppe segnalazioni o sei stato bannato da un moderatore.'
              : 'Comportamento sospetto rilevato. Attendi prima di riprovare.'}
          </p>
          <button onClick={() => { cleanupAll(); setAppState('landing'); }} className="px-6 py-2.5 bg-dark-700 hover:bg-dark-600 text-white rounded-lg transition text-sm">
            Torna alla Home
          </button>
        </div>
      </div>
    );
  }

  // MATCHED - Omegle layout
  return (
    <div className="h-[100dvh] flex flex-col bg-dark-900 overflow-hidden">
      {/* Top bar */}
      <TopBar>
        <div className="flex items-center gap-2">
          <StatusDot color="bg-green-400" />
          <span className="text-[11px] sm:text-xs text-gray-300 hidden sm:inline">Connesso</span>
          <button onClick={() => setShowReport(true)} className="p-1.5 sm:p-2 text-red-400 hover:bg-red-500/10 rounded-md transition" title="Segnala">
            <AlertTriangle size={15} />
          </button>
          <button
            onClick={handleNext}
            className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 bg-brand-primary hover:bg-indigo-500 text-white rounded-md text-[11px] sm:text-xs font-semibold transition min-h-[32px] sm:min-h-[36px]"
          >
            <SkipForward size={14} />
            <span className="hidden sm:inline">Next</span>
          </button>
        </div>
      </TopBar>
      {showAdminHint && <AdminHint />}

      {/* Main: video top on mobile, left on desktop */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* VIDEO AREA */}
        <div className="h-[58vh] sm:h-[62vh] lg:h-auto lg:flex-1 flex flex-col min-h-0 bg-black relative">
          {/* Remote video */}
          <div className="flex-1 relative min-h-0">
            {remoteStream ? (
              <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 bg-dark-800">
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-dark-700 flex items-center justify-center mb-2 sm:mb-3">
                  <Video size={22} className="text-gray-600" />
                </div>
                <p className="text-xs sm:text-sm text-gray-400 font-medium">In attesa del partner...</p>
                <p className="text-[10px] sm:text-xs text-gray-600 mt-1">La chat testuale funziona comunque</p>
              </div>
            )}
            <div className="absolute top-2 left-2 bg-black/60 px-2 py-0.5 rounded text-[10px] sm:text-[11px] text-white font-medium">
              Partner
            </div>
          </div>

          {/* Local video overlay */}
          <div className="absolute bottom-12 sm:bottom-14 right-2 sm:right-3 w-20 h-14 sm:w-24 sm:h-16 md:w-36 md:h-24 lg:w-44 lg:h-32 bg-dark-800 rounded-lg overflow-hidden border-2 border-dark-600 shadow-xl z-10">
            {localStream && !camDenied ? (
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-dark-800">
                <VideoOff size={16} className="text-gray-600 mb-0.5" />
                <span className="text-[9px] text-gray-500">{camDenied ? 'Off' : 'Tu'}</span>
              </div>
            )}
            <div className="absolute top-1 left-1 bg-black/60 px-1 py-px rounded text-[9px] text-white">Tu</div>
          </div>

          {/* Video controls bar - touch friendly */}
          <div className="shrink-0 h-11 sm:h-12 bg-dark-800 border-t border-dark-700 flex items-center justify-center gap-3 sm:gap-4 px-3">
            <button
              onClick={toggleMic}
              className={`p-2.5 sm:p-3 rounded-full transition min-w-[40px] min-h-[40px] flex items-center justify-center ${micOn ? 'bg-dark-700 text-white hover:bg-dark-600' : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'}`}
              title="Mic"
            >
              {micOn ? <Mic size={18} /> : <MicOff size={18} />}
            </button>
            <button
              onClick={toggleCam}
              className={`p-2.5 sm:p-3 rounded-full transition min-w-[40px] min-h-[40px] flex items-center justify-center ${camOn ? 'bg-dark-700 text-white hover:bg-dark-600' : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'}`}
              title="Camera"
            >
              {camOn ? <Video size={18} /> : <VideoOff size={18} />}
            </button>
            <button
              onClick={handleNext}
              className="flex items-center gap-1.5 px-4 sm:px-5 py-2 sm:py-2.5 bg-brand-primary hover:bg-indigo-500 text-white rounded-full text-xs sm:text-sm font-semibold transition shadow-lg shadow-brand-primary/20 min-h-[40px]"
            >
              <SkipForward size={16} />
              Next
            </button>
          </div>
        </div>

        {/* CHAT SIDEBAR */}
        <div className="h-[42vh] sm:h-[38vh] lg:h-auto lg:w-80 xl:w-96 flex flex-col bg-dark-800 border-t lg:border-t-0 lg:border-l border-dark-700 shrink-0">
          {/* Chat header */}
          <div className="h-9 sm:h-10 border-b border-dark-700 flex items-center justify-between px-3 shrink-0">
            <span className="text-[11px] sm:text-xs font-medium text-gray-300">Chat</span>
            <span className="text-[10px] text-gray-500">{messages.filter(m => !m.system).length} msg</span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-2 sm:p-2.5 space-y-2 scrollbar-thin min-h-0">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 py-3 sm:py-4">
                <p className="text-[11px] sm:text-xs">Dì ciao al tuo partner!</p>
                <p className="text-[10px] text-gray-600 mt-0.5">Sii rispettoso</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.system ? 'justify-center' : msg.isMe ? 'justify-end' : 'justify-start'}`}>
                {msg.system ? (
                  <span className="text-[10px] text-gray-500 bg-dark-700/60 px-2.5 py-0.5 rounded-full">{msg.text}</span>
                ) : (
                  <div className={`max-w-[90%] px-2.5 py-1.5 rounded-lg text-xs sm:text-sm ${msg.isMe ? 'bg-brand-primary text-white rounded-br-sm' : 'bg-dark-700 text-gray-200 rounded-bl-sm'}`}>
                    {msg.text}
                    {msg.warning && <p className="text-[9px] text-yellow-300 mt-0.5">⚠️ Attenzione</p>}
                  </div>
                )}
              </div>
            ))}
            {typing && (
              <div className="flex justify-start">
                <div className="bg-dark-700 px-2.5 py-1.5 rounded-lg rounded-bl-sm text-xs text-gray-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-2 border-t border-dark-700 shrink-0">
            <div className="flex gap-1.5">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Scrivi un messaggio..."
                className="flex-1 bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 sm:py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-primary transition min-h-[40px]"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="p-2.5 sm:p-3 bg-brand-primary hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-brand-primary text-white rounded-lg transition min-w-[44px] min-h-[40px] flex items-center justify-center"
              >
                <Send size={16} />
              </button>
            </div>
          </div>

          {/* Ad - hidden on mobile */}
          <div className="hidden lg:block p-2 border-t border-dark-700 shrink-0">
            <AdSlot label="Ad" className="h-14" />
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-dark-800 border border-dark-600 text-white px-3 py-2 rounded-lg shadow-lg text-xs z-50 max-w-xs text-center">
          {toast}
        </div>
      )}

      <ReportModal isOpen={showReport} onClose={() => setShowReport(false)} onSubmit={handleReport} />
    </div>
  );
};

export default Chat;
