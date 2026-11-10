import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  MonitorUp,
  MonitorOff,
  PhoneOff,
  Hand,
  MessageSquare,
  Sparkles,
  Plus,
  Copy,
  Users,
  Pin,
  PinOff,
  Send,
  Trash2,
  Save,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { getSocketUrl } from '../utils/realtime';

function formatDuration(seconds) {
  const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
  const secs = String(seconds % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

function VideoStreamTile({
  stream,
  name,
  avatarUrl,
  micMuted,
  camOff,
  handRaised,
  screenSharing,
  isSelf,
  isPinned,
  onTogglePin,
}) {
  const videoRef = useRef(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream || null;
    }
    if (stream) {
      el.play().catch(() => {});
    }
  }, [stream]);

  const hasVideoTrack = Boolean(
    stream &&
      stream.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled) &&
      (!camOff || screenSharing)
  );

  const initials = (name || 'M')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={`relative rounded-2xl overflow-hidden bg-slate-800 border transition flex items-center justify-center ${
        isPinned
          ? 'border-brand-500 ring-2 ring-brand-500/40 min-h-[340px]'
          : 'border-slate-700/80 min-h-[220px]'
      }`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isSelf}
        className={`w-full h-full object-cover ${
          hasVideoTrack ? 'opacity-100' : 'opacity-0 pointer-events-none absolute inset-0'
        } ${isSelf && !screenSharing ? 'scale-x-[-1]' : ''}`}
      />

      {!hasVideoTrack && (
        <div className="flex flex-col items-center justify-center gap-2 py-8">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={name}
              className="w-16 h-16 rounded-full border-2 border-slate-600 bg-slate-700"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-brand-600/30 border-2 border-brand-500 text-brand-200 flex items-center justify-center text-xl font-bold">
              {initials}
            </div>
          )}
          <span className="text-xs text-slate-400">
            {camOff ? 'Camera off' : 'Connecting video...'}
          </span>
        </div>
      )}

      {/* Top Overlay Badges */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-1.5">
          {handRaised && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500 text-slate-950 shadow">
              <Hand className="w-3 h-3" />
              Hand Raised
            </span>
          )}
          {screenSharing && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-600 text-white shadow">
              <MonitorUp className="w-3 h-3" />
              Presenting
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onTogglePin}
          title={isPinned ? 'Unpin tile' : 'Pin tile'}
          className="pointer-events-auto p-1.5 rounded-lg bg-slate-900/70 hover:bg-slate-900 text-slate-200 transition"
        >
          {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Bottom Name & Mic Pill */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/75 text-white text-xs font-medium backdrop-blur-xs">
          {micMuted ? (
            <MicOff className="w-3.5 h-3.5 text-rose-400" />
          ) : (
            <Mic className="w-3.5 h-3.5 text-emerald-400" />
          )}
          {name}
          {isSelf ? ' (You)' : ''}
        </span>
      </div>
    </div>
  );
}

