import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Users,
  TrendingUp,
  Sparkles,
  RefreshCw,
  Plus,
  Check,
  History,
} from 'lucide-react';
import api from '../api/client';
import { useWorkspace } from '../context/WorkspaceContext';
import toast from 'react-hot-toast';

const STATUS_STYLES = {
  done: { label: 'Done', cls: 'bg-emerald-100 text-emerald-700' },
  in_progress: { label: 'In Progress', cls: 'bg-amber-100 text-amber-700' },
  review: { label: 'Review', cls: 'bg-indigo-100 text-indigo-700' },
  todo: { label: 'To Do', cls: 'bg-slate-100 text-slate-700' },
};

const PRIORITY_STYLES = {
  high: { label: 'High', cls: 'bg-red-100 text-red-700' },
  medium: { label: 'Medium', cls: 'bg-amber-100 text-amber-700' },
  low: { label: 'Low', cls: 'bg-emerald-100 text-emerald-700' },
};

function renderRiskBadge(task) {
  if (task.delay_probability == null) {
    return (
      <span className="px-2.5 py-1 bg-slate-100 text-slate-500 border border-slate-200 rounded text-xs font-medium">
        Pending ML Score
      </span>
    );
  }
  const prob = Number(task.delay_probability).toFixed(2);
  const level = (task.risk_level || 'low').toLowerCase();
  if (level === 'high') {
    return (
      <span className="px-2.5 py-1 bg-rose-50 text-rose-600 border border-rose-200 rounded text-xs font-semibold">
        High Risk ({prob})
      </span>
    );
  }
  if (level === 'medium') {
    return (
      <span className="px-2.5 py-1 bg-amber-50 text-amber-600 border border-amber-200 rounded text-xs font-semibold">
        Medium Risk ({prob})
      </span>
    );
  }
  return (
    <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded text-xs font-semibold">
      Low Risk ({prob})
    </span>
  );
}

