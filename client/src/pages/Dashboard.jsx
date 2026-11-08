import React from 'react';
import { CheckCircle2, Clock, AlertTriangle, Users, TrendingUp } from 'lucide-react';

export default function Dashboard() {
  const stats = [
    { title: 'Total Tasks', value: '24', icon: CheckCircle2, color: 'text-brand-600', bg: 'bg-brand-50' },
    { title: 'In Progress', value: '11', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
    { title: 'Delay Risk (High)', value: '3', icon: AlertTriangle, color: 'text-rose-600', bg: 'bg-rose-50' },
    { title: 'Active Members', value: '8', icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Workspace Dashboard</h2>
          <p className="text-sm text-slate-500">Real-time overview of tasks, team activity, and predictive delay alerts.</p>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div key={idx} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-500">{stat.title}</span>
                <div className={`p-2 rounded-lg ${stat.bg}`}>
                  <Icon className={`w-5 h-5 ${stat.color}`} />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-3xl font-bold text-slate-800">{stat.value}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Predictive ML Insights Card */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 rounded-xl p-6 text-white shadow-md">
        <div className="flex items-center gap-3 mb-2">
          <TrendingUp className="w-5 h-5 text-brand-400" />
          <h3 className="font-semibold text-lg text-white">Machine Learning Delay Forecasting</h3>
        </div>
        <p className="text-sm text-slate-300 max-w-2xl">
          The Random Forest delay prediction model actively analyzes historical midpoint progress, task complexity, and team workload to proactively highlight at-risk deadlines before they slip.
        </p>
      </div>

      {/* Recent Activity Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800 text-base">Key Tasks & Risk Assessments</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <th className="py-3 px-6">Task</th>
                <th className="py-3 px-6">Priority</th>
                <th className="py-3 px-6">Status</th>
                <th className="py-3 px-6">ML Risk Assessment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              <tr>
                <td className="py-4 px-6 font-medium text-slate-800">Design Database Schema & Migration</td>
                <td className="py-4 px-6"><span className="px-2.5 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold">High</span></td>
                <td className="py-4 px-6"><span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold">Done</span></td>
                <td className="py-4 px-6"><span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded text-xs font-semibold">🟢 Low Risk (0.12)</span></td>
              </tr>
              <tr>
                <td className="py-4 px-6 font-medium text-slate-800">Socket.IO Real-time Channels & Chat</td>
                <td className="py-4 px-6"><span className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">Medium</span></td>
                <td className="py-4 px-6"><span className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">In Progress</span></td>
                <td className="py-4 px-6"><span className="px-2.5 py-1 bg-amber-50 text-amber-600 border border-amber-200 rounded text-xs font-semibold">🟡 Medium Risk (0.45)</span></td>
              </tr>
              <tr>
                <td className="py-4 px-6 font-medium text-slate-800">Train Random Forest on Synthetic Dataset</td>
                <td className="py-4 px-6"><span className="px-2.5 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold">High</span></td>
                <td className="py-4 px-6"><span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-semibold">To Do</span></td>
                <td className="py-4 px-6"><span className="px-2.5 py-1 bg-rose-50 text-rose-600 border border-rose-200 rounded text-xs font-semibold">🔴 High Risk (0.78)</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
