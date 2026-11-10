import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as Y from 'yjs';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/language/typescript/ts.worker?worker';
import Editor, { loader } from '@monaco-editor/react';
import { MonacoBinding } from 'y-monaco';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { io } from 'socket.io-client';
import {
  Code2,
  Plus,
  Trash2,
  Play,
  Sparkles,
  Download,
  Terminal,
  Eye,
  Users,
  Wifi,
  WifiOff,
  RefreshCw,
  Edit3,
  Check,
  X,
  FileCode2,
  Bug,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAuth } from '../context/AuthContext';
import { getCollabWsUrl, getFreshAuthToken, getSocketUrl, getUserColor } from '../utils/realtime';

// Configure Monaco locally from bundled workers so the IDE runs cleanly even offline
if (typeof self !== 'undefined' && !self.__monacoWorkersConfigured) {
  self.__monacoWorkersConfigured = true;
  self.MonacoEnvironment = {
    getWorker(_, label) {
      if (label === 'json') return new jsonWorker();
      if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
      if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
      if (label === 'typescript' || label === 'javascript') return new tsWorker();
      return new editorWorker();
    },
  };
  loader.config({ monaco });
}

const FILE_TEMPLATES = {
  javascript: '// JavaScript Sandbox\nconsole.log("Hello from Code Studio!");\n',
  python: '# Python (WebAssembly Pyodide)\nprint("Hello from Python in Code Studio!")\n',
  html: '<!DOCTYPE html>\n<html>\n<body style="font-family:sans-serif;padding:24px">\n  <h2>Live HTML Preview</h2>\n  <p>Edit and press Run to render.</p>\n</body>\n</html>\n',
  css: 'body {\n  font-family: system-ui, sans-serif;\n  background: #f8fafc;\n  color: #0f172a;\n}\n',
  json: '{\n  "workspace": "collaborative-ide"\n}\n',
  sql: 'SELECT id, title, status FROM tasks ORDER BY id DESC;\n',
};

