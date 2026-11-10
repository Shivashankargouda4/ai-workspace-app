import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, UserPlus, Copy, Check, KeyRound, Building2, Shield, MessageCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAuth } from '../context/AuthContext';

const ROLE_BADGES = {
  admin: 'bg-indigo-100 text-indigo-700',
  manager: 'bg-amber-100 text-amber-700',
  member: 'bg-slate-100 text-slate-700',
};

function extractToken(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const parts = trimmed.split('/').filter(Boolean);
  return parts[parts.length - 1] || trimmed;
}

export default function Team() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    orgId,
    organization,
    organizations,
    members,
    currentUserRole,
    refreshWorkspace,
    selectOrg,
  } = useWorkspace();

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const [joinInput, setJoinInput] = useState('');
  const [joining, setJoining] = useState(false);

  const canInvite = currentUserRole === 'admin' || currentUserRole === 'manager';

  const handleGenerateInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !orgId) return;

    setCreatingInvite(true);
    setGeneratedUrl('');
    setCopied(false);
    try {
      const res = await api.post(`/orgs/${orgId}/invite`, {
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      const fullUrl = `${window.location.origin}${res.data.inviteLink}`;
      setGeneratedUrl(fullUrl);
      setInviteEmail('');
      toast.success('Invitation link created!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to generate invitation link.');
    } finally {
      setCreatingInvite(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedUrl) return;
    try {
      await navigator.clipboard.writeText(generatedUrl);
      setCopied(true);
      toast.success('Invite link copied to clipboard!');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Copy failed — please select and copy the URL manually.');
    }
  };

  const handleJoinOrg = async (e) => {
    e.preventDefault();
    const token = extractToken(joinInput);
    if (!token) return;

    setJoining(true);
    try {
      const res = await api.post(`/orgs/join/${encodeURIComponent(token)}`);
      toast.success(res.data?.message || 'Joined organization!');
      setJoinInput('');
      if (res.data?.orgId) {
        await selectOrg(res.data.orgId);
      } else {
        await refreshWorkspace();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to accept invitation.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Team &amp; Organization</h2>
          <p className="text-sm text-slate-500">
            Active Organization:{' '}
            <span className="font-semibold text-slate-700">{organization?.name || 'Workspace'}</span>
            {' • '}Role:{' '}
            <span className="capitalize font-medium text-brand-600">{currentUserRole}</span>
          </p>
        </div>

        {organizations.length > 1 && (
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-400" />
            <select
              value={orgId || ''}
              onChange={(e) => selectOrg(Number(e.target.value))}
              className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 shadow-sm"
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.role})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Invite Team Member */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5">
            <UserPlus className="w-5 h-5 text-brand-600" />
            <h3 className="font-semibold text-slate-800 text-base">Invite a Team Member</h3>
          </div>

          {canInvite ? (
            <>
              <p className="text-xs text-slate-500">
                Generate a single-use cryptographic invite link. Send it to a registered teammate (or have them register first) and open the link to join{' '}
                <strong>{organization?.name}</strong>.
              </p>

              <form onSubmit={handleGenerateInvite} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Teammate Email
                  </label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="teammate@example.com"
                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700"
                  >
                    <option value="member">Member (tasks, chat, docs, files)</option>
                    <option value="manager">Manager (+ workspaces &amp; invites)</option>
                    <option value="admin">Admin (full organization control)</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={creatingInvite}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-semibold transition shadow-sm disabled:opacity-50"
                >
                  <UserPlus className="w-4 h-4" />
                  {creatingInvite ? 'Generating...' : 'Generate Invite Link'}
                </button>
              </form>

              {generatedUrl && (
                <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 space-y-2">
                  <div className="text-xs font-semibold text-emerald-800">
                    Share this invite link (valid 7 days, single-use):
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={generatedUrl}
                      onClick={(e) => e.target.select()}
                      className="flex-1 min-w-0 px-2.5 py-1.5 text-xs font-mono bg-white border border-emerald-200 rounded text-slate-700"
                    />
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium shrink-0"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-2.5">
              <Shield className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <span>
                Only <strong>Admin</strong> or <strong>Manager</strong> members can generate new invite links.
              </span>
            </div>
          )}
        </div>

        {/* Join Another Organization */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5">
            <KeyRound className="w-5 h-5 text-emerald-600" />
            <h3 className="font-semibold text-slate-800 text-base">Join Another Organization</h3>
          </div>
          <p className="text-xs text-slate-500">
            Have an invite link or token from another team? Paste it below to join their organization and switch into it.
          </p>
          <form onSubmit={handleJoinOrg} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Invite URL or Token
              </label>
              <input
                type="text"
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value)}
                placeholder="http://localhost:5000/invite/..."
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <button
              type="submit"
              disabled={joining || !joinInput.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-semibold transition shadow-sm disabled:opacity-50"
            >
              {joining ? 'Joining...' : 'Accept Invite'}
            </button>
          </form>
        </div>
      </div>

      {/* Members Directory */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-slate-500" />
            <h3 className="font-semibold text-slate-800 text-base">
              Members ({members.length})
            </h3>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                <th className="py-3 px-6">Member</th>
                <th className="py-3 px-6">Email</th>
                <th className="py-3 px-6">Role</th>
                <th className="py-3 px-6">Joined</th>
                <th className="py-3 px-6 text-right">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {members.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50/70">
                  <td className="py-3.5 px-6 font-medium text-slate-800">{m.name}</td>
                  <td className="py-3.5 px-6 text-slate-600">{m.email}</td>
                  <td className="py-3.5 px-6">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                        ROLE_BADGES[m.role] || ROLE_BADGES.member
                      }`}
                    >
                      {m.role}
                    </span>
                  </td>
                  <td className="py-3.5 px-6 text-xs text-slate-500">
                    {m.joined_at ? new Date(m.joined_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="py-3.5 px-6 text-right">
                    {m.id !== user?.id ? (
                      <button
                        type="button"
                        onClick={() => navigate(`/chat?dmUserId=${m.id}`)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-brand-600 hover:text-white text-slate-700 text-xs font-medium transition"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        DM
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400">You</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
