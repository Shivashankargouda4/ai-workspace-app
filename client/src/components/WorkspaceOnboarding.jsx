import React, { useState } from 'react';
import { Building2, KeyRound, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

function buildSlug(name) {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.length >= 2 ? base : `workspace-${Date.now().toString().slice(-5)}`;
}

function extractInviteToken(rawInput) {
  const trimmed = rawInput.trim();
  if (!trimmed) return '';
  const parts = trimmed.split('/').filter(Boolean);
  return parts[parts.length - 1] || trimmed;
}

export default function WorkspaceOnboarding({ onWorkspaceReady }) {
  const { user } = useAuth();
  const [orgName, setOrgName] = useState(user?.name ? `${user.name.split(' ')[0]}'s Workspace` : '');
  const [creating, setCreating] = useState(false);

  const [inviteInput, setInviteInput] = useState('');
  const [joining, setJoining] = useState(false);

  const handleCreateOrg = async (e) => {
    e.preventDefault();
    const trimmed = orgName.trim();
    if (trimmed.length < 2) {
      toast.error('Organization name must be at least 2 characters.');
      return;
    }

    setCreating(true);
    try {
      let slug = buildSlug(trimmed);
      try {
        await api.post('/orgs', { name: trimmed, slug });
      } catch (err) {
        if (err.response?.status === 409) {
          slug = `${slug}-${Date.now().toString().slice(-4)}`;
          await api.post('/orgs', { name: trimmed, slug });
        } else {
          throw err;
        }
      }
      toast.success('Workspace created! Launching your dashboard...');
      await onWorkspaceReady();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create organization.');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinInvite = async (e) => {
    e.preventDefault();
    const token = extractInviteToken(inviteInput);
    if (!token) {
      toast.error('Please enter an invitation token or link.');
      return;
    }

    setJoining(true);
    try {
      await api.post(`/orgs/join/${encodeURIComponent(token)}`);
      toast.success('Joined organization successfully!');
      await onWorkspaceReady();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Invalid or expired invitation.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <h2 className="text-2xl font-bold text-slate-900">
          Welcome{user?.name ? `, ${user.name}` : ''}! Set up your workspace
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Your new account is not part of any organization yet. Create an isolated workspace or join an existing team with an invite link.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          {/* Option A: Create New Organization */}
          <form
            onSubmit={handleCreateOrg}
            className="rounded-xl border border-slate-200 p-5 bg-slate-50/70 space-y-4 flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="flex items-center gap-2.5 text-brand-700 font-semibold">
                <Building2 className="w-5 h-5" />
                <span>Create New Organization</span>
              </div>
              <p className="text-xs text-slate-500">
                Provisions your own tenant-isolated workspace, project Kanban board, `#general` chat channel, collaborative docs, and file vault.
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Organization Name
                </label>
                <input
                  type="text"
                  required
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="e.g., Darshan Engineering"
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={creating}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-semibold transition shadow-sm disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Workspace'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Option B: Join via Invitation */}
          <form
            onSubmit={handleJoinInvite}
            className="rounded-xl border border-slate-200 p-5 bg-white space-y-4 flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="flex items-center gap-2.5 text-slate-800 font-semibold">
                <KeyRound className="w-5 h-5 text-emerald-600" />
                <span>Join With Invite Link</span>
              </div>
              <p className="text-xs text-slate-500">
                Received an invite from an organization admin? Paste the full link or token below.
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Invite Link or Token
                </label>
                <input
                  type="text"
                  value={inviteInput}
                  onChange={(e) => setInviteInput(e.target.value)}
                  placeholder="/invite/abc123..."
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={joining || !inviteInput.trim()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-semibold transition shadow-sm disabled:opacity-50"
            >
              {joining ? 'Joining...' : 'Join Organization'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