function sanitizeCssLabel(name) {
  return String(name || 'Peer').replace(/['"\\]/g, '');
}

async function ensurePyodideLoaded() {
  if (window.__workspacePyodideInstance) return window.__workspacePyodideInstance;
  if (!window.__workspacePyodidePromise) {
    window.__workspacePyodidePromise = new Promise((resolve, reject) => {
      const finishInit = async () => {
        try {
          const py = await window.loadPyodide({
            indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.2/full/',
          });
          window.__workspacePyodideInstance = py;
          resolve(py);
        } catch (err) {
          window.__workspacePyodidePromise = null;
          reject(err);
        }
      };

      if (typeof window.loadPyodide === 'function') {
        finishInit();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.js';
      script.async = true;
      script.onload = finishInit;
      script.onerror = () => {
        window.__workspacePyodidePromise = null;
        reject(new Error('Could not load Pyodide WebAssembly runtime (check internet connection).'));
      };
      document.head.appendChild(script);
    });
  }
  return window.__workspacePyodidePromise;
}

function formatArg(val) {
  if (typeof val === 'string') return val;
  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
}

function buildSandboxedJsSrcDoc(code, runId) {
  const safeCodeLiteral = JSON.stringify(code);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>
    (function(){
      var runId = ${JSON.stringify(runId)};
      function send(level, args){
        try {
          parent.postMessage({ __studioRunId: runId, level: level, text: Array.prototype.map.call(args, function(a){
            if (typeof a === 'string') return a;
            try { return JSON.stringify(a); } catch(e) { return String(a); }
          }).join(' ') }, '*');
        } catch(e){}
      }
      console.log = function(){ send('log', arguments); };
      console.info = function(){ send('info', arguments); };
      console.warn = function(){ send('warn', arguments); };
      console.error = function(){ send('error', arguments); };
      window.onerror = function(msg){ send('error', [String(msg)]); };
      Promise.resolve().then(function(){
        var fn = new Function(${safeCodeLiteral});
        return fn();
      }).then(function(res){
        if (res !== undefined) send('result', [res]);
        parent.postMessage({ __studioRunId: runId, done: true }, '*');
      }).catch(function(err){
        send('error', [err && err.stack ? err.stack : String(err)]);
        parent.postMessage({ __studioRunId: runId, done: true }, '*');
      });
    })();
  <\/script></body></html>`;
}

function MonacoCollabPane({ file, user, allFiles, onUpdateMeta }) {
  const [session, setSession] = useState(null);
  const [editorInstance, setEditorInstance] = useState(null);
  const [status, setStatus] = useState('connecting');
  const [isSynced, setIsSynced] = useState(false);
  const [unsyncedChanges, setUnsyncedChanges] = useState(0);
  const [peers, setPeers] = useState([]);
  const [authError, setAuthError] = useState(null);

  const [editingPath, setEditingPath] = useState(false);
  const [pathDraft, setPathDraft] = useState(file.path);

  const [drawerTab, setDrawerTab] = useState('console');
  const [consoleLines, setConsoleLines] = useState([
    { level: 'info', text: `Ready — open "${file.path}" and press Run Code to execute safely in browser.` },
  ]);
  const [running, setRunning] = useState(false);
  const [previewHtml, setPreviewHtml] = useState(null);
  const [sandboxJob, setSandboxJob] = useState(null);
  const [aiResult, setAiResult] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);

  const userColor = getUserColor(user);
  const activeRunCleanupRef = useRef(null);

  useEffect(() => {
    setPathDraft(file.path);
    setEditingPath(false);
    setAiResult(null);
  }, [file.id, file.path]);

  // Connect Hocuspocus CRDT session for code:<file.id>
  useEffect(() => {
    let active = true;
    const ydoc = new Y.Doc();
    let refreshedOnce = false;

    const provider = new HocuspocusProvider({
      url: getCollabWsUrl(),
      name: `code:${file.id}`,
      document: ydoc,
      token: () => getFreshAuthToken(false),
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
          await getFreshAuthToken(true);
          provider.connect();
          return;
        }
        setAuthError(reason || 'Authentication failed');
      },
    });

    provider.setAwarenessField('user', {
      name: user?.name || 'Developer',
      color: userColor,
    });

    setSession({ ydoc, provider });

    const onOffline = () => provider.disconnect();
    const onOnline = () => provider.connect();
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    return () => {
      active = false;
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      provider.destroy();
      ydoc.destroy();
      setSession(null);
      if (activeRunCleanupRef.current) {
        activeRunCleanupRef.current();
      }
    };
  }, [file.id, user?.name, userColor]);

  // Bind Y.Text('monaco') directly to Monaco model once both editor and provider exist
  useEffect(() => {
    if (!editorInstance || !session) return undefined;
    const model = editorInstance.getModel();
    if (!model) return undefined;

    const ytext = session.ydoc.getText('monaco');
    const binding = new MonacoBinding(
      ytext,
      model,
      new Set([editorInstance]),
      session.provider.awareness
    );

    return () => {
      binding.destroy();
    };
  }, [editorInstance, session]);

  const getCurrentCode = () => editorInstance?.getValue() ?? file.content ?? '';

  const appendLog = useCallback((level, text) => {
    setConsoleLines((prev) => [...prev, { level, text }]);
  }, []);

  const handleRunCode = async () => {
    const code = getCurrentCode();
    const lang = (file.language || 'javascript').toLowerCase();

    if (lang === 'html' || lang === 'css') {
      const siblingHtml =
        lang === 'html'
          ? code
          : allFiles.find((f) => f.language === 'html')?.content ||
            '<div style="padding:24px"><h2>CSS Preview</h2><div class="card">Applied stylesheet!</div></div>';
      const combined =
        lang === 'css' ? `<style>${code}</style>${siblingHtml}` : siblingHtml;
      setPreviewHtml(combined);
      setDrawerTab('preview');
      setConsoleLines([
        { level: 'info', text: `Rendered ${lang.toUpperCase()} inside isolated <iframe sandbox> preview.` },
      ]);
      return;
    }

    if (lang === 'json') {
      setDrawerTab('console');
      try {
        const parsed = JSON.parse(code);
        setConsoleLines([
          { level: 'info', text: `Valid JSON (${Object.keys(parsed || {}).length} root keys).` },
        ]);
      } catch (err) {
        setConsoleLines([{ level: 'error', text: `JSON Syntax Error: ${err.message}` }]);
      }
      return;
    }

    if (lang === 'python') {
      setDrawerTab('console');
      setRunning(true);
      setConsoleLines([{ level: 'info', text: 'Initializing Python WebAssembly runtime (Pyodide)...' }]);
      const started = performance.now();
      try {
        const py = await ensurePyodideLoaded();
        const pyLogs = [];
        py.setStdout({ batched: (msg) => pyLogs.push({ level: 'log', text: msg }) });
        py.setStderr({ batched: (msg) => pyLogs.push({ level: 'error', text: msg }) });
        const result = await py.runPythonAsync(code);
        const ms = Math.round(performance.now() - started);
        if (result !== undefined && result !== null) {
          pyLogs.push({ level: 'result', text: formatArg(result) });
        }
        pyLogs.push({ level: 'info', text: `Python finished in ${ms} ms.` });
        setConsoleLines(pyLogs);
      } catch (err) {
        setConsoleLines([{ level: 'error', text: err?.message || String(err) }]);
      } finally {
        setRunning(false);
      }
      return;
    }

    // JavaScript sandboxed execution inside null-origin iframe
    setDrawerTab('console');
    if (activeRunCleanupRef.current) {
      activeRunCleanupRef.current();
    }

    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const started = performance.now();
    setRunning(true);
    setConsoleLines([{ level: 'info', text: `Executing ${file.path} in sandboxed JS runtime...` }]);

    const onMessage = (event) => {
      const msg = event.data;
      if (!msg || msg.__studioRunId !== runId) return;
      if (msg.done) {
        const ms = Math.round(performance.now() - started);
        appendLog('info', `Execution finished in ${ms} ms.`);
        cleanup();
        return;
      }
      appendLog(msg.level || 'log', msg.text || '');
    };

    const timer = window.setTimeout(() => {
      appendLog('error', 'Execution timed out after 4000ms.');
      cleanup();
    }, 4000);

    function cleanup() {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timer);
      setSandboxJob(null);
      setRunning(false);
      activeRunCleanupRef.current = null;
    }

    activeRunCleanupRef.current = cleanup;
    window.addEventListener('message', onMessage);
    setSandboxJob({ runId, srcDoc: buildSandboxedJsSrcDoc(code, runId) });
  };

  const handleAiCodeHelper = async (mode) => {
    const code = getCurrentCode().trim();
    if (code.length < 5) {
      toast.error('Write at least 5 characters of code before asking AI.');
      return;
    }
    setAnalyzing(true);
    setDrawerTab('ai');
    try {
      const res = await api.post('/ai/explain-code', {
        code,
        language: file.language,
        mode,
      });
      setAiResult({
        text: res.data.analysis,
        source: res.data.source,
        mode,
      });
      toast.success(mode === 'review' ? 'Code review ready!' : 'Code explanation ready!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to analyze code.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDownloadFile = () => {
    const content = getCurrentCode();
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.path.split('/').pop() || 'code.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const submitPathRename = async (e) => {
    e.preventDefault();
    const trimmed = pathDraft.trim();
    if (!trimmed || trimmed === file.path) {
      setEditingPath(false);
      setPathDraft(file.path);
      return;
    }
    const ok = await onUpdateMeta(file.id, { path: trimmed });
    if (ok) setEditingPath(false);
  };

  // Per-peer Monaco remote cursor CSS
  const peerStyles = peers
    .map(
      (p) =>
        `.yRemoteSelection-${p.clientId} { background-color: ${p.color}33; }
         .yRemoteSelectionHead-${p.clientId} { border-left: 2px solid ${p.color}; }
         .yRemoteSelectionHead-${p.clientId}::after { content: '${sanitizeCssLabel(p.name)}'; background-color: ${p.color}; }`
    )
    .join('\n');

  const statusPill = () => {
    if (authError) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/20 text-rose-300 border border-rose-500/40">
          <WifiOff className="w-3 h-3" />
          {authError}
        </span>
      );
    }
    if (status === 'disconnected') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/40">
          <WifiOff className="w-3 h-3" />
          Offline{unsyncedChanges > 0 ? ` (${unsyncedChanges})` : ''}
        </span>
      );
    }
    if (status === 'connecting' || !isSynced || !editorInstance || unsyncedChanges > 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
          <RefreshCw className="w-3 h-3 animate-spin" />
          Syncing...
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
        <Wifi className="w-3 h-3" />
        Synced Live
      </span>
    );
  };

  return (
    <div className="flex flex-col flex-1 bg-slate-950 rounded-xl border border-slate-800 shadow-lg overflow-hidden min-h-[600px]">
      {peerStyles && <style>{peerStyles}</style>}

      {/* VS Code Top Workbench Bar */}
      <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-slate-200">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode2 className="w-4 h-4 text-brand-400 shrink-0" />
          {editingPath ? (
            <form onSubmit={submitPathRename} className="flex items-center gap-1">
              <input
                type="text"
                value={pathDraft}
                onChange={(e) => setPathDraft(e.target.value)}
                autoFocus
                className="px-2 py-0.5 text-xs bg-slate-800 border border-brand-500 rounded text-white focus:outline-none"
              />
              <button type="submit" className="p-1 bg-brand-600 rounded text-white" title="Save path">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingPath(false);
                  setPathDraft(file.path);
                }}
                className="p-1 bg-slate-800 rounded text-slate-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </form>
          ) : (
            <>
              <span className="text-sm font-mono font-semibold truncate">{file.path}</span>
              <button
                type="button"
                onClick={() => setEditingPath(true)}
                className="p-1 text-slate-400 hover:text-white rounded"
                title="Rename file"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          <select
            value={file.language}
            onChange={(e) => onUpdateMeta(file.id, { language: e.target.value })}
            aria-label="Language"
            className="ml-1 px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-[11px] font-medium text-slate-300 focus:outline-none"
          >
            <option value="javascript">JavaScript</option>
            <option value="typescript">TypeScript</option>
            <option value="python">Python</option>
            <option value="html">HTML</option>
            <option value="css">CSS</option>
            <option value="json">JSON</option>
            <option value="sql">SQL</option>
            <option value="markdown">Markdown</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {peers.length > 0 && (
            <div className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              {peers.map((p) => (
                <span
                  key={p.clientId}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-slate-800 text-slate-200 border border-slate-700"
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                  {p.name}
                </span>
              ))}
            </div>
          )}

          {statusPill()}

          <button
            type="button"
            onClick={handleRunCode}
            disabled={running}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-xs font-semibold transition disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" />
            {running ? 'Running...' : 'Run Code'}
          </button>

          <button
            type="button"
            onClick={() => handleAiCodeHelper('explain')}
            disabled={analyzing}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-xs font-medium transition disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI Explain
          </button>

          <button
            type="button"
            onClick={() => handleAiCodeHelper('review')}
            disabled={analyzing}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md text-xs font-medium transition disabled:opacity-50"
          >
            <Bug className="w-3.5 h-3.5 text-amber-400" />
            Review
          </button>

          <button
            type="button"
            onClick={handleDownloadFile}
            title="Download file"
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Center Monaco Editor Canvas */}
      <div className="flex-1 min-h-[340px]">
        <Editor
          key={file.id}
          height="360px"
          theme="vs-dark"
          language={file.language}
          path={`file:///${file.path}`}
          defaultValue=""
          onMount={(editor) => setEditorInstance(editor)}
          options={{
            minimap: { enabled: true },
            fontSize: 13.5,
            wordWrap: 'on',
            automaticLayout: true,
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            tabSize: 2,
          }}
        />
      </div>

      {/* Hidden null-origin sandboxed JS execution frame */}
      {sandboxJob && (
        <iframe
          key={sandboxJob.runId}
          title="JS Sandbox Runner"
          sandbox="allow-scripts"
          srcDoc={sandboxJob.srcDoc}
          className="hidden"
        />
      )}

      {/* Bottom VS Code Integrated Panel (Console / Live HTML Preview / AI Assistant) */}
      <div className="border-t border-slate-800 bg-slate-900 text-slate-200">
        <div className="flex items-center justify-between px-4 py-1.5 border-b border-slate-800 text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDrawerTab('console')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-medium transition ${
                drawerTab === 'console'
                  ? 'bg-slate-800 text-white border-b-2 border-brand-500'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              Console
            </button>
            <button
              type="button"
              onClick={() => setDrawerTab('preview')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-medium transition ${
                drawerTab === 'preview'
                  ? 'bg-slate-800 text-white border-b-2 border-brand-500'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              HTML Preview
            </button>
            <button
              type="button"
              onClick={() => setDrawerTab('ai')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-medium transition ${
                drawerTab === 'ai'
                  ? 'bg-slate-800 text-white border-b-2 border-brand-500'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              AI Assistant
            </button>
          </div>
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            CRDT synced • Client-side sandbox
          </span>
        </div>

        <div className="h-44 overflow-y-auto p-3 font-mono text-xs bg-slate-950/90">
          {drawerTab === 'console' && (
            <div className="space-y-1">
              {consoleLines.map((line, i) => (
                <div
                  key={i}
                  className={
                    line.level === 'error'
                      ? 'text-rose-400 whitespace-pre-wrap'
                      : line.level === 'warn'
                      ? 'text-amber-300 whitespace-pre-wrap'
                      : line.level === 'result'
                      ? 'text-emerald-400 whitespace-pre-wrap'
                      : line.level === 'info'
                      ? 'text-slate-400 whitespace-pre-wrap'
                      : 'text-slate-100 whitespace-pre-wrap'
                  }
                >
                  {line.level === 'result' ? `<= ${line.text}` : line.text}
                </div>
              ))}
            </div>
          )}

          {drawerTab === 'preview' && (
            previewHtml ? (
              <iframe
                title="Live HTML Sandbox Preview"
                sandbox="allow-scripts"
                srcDoc={previewHtml}
                className="w-full h-36 bg-white rounded border border-slate-700"
              />
            ) : (
              <p className="text-slate-400">
                Open an HTML or CSS file and click &ldquo;Run Code&rdquo; to preview it safely here.
              </p>
            )
          )}

          {drawerTab === 'ai' && (
            analyzing ? (
              <p className="text-indigo-300">Analyzing {file.path}...</p>
            ) : aiResult ? (
              <div className="space-y-1.5 font-sans">
                <div className="text-[11px] text-indigo-400 font-semibold uppercase tracking-wide">
                  {aiResult.mode === 'review' ? 'AI Code Review' : 'AI Code Explanation'} • {aiResult.source}
                </div>
                <p className="whitespace-pre-line text-slate-200 leading-relaxed">{aiResult.text}</p>
              </div>
            ) : (
              <p className="text-slate-400 font-sans">
                Click &ldquo;AI Explain&rdquo; or &ldquo;Review&rdquo; above to inspect the active code file.
              </p>
            )
          )}
        </div>
      </div>
    </div>
  );
}

export default function CodeStudio() {
  const { user } = useAuth();
  const { workspaceId: defaultWorkspaceId, workspaces } = useWorkspace();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(null);
  const workspaceId = workspaces.some((w) => w.id === selectedWorkspaceId)
    ? selectedWorkspaceId
    : defaultWorkspaceId;

  const [files, setFiles] = useState([]);
  const [selectedFileId, setSelectedFileId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newPath, setNewPath] = useState('');

  const loadFiles = useCallback(async (wsId) => {
    if (!wsId) {
      setFiles([]);
      setSelectedFileId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get(`/code/workspace/${wsId}`);
      const list = res.data?.files || [];
      setFiles(list);
      setSelectedFileId((prev) => (prev && list.some((f) => f.id === prev) ? prev : list[0]?.id || null));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load workspace code files.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles(workspaceId);
  }, [workspaceId, loadFiles]);

  // Real-time Socket.IO sync of file explorer across active teammate tabs
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!workspaceId || !token) return;

    const socket = io(getSocketUrl(), {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      socket.emit('workspace:join', { workspaceId });
    });

    socket.on('code:changed', (payload) => {
      if (Number(payload?.workspaceId) !== Number(workspaceId)) return;
      if (payload.action === 'created' && payload.file) {
        setFiles((prev) =>
          prev.some((f) => f.id === payload.file.id) ? prev : [...prev, payload.file]
        );
      } else if (payload.action === 'updated' && payload.file) {
        setFiles((prev) =>
          prev.map((f) => (f.id === payload.file.id ? { ...f, ...payload.file } : f))
        );
      } else if (payload.action === 'deleted' && payload.fileId) {
        setFiles((prev) => prev.filter((f) => f.id !== payload.fileId));
      }
    });

    return () => {
      socket.emit('workspace:leave', { workspaceId });
      socket.disconnect();
    };
  }, [workspaceId]);

  useEffect(() => {
    if (files.length === 0) {
      if (selectedFileId !== null) setSelectedFileId(null);
      return;
    }
    if (!files.some((f) => f.id === selectedFileId)) {
      setSelectedFileId(files[0].id);
    }
  }, [files, selectedFileId]);

  const handleCreateFile = async (e) => {
    e.preventDefault();
    const cleanPath = newPath.trim();
    if (!cleanPath || !workspaceId) return;

    const ext = cleanPath.split('.').pop()?.toLowerCase();
    const templateMap = {
      js: FILE_TEMPLATES.javascript,
      mjs: FILE_TEMPLATES.javascript,
      py: FILE_TEMPLATES.python,
      html: FILE_TEMPLATES.html,
      css: FILE_TEMPLATES.css,
      json: FILE_TEMPLATES.json,
      sql: FILE_TEMPLATES.sql,
    };

    setCreating(true);
    try {
      const res = await api.post('/code', {
        workspace_id: workspaceId,
        path: cleanPath,
        content: templateMap[ext] || `// ${cleanPath}\n`,
      });
      const created = res.data.file;
      setFiles((prev) => (prev.some((f) => f.id === created.id) ? prev : [...prev, created]));
      setSelectedFileId(created.id);
      setNewPath('');
      toast.success(`Created ${created.path}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create file.');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateMeta = async (fileId, patch) => {
    try {
      const res = await api.patch(`/code/${fileId}`, patch);
      const updated = res.data.file;
      setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, ...updated } : f)));
      toast.success('File updated');
      return true;
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update file.');
      return false;
    }
  };

  const handleDeleteFile = async (file) => {
    if (!window.confirm(`Delete "${file.path}"?`)) return;
    try {
      await api.delete(`/code/${file.id}`);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      toast.success(`Deleted ${file.path}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete file.');
    }
  };

  const activeFile = files.find((f) => f.id === selectedFileId) || null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Code2 className="w-6 h-6 text-brand-600" />
            Collaborative Code Studio
          </h2>
          <p className="text-sm text-slate-500">
            VS Code Monaco IDE synced over CRDT WebSockets with safe browser sandbox execution &amp; AI review.
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* VS Code Explorer Sidebar */}
        <div className="lg:col-span-4 xl:col-span-3 bg-slate-900 text-slate-200 rounded-xl border border-slate-800 shadow-sm p-3.5 space-y-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1">
            Workspace Explorer
          </div>

          <form onSubmit={handleCreateFile} className="flex gap-1.5">
            <input
              type="text"
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              placeholder="e.g. src/app.js or script.py"
              className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              type="submit"
              disabled={creating || !newPath.trim()}
              title="New code file"
              className="px-2.5 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-medium transition disabled:opacity-40"
            >
              <Plus className="w-4 h-4" />
            </button>
          </form>

          <div className="space-y-1 max-h-[500px] overflow-y-auto">
            {loading ? (
              <div className="py-6 text-center text-xs text-slate-500">Loading files...</div>
            ) : files.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                No files yet. Create `src/main.js` or `app.py` above!
              </div>
            ) : (
              files.map((f) => {
                const isSelected = f.id === selectedFileId;
                return (
                  <div
                    key={f.id}
                    onClick={() => setSelectedFileId(f.id)}
                    className={`group flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg cursor-pointer text-xs font-mono transition ${
                      isSelected
                        ? 'bg-brand-600/20 text-brand-300 border border-brand-500/40'
                        : 'text-slate-300 hover:bg-slate-800 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileCode2 className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{f.path}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteFile(f);
                      }}
                      className="p-1 text-slate-500 hover:text-rose-400 opacity-75 sm:opacity-0 sm:group-hover:opacity-100"
                      title="Delete code file"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Active VS Code Editor */}
        <div className="lg:col-span-8 xl:col-span-9">
          {activeFile ? (
            <MonacoCollabPane
              key={activeFile.id}
              file={activeFile}
              user={user}
              allFiles={files}
              onUpdateMeta={handleUpdateMeta}
            />
          ) : (
            <div className="bg-slate-900 text-slate-200 rounded-xl border border-slate-800 p-12 text-center space-y-3">
              <Code2 className="w-10 h-10 text-slate-500 mx-auto" />
              <h3 className="text-base font-semibold">Create or select a code file</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Start collaborating live with VS Code syntax highlighting, multi-cursor presence, and client-side code execution.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
