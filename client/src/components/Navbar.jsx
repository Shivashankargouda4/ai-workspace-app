import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Bell, LogOut, User } from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-6 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-brand-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-sm">
          W
        </div>
        <div>
          <h1 className="font-semibold text-slate-800 text-base leading-tight">Collaborative Workspace</h1>
          <span className="text-xs text-slate-500">AI & Predictive Analytics</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button 
          title="Notifications" 
          className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-full transition"
        >
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>

        <div className="h-6 w-px bg-slate-200"></div>

        <div className="flex items-center gap-3">
          <img
            src={user?.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=User'}
            alt={user?.name}
            className="w-8 h-8 rounded-full border border-slate-200 bg-slate-50"
          />
          <div className="hidden sm:block text-left">
            <p className="text-sm font-medium text-slate-800 leading-tight">{user?.name}</p>
            <p className="text-xs text-slate-500">{user?.email}</p>
          </div>
        </div>

        <button
          onClick={logout}
          title="Sign out"
          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
