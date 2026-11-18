import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  User,
  ShieldCheck,
  Bell,
  Palette,
  Camera,
  Eye,
  EyeOff,
  Check,
  CheckCircle2,
  AlertCircle,
  Lock,
  Moon,
  Sun,
  Phone,
  Sparkles,
  LogOut,
  Calendar,
  Mail,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';

export default function ProfileSettingsModal({ user, onClose, onSaved }) {
  const [activeTab, setActiveTab] = useState('personal'); // 'personal' | 'security' | 'notifications' | 'appearance'
  
  // Personal Info Form State
  const [name, setName] = useState(user?.name || '');
  const [gender, setGender] = useState(user?.gender || 'prefer_not_to_say');
  const [phone, setPhone] = useState(user?.phone || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');

  // Password & Security State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Notifications State
  const defaultNotifs = {
    task_assigned: true,
    chat_mentions: true,
    email_alerts: true,
    ...(typeof user?.notification_preferences === 'object' ? user.notification_preferences : {}),
  };
  const [notifications, setNotifications] = useState(defaultNotifs);

  // Appearance State
  const initialTheme = user?.theme_preference || localStorage.getItem('theme_preference') || 'light';
  const [theme, setTheme] = useState(initialTheme);

  // Status & UI State
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef(null);

  // Track if changes have been made
  const hasChanges =
    name !== (user?.name || '') ||
    gender !== (user?.gender || 'prefer_not_to_say') ||
    phone !== (user?.phone || '') ||
    bio !== (user?.bio || '') ||
    avatarUrl !== (user?.avatar_url || '') ||
    theme !== (user?.theme_preference || 'light') ||
    JSON.stringify(notifications) !== JSON.stringify(defaultNotifs) ||
    Boolean(newPassword);

  // Password strength calculation
  const getPasswordStrength = (pass) => {
    if (!pass) return { score: 0, label: '', color: 'bg-slate-200' };
    let score = 0;
    if (pass.length >= 6) score += 1;
    if (pass.length >= 8) score += 1;
    if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;

    if (score <= 2) return { score: 1, label: 'Weak', color: 'bg-rose-500', width: 'w-1/3' };
    if (score <= 4) return { score: 2, label: 'Good', color: 'bg-amber-500', width: 'w-2/3' };
    return { score: 3, label: 'Strong', color: 'bg-emerald-500', width: 'w-full' };
  };

  const passwordStrength = getPasswordStrength(newPassword);

  // Handle local file upload for profile photo
  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file (PNG, JPG, WebP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5 MB.');
      return;
    }

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);

      const res = await api.post('/auth/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const newUrl = res.data.avatarUrl;
      setAvatarUrl(newUrl);
      if (res.data.user) {
        onSaved(res.data.user);
      }
      toast.success('Profile photo uploaded and updated!');
    } catch (err) {
      console.error('Photo upload failed:', err);
      // Fallback: convert to base64 Data URL so user can still save photo
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarUrl(reader.result);
        toast.success('Photo loaded! Click "Save Changes" to apply.');
      };
      reader.readAsDataURL(file);
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Generate new Dicebear avatar
  const handleRandomizeAvatar = () => {
    const seed = `${name || 'user'}-${Date.now().toString().slice(-4)}`;
    const style = gender === 'female' ? 'lorelei' : gender === 'male' ? 'avataaars' : 'bottts';
    const newDicebear = `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}`;
    setAvatarUrl(newDicebear);
    toast.success('Generated new avatar style!');
  };

  // Switch Theme
  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('theme_preference', newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  // Logout from all devices
  const handleLogoutAll = async () => {
    if (!window.confirm('Are you sure you want to log out from all devices? You will be signed out.')) {
      return;
    }
    try {
      await api.post('/auth/logout-all');
      toast.success('Logged out from all sessions.');
      window.location.href = '/login';
    } catch (err) {
      toast.error('Failed to log out all devices.');
    }
  };

  // Submit all profile updates
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (newPassword) {
      if (!currentPassword) {
        toast.error('Please enter your Current Password to change passwords.');
        setActiveTab('security');
        return;
      }
      if (newPassword.length < 6) {
        toast.error('New password must be at least 6 characters.');
        setActiveTab('security');
        return;
      }
      if (newPassword !== confirmPassword) {
        toast.error('New password and Confirm password do not match.');
        setActiveTab('security');
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        gender,
        phone: phone.trim() || null,
        bio: bio.trim() || null,
        avatar_url: avatarUrl.trim() || null,
        theme_preference: theme,
        notification_preferences: notifications,
        ...(newPassword ? { currentPassword, newPassword } : {}),
      };

      const res = await api.patch('/auth/me', payload);
      onSaved(res.data.user);
      toast.success('Profile settings updated successfully!');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-950/60 border border-brand-200 dark:border-brand-800 flex items-center justify-center text-brand-600 dark:text-brand-400">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Your Profile & Account Settings
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Manage personal information, security credentials, and preferences
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 gap-2 overflow-x-auto">
          {[
            { id: 'personal', label: 'Personal Info', icon: User },
            { id: 'security', label: 'Password & Security', icon: ShieldCheck },
            { id: 'notifications', label: 'Notifications', icon: Bell },
            { id: 'appearance', label: 'Appearance', icon: Palette },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition whitespace-nowrap ${
                  isActive
                    ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* TAB 1: PERSONAL INFORMATION */}
          {activeTab === 'personal' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              
              {/* Profile Photo & Avatar Section */}
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
                <div className="relative group">
                  <img
                    src={avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name || 'user')}`}
                    alt={name}
                    className="w-20 h-20 rounded-full object-cover border-2 border-white dark:border-slate-700 shadow-md bg-white"
                  />
                  {uploadingAvatar && (
                    <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center">
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    </div>
                  )}
                </div>

                <div className="flex-1 text-center sm:text-left space-y-2">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Profile Photo</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Upload your picture (JPG, PNG or WebP) or generate an avatar.
                  </p>
                  
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png, image/jpeg, image/webp"
                      className="hidden"
                      onChange={handlePhotoUpload}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingAvatar}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-brand-600 hover:bg-brand-700 text-white shadow-sm transition disabled:opacity-50"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>Upload Photo</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleRandomizeAvatar}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <span>Randomize Avatar</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Name & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your Full Name"
                    className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Email Address
                    </label>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                      <Check className="w-3 h-3" />
                      Verified
                    </span>
                  </div>
                  <input
                    type="email"
                    disabled
                    value={user?.email || ''}
                    className="w-full px-3.5 py-2 text-sm bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Gender Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Gender Selection
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: 'male', label: 'Male', emoji: '👨' },
                    { id: 'female', label: 'Female', emoji: '👩' },
                    { id: 'prefer_not_to_say', label: 'Prefer not to say', emoji: '🧑' },
                  ].map((option) => {
                    const isSelected = gender === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setGender(option.id)}
                        className={`p-3 rounded-xl border text-center transition flex flex-col items-center gap-1 ${
                          isSelected
                            ? 'border-brand-500 bg-brand-50/70 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 ring-2 ring-brand-500/20 font-bold'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300'
                        }`}
                      >
                        <span className="text-xl">{option.emoji}</span>
                        <span className="text-xs">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Phone & Bio */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Phone Number (Optional)
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full pl-9 pr-3.5 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Account Status
                  </label>
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-600 dark:text-slate-300">
                    <Calendar className="w-4 h-4 text-brand-500" />
                    <span>Member since: {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Nov 2026'}</span>
                  </div>
                </div>
              </div>

              {/* Bio / About me */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Bio / About Me
                  </label>
                  <span className="text-[11px] text-slate-400">{bio.length}/500</span>
                </div>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell your team about yourself, role, or tech stack..."
                  className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
              </div>
            </div>
          )}

          {/* TAB 2: PASSWORD & SECURITY */}
          {activeTab === 'security' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-3 text-xs text-amber-800 dark:text-amber-300">
                <Lock className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                <p>
                  Passwords are encrypted using bcrypt hashing (salt rounds: 12). Your password is never stored or transmitted in plain text.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password to verify identity"
                    className="w-full px-3.5 py-2 pr-10 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full px-3.5 py-2 pr-10 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Password Strength Indicator */}
                {newPassword && (
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 dark:text-slate-400">Strength:</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{passwordStrength.label}</span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div className={`h-full transition-all duration-300 ${passwordStrength.color} ${passwordStrength.width}`} />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-type new password"
                    className={`w-full px-3.5 py-2 pr-10 text-sm bg-white dark:bg-slate-800 border rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 ${
                      confirmPassword && newPassword !== confirmPassword
                        ? 'border-rose-400 focus:ring-rose-500'
                        : 'border-slate-200 dark:border-slate-700 focus:ring-brand-500'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword && newPassword === confirmPassword && (
                  <p className="text-[11px] text-emerald-600 flex items-center gap-1 mt-1">
                    <Check className="w-3.5 h-3.5" /> Passwords match
                  </p>
                )}
              </div>

              {/* Logout from all devices */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h5 className="text-xs font-semibold text-slate-900 dark:text-white">Active Sessions</h5>
                  <p className="text-[11px] text-slate-500">Sign out of all other browsers and mobile devices.</p>
                </div>
                <button
                  type="button"
                  onClick={handleLogoutAll}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 rounded-lg border border-rose-200 dark:border-rose-800 transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log out all devices</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: NOTIFICATION PREFERENCES */}
          {activeTab === 'notifications' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Choose which alerts and activities trigger in-app banner and sound notifications.
              </p>

              {[
                {
                  key: 'task_assigned',
                  title: 'Task Assignment Alerts',
                  desc: 'Notify when team members assign tasks or modify sprint deadlines.',
                },
                {
                  key: 'chat_mentions',
                  title: 'Chat @Mentions & Direct Messages',
                  desc: 'Receive alerts when mentioned in #general or private team discussions.',
                },
                {
                  key: 'email_alerts',
                  title: 'Weekly Sprint & AI Risk Digest',
                  desc: 'Receive automated summary of high-delay risk tasks from Random Forest predictor.',
                },
              ].map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30"
                >
                  <div className="space-y-0.5 pr-4">
                    <h5 className="text-xs font-semibold text-slate-900 dark:text-white">{item.title}</h5>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{item.desc}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={Boolean(notifications[item.key])}
                      onChange={(e) =>
                        setNotifications({ ...notifications, [item.key]: e.target.checked })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
                  </label>
                </div>
              ))}
            </div>
          )}

          {/* TAB 4: APPEARANCE & THEME */}
          {activeTab === 'appearance' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Customize your workspace visual theme. Light and dark modes synchronize seamlessly.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => handleThemeChange('light')}
                  className={`p-4 rounded-xl border text-left flex flex-col justify-between transition ${
                    theme === 'light'
                      ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-950/30 ring-2 ring-brand-500/20'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <Sun className="w-5 h-5 text-amber-500" />
                    {theme === 'light' && <CheckCircle2 className="w-4 h-4 text-brand-600" />}
                  </div>
                  <div>
                    <h5 className="text-sm font-semibold text-slate-900 dark:text-white">Light Theme</h5>
                    <p className="text-xs text-slate-500">Clean, crisp corporate appearance</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleThemeChange('dark')}
                  className={`p-4 rounded-xl border text-left flex flex-col justify-between transition ${
                    theme === 'dark'
                      ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-950/30 ring-2 ring-brand-500/20'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <Moon className="w-5 h-5 text-indigo-500" />
                    {theme === 'dark' && <CheckCircle2 className="w-4 h-4 text-brand-600" />}
                  </div>
                  <div>
                    <h5 className="text-sm font-semibold text-slate-900 dark:text-white">Dark Theme</h5>
                    <p className="text-xs text-slate-500">Reduced eye strain in low-light environments</p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Modal Footer */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {hasChanges && (
                <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  Unsaved changes
                </span>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !hasChanges}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm transition disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{saving ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          </div>
        </form>

      </div>
    </div>
  );
}
