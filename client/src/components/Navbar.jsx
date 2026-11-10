import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  Bell,
  LogOut,
  Users,
  ChevronDown,
  AlertTriangle,
  CheckCheck,
  Building2,
  User as UserIcon,
  Settings,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import api from '../api/client';
import { createAuthenticatedSocket } from '../utils/realtime';

function ProfileSettingsModal({ user, onClose, onSaved }) {
  const [name, setName] = useState(user?.name || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        ...(avatarUrl.trim() ? { avatar_url: avatarUrl.trim() } : {}),
        ...(newPassword ? { currentPassword, newPassword } : {}),
      };
      const res = await api.patch('/auth/me', payload);
      onSaved(res.data.user);
      toast.success('Profile updated!');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-brand-600" />
            <h3 className="font-semibold text-slate-800 text-base">Profile Settings</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Display Name</label>
            <input
              type="text"
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Avatar URL</label>
            <input
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://api.dicebear.com/7.x/avataaars/svg?seed=Name"
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="pt-2 border-t border-slate-200 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase">Change Password (Optional)</p>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Required only when setting a new password"
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">New Password</label>
              <input
                type="password"
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Navbar() {
  const { user, logout, updateUser } = useAuth();
  const { organization, organizations, orgId, currentUserRole, hasOrg, selectOrg } = useWorkspace();
  const navigate = useNavigate();

  const [openMenu, setOpenMenu] = useState(null); // 'notifications' | 'profile' | null
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [notifData, setNotifData] = useState({ notifications: [], risk_alerts: [], unread_count: 0 });
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const [dismissedRisks, setDismissedRisks] = useState(false);

  const menuContainerRef = useRef(null);

  const loadNotifications = useCallback(async () => {
    setLoadingNotifs(true);
    try {
      const res = await api.get('/notifications');
      setNotifData({
        notifications: res.data?.notifications || [],
        risk_alerts: res.data?.risk_alerts || [],
        unread_count: res.data?.unread_count || 0,
      });
    } catch {
      // Keep navbar resilient
    } finally {
      setLoadingNotifs(false);
    }
  }, []);

  useEffect(() => {
    if (user) loadNotifications();
  }, [user, loadNotifications]);

  // Real-time Socket.IO listener for pushed user notifications
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!user || !token) return;

    const socket = createAuthenticatedSocket(io);

    socket.on('notification:new', (savedNotif) => {
      setNotifData((prev) => ({
        ...prev,
        notifications: [savedNotif, ...prev.notifications].slice(0, 20),
        unread_count: prev.unread_count + 1,
      }));
      toast(savedNotif.title || 'New notification', { icon: '🔔' });
    });

    return () => {
      socket.disconnect();
    };
  }, [user?.id]);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target)) {
        setOpenMenu(null);
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setOpenMenu(null);
        setShowProfileModal(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const toggleNotifications = () => {
    const next = openMenu === 'notifications' ? null : 'notifications';
    setOpenMenu(next);
    if (next === 'notifications') {
      loadNotifications();
    }
  };

  const toggleProfile = () => {
    setOpenMenu((prev) => (prev === 'profile' ? null : 'profile'));
  };

  const handleMarkAllRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setDismissedRisks(true);
      setNotifData((prev) => ({
        ...prev,
        notifications: prev.notifications.map((n) => ({ ...n, is_read: true })),
        unread_count: 0,
      }));
      toast.success('Notifications marked as read');
    } catch {
      toast.error('Failed to update notifications.');
    }
  };

  const visibleRiskAlerts = dismissedRisks ? [] : notifData.risk_alerts;
  const unreadDb = notifData.notifications.filter((n) => !n.is_read).length;
  const totalBadgeCount = unreadDb + visibleRiskAlerts.length;

  return (
    <>
      <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-30">
        <Link to="/" className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 bg-brand-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-sm shrink-0">
            W
          </div>
          <div className="min-w-0">
            <h1 className="font-semibold text-slate-800 text-sm sm:text-base leading-tight truncate">
              Collaborative Workspace
            </h1>
            <span className="text-xs text-slate-500 hidden sm:block">AI &amp; Predictive Analytics</span>
          </div>
        </Link>

        <div ref={menuContainerRef} className="relative flex items-center gap-2 sm:gap-3">
          <Link
            to="/team"
            title="Team & Invites"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-brand-50 hover:text-brand-700 rounded-lg transition"
          >
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">Team</span>
          </Link>

          {/* Notifications Bell */}
          <button
            type="button"
            onClick={toggleNotifications}
            aria-expanded={openMenu === 'notifications'}
            aria-label="Notifications"
            title="Notifications"
            className={`relative p-2 rounded-full transition ${
              openMenu === 'notifications'
                ? 'bg-brand-50 text-brand-700'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Bell className="w-5 h-5" />
            {totalBadgeCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {totalBadgeCount > 9 ? '9+' : totalBadgeCount}
              </span>
            )}
          </button>

          <div className="h-6 w-px bg-slate-200"></div>

          {/* Clickable Profile Trigger */}
          <button
            type="button"
            onClick={toggleProfile}
            aria-expanded={openMenu === 'profile'}
            aria-label="Account profile"
            className={`flex items-center gap-2.5 px-2 py-1 rounded-lg transition text-left ${
              openMenu === 'profile' ? 'bg-slate-100' : 'hover:bg-slate-50'
            }`}
          >
            <img
              src={user?.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=User'}
              alt={user?.name}
              className="w-8 h-8 rounded-full border border-slate-200 bg-slate-50 shrink-0"
            />
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium text-slate-800 leading-tight">{user?.name}</p>
              <p className="text-xs text-slate-500">{user?.email}</p>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-400 hidden sm:block" />
          </button>

          {/* Notifications Dropdown Popover */}
          {openMenu === 'notifications' && (
            <div className="absolute right-0 top-14 w-80 sm:w-96 bg-white rounded-xl border border-slate-200 shadow-xl z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                <span className="text-sm font-semibold text-slate-800">Notifications</span>
                {(visibleRiskAlerts.length > 0 || unreadDb > 0) && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {loadingNotifs ? (
                  <div className="p-6 text-center text-xs text-slate-400">Loading alerts...</div>
                ) : visibleRiskAlerts.length === 0 && notifData.notifications.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    No new notifications or high-risk delay alerts.
                  </div>
                ) : (
                  <>
                    {visibleRiskAlerts.map((alert) => (
                      <button
                        key={alert.id}
                        type="button"
                        onClick={() => {
                          setOpenMenu(null);
                          navigate('/kanban');
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-rose-50/40 transition flex items-start gap-2.5"
                      >
                        <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-rose-700">{alert.title}</p>
                          <p className="text-xs text-slate-600 mt-0.5">{alert.message}</p>
                        </div>
                      </button>
                    ))}
                    {notifData.notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`px-4 py-3 text-xs ${n.is_read ? 'bg-white text-slate-500' : 'bg-brand-50/30 text-slate-800'}`}
                      >
                        <p className="font-semibold">{n.title}</p>
                        <p className="mt-0.5">{n.message}</p>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Profile Dropdown Popover */}
          {openMenu === 'profile' && (
            <div className="absolute right-0 top-14 w-72 bg-white rounded-xl border border-slate-200 shadow-xl z-50 overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50/70 space-y-1.5">
                <div className="flex items-center gap-2.5">
                  <UserIcon className="w-4 h-4 text-brand-600 shrink-0" />
                  <span className="text-sm font-bold text-slate-800 truncate">{user?.name}</span>
                </div>
                <p className="text-xs text-slate-500 truncate pl-6">{user?.email}</p>
                {hasOrg && organization && (
                  <div className="pl-6 pt-1 flex items-center gap-1.5 text-[11px] text-slate-600">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-medium truncate">{organization.name}</span>
                    <span className="px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 font-semibold capitalize">
                      {currentUserRole}
                    </span>
                  </div>
                )}
              </div>

              {organizations.length > 1 && (
                <div className="px-4 py-2.5 border-b border-slate-100 space-y-1">
                  <label className="block text-[11px] font-semibold uppercase text-slate-400">
                    Switch Organization
                  </label>
                  <select
                    value={orgId || ''}
                    onChange={async (e) => {
                      await selectOrg(Number(e.target.value));
                      setOpenMenu(null);
                    }}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white text-slate-700"
                  >
                    {organizations.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} ({o.role})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="p-2 space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    setShowProfileModal(true);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-100 transition"
                >
                  <Settings className="w-4 h-4 text-slate-500" />
                  Profile Settings
                </button>
                {hasOrg && (
                  <Link
                    to="/team"
                    onClick={() => setOpenMenu(null)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-100 transition"
                  >
                    <Users className="w-4 h-4 text-slate-500" />
                    Team &amp; Invitations
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    logout();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-rose-600 hover:bg-rose-50 transition font-medium"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {showProfileModal && (
        <ProfileSettingsModal
          user={user}
          onClose={() => setShowProfileModal(false)}
          onSaved={(updatedUser) => updateUser(updatedUser)}
        />
      )}
    </>
  );
}
