import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, KanbanSquare, MessageSquare, BarChart3, Settings } from 'lucide-react';

const navItems = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Kanban Board', path: '/kanban', icon: KanbanSquare },
  { name: 'Team Chat', path: '/chat', icon: MessageSquare },
  { name: 'Analytics', path: '/analytics', icon: BarChart3 },
];

export default function Sidebar() {
  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col min-h-[calc(100vh-4rem)] border-r border-slate-800">
      <div className="p-4 flex-1">
        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Navigation
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                    isActive
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                  }`
                }
              >
                <Icon className="w-5 h-5" />
                {item.name}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-slate-800">
        <div className="bg-slate-800/60 rounded-lg p-3 text-xs text-slate-400">
          <span className="font-semibold text-slate-200 block mb-1">ML Status</span>
          Delay Predictor v1.0 active
        </div>
      </div>
    </aside>
  );
}
