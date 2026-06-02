import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Send, SkipForward, AlertTriangle, MessageCircle,
  Mic, MicOff, Video, VideoOff, Power, Camera,
  ShieldCheck, Eye, Lock
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

  const [appState, setAppState] = useState('landing');
  const [roomId, setRoomId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [toast, setToast] = useState(null);
  const [onlineCount, setOnlineCount] = useState(11435);
  const [showAdminHint, setShowAdminHint] = useState(false);

  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [camDenied, setCamDenied] = useState(false);

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
      setAppState('waiting');
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
  function toggleCam() {
    if (localStreamRef.current) {
      const t = localStreamRef.current.getVideoTracks()[0];
      if (t) { t.enabled = !t.enabled; setCamOn(t.enabled); }
    }
  }

  async function handleStart() {
    await requestCamera();
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

  function handleStop() {
    closePeerConnection();
    setMessages([]);
    setRoomId(null);
    cleanupAll();
    setAppState('landing');
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

  const StatusDot = ({ color }) => <span className={`inline-block w-2 h-2 rounded-full animate-pulse ${color}`} />;

  // === LANDING ===
  if (appState === 'landing') {
    return (
      <div className="h-screen flex flex-col bg-[#1a0b2e]">
        {/* Header VIOLA */}
        <header className="h-14 bg-[#6b21a8] flex items-center justify-between px-4 shrink-0 shadow-lg">
          <div className="flex items-center gap-2">
            <MessageCircle size={24} className="text-white" />
            <span className="font-bold text-xl text-white tracking-tight">RandomChat</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-white/20 px-3 py-1.5 rounded-full">
              <Eye size={14} className="text-white" />
              <span className="text-xs text-white font-bold">{onlineCount.toLocaleString()}+</span>
              <span className="text-[10px] text-white/80">online</span>
            </div>
          </div>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-md bg-white/10 backdrop-blur border border-white/20 rounded-3xl p-8 text-center shadow-2xl">
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-[#a855f7] to-[#ec4899] flex items-center justify-center mx-auto mb-6 shadow-xl">
              <Camera size={40} className="text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Video Chat</h2>
            <p className="text-white/70 text-sm mb-6">
              Meet new people from around the world. Safe, moderated, anonymous.
            </p>
            <button
              onClick={handleStart}
              className="w-full py-4 bg-gradient-to-r from-[#7c3aed] to-[#a855f7] hover:from-[#6d28d9] hover:to-[#9333ea] text-white font-bold rounded-xl transition shadow-xl text-lg"
            >
              Start Chatting
            </button>
            <p className="text-xs text-white/50 mt-4">
              By clicking, you agree to our terms. Respectful behavior required.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // === WAITING ===
  if (appState === 'waiting') {
    return (
      <div className="h-screen flex flex-col bg-[#1a0b2e]">
        <header className="h-14 bg-[#6b21a8] flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-2">
            <MessageCircle size={22} className="text-white" />
            <span className="font-bold text-lg text-white">RandomChat</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-white/80">
            <StatusDot color="bg-white" />
            Looking for someone...
          </div>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="w-20 h-20 border-4 border-[#a855f7] border-t-transparent rounded-full animate-spin mb-6" />
          <p className="text-white font-semibold text-xl mb-2">Looking for a partner...</p>
          <p className="text-white/50 text-sm">This may take a few seconds</p>
          <button onClick={() => { cleanupAll(); setAppState('landing'); }} className="mt-10 px-8 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm transition">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // === BANNED / TIMEOUT ===
  if (appState === 'banned' || appState === 'timeout') {
    return (
      <div className="h-screen flex flex-col bg-[#1a0b2e]">
        <header className="h-14 bg-[#6b21a8] flex items-center px-4 shrink-0">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 text-white hover:opacity-80 transition">
            <MessageCircle size={20} className="text-white" />
            <span className="font-bold text-sm">RandomChat</span>
          </button>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="w-24 h-24 rounded-full bg-red-500/20 flex items-center justify-center mb-6">
            <Power size={40} className="text-red-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">{appState === 'banned' ? 'Banned' : 'Timeout'}</h2>
          <p className="text-white/60 text-center max-w-md text-sm mb-8">
            {appState === 'banned'
              ? 'You received too many reports or were banned by a moderator.'
              : 'Suspicious behavior detected. Please wait before trying again.'}
          </p>
          <button onClick={() => { cleanupAll(); setAppState('landing'); }} className="px-10 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition text-sm font-medium">
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  // === MATCHED — ESATTO come umingle ===
  return (
    <div className="h-screen flex flex-col bg-[#0f0f1a] overflow-hidden">
      {/* Header VIOLA */}
      <header className="h-12 bg-[#7c3aed] flex items-center justify-between px-3 shrink-0 z-20 shadow-md">
        <div className="flex items-center gap-2">
          <MessageCircle size={20} className="text-white" />
          <span className="font-bold text-base text-white">RandomChat</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Eye size={14} className="text-white" />
            <span className="text-sm text-white font-bold">{onlineCount.toLocaleString()}+</span>
            <span className="text-[10px] text-white/80">online</span>
          </div>
          <button onClick={() => setShowAdminHint(!showAdminHint)} className="p-1.5 text-white/70 hover:text-white transition">
            <Lock size={14} />
          </button>
        </div>
      </header>
      {showAdminHint && (
        <div className="absolute top-12 right-2 bg-[#1a1a2e] border border-[#333] rounded-lg p-3 shadow-xl z-30 w-64">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck size={16} className="text-[#a855f7]" />
            <span className="text-sm font-semibold text-white">Admin Access</span>
          </div>
          <p className="text-xs text-gray-400 mb-2">Go to <code className="text-[#a855f7]">/admin</code></p>
          <button onClick={() => navigate('/admin')} className="w-full py-1.5 bg-[#7c3aed]/20 hover:bg-[#7c3aed]/30 text-[#a855f7] rounded text-xs font-medium transition mb-2">Open Admin</button>
          <div className="text-[10px] text-gray-500 border-t border-[#333] pt-2">Password: <span className="text-gray-300 font-mono">admin123</span></div>
        </div>
      )}

      {/* Main — video affiancati come umingle */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Area video (sinistra, grande) */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Info bar */}
          <div className="h-9 bg-[#1a1a2e] border-b border-[#2a2a3e] flex items-center px-3 shrink-0">
            <span className="text-xs text-gray-400">You're now chatting with someone new</span>
            <span className="text-xs text-gray-300 ml-2">You both like Italy 🇮🇹</span>
          </div>

          {/* Video grid ORIZZONTALE (come umingle) */}
          <div className="flex-1 flex flex-col lg:flex-row gap-1 p-1 bg-[#0f0f1a] min-h-0">
            {/* Remote video (sinistra o sopra) */}
            <div className="flex-1 relative rounded-2xl overflow-hidden bg-[#1a1a2e] border border-[#2a2a3e]">
              {remoteStream ? (
                <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-[#2a2a3e] flex items-center justify-center mb-3">
                    <Video size={28} className="text-gray-500" />
                  </div>
                  <p className="text-sm text-gray-500">Waiting for partner...</p>
                </div>
              )}
              <div className="absolute bottom-3 right-3 text-[11px] text-white/40 font-medium">randomchat.com</div>
            </div>

            {/* Local video (destra o sotto) */}
            <div className="flex-1 relative rounded-2xl overflow-hidden bg-[#1a1a2e] border border-[#2a2a3e]">
              {localStream && !camDenied ? (
                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center">
                  <VideoOff size={28} className="text-gray-500 mb-2" />
                  <span className="text-sm text-gray-500">{camDenied ? 'Camera off' : 'Your camera'}</span>
                </div>
              )}
              <div className="absolute bottom-3 right-3 text-[11px] text-white/40 font-medium">randomchat.com</div>
            </div>
          </div>

          {/* Controlli in basso — pulsanti GRANDI come umingle */}
          <div className="h-16 bg-[#1a1a2e] border-t border-[#2a2a3e] flex items-center justify-center gap-3 px-4 shrink-0">
            <button onClick={toggleMic} className={`p-3 rounded-full transition ${micOn ? 'bg-[#2a2a3e] text-white hover:bg-[#3a3a4e]' : 'bg-red-500/20 text-red-400'}`}>
              {micOn ? <Mic size={20} /> : <MicOff size={20} />}
            </button>
            <button onClick={toggleCam} className={`p-3 rounded-full transition ${camOn ? 'bg-[#2a2a3e] text-white hover:bg-[#3a3a4e]' : 'bg-red-500/20 text-red-400'}`}>
              {camOn ? <Video size={20} /> : <VideoOff size={20} />}
            </button>
            <button onClick={() => setShowReport(true)} className="p-3 rounded-full bg-red-500/10 text-red-400 hover:bg-red-500/20 transition">
              <AlertTriangle size={20} />
            </button>
            <button onClick={handleNext} className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-full font-bold text-sm transition shadow-lg">
              <SkipForward size={18} />
              Skip
            </button>
            <button onClick={handleStop} className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-full font-bold text-sm transition shadow-lg">
              <Power size={18} />
              Stop
            </button>
          </div>
        </div>

        {/* Chat sidebar (destra) */}
        <div className="w-full lg:w-80 flex flex-col bg-[#1a1a2e] border-t lg:border-t-0 lg:border-l border-[#2a2a3e] shrink-0 h-48 lg:h-auto">
          <div className="h-10 border-b border-[#2a2a3e] flex items-center justify-between px-3 shrink-0">
            <span className="text-xs font-medium text-gray-300">Chat</span>
            <span className="text-[10px] text-gray-500">{messages.filter(m => !m.system).length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin min-h-0">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 py-4">
                <p className="text-xs">Say hi to your partner!</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.system ? 'justify-center' : msg.isMe ? 'justify-end' : 'justify-start'}`}>
                {msg.system ? (
                  <span className="text-[10px] text-gray-500 bg-[#2a2a3e] px-3 py-1 rounded-full">{msg.text}</span>
                ) : (
                  <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${msg.isMe ? 'bg-[#7c3aed] text-white rounded-br-md' : 'bg-[#2a2a3e] text-gray-200 rounded-bl-md'}`}>
                    {msg.text}
                    {msg.warning && <p className="text-[9px] text-yellow-300 mt-1">⚠️ Warning</p>}
                  </div>
                )}
              </div>
            ))}
            {typing && (
              <div className="flex justify-start">
                <div className="bg-[#2a2a3e] px-3 py-2 rounded-2xl rounded-bl-md text-sm text-gray-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="p-2 border-t border-[#2a2a3e] shrink-0">
            <div className="flex gap-2">
              <input ref={inputRef} type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Type a message..." className="flex-1 bg-[#2a2a3e] border border-[#3a3a4e] rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#7c3aed] transition" />
              <button onClick={handleSend} disabled={!input.trim()} className="p-2.5 bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-40 text-white rounded-xl transition">
                <Send size={18} />
              </button>
            </div>
          </div>
          <div className="hidden lg:block p-2 border-t border-[#2a2a3e] shrink-0">
            <AdSlot label="Ad" className="h-14" />
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-[#1a1a2e] border border-[#2a2a3e] text-white px-4 py-2.5 rounded-lg shadow-lg text-xs z-50 max-w-xs text-center">
          {toast}
        </div>
      )}

      <ReportModal isOpen={showReport} onClose={() => setShowReport(false)} onSubmit={handleReport} />
    </div>
  );
};

export default Chat;
