import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Send, Hash, UserCircle, Plus, MessageCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import { createAuthenticatedSocket } from '../utils/realtime';

export default function Chat() {
  const { user } = useAuth();
  const { workspaceId, orgId, members } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();

  const [channels, setChannels] = useState([]);
  const [currentChannelId, setCurrentChannelId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [typingUser, setTypingUser] = useState(null);
  const [connected, setConnected] = useState(false);

  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [creatingChannel, setCreatingChannel] = useState(false);

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadChannels = useCallback(async () => {
    if (!workspaceId) {
      setChannels([]);
      setCurrentChannelId(null);
      return [];
    }
    try {
      const res = await api.get(`/chat/channels/${workspaceId}`);
      const list = res.data?.channels || [];
      setChannels(list);
      setCurrentChannelId((prev) =>
        prev && list.some((c) => c.id === prev) ? prev : (list[0]?.id ?? null)
      );
      return list;
    } catch (err) {
      console.error('Failed to load channels', err);
      return [];
    }
  }, [workspaceId]);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  const handleOpenDm = useCallback(
    async (recipientUserId) => {
      if (!orgId || !recipientUserId || recipientUserId === user?.id) return;
      try {
        const res = await api.post('/chat/dm', {
          org_id: orgId,
          recipient_user_id: Number(recipientUserId),
        });
        const dmChannel = res.data.channel;
        await loadChannels();
        setCurrentChannelId(dmChannel.id);
      } catch (err) {
        toast.error(err.response?.data?.error || 'Failed to open direct message.');
      }
    },
    [orgId, user?.id, loadChannels]
  );

  // Support deep link from Team page: /chat?dmUserId=123
  useEffect(() => {
    const dmUserId = Number(searchParams.get('dmUserId'));
    if (dmUserId && orgId) {
      handleOpenDm(dmUserId);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, orgId, handleOpenDm, setSearchParams]);

  // Fetch message history when active channel changes
  useEffect(() => {
    if (!currentChannelId) {
      setMessages([]);
      return;
    }
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

  // Socket.IO connection & listeners
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token || !currentChannelId) return;

    const socket = createAuthenticatedSocket(io);
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

  const handleCreateChannel = async (e) => {
    e.preventDefault();
    const trimmed = newChannelName.trim();
    if (!trimmed || !workspaceId) return;
    setCreatingChannel(true);
    try {
      const res = await api.post('/chat/channels', {
        workspace_id: workspaceId,
        name: trimmed,
      });
      const created = res.data.channel;
      setNewChannelName('');
      setShowNewChannel(false);
      await loadChannels();
      setCurrentChannelId(created.id);
      toast.success(`Channel #${created.name} created`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create channel.');
    } finally {
      setCreatingChannel(false);
    }
  };

  const handleInputChange = (e) => {
    setInputText(e.target.value);
    if (socketRef.current && user && currentChannelId) {
      socketRef.current.emit('typing:start', {
        channelId: currentChannelId,
        userName: user.name,
      });
      setTimeout(() => {
        socketRef.current?.emit('typing:stop', { channelId: currentChannelId });
      }, 1500);
    }
  };

  const handleSend = (e) => {
    e.preventDefault();
    if (!inputText.trim() || !currentChannelId) return;

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

  const publicChannels = channels.filter((c) => c.type !== 'direct');
  const dmChannels = channels.filter((c) => c.type === 'direct');
  const activeChannel = channels.find((c) => c.id === currentChannelId);
  const currentChannelLabel = activeChannel
    ? activeChannel.type === 'direct'
      ? `@ ${activeChannel.display_name || activeChannel.name}`
      : `# ${activeChannel.display_name || activeChannel.name}`
    : 'channel';
  const teammates = (members || []).filter((m) => m.id !== user?.id);

  return (
    <div className="h-[calc(100vh-8rem)] bg-white rounded-xl border border-slate-200 shadow-sm flex overflow-hidden">
      {/* Channels & Direct Messages Sidebar */}
      <div className="hidden md:flex w-64 border-r border-slate-200 bg-slate-50 flex-col shrink-0">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 text-sm">Channels</h3>
          <button
            type="button"
            onClick={() => setShowNewChannel((p) => !p)}
            title="Create channel"
            className="p-1 text-slate-500 hover:text-brand-600 hover:bg-white rounded"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {showNewChannel && (
          <form onSubmit={handleCreateChannel} className="p-2.5 border-b border-slate-200 bg-white flex gap-1.5">
            <input
              type="text"
              required
              minLength={2}
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              placeholder="e.g. sprint-qa"
              className="flex-1 min-w-0 px-2.5 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <button
              type="submit"
              disabled={creatingChannel}
              className="px-2 py-1 bg-brand-600 text-white rounded text-xs font-medium disabled:opacity-50"
            >
              Add
            </button>
          </form>
        )}

        <div className="p-3 space-y-4 flex-1 overflow-y-auto">
          <div className="space-y-1">
            {publicChannels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => setCurrentChannelId(ch.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm transition ${
                  currentChannelId === ch.id
                    ? 'bg-brand-50 text-brand-700 shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Hash className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="truncate">{ch.display_name || ch.name}</span>
              </button>
            ))}
          </div>

          {/* Direct Messages Section */}
          <div>
            <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Direct Messages
            </div>
            {teammates.length === 0 ? (
              <p className="px-2 text-xs text-slate-400">Invite teammates on Team page to chat 1-on-1.</p>
            ) : (
              <div className="space-y-1">
                {teammates.map((m) => {
                  const existingDm = dmChannels.find((d) => d.peer_id === m.id);
                  const isActive = existingDm && existingDm.id === currentChannelId;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() =>
                        existingDm ? setCurrentChannelId(existingDm.id) : handleOpenDm(m.id)
                      }
                      className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition ${
                        isActive
                          ? 'bg-brand-50 text-brand-700 font-medium shadow-sm'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span className="truncate">{m.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chat Messages Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="h-14 border-b border-slate-200 px-3 sm:px-6 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <select
              value={currentChannelId || ''}
              onChange={(e) => setCurrentChannelId(Number(e.target.value))}
              aria-label="Select channel"
              className="md:hidden text-sm font-semibold text-slate-800 bg-slate-100 py-1 px-2 rounded border border-slate-200 focus:outline-none max-w-[200px]"
            >
              {channels.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.type === 'direct' ? `@ ${ch.display_name}` : `# ${ch.display_name || ch.name}`}
                </option>
              ))}
            </select>
            <span className="hidden md:inline font-semibold text-slate-800 text-sm truncate">
              {currentChannelLabel}
            </span>
          </div>
          <span
            className={`text-[11px] sm:text-xs font-medium flex items-center gap-1.5 shrink-0 ${
              connected ? 'text-emerald-600' : 'text-slate-400'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                connected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
              }`}
            ></span>
            {connected ? 'Live' : 'Connecting...'}
          </span>
        </div>

        {/* Message Feed */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-slate-50/50">
          {messages.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No messages in {currentChannelLabel} yet. Say hello!
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = user?.id === msg.sender_id || user?.name === msg.sender_name;
              const timeStr = msg.created_at
                ? new Date(msg.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
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
            })
          )}
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
            placeholder={`Message ${currentChannelLabel}...`}
            className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || !connected}
            className="bg-brand-600 hover:bg-brand-700 text-white px-5 py-2.5 rounded-lg transition font-medium flex items-center gap-2 text-sm shadow-sm disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>
      </div>
    </div>
  );
}
