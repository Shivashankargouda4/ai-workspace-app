import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import {
  FileText,
  Plus,
  Trash2,
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Code,
  Undo2,
  Redo2,
  Wifi,
  WifiOff,
  RefreshCw,
  Sparkles,
  Users,
  Edit3,
  Check,
  X,
  History,
  BookmarkPlus,
  Download,
  RotateCcw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAuth } from '../context/AuthContext';

const USER_COLORS = ['#4f46e5', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];

function getUserColor(user) {
  const seed = Number(user?.id) || (user?.name || 'u').charCodeAt(0);
  return USER_COLORS[Math.abs(seed) % USER_COLORS.length];
}

function getCollabWsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/collab`;
}

function isJwtExpiringSoon(token, bufferSeconds = 60) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));
    if (!payload.exp) return false;
    return payload.exp * 1000 - Date.now() < bufferSeconds * 1000;
  } catch {
    return true;
  }
}

async function getFreshCollabToken(forceRefresh = false) {
  const existing = localStorage.getItem('accessToken');
  if (!forceRefresh && existing && !isJwtExpiringSoon(existing, 60)) {
    return existing;
  }
  try {
    const res = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
    const nextToken = res.data?.accessToken;
    if (nextToken) {
      localStorage.setItem('accessToken', nextToken);
      return nextToken;
    }
  } catch {
    // Fallback to existing token if refresh endpoint rejects
  }
  return existing || '';
}

function ToolbarButton({ active, onClick, title, children, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded-md text-xs font-medium transition ${
        active
          ? 'bg-brand-600 text-white shadow-sm'
          : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
      } disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

function htmlToMarkdown(html, title) {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(html || '', 'text/html');

  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = node.tagName.toLowerCase();
    const inner = Array.from(node.childNodes).map(walk).join('');

    if (tag === 'h1') return `# ${inner.trim()}\n\n`;
    if (tag === 'h2') return `## ${inner.trim()}\n\n`;
    if (tag === 'h3') return `### ${inner.trim()}\n\n`;
    if (tag === 'p') return `${inner.trim()}\n\n`;
    if (tag === 'strong' || tag === 'b') return `**${inner}**`;
    if (tag === 'em' || tag === 'i') return `*${inner}*`;
    if (tag === 's' || tag === 'del') return `~~${inner}~~`;
    if (tag === 'code') {
      if (node.parentElement?.tagName.toLowerCase() === 'pre') return inner;
      return `\`${inner}\``;
    }
    if (tag === 'pre') return `\`\`\`\n${inner.trim()}\n\`\`\`\n\n`;
    if (tag === 'blockquote') {
      return (
        inner
          .trim()
          .split('\n')
          .map((l) => `> ${l}`)
          .join('\n') + '\n\n'
      );
    }
    if (tag === 'li') return `- ${inner.trim()}\n`;
    if (tag === 'ul' || tag === 'ol') return `${inner}\n`;
    if (tag === 'br') return '\n';
    return inner;
  }

  const body = Array.from(parsed.body.childNodes).map(walk).join('').trim();
  return `# ${title}\n\n${body}\n`;
}

