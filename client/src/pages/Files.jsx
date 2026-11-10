import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FolderOpen,
  Upload,
  Download,
  Search,
  FileText,
  Image as ImageIcon,
  FileArchive,
  File as FileIcon,
  RefreshCw,
  Eye,
  Trash2,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAuth } from '../context/AuthContext';

function formatBytes(bytes) {
  const num = Number(bytes) || 0;
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(2)} MB`;
}

function getFileIcon(mimeType = '') {
  if (mimeType.startsWith('image/')) return ImageIcon;
  if (mimeType.includes('pdf') || mimeType.includes('word') || mimeType.startsWith('text/')) {
    return FileText;
  }
  if (mimeType.includes('zip')) return FileArchive;
  return FileIcon;
}

export default function Files() {
  const { user } = useAuth();
  const { workspaceId: defaultWorkspaceId, workspaces, currentUserRole } = useWorkspace();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(null);
  const workspaceId = workspaces.some((w) => w.id === selectedWorkspaceId)
    ? selectedWorkspaceId
    : defaultWorkspaceId;
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [previewState, setPreviewState] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const fileInputRef = useRef(null);

  const isPreviewable = (mime = '') =>
    mime.startsWith('image/') ||
    mime === 'application/pdf' ||
    mime.startsWith('text/') ||
    mime === 'application/json';

  const closePreview = () => {
    if (previewState?.blobUrl) {
      window.URL.revokeObjectURL(previewState.blobUrl);
    }
    setPreviewState(null);
  };

  useEffect(() => {
    return () => {
      if (previewState?.blobUrl) {
        window.URL.revokeObjectURL(previewState.blobUrl);
      }
    };
  }, [previewState?.blobUrl]);

  const handlePreview = async (file) => {
    try {
      const res = await api.get(`/files/${file.id}/download?inline=1`, {
        responseType: 'blob',
      });
      const mime = file.mime_type || res.data.type || '';
      if (mime.startsWith('text/') || mime === 'application/json') {
        const text = await res.data.text();
        setPreviewState({ file, kind: 'text', text });
      } else if (mime.startsWith('image/')) {
        const blobUrl = window.URL.createObjectURL(res.data);
        setPreviewState({ file, kind: 'image', blobUrl });
      } else if (mime === 'application/pdf') {
        const blobUrl = window.URL.createObjectURL(res.data);
        setPreviewState({ file, kind: 'pdf', blobUrl });
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Preview failed.');
    }
  };

  const handleDeleteFile = async (file) => {
    if (!window.confirm(`Delete "${file.name}" permanently?`)) return;
    try {
      await api.delete(`/files/${file.id}`);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      toast.success('File deleted');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete file.');
    }
  };

  const loadFiles = useCallback(async (wsId) => {
    if (!wsId) {
      setFiles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get(`/files/workspace/${wsId}`);
      setFiles(res.data?.files || []);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load workspace files.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles(workspaceId);
  }, [workspaceId, loadFiles]);

  const handleUploadChange = async (e) => {
    const selected = e.target.files?.[0];
    if (!selected || !workspaceId) return;

    const formData = new FormData();
    formData.append('file', selected);
    formData.append('workspaceId', String(workspaceId));

    setUploading(true);
    try {
      await api.post('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(`Uploaded "${selected.name}"`);
      await loadFiles(workspaceId);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to upload file.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownload = async (file) => {
    setDownloadingId(file.id);
    try {
      const res = await api.get(`/files/${file.id}/download`, {
        responseType: 'blob',
      });
      const blobUrl = window.URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Download failed.');
    } finally {
      setDownloadingId(null);
    }
  };

  const filteredFiles = files.filter((f) =>
    f.name?.toLowerCase().includes(searchTerm.trim().toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">File Repository</h2>
          <p className="text-sm text-slate-500">
            Tenant-isolated workspace file sharing with authenticated uploads and downloads.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {workspaces.length > 1 && (
            <select
              value={workspaceId || ''}
              onChange={(e) => {
                const nextWs = Number(e.target.value);
                setSelectedWorkspaceId(nextWs);
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

          <button
            type="button"
            onClick={() => loadFiles(workspaceId)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <label className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium transition shadow-sm cursor-pointer">
            <Upload className="w-4 h-4" />
            {uploading ? 'Uploading...' : 'Upload File'}
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleUploadChange}
              disabled={uploading || !workspaceId}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Upload policy notice & Search */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search workspace files..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <span className="text-xs text-slate-500">
          Max 10 MB • Supports PDF, DOCX, TXT, CSV, JSON, ZIP &amp; images
        </span>
      </div>

      {/* File Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">Loading workspace files...</div>
        ) : filteredFiles.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <FolderOpen className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-base font-semibold text-slate-700">
              {files.length === 0 ? 'No files uploaded yet' : 'No matching files'}
            </h3>
            <p className="text-sm text-slate-500">
              {files.length === 0
                ? 'Click "Upload File" above to share documents cleanly inside your workspace.'
                : 'Try adjusting your search query.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3 px-6">File Name</th>
                  <th className="py-3 px-6">Type</th>
                  <th className="py-3 px-6">Size</th>
                  <th className="py-3 px-6">Uploaded By</th>
                  <th className="py-3 px-6">Date</th>
                  <th className="py-3 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredFiles.map((file) => {
                  const Icon = getFileIcon(file.mime_type || '');
                  return (
                    <tr key={file.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3.5 px-6 font-medium text-slate-800">
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 rounded-lg bg-slate-100 text-slate-600">
                            <Icon className="w-4 h-4" />
                          </div>
                          <span className="truncate max-w-xs" title={file.name}>
                            {file.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-6 text-xs text-slate-500 font-mono">
                        {file.mime_type || 'unknown'}
                      </td>
                      <td className="py-3.5 px-6 text-slate-600">{formatBytes(file.size)}</td>
                      <td className="py-3.5 px-6 text-slate-600">
                        {file.uploader_name || file.uploader_email || 'Member'}
                      </td>
                      <td className="py-3.5 px-6 text-slate-500 text-xs">
                        {new Date(file.created_at).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-6 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {isPreviewable(file.mime_type || '') && (
                            <button
                              type="button"
                              onClick={() => handlePreview(file)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-indigo-600 hover:text-white text-slate-700 text-xs font-medium transition"
                              title="Preview file"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Preview
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDownload(file)}
                            disabled={downloadingId === file.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-brand-600 hover:text-white text-slate-700 text-xs font-medium transition disabled:opacity-50"
                          >
                            <Download className="w-3.5 h-3.5" />
                            {downloadingId === file.id ? 'Downloading...' : 'Download'}
                          </button>
                          {(file.uploaded_by === user?.id ||
                            currentUserRole === 'admin' ||
                            currentUserRole === 'manager') && (
                            <button
                              type="button"
                              onClick={() => handleDeleteFile(file)}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-600 hover:text-white text-slate-500 transition"
                              title="Delete file"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inline File Preview Modal */}
      {previewState && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="font-semibold text-slate-800 text-sm truncate pr-4">
                {previewState.file.name}
              </div>
              <button
                type="button"
                onClick={closePreview}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-auto bg-slate-100 flex items-center justify-center">
              {previewState.kind === 'image' && (
                <img
                  src={previewState.blobUrl}
                  alt={previewState.file.name}
                  className="max-h-[72vh] max-w-full rounded shadow"
                />
              )}
              {previewState.kind === 'pdf' && (
                <iframe
                  title={previewState.file.name}
                  src={previewState.blobUrl}
                  className="w-full h-[72vh] rounded border border-slate-200 bg-white"
                />
              )}
              {previewState.kind === 'text' && (
                <pre className="w-full max-h-[72vh] overflow-auto bg-white p-4 rounded border border-slate-200 text-xs font-mono text-slate-800 whitespace-pre-wrap">
                  {previewState.text}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
