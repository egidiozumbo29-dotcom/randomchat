import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Send, SkipForward, AlertTriangle, MessageCircle,
  Mic, MicOff, Video, VideoOff, Power
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';
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
  const [onlineCount, setOnlineCount] = useState(11334);

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
      setMessages(prev => [...prev, { system: true, text: "You have disconnected" }]);
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
  const isConnected = appState === 'matched';

  // === LANDING ===
  if (appState === 'landing') {
    return (
      <div className="h-screen flex flex-col bg-white">
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#7c3aed] flex items-center justify-center">
              <MessageCircle size={18} className="text-white" />
            </div>
            <span className="font-bold text-xl text-gray-800 tracking-tight">RandomChat</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-5 bg-gray-300 rounded-full relative">
              <div className="w-4 h-4 bg-white rounded-full absolute top-0.5 left-0.5 shadow"></div>
            </div>
            <span className="text-sm text-[#7c3aed] font-bold">{onlineCount.toLocaleString()}+</span>
            <span className="text-xs text-gray-500">online</span>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center p-6 bg-gray-50">
          <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-lg">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#7c3aed] to-[#a855f7] flex items-center justify-center mx-auto mb-6">
              <MessageCircle size={36} className="text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">RandomChat</h2>
            <p className="text-gray-500 text-sm mb-6">Chat video anonima con persone da tutto il mondo</p>
            <button onClick={handleStart} className="w-full py-3.5 bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-bold rounded-xl transition text-lg">
              Inizia a Chattare
            </button>
          </div>
        </div>
      </div>
    );
  }

  // === WAITING ===
  if (appState === 'waiting') {
    return (
      <div className="h-screen flex flex-col bg-white">
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#7c3aed] flex items-center justify-center">
              <MessageCircle size={18} className="text-white" />
            </div>
            <span className="font-bold text-xl text-gray-800">RandomChat</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-5 bg-[#7c3aed] rounded-full relative">
              <div className="w-4 h-4 bg-white rounded-full absolute top-0.5 right-0.5 shadow"></div>
            </div>
            <span className="text-sm text-[#7c3aed] font-bold">{onlineCount.toLocaleString()}+</span>
            <span className="text-xs text-gray-500">online</span>
          </div>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center bg-gray-50">
          <div className="w-16 h-16 border-4 border-[#7c3aed] border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-600 font-medium">Cerchiamo qualcuno...</p>
        </div>
      </div>
    );
  }

  // === CHAT (matched o disconnected) ===
  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header bianco */}
      <header className="h-12 bg-white border-b border-gray-200 flex items-center justify-between px-3 shrink-0 z-20">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#7c3aed] flex items-center justify-center">
            <MessageCircle size={16} className="text-white" />
          </div>
          <span className="font-bold text-lg text-gray-800">RandomChat</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-9 h-5 rounded-full relative transition ${isConnected ? 'bg-[#7c3aed]' : 'bg-gray-300'}`}>
            <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 shadow transition ${isConnected ? 'right-0.5' : 'left-0.5'}`}></div>
          </div>
          <span className="text-sm text-[#7c3aed] font-bold">{onlineCount.toLocaleString()}+</span>
          <span className="text-xs text-gray-500">online</span>
        </div>
      </header>

      {/* Main: video + chat */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left: video area */}
        <div className="flex-1 flex flex-col min-h-0 bg-gray-50">
          {/* Video grid orizzontale (come in foto) */}
          <div className="flex-1 flex gap-2 p-2 min-h-0">
            {/* Partner video (sinistra) */}
            <div className="flex-1 relative rounded-xl overflow-hidden bg-[#d1d5db]">
              {remoteStream ? (
                <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[#d1d5db]">
                  <Video size={32} className="text-gray-400" />
                </div>
              )}
              <div className="absolute bottom-2 left-2 text-xs text-white/60 font-medium">randomchat.com</div>
              <div className="absolute bottom-2 right-2 w-6 h-6 bg-white/20 rounded flex items-center justify-center text-[10px] text-white font-bold">P</div>
            </div>

            {/* Local video (destra) */}
            <div className="flex-1 relative rounded-xl overflow-hidden bg-[#d1d5db]">
              {localStream && !camDenied ? (
                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-[#d1d5db]">
                  <VideoOff size={28} className="text-gray-400 mb-1" />
                  <span className="text-xs text-gray-500">{camDenied ? 'Camera off' : 'Camera'}</span>
                </div>
              )}
            </div>
          </div>

          {/* Info text sotto video */}
          <div className="px-3 py-2 bg-white border-t border-gray-100">
            <p className="text-xs text-gray-600">You're now chatting with someone new</p>
            <p className="text-xs text-gray-500">You both like Italia, ita, it</p>
            <p className="text-xs text-gray-700 font-medium">🇮🇹 Italy</p>
            {!isConnected && <p className="text-xs text-gray-500 mt-1">You have disconnected</p>}
          </div>

          {/* Controls */}
          <div className="h-14 bg-white border-t border-gray-200 flex items-center gap-2 px-3 shrink-0">
            <button onClick={toggleMic} className={`p-2 rounded-full transition ${micOn ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-red-100 text-red-500'}`}>
              {micOn ? <Mic size={18} /> : <MicOff size={18} />}
            </button>
            <button onClick={toggleCam} className={`p-2 rounded-full transition ${camOn ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-red-100 text-red-500'}`}>
              {camOn ? <Video size={18} /> : <VideoOff size={18} />}
            </button>
            <button onClick={() => setShowReport(true)} className="p-2 rounded-full bg-red-50 text-red-500 hover:bg-red-100 transition">
              <AlertTriangle size={18} />
            </button>
            {isConnected ? (
              <button onClick={handleNext} className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold text-sm transition">
                <SkipForward size={16} />
                Skip
              </button>
            ) : (
              <button onClick={handleStart} className="flex items-center gap-1.5 px-5 py-2.5 bg-[#7c3aed] hover:bg-[#6d28d9] text-white rounded-lg font-bold text-sm transition">
                Start
                <span className="text-[10px] font-normal opacity-70 ml-1">Esc</span>
              </button>
            )}
          </div>
        </div>

        {/* Right: chat sidebar */}
        <div className="w-full lg:w-56 flex flex-col bg-white border-t lg:border-t-0 lg:border-l border-gray-200 shrink-0 h-40 lg:h-auto">
          <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin min-h-0">
            {messages.length === 0 && (
              <div className="text-center text-gray-400 py-4 text-xs">Say hi!</div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.system ? 'justify-center' : msg.isMe ? 'justify-end' : 'justify-start'}`}>
                {msg.system ? (
                  <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-1 rounded-full">{msg.text}</span>
                ) : (
                  <div className={`max-w-[90%] px-2.5 py-1.5 rounded-lg text-xs ${msg.isMe ? 'bg-[#7c3aed] text-white' : 'bg-gray-100 text-gray-700'}`}>
                    {msg.text}
                  </div>
                )}
              </div>
            ))}
            {typing && (
              <div className="flex justify-start">
                <div className="bg-gray-100 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 flex items-center gap-1">
                  <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" />
                  <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="p-2 border-t border-gray-200 shrink-0">
            <div className="flex gap-1.5">
              <input ref={inputRef} type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Type..." className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:border-[#7c3aed] transition" />
              <button onClick={handleSend} disabled={!input.trim()} className="p-2 bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-40 text-white rounded-lg transition">
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-3 py-2 rounded-lg shadow-lg text-xs z-50">
          {toast}
        </div>
      )}

      <ReportModal isOpen={showReport} onClose={() => setShowReport(false)} onSubmit={handleReport} />
    </div>
  );
};

export default Chat;
