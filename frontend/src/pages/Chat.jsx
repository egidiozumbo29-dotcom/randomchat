import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Send, SkipForward, AlertTriangle, MessageCircle,
  Mic, MicOff, Video, VideoOff, Power
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import ReportModal from '../components/ReportModal';

const BACKEND_URL = 'https://lectures-ellis-coast-overall.trycloudflare.com';

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

  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('randomchat-theme');
    return saved ? saved === 'dark' : false;
  });

  const [appState, setAppState] = useState('landing');
  const [roomId, setRoomId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [toast, setToast] = useState(null);
  const [onlineCount, setOnlineCount] = useState(0);

  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [camDenied, setCamDenied] = useState(false);

  // Fetch real online count from backend
  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch(`${BACKEND_URL}/stats`, { method: 'GET', mode: 'cors', cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setOnlineCount(data.online || 0);
        }
      } catch (e) {}
    }
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    localStorage.setItem('randomchat-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);

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
      setAppState('disconnected');
      setRoomId(null);
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

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream; }, [localStream]);
  useEffect(() => { if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream; }, [remoteStream]);

  async function requestCamera() {
    if (localStreamRef.current) return;
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

  function createPeerConnection(currentRoomId) {
    if (pcRef.current) { try { pcRef.current.close(); } catch (e) {} pcRef.current = null; }
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]
    });
    peer.onicecandidate = (event) => {
      if (event.candidate && currentRoomId) {
        try { socket.emit('webrtc-ice-candidate', { roomId: currentRoomId, candidate: event.candidate }); } catch (e) {}
      }
    };
    peer.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        try { setRemoteStream(event.streams[0]); } catch (e) {}
      }
    };
    if (localStreamRef.current) {
      try {
        localStreamRef.current.getTracks().forEach(track => {
          try { peer.addTrack(track, localStreamRef.current); } catch (e) {}
        });
      } catch (e) {}
    }
    pcRef.current = peer;
    return peer;
  }

  async function startPeerConnection(initiator, currentRoomId) {
    try {
      const peer = createPeerConnection(currentRoomId);
      if (initiator) {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socket.emit('webrtc-offer', { roomId: currentRoomId, offer });
      }
    } catch (e) { console.error('startPeerConnection error:', e); }
  }

  function closePeerConnection() {
    try { if (pcRef.current) { pcRef.current.close(); } } catch (e) {}
    pcRef.current = null;
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

  async function handleStart() {
    await requestCamera();
    setAppState('waiting');
    socket.emit('find_partner');
  }

  function handleStop() {
    closePeerConnection();
    setMessages([]);
    setRoomId(null);
    cleanupAll();
    setAppState('landing');
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

  const isConnected = appState === 'matched';

  // THEME classes
  const bgMain = darkMode ? 'bg-[#0f0f1a]' : 'bg-white';
  const bgHeader = darkMode ? 'bg-[#13131a] border-[#1f1f2e]' : 'bg-white border-gray-200';
  const textMain = darkMode ? 'text-white' : 'text-gray-800';
  const textSub = darkMode ? 'text-gray-400' : 'text-gray-500';
  const bgVideo = darkMode ? 'bg-[#1a1a2e] border-[#2a2a3e]' : 'bg-[#d1d5db] border-gray-200';
  const bgChat = darkMode ? 'bg-[#1a1a2e] border-[#2a2a3e]' : 'bg-gray-50 border-gray-200';
  const bgInput = darkMode ? 'bg-[#2a2a3e] border-[#3a3a4e] text-white placeholder-gray-500' : 'bg-white border-gray-200 text-gray-700 placeholder-gray-400';
  const bgMsgMe = darkMode ? 'bg-[#7c3aed]' : 'bg-[#7c3aed]';
  const bgMsgOther = darkMode ? 'bg-[#2a2a3e] text-gray-200' : 'bg-white text-gray-700';
  const bgSystem = darkMode ? 'bg-[#1a1a28] text-gray-500' : 'bg-gray-100 text-gray-500';
  const bgControls = darkMode ? 'bg-[#1a1a2e] border-[#2a2a3e]' : 'bg-white border-gray-200';
  const btnControl = darkMode ? 'bg-[#2a2a3e] text-white hover:bg-[#3a3a4e]' : 'bg-gray-100 text-gray-600 hover:bg-gray-200';

  // === LANDING ===
  if (appState === 'landing') {
    return (
      <div className={`h-screen flex flex-col ${bgMain} transition-colors`}>
        <header className={`h-14 border-b flex items-center justify-between px-4 shrink-0 ${bgHeader} transition-colors`}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#7c3aed] flex items-center justify-center">
              <MessageCircle size={18} className="text-white" />
            </div>
            <span className={`font-bold text-xl tracking-tight ${textMain}`}>RandomChat</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-[#7c3aed] font-bold">{onlineCount.toLocaleString()}+</span>
            <span className="text-xs text-gray-500">online</span>
          </div>
        </header>
        <div className={`flex-1 flex items-center justify-center p-6 ${darkMode ? 'bg-[#0a0a0f]' : 'bg-gray-50'} transition-colors`}>
          <div className={`w-full max-w-md border rounded-2xl p-8 text-center shadow-lg transition-colors ${darkMode ? 'bg-[#13131a] border-[#1f1f2e]' : 'bg-white border-gray-200'}`}>
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#7c3aed] to-[#a855f7] flex items-center justify-center mx-auto mb-6">
              <MessageCircle size={36} className="text-white" />
            </div>
            <h2 className={`text-2xl font-bold mb-2 ${textMain}`}>RandomChat</h2>
            <p className={`text-sm mb-6 ${textSub}`}>Chat video anonima con persone da tutto il mondo</p>
            <button onClick={handleStart} className="w-full py-3.5 bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-bold rounded-xl transition text-lg">
              Avvia
            </button>
          </div>
        </div>
      </div>
    );
  }

  // === CHAT (video sopra, chat sotto) — usato per waiting, matched, disconnected ===
  return (
    <div className={`h-screen flex flex-col ${bgMain} transition-colors`}>
      {/* Header */}
      <header className={`h-12 border-b flex items-center justify-between px-3 shrink-0 z-20 ${bgHeader} transition-colors`}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#7c3aed] flex items-center justify-center">
            <MessageCircle size={16} className="text-white" />
          </div>
          <span className={`font-bold text-lg ${textMain}`}>RandomChat</span>
        </div>
        <div className="flex items-center gap-3">
          <div onClick={() => setDarkMode(!darkMode)} className={`w-9 h-5 rounded-full relative transition cursor-pointer ${darkMode ? 'bg-[#7c3aed]' : 'bg-gray-300'}`}>
            <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 shadow transition ${darkMode ? 'right-0.5' : 'left-0.5'}`}></div>
          </div>
          <span className="text-sm text-[#7c3aed] font-bold">{onlineCount.toLocaleString()}+</span>
          <span className="text-xs text-gray-500">online</span>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Video row (piccole) */}
        <div className="flex gap-2 p-2 shrink-0 h-[42vh] min-h-[260px]">
          {/* Partner video */}
          <div className={`flex-1 relative rounded-xl overflow-hidden border ${bgVideo} transition-colors`}>
            {remoteStream ? (
              <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            ) : (
              <div className={`w-full h-full flex flex-col items-center justify-center ${darkMode ? 'bg-[#1a1a2e]' : 'bg-[#d1d5db]'}`}>
                {appState === 'waiting' ? (
                  <>
                    <div className="w-12 h-12 border-4 border-[#7c3aed] border-t-transparent rounded-full animate-spin mb-2" />
                    <span className="text-xs text-gray-500">Cerchiamo qualcuno...</span>
                  </>
                ) : (
                  <>
                    <Video size={28} className="text-gray-400" />
                    <span className="text-xs text-gray-500 mt-1">Partner</span>
                  </>
                )}
              </div>
            )}
            <div className="absolute bottom-2 left-2 text-[10px] text-white/60 font-medium">randomchat.com</div>
          </div>

          {/* Local video */}
          <div className={`flex-1 relative rounded-xl overflow-hidden border ${bgVideo} transition-colors`}>
            {localStream && !camDenied ? (
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            ) : (
              <div className={`w-full h-full flex flex-col items-center justify-center ${darkMode ? 'bg-[#1a1a2e]' : 'bg-[#d1d5db]'}`}>
                <VideoOff size={24} className="text-gray-400" />
                <span className="text-xs text-gray-500 mt-1">{camDenied ? 'Camera off' : 'You'}</span>
              </div>
            )}
          </div>
        </div>

        {/* Info bar */}
        <div className={`px-3 py-1.5 text-xs border-b shrink-0 ${darkMode ? 'bg-[#13131a] border-[#1f1f2e] text-gray-400' : 'bg-white border-gray-100 text-gray-600'} transition-colors`}>
          {appState === 'waiting' ? 'Cerchiamo un partner per te...' : (
            <>
              You're now chatting with someone new — 🇮🇹 Italy
              {!isConnected && <span className="ml-2 text-gray-500">— You have disconnected</span>}
            </>
          )}
        </div>

        {/* Chat area (sotto) */}
        <div className={`flex-1 flex flex-col min-h-0 border-t transition-colors ${bgChat}`}>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin min-h-0">
            {messages.length === 0 && appState === 'matched' && (
              <div className={`text-center py-6 text-xs ${textSub}`}>Say hi to your partner!</div>
            )}
            {messages.length === 0 && appState !== 'matched' && (
              <div className={`text-center py-6 text-xs ${textSub}`}>Aspetta che troviamo qualcuno...</div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.system ? 'justify-center' : msg.isMe ? 'justify-end' : 'justify-start'}`}>
                {msg.system ? (
                  <span className={`text-[10px] px-3 py-1 rounded-full ${bgSystem}`}>{msg.text}</span>
                ) : (
                  <div className={`max-w-[80%] sm:max-w-md px-3 py-2 rounded-2xl text-sm ${msg.isMe ? `${bgMsgMe} text-white rounded-br-md` : `${bgMsgOther} rounded-bl-md shadow-sm`}`}>
                    {msg.text}
                  </div>
                )}
              </div>
            ))}
            {typing && (
              <div className="flex justify-start">
                <div className={`px-3 py-2 rounded-2xl rounded-bl-md text-sm flex items-center gap-1 ${darkMode ? 'bg-[#2a2a3e] text-gray-400' : 'bg-white text-gray-400'} shadow-sm`}>
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input + Controls */}
          <div className={`border-t p-2 shrink-0 ${bgControls} transition-colors`}>
            <div className="flex items-center gap-2 mb-2">
              <button onClick={toggleMic} className={`p-2 rounded-full transition ${micOn ? btnControl : 'bg-red-500/10 text-red-400'}`}>
                {micOn ? <Mic size={16} /> : <MicOff size={16} />}
              </button>
              <button onClick={() => setShowReport(true)} className="p-2 rounded-full bg-red-500/10 text-red-400 hover:bg-red-500/20 transition">
                <AlertTriangle size={16} />
              </button>
              <button onClick={handleStop} className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold text-sm transition">
                <Power size={16} />
                Stop
              </button>
              <button onClick={handleNext} className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold text-sm transition">
                <SkipForward size={16} />
                Skip
              </button>
            </div>
            <div className="flex gap-2">
              <input ref={inputRef} type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Scrivi un messaggio..." className={`flex-1 border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#7c3aed] transition ${bgInput}`} />
              <button onClick={handleSend} disabled={!input.trim() || appState !== 'matched'} className="p-2.5 bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-40 text-white rounded-xl transition">
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-lg shadow-lg text-xs z-50 max-w-xs text-center ${darkMode ? 'bg-[#13131a] border border-[#1f1f2e] text-white' : 'bg-gray-800 text-white'}`}>
          {toast}
        </div>
      )}

      <ReportModal isOpen={showReport} onClose={() => setShowReport(false)} onSubmit={handleReport} />
    </div>
  );
};

export default Chat;
