import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, KanbanSquare, MessageSquare, BarChart3 } from 'lucide-react';

const navItems = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Kanban', path: '/kanban', icon: KanbanSquare },
  { name: 'Chat', path: '/chat', icon: MessageSquare },
  { name: 'Analytics', path: '/analytics', icon: BarChart3 },
];

export default function Sidebar() {
  return (
    <>
      {/* Desktop Sidebar (hidden on mobile) */}
      <aside className="hidden md:flex w-64 bg-slate-900 text-slate-300 flex-col min-h-[calc(100vh-4rem)] border-r border-slate-800 shrink-0">
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

      {/* Mobile Bottom Navigation Bar (< 768px, 390px phone screen) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-sm border-t border-slate-800 flex justify-around items-center py-2 px-1 shadow-2xl">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-[11px] font-medium transition ${
                  isActive
                    ? 'text-brand-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`
              }
            >
              <Icon className="w-5 h-5" />
              <span>{item.name}</span>
            </NavLink>
          );
        })}
      </nav>
    </>
  );
}