export default function Dashboard() {
  const { orgId, projectId } = useWorkspace();
  const [analytics, setAnalytics] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [auditHistory, setAuditHistory] = useState([]);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [addedItemKeys, setAddedItemKeys] = useState({});

  const loadDashboardData = useCallback(async () => {
    if (!orgId) {
      setLoadingMetrics(false);
      return;
    }
    setLoadingMetrics(true);
    try {
      const [analyticsRes, tasksRes, auditRes] = await Promise.all([
        api.get(`/analytics/overview/${orgId}`).catch(() => null),
        projectId ? api.get(`/tasks/project/${projectId}`).catch(() => null) : Promise.resolve(null),
        api.get(`/analytics/audit/${orgId}`).catch(() => null),
      ]);
      setAnalytics(analyticsRes?.data || null);
      setTasks(tasksRes?.data?.tasks || []);
      setAuditHistory(auditRes?.data?.history || []);
    } catch (err) {
      console.error('Failed to load dashboard metrics', err);
    } finally {
      setLoadingMetrics(false);
    }
  }, [orgId, projectId]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const inProgressCount =
    analytics?.tasks_by_status?.find((s) => s.status === 'in_progress')?.count ?? 0;
  const highRiskCount =
    analytics?.ml_risk_distribution?.find((r) => r.risk_level === 'high')?.count ?? 0;

  const stats = [
    {
      title: 'Total Tasks',
      value: loadingMetrics ? '...' : String(analytics?.summary?.total_tasks ?? tasks.length),
      icon: CheckCircle2,
      color: 'text-brand-600',
      bg: 'bg-brand-50',
    },
    {
      title: 'In Progress',
      value: loadingMetrics ? '...' : String(inProgressCount),
      icon: Clock,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    {
      title: 'Delay Risk (High)',
      value: loadingMetrics ? '...' : String(highRiskCount),
      icon: AlertTriangle,
      color: 'text-rose-600',
      bg: 'bg-rose-50',
    },
    {
      title: 'Active Members',
      value: loadingMetrics ? '...' : String(analytics?.member_workload?.length ?? 0),
      icon: Users,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
  ];

  const [aiInput, setAiInput] = useState('');
  const [aiOutput, setAiOutput] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);

  const handleSummarize = async () => {
    if (!aiInput.trim()) {
      toast.error('Please enter notes or text to summarize.');
      return;
    }
    setLoadingAi(true);
    setAiOutput(null);
    try {
      const res = await api.post('/ai/summarize', { text: aiInput });
      setAiOutput({ type: 'summary', content: res.data.summary, source: res.data.source });
      toast.success('Summary generated successfully!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to summarize.');
    } finally {
      setLoadingAi(false);
    }
  };

  const handleExtractActionItems = async () => {
    if (!aiInput.trim()) {
      toast.error('Please enter text to extract action items.');
      return;
    }
    setLoadingAi(true);
    setAiOutput(null);
    setAddedItemKeys({});
    try {
      const res = await api.post('/ai/action-items', { text: aiInput });
      setAiOutput({ type: 'action_items', items: res.data.action_items, source: res.data.source });
      toast.success('Action items extracted!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to extract items.');
    } finally {
      setLoadingAi(false);
    }
  };

  const handleCreateTaskFromAi = async (item, idx) => {
    if (!projectId) {
      toast.error('No active project available in workspace.');
      return;
    }
    setAddedItemKeys((prev) => ({ ...prev, [idx]: 'saving' }));
    try {
      await api.post('/tasks', {
        project_id: projectId,
        title: item.title,
        priority: item.priority || 'medium',
        complexity: item.priority === 'high' ? 6 : 4,
        estimated_days: Number(item.estimated_days) || 3,
      });
      setAddedItemKeys((prev) => ({ ...prev, [idx]: 'added' }));
      toast.success('Action item added to Kanban!');
      loadDashboardData();
    } catch (err) {
      setAddedItemKeys((prev) => ({ ...prev, [idx]: false }));
      toast.error(err.response?.data?.error || 'Failed to create task.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Workspace Dashboard</h2>
          <p className="text-sm text-slate-500">Real-time overview of tasks, team activity, and predictive delay alerts.</p>
        </div>
        <button
          type="button"
          onClick={loadDashboardData}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loadingMetrics ? 'animate-spin' : ''}`} />
          Refresh
        </button>
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

      {/* AI Assistant Section */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-600" />
          <h3 className="font-semibold text-slate-800 text-base">AI Assistant (Document Summarizer & Action Item Extractor)</h3>
        </div>
        <p className="text-xs text-slate-500">
          Enter meeting notes, sprint updates, or chat messages. The AI service will generate concise executive summaries and extract structured task action items.
        </p>

        <textarea
          rows={3}
          value={aiInput}
          onChange={(e) => setAiInput(e.target.value)}
          placeholder="Paste meeting discussion notes or project updates here..."
          className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
        />

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleSummarize}
            disabled={loadingAi}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition shadow-sm disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" /> Summarize Text
          </button>
          <button
            onClick={handleExtractActionItems}
            disabled={loadingAi}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-medium transition shadow-sm disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" /> Extract Action Items
          </button>
        </div>

        {loadingAi && (
          <div className="p-4 bg-slate-50 rounded-lg text-sm text-slate-500 animate-pulse flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping"></span> AI is analyzing your content...
          </div>
        )}

        {aiOutput && (
          <div className="p-4 bg-indigo-50/70 border border-indigo-100 rounded-lg mt-3 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-indigo-700">
              <span>{aiOutput.type === 'summary' ? '📄 AI Executive Summary' : '📋 Extracted Action Items'}</span>
              <span className="text-[10px] bg-white px-2 py-0.5 rounded border border-indigo-200">{aiOutput.source}</span>
            </div>

            {aiOutput.type === 'summary' ? (
              <p className="text-sm text-slate-800 whitespace-pre-line leading-relaxed">{aiOutput.content}</p>
            ) : (
              <div className="space-y-1.5 mt-2">
                {aiOutput.items.map((item, idx) => {
                  const itemState = addedItemKeys[idx];
                  return (
                    <div
                      key={idx}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white p-2.5 rounded border border-indigo-100 text-sm"
                    >
                      <span className="font-medium text-slate-800">• {item.title}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-slate-500">{item.estimated_days}d est</span>
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                            item.priority === 'high'
                              ? 'bg-red-100 text-red-700'
                              : item.priority === 'medium'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {item.priority}
                        </span>
                        <button
                          type="button"
                          disabled={itemState === 'added' || itemState === 'saving' || !projectId}
                          onClick={() => handleCreateTaskFromAi(item, idx)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition ${
                            itemState === 'added'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50'
                          }`}
                        >
                          {itemState === 'added' ? (
                            <>
                              <Check className="w-3.5 h-3.5" /> Added
                            </>
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5" />{' '}
                              {itemState === 'saving' ? 'Adding...' : 'Add to Kanban'}
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
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
              {loadingMetrics ? (
                <tr>
                  <td colSpan={4} className="py-6 px-6 text-center text-slate-500">
                    Loading live tasks &amp; ML predictions...
                  </td>
                </tr>
              ) : tasks.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 px-6 text-center text-slate-500">
                    No tasks created in this workspace yet. Visit Kanban to create a task.
                  </td>
                </tr>
              ) : (
                tasks.slice(0, 8).map((task) => {
                  const priorityStyle = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium;
                  const statusStyle = STATUS_STYLES[task.status] || STATUS_STYLES.todo;
                  return (
                    <tr key={task.id} className="hover:bg-slate-50/60">
                      <td className="py-4 px-6 font-medium text-slate-800">{task.title}</td>
                      <td className="py-4 px-6">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${priorityStyle.cls}`}>
                          {priorityStyle.label}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusStyle.cls}`}>
                          {statusStyle.label}
                        </span>
                      </td>
                      <td className="py-4 px-6">{renderRiskBadge(task)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Audit History Viewer (task_status_history) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
          <History className="w-5 h-5 text-slate-500" />
          <h3 className="font-semibold text-slate-800 text-base">
            Recent Status Audit Trail (<code className="text-xs font-mono text-slate-500">task_status_history</code>)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <th className="py-3 px-6">Task</th>
                <th className="py-3 px-6">Transition</th>
                <th className="py-3 px-6">Progress</th>
                <th className="py-3 px-6">Changed By</th>
                <th className="py-3 px-6">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {auditHistory.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-5 px-6 text-center text-slate-500">
                    No status transitions recorded yet.
                  </td>
                </tr>
              ) : (
                auditHistory.slice(0, 10).map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/60">
                    <td className="py-3 px-6 font-medium text-slate-800">{row.task_title}</td>
                    <td className="py-3 px-6 text-xs font-mono text-slate-700">
                      {row.old_status ? `${row.old_status} -> ${row.new_status}` : `created (${row.new_status})`}
                    </td>
                    <td className="py-3 px-6 text-xs text-slate-600">{row.new_progress}%</td>
                    <td className="py-3 px-6 text-xs text-slate-600">{row.changed_by_name || 'System'}</td>
                    <td className="py-3 px-6 text-xs text-slate-500">
                      {new Date(row.changed_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