export default function Meet() {
  const { roomCode: routeRoomCode } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { workspaceId: defaultWorkspaceId, projectId, workspaces } = useWorkspace();

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(null);
  const workspaceId = workspaces.some((w) => w.id === selectedWorkspaceId)
    ? selectedWorkspaceId
    : defaultWorkspaceId;

  // Lobby state
  const [meetings, setMeetings] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [creating, setCreating] = useState(false);

  // Active call state
  const [activeMeeting, setActiveMeeting] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [hardwareNotice, setHardwareNotice] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [pinnedKey, setPinnedKey] = useState(null);

  // Peers state: { socketId, user, micMuted, camOff, handRaised, screenSharing, stream }
  const [remotePeers, setRemotePeers] = useState([]);

  // Side drawer: 'chat' | 'notes' | null
  const [drawerTab, setDrawerTab] = useState('chat');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [aiItems, setAiItems] = useState([]);
  const [extractingAi, setExtractingAi] = useState(false);
  const [addedItems, setAddedItems] = useState(new Set());

  // Mutable refs for WebRTC event handlers
  const socketRef = useRef(null);
  const pcMapRef = useRef(new Map());
  const remoteStreamsRef = useRef(new Map());
  const pendingIceRef = useRef(new Map());
  const iceConfigRef = useRef({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  const localStreamRef = useRef(null);
  const camStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const activeMeetingRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    activeMeetingRef.current = activeMeeting;
  }, [activeMeeting]);

  const loadMeetings = useCallback(async (wsId) => {
    if (!wsId) {
      setMeetings([]);
      setLoadingList(false);
      return;
    }
    setLoadingList(true);
    try {
      const res = await api.get(`/meetings/workspace/${wsId}`);
      setMeetings(res.data?.meetings || []);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load meetings.');
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadMeetings(workspaceId);
  }, [workspaceId, loadMeetings]);

  // Lobby Socket listener for live workspace room & participant badge updates
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!workspaceId || !token || activeMeeting) return undefined;

    const socket = io(getSocketUrl(), {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      socket.emit('workspace:join', { workspaceId });
    });

    socket.on('meetings:changed', () => {
      loadMeetings(workspaceId);
    });

    return () => {
      socket.emit('workspace:leave', { workspaceId });
      socket.disconnect();
    };
  }, [workspaceId, activeMeeting, loadMeetings]);

  // Call duration clock
  useEffect(() => {
    if (!activeMeeting) {
      setElapsedSeconds(0);
      return undefined;
    }
    const timer = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeMeeting]);

  const cleanupMediaAndConnections = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
      setDictating(false);
    }

    for (const pc of pcMapRef.current.values()) {
      try {
        pc.close();
      } catch {
        // ignore
      }
    }
    pcMapRef.current.clear();
    remoteStreamsRef.current.clear();
    pendingIceRef.current.clear();

    for (const sRef of [camStreamRef, screenStreamRef, localStreamRef]) {
      if (sRef.current) {
        sRef.current.getTracks().forEach((t) => t.stop());
        sRef.current = null;
      }
    }
    setLocalStream(null);
    setRemotePeers([]);

    if (socketRef.current) {
      const meetingId = activeMeetingRef.current?.id;
      if (meetingId) {
        socketRef.current.emit('meeting:leave', { meetingId });
      }
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => cleanupMediaAndConnections();
  }, [cleanupMediaAndConnections]);

  const acquireLocalMedia = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      return { stream: null, hasVideo: false, hasAudio: false, notice: 'Browser media capture unavailable — joined in listen/screen-share mode.' };
    }
    try {
      const avStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      return { stream: avStream, hasVideo: true, hasAudio: true, notice: null };
    } catch {
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        return {
          stream: audioOnly,
          hasVideo: false,
          hasAudio: true,
          notice: 'No camera detected or permission denied — joined with microphone audio only.',
        };
      } catch {
        return {
          stream: null,
          hasVideo: false,
          hasAudio: false,
          notice: 'No camera/microphone detected — joined in viewer/screen-share mode.',
        };
      }
    }
  };

  const createPeerConnection = useCallback((remoteSocketId, meetingId, peerMeta) => {
    const existing = pcMapRef.current.get(remoteSocketId);
    if (existing) return existing;

    const pc = new RTCPeerConnection(iceConfigRef.current);
    pcMapRef.current.set(remoteSocketId, pc);

    // Attach local audio/video tracks cleanly if available
    const activeStream = localStreamRef.current;
    if (activeStream) {
      activeStream.getTracks().forEach((track) => {
        pc.addTrack(track, activeStream);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('webrtc:ice-candidate', {
          meetingId,
          targetSocketId: remoteSocketId,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      let peerStream = remoteStreamsRef.current.get(remoteSocketId);
      if (!peerStream) {
        peerStream = new MediaStream();
        remoteStreamsRef.current.set(remoteSocketId, peerStream);
      }
      const sourceTracks = event.streams?.[0]?.getTracks() || [event.track];
      for (const t of sourceTracks) {
        if (!peerStream.getTracks().some((existing) => existing.id === t.id)) {
          peerStream.addTrack(t);
        }
      }
      // Fresh MediaStream wrapper triggers React re-render cleanly when video arrives after audio
      const refreshed = new MediaStream(peerStream.getTracks());
      setRemotePeers((prev) =>
        prev.map((p) => (p.socketId === remoteSocketId ? { ...p, stream: refreshed } : p))
      );
    };

    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) {
        // Peer socket left/cleanup handles removal; ignore transient states
      }
    };

    if (peerMeta) {
      setRemotePeers((prev) => {
        if (prev.some((p) => p.socketId === remoteSocketId)) return prev;
        return [...prev, { socketId: remoteSocketId, stream: null, ...peerMeta }];
      });
    }

    return pc;
  }, []);

  const flushPendingIce = async (remoteSocketId, pc) => {
    const queued = pendingIceRef.current.get(remoteSocketId) || [];
    pendingIceRef.current.delete(remoteSocketId);
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // ignore stale ICE candidate
      }
    }
  };

  const enterMeetingRoom = useCallback(
    async (meeting) => {
      cleanupMediaAndConnections();
      setActiveMeeting(meeting);
      setNotesDraft(meeting.transcript || '');
      setChatMessages([]);
      setAiItems([]);
      setAddedItems(new Set());
      setHandRaised(false);
      setScreenSharing(false);
      setPinnedKey(null);

      try {
        const iceRes = await api.get('/meetings/ice-config');
        if (iceRes.data?.iceServers) {
          iceConfigRef.current = { iceServers: iceRes.data.iceServers };
        }
      } catch {
        // Keep public Google STUN fallback
      }

      const media = await acquireLocalMedia();
      camStreamRef.current = media.stream;
      localStreamRef.current = media.stream;
      setLocalStream(media.stream);
      setCamOff(!media.hasVideo);
      setMicMuted(!media.hasAudio);
      setHardwareNotice(media.notice);

      const token = localStorage.getItem('accessToken');
      const socket = io(getSocketUrl(), {
        auth: { token },
        transports: ['websocket', 'polling'],
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        socket.emit('meeting:join', {
          meetingId: meeting.id,
          micMuted: !media.hasAudio,
          camOff: !media.hasVideo,
          handRaised: false,
          screenSharing: false,
        });
      });

      socket.on('meeting:peers', async ({ peers }) => {
        setRemotePeers(peers.map((p) => ({ ...p, stream: null })));
        for (const peer of peers) {
          try {
            const pc = createPeerConnection(peer.socketId, meeting.id, peer);
            // Ensure passive/viewer joins still negotiate receiving tracks cleanly
            if (!localStreamRef.current && pc.getTransceivers().length === 0) {
              pc.addTransceiver('video', { direction: 'recvonly' });
              pc.addTransceiver('audio', { direction: 'recvonly' });
            }
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('webrtc:offer', {
              meetingId: meeting.id,
              targetSocketId: peer.socketId,
              sdp: pc.localDescription,
            });
          } catch (err) {
            console.error('Offer creation failed:', err);
          }
        }
      });

      socket.on('meeting:peer-joined', ({ peer }) => {
        setRemotePeers((prev) => {
          if (prev.some((p) => p.socketId === peer.socketId)) return prev;
          return [...prev, { ...peer, stream: null }];
        });
      });

      socket.on('webrtc:offer', async ({ fromSocketId, fromUser, sdp }) => {
        try {
          const pc = createPeerConnection(fromSocketId, meeting.id, {
            user: fromUser,
            micMuted: false,
            camOff: false,
            handRaised: false,
            screenSharing: false,
          });
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          await flushPendingIce(fromSocketId, pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('webrtc:answer', {
            meetingId: meeting.id,
            targetSocketId: fromSocketId,
            sdp: pc.localDescription,
          });
        } catch (err) {
          console.error('Handling WebRTC offer failed:', err);
        }
      });

      socket.on('webrtc:answer', async ({ fromSocketId, sdp }) => {
        const pc = pcMapRef.current.get(fromSocketId);
        if (!pc) return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          await flushPendingIce(fromSocketId, pc);
        } catch (err) {
          console.error('Handling WebRTC answer failed:', err);
        }
      });

      socket.on('webrtc:ice-candidate', async ({ fromSocketId, candidate }) => {
        const pc = pcMapRef.current.get(fromSocketId);
        if (!pc || !pc.remoteDescription) {
          const list = pendingIceRef.current.get(fromSocketId) || [];
          list.push(candidate);
          pendingIceRef.current.set(fromSocketId, list);
          return;
        }
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
          // ignore
        }
      });

      socket.on('meeting:media-state', ({ socketId, ...patch }) => {
        setRemotePeers((prev) =>
          prev.map((p) => (p.socketId === socketId ? { ...p, ...patch } : p))
        );
      });

      socket.on('meeting:peer-left', ({ socketId }) => {
        const pc = pcMapRef.current.get(socketId);
        if (pc) {
          pc.close();
          pcMapRef.current.delete(socketId);
        }
        remoteStreamsRef.current.delete(socketId);
        pendingIceRef.current.delete(socketId);
        setRemotePeers((prev) => prev.filter((p) => p.socketId !== socketId));
      });

      socket.on('meeting:chat', (msg) => {
        setChatMessages((prev) => [...prev, msg]);
      });

      socket.on('meeting:transcript-sync', ({ transcript }) => {
        setNotesDraft(transcript);
      });

      socket.on('meeting:ended', () => {
        toast('Meeting was ended by the host.');
        cleanupMediaAndConnections();
        setActiveMeeting(null);
        navigate('/meet', { replace: true });
      });
    },
    [cleanupMediaAndConnections, createPeerConnection, navigate]
  );

  // Support opening shareable deep link /meet/:roomCode directly
  useEffect(() => {
    if (!routeRoomCode || activeMeeting?.room_code === routeRoomCode) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/meetings/code/${encodeURIComponent(routeRoomCode)}`);
        if (!cancelled && res.data?.meeting) {
          await enterMeetingRoom(res.data.meeting);
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(err.response?.data?.error || 'Meeting room not found.');
          navigate('/meet', { replace: true });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routeRoomCode, activeMeeting?.room_code, enterMeetingRoom, navigate]);

  const handleLeaveCall = () => {
    cleanupMediaAndConnections();
    setActiveMeeting(null);
    if (routeRoomCode) {
      navigate('/meet', { replace: true });
    } else {
      loadMeetings(workspaceId);
    }
  };

  const emitMediaState = (patch) => {
    if (socketRef.current && activeMeeting) {
      socketRef.current.emit('meeting:media-state', {
        meetingId: activeMeeting.id,
        ...patch,
      });
    }
  };

  const toggleMic = () => {
    const stream = localStreamRef.current;
    const audioTracks = stream ? stream.getAudioTracks() : [];
    const nextMuted = !micMuted;
    audioTracks.forEach((t) => {
      t.enabled = !nextMuted;
    });
    setMicMuted(nextMuted);
    emitMediaState({ micMuted: nextMuted });
  };

  const toggleCam = () => {
    const stream = camStreamRef.current;
    const videoTracks = stream ? stream.getVideoTracks() : [];
    if (videoTracks.length === 0) {
      toast.error('No camera stream available.');
      return;
    }
    const nextOff = !camOff;
    videoTracks.forEach((t) => {
      t.enabled = !nextOff;
    });
    setCamOff(nextOff);
    emitMediaState({ camOff: nextOff });
  };

  const toggleHand = () => {
    const next = !handRaised;
    setHandRaised(next);
    emitMediaState({ handRaised: next });
  };

  const stopScreenShare = useCallback(async () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    const camStream = camStreamRef.current;
    const camVideoTrack = camStream?.getVideoTracks()[0] || null;
    localStreamRef.current = camStream;
    setLocalStream(camStream);
    setScreenSharing(false);

    for (const pc of pcMapRef.current.values()) {
      const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (videoSender) {
        await videoSender.replaceTrack(camVideoTrack);
      }
    }
    emitMediaState({ screenSharing: false });
  }, [activeMeeting]);

  const toggleScreenShare = async () => {
    if (screenSharing) {
      await stopScreenShare();
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast.error('Screen sharing is not supported in this browser.');
      return;
    }
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const screenTrack = displayStream.getVideoTracks()[0];
      screenStreamRef.current = displayStream;

      const audioTracks = camStreamRef.current ? camStreamRef.current.getAudioTracks() : [];
      const composite = new MediaStream([screenTrack, ...audioTracks]);
      localStreamRef.current = composite;
      setLocalStream(composite);
      setScreenSharing(true);

      for (const [peerSocketId, pc] of pcMapRef.current.entries()) {
        const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(screenTrack);
        } else {
          pc.addTrack(screenTrack, composite);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socketRef.current?.emit('webrtc:offer', {
            meetingId: activeMeeting.id,
            targetSocketId: peerSocketId,
            sdp: pc.localDescription,
          });
        }
      }

      emitMediaState({ screenSharing: true });
      screenTrack.onended = () => {
        stopScreenShare();
      };
    } catch {
      // User cancelled screen picker
    }
  };

  const handleSendChat = (e) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed || !socketRef.current || !activeMeeting) return;
    socketRef.current.emit('meeting:chat', {
      meetingId: activeMeeting.id,
      content: trimmed,
    });
    setChatInput('');
  };

  const handleNotesChange = (val) => {
    setNotesDraft(val);
    if (socketRef.current && activeMeeting) {
      socketRef.current.emit('meeting:transcript-sync', {
        meetingId: activeMeeting.id,
        transcript: val,
      });
    }
  };

  const handleSaveNotes = async () => {
    if (!activeMeeting) return;
    setSavingNotes(true);
    try {
      await api.patch(`/meetings/${activeMeeting.id}`, { transcript: notesDraft });
      toast.success('Meeting notes saved!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save notes.');
    } finally {
      setSavingNotes(false);
    }
  };

  const toggleSpeechDictation = () => {
    if (dictating && recognitionRef.current) {
      recognitionRef.current.stop();
      setDictating(false);
      return;
    }
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      toast.error('Live voice dictation requires Chrome/Edge Web Speech API.');
      return;
    }
    const rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.onresult = (event) => {
      const latest = event.results[event.results.length - 1]?.[0]?.transcript?.trim();
      if (latest) {
        setNotesDraft((prev) => {
          const next = prev ? `${prev}\n${user?.name || 'Speaker'}: ${latest}` : `${user?.name || 'Speaker'}: ${latest}`;
          if (socketRef.current && activeMeetingRef.current) {
            socketRef.current.emit('meeting:transcript-sync', {
              meetingId: activeMeetingRef.current.id,
              transcript: next,
            });
          }
          return next;
        });
      }
    };
    rec.onerror = () => setDictating(false);
    rec.onend = () => setDictating(false);
    recognitionRef.current = rec;
    rec.start();
    setDictating(true);
    toast.success('Live voice transcription started');
  };

  const handleExtractMeetingTasks = async () => {
    const txt = notesDraft.trim();
    if (txt.length < 10) {
      toast.error('Write or dictate some meeting notes first (at least 10 chars).');
      return;
    }
    setExtractingAi(true);
    try {
      const res = await api.post('/ai/action-items', { text: txt });
      setAiItems(res.data?.action_items || []);
      setAddedItems(new Set());
      toast.success('Action items extracted!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to extract action items.');
    } finally {
      setExtractingAi(false);
    }
  };

  const handleAddActionToKanban = async (item, index) => {
    if (!projectId) {
      toast.error('No active project found to create task.');
      return;
    }
    try {
      await api.post('/tasks', {
        project_id: projectId,
        title: item.title,
        description: `Created from meeting "${activeMeeting?.title || 'Call'}"`,
        priority: ['low', 'medium', 'high'].includes(item.priority) ? item.priority : 'medium',
        estimated_days: Number(item.estimated_days) || 3,
        complexity: 5,
      });
      setAddedItems((prev) => new Set([...prev, index]));
      toast.success(`Added "${item.title}" to Kanban!`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add task.');
    }
  };

  const handleCreateMeeting = async (e) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title || !workspaceId) return;

    setCreating(true);
    try {
      const res = await api.post('/meetings', { workspace_id: workspaceId, title });
      const created = res.data.meeting;
      setMeetings((prev) => [created, ...prev]);
      setNewTitle('');
      await enterMeetingRoom(created);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create meeting.');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinByCode = async (e) => {
    e.preventDefault();
    const raw = joinCodeInput.trim();
    const code = raw.includes('/meet/') ? raw.split('/meet/').pop().split(/[?#]/)[0] : raw;
    if (!code) return;
    try {
      const res = await api.get(`/meetings/code/${encodeURIComponent(code)}`);
      if (res.data?.meeting) {
        setJoinCodeInput('');
        await enterMeetingRoom(res.data.meeting);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Meeting code not found in your organization.');
    }
  };

  const handleDeleteMeeting = async (meeting) => {
    if (!window.confirm(`Delete meeting "${meeting.title}"?`)) return;
    try {
      await api.delete(`/meetings/${meeting.id}`);
      setMeetings((prev) => prev.filter((m) => m.id !== meeting.id));
      toast.success('Meeting removed');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete meeting.');
    }
  };

  const copyRoomLink = (roomCode) => {
    const url = `${window.location.origin}/meet/${roomCode}`;
    navigator.clipboard.writeText(url);
    toast.success(`Copied invite link (${roomCode})`);
  };

  // Active Google Meet Room View
  if (activeMeeting) {
    const allTiles = [
      {
        key: 'self',
        stream: localStream,
        name: user?.name || 'You',
        avatarUrl: user?.avatar_url,
        micMuted,
        camOff,
        handRaised,
        screenSharing,
        isSelf: true,
      },
      ...remotePeers.map((p) => ({
        key: p.socketId,
        stream: p.stream,
        name: p.user?.name || 'Teammate',
        avatarUrl: p.user?.avatar_url,
        micMuted: p.micMuted,
        camOff: p.camOff,
        handRaised: p.handRaised,
        screenSharing: p.screenSharing,
        isSelf: false,
      })),
    ];

    const autoSpotlight = allTiles.find((t) => t.key === pinnedKey) || allTiles.find((t) => t.screenSharing) || null;
    const gridTiles = autoSpotlight ? allTiles.filter((t) => t.key !== autoSpotlight.key) : allTiles;

    return (
      <div className="bg-slate-950 text-slate-100 rounded-2xl border border-slate-800 shadow-xl overflow-hidden flex flex-col min-h-[640px]">
        {/* Call Top Bar */}
        <div className="px-5 py-3 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base font-bold text-white truncate">{activeMeeting.title}</h2>
              <div className="text-xs text-slate-400 flex items-center gap-2">
                <span>{formatDuration(elapsedSeconds)}</span>
                <span>•</span>
                <span className="font-mono">{activeMeeting.room_code}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-slate-800 text-slate-200 border border-slate-700">
              <Users className="w-3.5 h-3.5 text-brand-400" />
              {allTiles.length} in call
            </span>
            <button
              type="button"
              onClick={() => copyRoomLink(activeMeeting.room_code)}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy Link
            </button>
          </div>
        </div>

        {hardwareNotice && (
          <div className="px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 text-amber-200 text-xs text-center">
            {hardwareNotice}
          </div>
        )}

        {/* Main Video Stage + Optional Side Drawer */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 p-4 gap-4">
          <div className="flex-1 flex flex-col gap-4 min-w-0">
            {autoSpotlight && (
              <VideoStreamTile
                {...autoSpotlight}
                isPinned
                onTogglePin={() => setPinnedKey(pinnedKey === autoSpotlight.key ? null : autoSpotlight.key)}
              />
            )}

            <div
              className={`grid gap-4 flex-1 ${
                gridTiles.length <= 1
                  ? 'grid-cols-1'
                  : gridTiles.length === 2
                  ? 'grid-cols-1 md:grid-cols-2'
                  : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
              }`}
            >
              {gridTiles.map((tile) => (
                <VideoStreamTile
                  key={tile.key}
                  {...tile}
                  isPinned={false}
                  onTogglePin={() => setPinnedKey(tile.key)}
                />
              ))}
            </div>
          </div>

          {/* Right Drawer: Chat & AI Meeting Notes */}
          {drawerTab && (
            <aside className="w-full lg:w-80 bg-slate-900 rounded-xl border border-slate-800 flex flex-col min-h-[320px] max-h-[520px]">
              <div className="flex border-b border-slate-800 p-1.5 gap-1">
                <button
                  type="button"
                  onClick={() => setDrawerTab('chat')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${
                    drawerTab === 'chat'
                      ? 'bg-brand-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  In-Call Chat ({chatMessages.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerTab('notes')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${
                    drawerTab === 'notes'
                      ? 'bg-brand-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  AI Notes &amp; Tasks
                </button>
              </div>

              {drawerTab === 'chat' ? (
                <>
                  <div className="flex-1 overflow-y-auto p-3 space-y-2.5 text-xs">
                    {chatMessages.length === 0 ? (
                      <p className="text-slate-500 text-center py-8">
                        Send a quick message to everyone on this call.
                      </p>
                    ) : (
                      chatMessages.map((m) => (
                        <div key={m.id} className="bg-slate-800/80 rounded-lg p-2.5 space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-brand-300">{m.sender?.name}</span>
                            <span className="text-slate-500">
                              {new Date(m.created_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <p className="text-slate-200 break-words">{m.content}</p>
                        </div>
                      ))
                    )}
                  </div>
                  <form onSubmit={handleSendChat} className="p-2.5 border-t border-slate-800 flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Send message in call..."
                      className="flex-1 px-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                    <button
                      type="submit"
                      disabled={!chatInput.trim()}
                      className="p-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg disabled:opacity-40"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </>
              ) : (
                <div className="flex-1 flex flex-col p-3 gap-2.5 overflow-y-auto text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={toggleSpeechDictation}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition ${
                        dictating
                          ? 'bg-rose-600 text-white'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                      }`}
                    >
                      <Mic className="w-3 h-3" />
                      {dictating ? 'Stop Dictation' : 'Voice Dictate'}
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveNotes}
                      disabled={savingNotes}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md font-medium"
                    >
                      <Save className="w-3 h-3" />
                      {savingNotes ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={handleExtractMeetingTasks}
                      disabled={extractingAi}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md font-medium"
                    >
                      <Sparkles className="w-3 h-3" />
                      {extractingAi ? 'Extracting...' : 'AI Tasks'}
                    </button>
                  </div>

                  <textarea
                    value={notesDraft}
                    onChange={(e) => handleNotesChange(e.target.value)}
                    placeholder="Shared meeting notes & live transcript (syncs across participants)..."
                    rows={6}
                    className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />

                  {aiItems.length > 0 && (
                    <div className="space-y-2 pt-1 border-t border-slate-800">
                      <div className="text-[11px] font-semibold text-indigo-300 uppercase">
                        Extracted Action Items
                      </div>
                      {aiItems.map((item, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-800/80 p-2 rounded-lg flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-slate-100 truncate">{item.title}</div>
                            <div className="text-[10px] text-slate-400">
                              {item.priority} • {item.estimated_days}d
                            </div>
                          </div>
                          {addedItems.has(idx) ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px] shrink-0">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Added
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAddActionToKanban(item, idx)}
                              className="px-2 py-1 bg-brand-600 hover:bg-brand-500 text-white rounded text-[11px] font-medium shrink-0"
                            >
                              + Kanban
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </aside>
          )}
        </div>

        {/* Floating Google Meet Bottom Control Dock */}
        <div className="px-4 py-3 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={toggleMic}
            title={micMuted ? 'Unmute microphone' : 'Mute microphone'}
            className={`p-3 rounded-full transition ${
              micMuted
                ? 'bg-rose-600 hover:bg-rose-500 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-100'
            }`}
          >
            {micMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          <button
            type="button"
            onClick={toggleCam}
            title={camOff ? 'Turn camera on' : 'Turn camera off'}
            className={`p-3 rounded-full transition ${
              camOff
                ? 'bg-rose-600 hover:bg-rose-500 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-100'
            }`}
          >
            {camOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
          </button>

          <button
            type="button"
            onClick={toggleScreenShare}
            title={screenSharing ? 'Stop presenting' : 'Present screen'}
            className={`p-3 rounded-full transition ${
              screenSharing
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-100'
            }`}
          >
            {screenSharing ? <MonitorOff className="w-5 h-5" /> : <MonitorUp className="w-5 h-5" />}
          </button>

          <button
            type="button"
            onClick={toggleHand}
            title="Raise hand"
            className={`p-3 rounded-full transition ${
              handRaised
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-100'
            }`}
          >
            <Hand className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => setDrawerTab((prev) => (prev ? null : 'chat'))}
            title="Toggle chat & AI notes"
            className={`p-3 rounded-full transition ${
              drawerTab
                ? 'bg-brand-600 hover:bg-brand-500 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-100'
            }`}
          >
            <MessageSquare className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={handleLeaveCall}
            title="Leave call"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm transition"
          >
            <PhoneOff className="w-5 h-5" />
            Leave
          </button>
        </div>
      </div>
    );
  }

  // Lobby View
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Video className="w-6 h-6 text-brand-600" />
            Workspace Video Meetings
          </h2>
          <p className="text-sm text-slate-500">
            WebRTC HD video, screen sharing, in-call chat &amp; AI action-item capture for your organization.
          </p>
        </div>

        {workspaces.length > 1 && (
          <select
            value={workspaceId || ''}
            onChange={(e) => setSelectedWorkspaceId(Number(e.target.value))}
            className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 shadow-sm"
          >
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Launch & Join Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <form
          onSubmit={handleCreateMeeting}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3"
        >
          <h3 className="text-sm font-bold text-slate-800">Start New Meeting</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Daily Standup or Sprint Review"
              className="flex-1 px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              type="submit"
              disabled={creating || newTitle.trim().length < 2 || !workspaceId}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {creating ? 'Starting...' : 'Start Call'}
            </button>
          </div>
        </form>

        <form
          onSubmit={handleJoinByCode}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3"
        >
          <h3 className="text-sm font-bold text-slate-800">Join With Room Code or Link</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value)}
              placeholder="Enter meet-xxxxxxxx or paste /meet/... link"
              className="flex-1 px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              type="submit"
              disabled={!joinCodeInput.trim()}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-semibold transition disabled:opacity-40"
            >
              Join
            </button>
          </div>
        </form>
      </div>

      {/* Existing Workspace Rooms */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">Workspace Meeting Rooms</h3>
          <span className="text-xs text-slate-400">Encrypted org-only Socket.IO + WebRTC mesh</span>
        </div>

        {loadingList ? (
          <p className="text-sm text-slate-400 py-6 text-center">Loading meetings...</p>
        ) : meetings.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <Video className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-medium text-slate-700">No meetings yet</p>
            <p className="text-xs text-slate-500">
              Start an instant call above and share the invite link with teammates in your organization.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {meetings.map((m) => (
              <div
                key={m.id}
                className="p-4 rounded-xl border border-slate-200 hover:border-brand-300 bg-slate-50/50 flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-800">{m.title}</div>
                    <div className="text-xs text-slate-500">
                      Host: {m.host_name || 'Member'} • Code:{' '}
                      <span className="font-mono text-slate-700">{m.room_code}</span>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                      m.active_participants > 0
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <Users className="w-3 h-3" />
                    {m.active_participants} live
                  </span>
                </div>

                {m.transcript && (
                  <p className="text-xs text-slate-600 bg-white px-2.5 py-1.5 rounded border border-slate-200 line-clamp-2 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{m.transcript}</span>
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => enterMeetingRoom(m)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-semibold transition"
                    >
                      <Video className="w-3.5 h-3.5" />
                      Join Call
                    </button>
                    <button
                      type="button"
                      onClick={() => copyRoomLink(m.room_code)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-medium transition"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy Link
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeleteMeeting(m)}
                    title="Delete meeting room"
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
