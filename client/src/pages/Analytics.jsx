import React, { useState, useEffect } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { BarChart3, CheckCircle2, AlertTriangle, Users, TrendingUp, RefreshCw } from 'lucide-react';
import api from '../api/client';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
  todo: '#94a3b8',
  in_progress: '#f59e0b',
  review: '#6366f1',
  done: '#10b981',
};

const PRIORITY_COLORS = {
  low: '#10b981',
  medium: '#f59e0b',
  high: '#ef4444',
};

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const res = await api.get('/analytics/overview/1');
      setData(res.data);
    } catch (err) {
      console.error('Failed to load analytics', err);
      toast.error('Failed to load live analytics data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const statusChartData = (data?.tasks_by_status || []).map((s) => ({
    name: s.status.replace('_', ' ').toUpperCase(),
    value: s.count,
    color: STATUS_COLORS[s.status] || '#cbd5e1',
  }));

  const workloadChartData = (data?.member_workload || []).map((m) => ({
    name: m.name,
    tasks: m.task_count,
  }));

  const priorityChartData = (data?.tasks_by_priority || []).map((p) => ({
    priority: p.priority.toUpperCase(),
    count: p.count,
    fill: PRIORITY_COLORS[p.priority] || '#cbd5e1',
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Project & Team Analytics</h2>
          <p className="text-sm text-slate-500">Live SQL aggregations verified directly against PostgreSQL.</p>
        </div>
        <button
          onClick={fetchAnalytics}
          className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh Metrics
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase text-slate-400">Total Project Tasks</span>
          <p className="text-3xl font-bold text-slate-800 mt-2">{data?.summary?.total_tasks || 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase text-slate-400">Completion Rate</span>
          <p className="text-3xl font-bold text-emerald-600 mt-2">{data?.summary?.completion_rate || 0}%</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase text-slate-400">Completed Tasks</span>
          <p className="text-3xl font-bold text-brand-600 mt-2">{data?.summary?.completed_tasks || 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase text-slate-400">Overdue Tasks</span>
          <p className="text-3xl font-bold text-rose-600 mt-2">{data?.summary?.overdue_tasks || 0}</p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Distribution */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-base mb-4">Tasks by Workflow Stage</h3>
          <div className="h-64">
            {statusChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {statusChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-400">No task data yet</div>
            )}
          </div>
        </div>

        {/* Member Workload */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 text-base mb-4">Member Workload (Active Tasks)</h3>
          <div className="h-64">
            {workloadChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={workloadChartData}>
                  <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="tasks" fill="#0284c7" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-400">No workload data yet</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
