import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Send, Hash, UserCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function Chat() {
  const { user } = useAuth();
  const [channels, setChannels] = useState([
    { id: 1, name: 'general' },
    { id: 2, name: 'project-discussion' },
  ]);
  const [currentChannelId, setCurrentChannelId] = useState(1);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [typingUser, setTypingUser] = useState(null);
  const [connected, setConnected] = useState(false);

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 1. Fetch channel list
  useEffect(() => {
    const fetchChannels = async () => {
      try {
        const res = await api.get('/chat/channels/1');
        if (res.data.channels?.length > 0) {
          setChannels(res.data.channels);
        }
      } catch (err) {
        console.error('Failed to load channels', err);
      }
    };
    fetchChannels();
  }, []);

  // 2. Fetch message history when channel changes
  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const res = await api.get(`/chat/messages/${currentChannelId}`);
        setMessages(res.data.messages || []);
        scrollToBottom();
      } catch (err) {
        console.error('Failed to load messages', err);
      }
    };
    fetchMessages();
  }, [currentChannelId]);

  // 3. Socket.IO connection & listeners
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    const socket = io('http://localhost:5000', {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('channel:join', { channelId: currentChannelId });
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('message:new', (newMsg) => {
      if (newMsg.channel_id === currentChannelId) {
        setMessages((prev) => [
          ...prev,
          {
            id: newMsg.id,
            channel_id: newMsg.channel_id,
            content: newMsg.content,
            sender_name: newMsg.sender?.name || 'Teammate',
            sender_id: newMsg.user_id,
            avatar_url: newMsg.sender?.avatar_url,
            created_at: newMsg.created_at,
          },
        ]);
        scrollToBottom();
      }
    });

    socket.on('typing:status', ({ channelId, userName, isTyping }) => {
      if (channelId === currentChannelId) {
        setTypingUser(isTyping ? userName : null);
      }
    });

    return () => {
      socket.emit('channel:leave', { channelId: currentChannelId });
      socket.disconnect();
    };
  }, [currentChannelId]);

  // Handle typing debounce
  const handleInputChange = (e) => {
    setInputText(e.target.value);
    if (socketRef.current && user) {
      socketRef.current.emit('typing:start', {
        channelId: currentChannelId,
        userName: user.name,
      });
      setTimeout(() => {
        socketRef.current?.emit('typing:stop', { channelId: currentChannelId });
      }, 1500);
    }
  };

  // Send message
  const handleSend = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    if (socketRef.current && connected) {
      socketRef.current.emit('message:send', {
        channelId: currentChannelId,
        content: inputText.trim(),
      });
      setInputText('');
    } else {
      toast.error('Chat not connected. Please log in.');
    }
  };

  const currentChannelName = channels.find((c) => c.id === currentChannelId)?.name || 'channel';

  return (
    <div className="h-[calc(100vh-8rem)] bg-white rounded-xl border border-slate-200 shadow-sm flex overflow-hidden">
      {/* Channels Sidebar (Desktop) */}
      <div className="hidden md:flex w-64 border-r border-slate-200 bg-slate-50 flex-col shrink-0">
        <div className="p-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800 text-sm">Channels & Rooms</h3>
        </div>
        <div className="p-3 space-y-1 flex-1 overflow-y-auto">
          {channels.map((ch) => (
            <button
              key={ch.id}
              onClick={() => setCurrentChannelId(ch.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm transition ${
                currentChannelId === ch.id
                  ? 'bg-brand-50 text-brand-700 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Hash className="w-4 h-4 text-slate-400" /> {ch.name}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Messages Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="h-14 border-b border-slate-200 px-3 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Hash className="w-5 h-5 text-slate-500 shrink-0" />
            <select
              value={currentChannelId}
              onChange={(e) => setCurrentChannelId(Number(e.target.value))}
              aria-label="Select channel"
              className="md:hidden text-sm font-semibold text-slate-800 bg-slate-100 py-1 px-2 rounded border border-slate-200 focus:outline-none"
            >
              {channels.map((ch) => (
                <option key={ch.id} value={ch.id}>#{ch.name}</option>
              ))}
            </select>
            <span className="hidden md:inline font-semibold text-slate-800 text-sm">{currentChannelName}</span>
          </div>
          <span className={`text-[11px] sm:text-xs font-medium flex items-center gap-1.5 ${connected ? 'text-emerald-600' : 'text-slate-400'}`}>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></span>
            {connected ? 'Live' : 'Connecting...'}
          </span>
        </div>

        {/* Message Feed */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-slate-50/50">
          {messages.map((msg) => {
            const isMe = user?.id === msg.sender_id || user?.name === msg.sender_name;
            const timeStr = msg.created_at
              ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : 'Now';

            return (
              <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-slate-700">{msg.sender_name}</span>
                  <span className="text-[10px] text-slate-400">{timeStr}</span>
                </div>
                <div
                  className={`px-4 py-2.5 rounded-2xl text-sm max-w-md shadow-sm ${
                    isMe
                      ? 'bg-brand-600 text-white rounded-br-none'
                      : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            );
          })}
          {typingUser && (
            <div className="text-xs text-slate-400 italic animate-pulse">
              {typingUser} is typing...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Field */}
        <form onSubmit={handleSend} className="p-4 border-t border-slate-200 bg-white flex gap-3">
          <input
            type="text"
            value={inputText}
            onChange={handleInputChange}
            placeholder={`Message #${currentChannelName}...`}
            className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || !connected}
            className="bg-brand-600 hover:bg-brand-700 text-white px-5 py-2.5 rounded-lg transition font-medium flex items-center gap-2 text-sm shadow-sm disabled:opacity-50"
          >
            <Send className="w-4 h-4" /> Send
          </button>
        </form>
      </div>
    </div>
  );
}