function TiptapSurface({ doc, ydoc, provider, user, userColor }) {
  const [aiSummary, setAiSummary] = useState(null);
  const [summarizing, setSummarizing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [snapshots, setSnapshots] = useState([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [restoringId, setRestoringId] = useState(null);

  const loadSnapshots = useCallback(async () => {
    setLoadingSnapshots(true);
    try {
      const res = await api.get(`/docs/${doc.id}/snapshots`);
      setSnapshots(res.data?.snapshots || []);
    } catch {
      toast.error('Failed to load document snapshots.');
    } finally {
      setLoadingSnapshots(false);
    }
  }, [doc.id]);

  const handleSaveSnapshot = async () => {
    setSavingSnapshot(true);
    try {
      await api.post(`/docs/${doc.id}/snapshots`, {});
      toast.success('Version snapshot saved!');
      if (showHistory) await loadSnapshots();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save snapshot.');
    } finally {
      setSavingSnapshot(false);
    }
  };

  const handleToggleHistory = () => {
    const next = !showHistory;
    setShowHistory(next);
    if (next) loadSnapshots();
  };

  const handleRestoreSnapshot = async (snap) => {
    if (!window.confirm(`Restore document to "${snap.label}"?`)) return;
    setRestoringId(snap.id);
    try {
      await api.post(`/docs/${doc.id}/snapshots/${snap.id}/restore`);
      toast.success('Document restored to snapshot!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to restore snapshot.');
    } finally {
      setRestoringId(null);
    }
  };

  const handleExportMarkdown = () => {
    if (!editor) return;
    const md = htmlToMarkdown(editor.getHTML(), doc.title);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.title.replace(/[^a-z0-9-_]+/gi, '_') || 'document'}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          undoRedo: false,
        }),
        Collaboration.configure({
          document: ydoc,
          field: 'default',
        }),
        CollaborationCaret.configure({
          provider,
          user: {
            name: user?.name || 'Workspace Member',
            color: userColor,
          },
        }),
      ],
    },
    [ydoc, provider]
  );

  const handleSummarizeDoc = async () => {
    const textContent = editor?.getText()?.trim();
    if (!textContent) {
      toast.error('Write some notes before requesting an AI summary.');
      return;
    }
    setSummarizing(true);
    try {
      const res = await api.post('/ai/summarize', { text: textContent });
      setAiSummary({ text: res.data.summary, source: res.data.source });
      toast.success('Document summarized!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to summarize document.');
    } finally {
      setSummarizing(false);
    }
  };

  if (!editor) {
    return (
      <div className="p-8 text-center text-sm text-slate-500">
        Initializing collaborative editor...
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Rich Text Formatting Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <div className="flex flex-wrap items-center gap-1">
          <ToolbarButton
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Bold"
          >
            <Bold className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italic"
          >
            <Italic className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            title="Strikethrough"
          >
            <Strikethrough className="w-4 h-4" />
          </ToolbarButton>
          <div className="w-px h-5 bg-slate-300 mx-1" />
          <ToolbarButton
            active={editor.isActive('heading', { level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            title="Heading 1"
          >
            <Heading1 className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('heading', { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="Heading 2"
          >
            <Heading2 className="w-4 h-4" />
          </ToolbarButton>
          <div className="w-px h-5 bg-slate-300 mx-1" />
          <ToolbarButton
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Bullet List"
          >
            <List className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Ordered List"
          >
            <ListOrdered className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            title="Blockquote"
          >
            <Quote className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('codeBlock')}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            title="Code Block"
          >
            <Code className="w-4 h-4" />
          </ToolbarButton>
          <div className="w-px h-5 bg-slate-300 mx-1" />
          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            title="Undo"
          >
            <Undo2 className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            title="Redo"
          >
            <Redo2 className="w-4 h-4" />
          </ToolbarButton>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleSaveSnapshot}
            disabled={savingSnapshot}
            title="Save version snapshot"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-medium transition disabled:opacity-50"
          >
            <BookmarkPlus className="w-3.5 h-3.5 text-brand-600" />
            {savingSnapshot ? 'Saving...' : 'Save Snapshot'}
          </button>
          <button
            type="button"
            onClick={handleToggleHistory}
            title="View & restore snapshots"
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition border ${
              showHistory
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Snapshots
          </button>
          <button
            type="button"
            onClick={handleExportMarkdown}
            title="Export as Markdown (.md)"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-medium transition"
          >
            <Download className="w-3.5 h-3.5" />
            Export .md
          </button>
          <button
            type="button"
            onClick={handleSummarizeDoc}
            disabled={summarizing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition shadow-sm disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {summarizing ? 'Summarizing...' : 'AI Summarize'}
          </button>
        </div>
      </div>

      {/* Inline AI Summary Callout */}
      {aiSummary && (
        <div className="mx-5 mt-4 p-3.5 rounded-lg bg-indigo-50 border border-indigo-200 text-xs text-slate-800 space-y-1">
          <div className="flex items-center justify-between font-semibold text-indigo-700">
            <span>AI Summary for &ldquo;{doc.title}&rdquo;</span>
            <button
              type="button"
              onClick={() => setAiSummary(null)}
              className="text-slate-400 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="whitespace-pre-line leading-relaxed">{aiSummary.text}</p>
        </div>
      )}

      {/* Version Snapshots Drawer + ProseMirror Surface */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        <div className="tiptap-editor flex-1 p-6 overflow-y-auto bg-white">
          <EditorContent editor={editor} />
        </div>

        {showHistory && (
          <aside className="w-full lg:w-72 border-t lg:border-t-0 lg:border-l border-slate-200 bg-slate-50 p-4 overflow-y-auto space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Version Snapshots
              </h4>
              <button
                type="button"
                onClick={() => setShowHistory(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {loadingSnapshots ? (
              <p className="text-xs text-slate-400">Loading snapshots...</p>
            ) : snapshots.length === 0 ? (
              <p className="text-xs text-slate-500">
                No snapshots yet. Click &ldquo;Save Snapshot&rdquo; above to capture a checkpoint.
              </p>
            ) : (
              snapshots.map((snap) => (
                <div
                  key={snap.id}
                  className="bg-white p-3 rounded-lg border border-slate-200 text-xs space-y-1.5"
                >
                  <div className="font-semibold text-slate-800 truncate">{snap.label}</div>
                  <div className="text-[11px] text-slate-400">
                    {snap.author_name || 'Member'} • {new Date(snap.created_at).toLocaleString()}
                  </div>
                  {snap.content && (
                    <p className="text-[11px] text-slate-600 line-clamp-2">{snap.content}</p>
                  )}
                  <button
                    type="button"
                    disabled={restoringId === snap.id}
                    onClick={() => handleRestoreSnapshot(snap)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-50 hover:bg-brand-600 hover:text-white text-brand-700 rounded text-[11px] font-medium transition disabled:opacity-50"
                  >
                    <RotateCcw className="w-3 h-3" />
                    {restoringId === snap.id ? 'Restoring...' : 'Restore'}
                  </button>
                </div>
              ))
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

function CollaborativeEditorPane({ doc, user, onRenameDoc }) {
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState('connecting');
  const [isSynced, setIsSynced] = useState(false);
  const [unsyncedChanges, setUnsyncedChanges] = useState(0);
  const [peers, setPeers] = useState([]);
  const [authError, setAuthError] = useState(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(doc.title);

  const userColor = getUserColor(user);

  useEffect(() => {
    setTitleDraft(doc.title);
    setEditingTitle(false);
  }, [doc.id, doc.title]);

  useEffect(() => {
    let active = true;
    const ydoc = new Y.Doc();
    let refreshedOnce = false;

    const provider = new HocuspocusProvider({
      url: getCollabWsUrl(),
      name: `doc:${doc.id}`,
      document: ydoc,
      token: () => getFreshCollabToken(false),
      onStatus: ({ status: nextStatus }) => {
        if (active) setStatus(nextStatus);
      },
      onSynced: ({ state }) => {
        if (active) {
          setIsSynced(Boolean(state));
          if (state) setAuthError(null);
        }
      },
      onUnsyncedChanges: ({ number }) => {
        if (active) setUnsyncedChanges(number || 0);
      },
      onAwarenessChange: ({ states }) => {
        if (!active) return;
        const unique = [];
        const seen = new Set();
        states.forEach((s) => {
          if (s?.user?.name && !seen.has(`${s.clientId}`)) {
            seen.add(`${s.clientId}`);
            unique.push({
              clientId: s.clientId,
              name: s.user.name,
              color: s.user.color || '#4f46e5',
            });
          }
        });
        setPeers(unique);
      },
      onAuthenticationFailed: async ({ reason }) => {
        if (!active) return;
        if (reason === 'TOKEN_EXPIRED' && !refreshedOnce) {
          refreshedOnce = true;
          await getFreshCollabToken(true);
          provider.connect();
          return;
        }
        setAuthError(reason || 'Authentication failed');
      },
    });

    setSession({ ydoc, provider });

    const handleOffline = () => {
      provider.disconnect();
    };
    const handleOnline = () => {
      provider.connect();
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      active = false;
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      provider.destroy();
      ydoc.destroy();
      setSession(null);
    };
  }, [doc.id]);

  const submitTitleRename = async (e) => {
    e.preventDefault();
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === doc.title) {
      setEditingTitle(false);
      setTitleDraft(doc.title);
      return;
    }
    const ok = await onRenameDoc(doc.id, trimmed);
    if (ok) setEditingTitle(false);
  };

  const statusBadge = () => {
    if (authError) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
          <WifiOff className="w-3.5 h-3.5" />
          {authError}
        </span>
      );
    }
    if (status === 'disconnected') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
          <WifiOff className="w-3.5 h-3.5" />
          Offline{unsyncedChanges > 0 ? ` (${unsyncedChanges} queued)` : ''}
        </span>
      );
    }
    if (status === 'connecting' || !isSynced || unsyncedChanges > 0) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          Syncing...
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
        <Wifi className="w-3.5 h-3.5" />
        Synced Live
      </span>
    );
  };

  return (
    <div className="flex flex-col flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden min-h-[540px]">
      {/* Header: Document Title + Live Sync Status + Active Peers */}
      <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-white">
        <div className="flex items-center gap-2 min-w-0">
          {editingTitle ? (
            <form onSubmit={submitTitleRename} className="flex items-center gap-1.5">
              <input
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                autoFocus
                className="px-2.5 py-1 text-base font-semibold border border-brand-500 rounded-md focus:outline-none"
              />
              <button
                type="submit"
                className="p-1.5 bg-brand-600 text-white rounded-md hover:bg-brand-700"
                title="Save title"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingTitle(false);
                  setTitleDraft(doc.title);
                }}
                className="p-1.5 bg-slate-100 text-slate-600 rounded-md hover:bg-slate-200"
                title="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <>
              <h3 className="text-lg font-bold text-slate-800 truncate">{doc.title}</h3>
              <button
                type="button"
                onClick={() => setEditingTitle(true)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded"
                title="Rename document"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {peers.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              <div className="flex flex-wrap gap-1">
                {peers.map((p) => (
                  <span
                    key={p.clientId}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200"
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: p.color }}
                    />
                    {p.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {statusBadge()}
        </div>
      </div>

      {session && (
        <TiptapSurface
          key={doc.id}
          doc={doc}
          ydoc={session.ydoc}
          provider={session.provider}
          user={user}
          userColor={userColor}
        />
      )}
    </div>
  );
}

export default function Documents() {
  const { user } = useAuth();
  const { workspaceId: defaultWorkspaceId, workspaces } = useWorkspace();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(null);
  const workspaceId = workspaces.some((w) => w.id === selectedWorkspaceId)
    ? selectedWorkspaceId
    : defaultWorkspaceId;
  const [docs, setDocs] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const titleInputRef = useRef(null);

  const loadWorkspaceDocs = useCallback(async (wsId) => {
    if (!wsId) {
      setDocs([]);
      setSelectedDocId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get(`/docs/workspace/${wsId}`);
      const list = res.data?.documents || [];
      setDocs(list);
      setSelectedDocId((prev) => {
        if (prev && list.some((d) => d.id === prev)) return prev;
        return list[0]?.id || null;
      });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load documents.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkspaceDocs(workspaceId);
  }, [workspaceId, loadWorkspaceDocs]);

  // Live Socket.IO sync for document list across all active teammate tabs
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!workspaceId || !token) return;

    const socketUrl =
      window.location.hostname === 'localhost' && window.location.port === '5173'
        ? 'http://localhost:5000'
        : window.location.origin;

    const socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      socket.emit('workspace:join', { workspaceId });
    });

    socket.on('docs:changed', (payload) => {
      if (Number(payload?.workspaceId) !== Number(workspaceId)) return;

      if (payload.action === 'created' && payload.document) {
        setDocs((prev) => {
          if (prev.some((d) => d.id === payload.document.id)) return prev;
          return [payload.document, ...prev];
        });
        setSelectedDocId((prev) => prev || payload.document.id);
      } else if (payload.action === 'renamed' && payload.document) {
        setDocs((prev) =>
          prev.map((d) =>
            d.id === payload.document.id ? { ...d, title: payload.document.title } : d
          )
        );
      } else if (payload.action === 'deleted' && payload.docId) {
        setDocs((prev) => prev.filter((d) => d.id !== payload.docId));
      }
    });

    return () => {
      socket.emit('workspace:leave', { workspaceId });
      socket.disconnect();
    };
  }, [workspaceId]);

  useEffect(() => {
    if (docs.length === 0) {
      if (selectedDocId !== null) setSelectedDocId(null);
      return;
    }
    if (!docs.some((d) => d.id === selectedDocId)) {
      setSelectedDocId(docs[0].id);
    }
  }, [docs, selectedDocId]);

  const createDocumentWithTitle = async (rawTitle) => {
    const title = rawTitle.trim();
    if (!title || !workspaceId) return;

    setCreating(true);
    try {
      const res = await api.post('/docs', {
        workspace_id: workspaceId,
        title,
        content: '',
      });
      const created = res.data.document;
      setDocs((prev) => (prev.some((d) => d.id === created.id) ? prev : [created, ...prev]));
      setSelectedDocId(created.id);
      setNewTitle('');
      toast.success(`Created "${created.title}"`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create document.');
    } finally {
      setCreating(false);
    }
  };

  const handleCreateDoc = async (e) => {
    e.preventDefault();
    await createDocumentWithTitle(newTitle);
  };

  const handleQuickCreateDoc = async () => {
    const fallbackTitle = newTitle.trim() || `Shared Notes (${new Date().toLocaleDateString()})`;
    await createDocumentWithTitle(fallbackTitle);
  };

  const handleRenameDoc = async (docId, title) => {
    try {
      const res = await api.patch(`/docs/${docId}`, { title });
      const updated = res.data.document;
      setDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, title: updated.title } : d)));
      toast.success('Document renamed');
      return true;
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to rename document.');
      return false;
    }
  };

  const handleDeleteDoc = async (doc) => {
    if (!window.confirm(`Delete "${doc.title}"? This removes the document permanently.`)) {
      return;
    }
    try {
      await api.delete(`/docs/${doc.id}`);
      const remaining = docs.filter((d) => d.id !== doc.id);
      setDocs(remaining);
      if (selectedDocId === doc.id) {
        setSelectedDocId(remaining[0]?.id || null);
      }
      toast.success('Document deleted');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete document.');
    }
  };

  const activeDoc = docs.find((d) => d.id === selectedDocId) || null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Collaborative Documents</h2>
          <p className="text-sm text-slate-500">
            Real-time CRDT multi-user notes synced over WebSockets &amp; persisted to PostgreSQL.
          </p>
        </div>

        {workspaces.length > 1 && (
          <select
            value={workspaceId || ''}
            onChange={(e) => {
              const nextWsId = Number(e.target.value);
              setSelectedWorkspaceId(nextWsId);
            }}
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Pane: Document List & Create Form */}
        <div className="lg:col-span-4 xl:col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
          <form onSubmit={handleCreateDoc} className="flex gap-2">
            <input
              ref={titleInputRef}
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="New document title..."
              className="flex-1 min-w-0 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              type="submit"
              disabled={creating || !newTitle.trim()}
              className="inline-flex items-center justify-center px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
              title="Create document"
            >
              <Plus className="w-4 h-4" />
            </button>
          </form>

          <div className="space-y-1.5 max-h-[460px] overflow-y-auto">
            {loading ? (
              <div className="py-6 text-center text-xs text-slate-400">Loading documents...</div>
            ) : docs.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">
                No documents yet. Create one above to start collaborating!
              </div>
            ) : (
              docs.map((doc) => {
                const isSelected = doc.id === selectedDocId;
                return (
                  <div
                    key={doc.id}
                    onClick={() => setSelectedDocId(doc.id)}
                    className={`group flex items-start justify-between gap-2 p-2.5 rounded-lg cursor-pointer transition border ${
                      isSelected
                        ? 'bg-brand-50 border-brand-200 text-brand-900'
                        : 'bg-white border-transparent hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <FileText
                        className={`w-4 h-4 mt-0.5 shrink-0 ${
                          isSelected ? 'text-brand-600' : 'text-slate-400'
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{doc.title}</div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {doc.author_name || 'Member'} •{' '}
                          {new Date(doc.updated_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteDoc(doc);
                      }}
                      className="p-1 text-slate-400 hover:text-rose-600 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition"
                      title="Delete document"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Active Collaborative Editor */}
        <div className="lg:col-span-8 xl:col-span-9">
          {activeDoc ? (
            <CollaborativeEditorPane
              key={activeDoc.id}
              doc={activeDoc}
              user={user}
              onRenameDoc={handleRenameDoc}
            />
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center space-y-4">
              <FileText className="w-10 h-10 text-slate-300 mx-auto" />
              <div className="space-y-1.5">
                <h3 className="text-base font-semibold text-slate-700">
                  Select or create a document
                </h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Shared notes update live across every active teammate tab with multi-cursor presence.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                <button
                  type="button"
                  disabled={creating || !workspaceId}
                  onClick={handleQuickCreateDoc}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium transition shadow-sm disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  {creating ? 'Creating...' : 'Create Shared Document'}
                </button>
                <button
                  type="button"
                  onClick={() => titleInputRef.current?.focus()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition"
                >
                  Name Document First
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
