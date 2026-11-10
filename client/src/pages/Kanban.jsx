import React, { useState, useEffect, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
  Calendar,
  Plus,
  RefreshCw,
  X,
  Trash2,
  MessageSquare,
  History,
  Users,
  Send,
} from 'lucide-react';
import api from '../api/client';
import { useWorkspace } from '../context/WorkspaceContext';
import toast from 'react-hot-toast';

const columnOrder = [
  { id: 'todo', name: 'To Do' },
  { id: 'in_progress', name: 'In Progress' },
  { id: 'review', name: 'Review' },
  { id: 'done', name: 'Done' },
];

function TaskDetailModal({ taskId, members, onClose, onChanged }) {
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [complexity, setComplexity] = useState(3);
  const [estimatedDays, setEstimatedDays] = useState(3);
  const [dueDate, setDueDate] = useState('');
  const [selectedAssignees, setSelectedAssignees] = useState([]);
  const [comments, setComments] = useState([]);
  const [history, setHistory] = useState([]);
  const [prediction, setPrediction] = useState(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [postingComment, setPostingComment] = useState(false);

  const loadDetails = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/tasks/${taskId}`);
      const t = res.data.task;
      setTitle(t.title || '');
      setDescription(t.description || '');
      setPriority(t.priority || 'medium');
      setComplexity(t.complexity || 3);
      setEstimatedDays(t.estimated_days || 3);
      setDueDate(t.due_date ? String(t.due_date).slice(0, 10) : '');
      setSelectedAssignees((res.data.assignees || []).map((a) => a.id));
      setComments(res.data.comments || []);
      setHistory(res.data.history || []);
      setPrediction(
        t.delay_probability != null
          ? { prob: t.delay_probability, risk: t.risk_level }
          : null
      );
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load task details.');
      onClose();
    } finally {
      setLoading(false);
    }
  }, [taskId, onClose]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  const toggleAssignee = (uid) => {
    setSelectedAssignees((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/tasks/${taskId}`, {
        title: title.trim(),
        description,
        priority,
        complexity: Number(complexity),
        estimated_days: Number(estimatedDays),
        due_date: dueDate || null,
        assignee_ids: selectedAssignees,
      });
      toast.success('Task updated!');
      await loadDetails();
      onChanged();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save task.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/tasks/${taskId}`);
      toast.success('Task deleted');
      onChanged();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete task.');
    }
  };

  const handlePostComment = async (e) => {
    e.preventDefault();
    if (!commentDraft.trim()) return;
    setPostingComment(true);
    try {
      const res = await api.post(`/tasks/${taskId}/comments`, {
        content: commentDraft.trim(),
      });
      setComments((prev) => [...prev, res.data.comment]);
      setCommentDraft('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to post comment.');
    } finally {
      setPostingComment(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-brand-50 text-brand-700 font-bold">
              T{taskId}
            </span>
            <h3 className="font-semibold text-slate-800 truncate">Task Details</h3>
            {prediction && (
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                  prediction.risk === 'high'
                    ? 'bg-rose-100 text-rose-700'
                    : prediction.risk === 'medium'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                ML {prediction.risk.toUpperCase()} ({Math.round(Number(prediction.prob) * 100)}%)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDelete}
              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"
              title="Delete Task"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-500">Loading task details...</div>
          ) : (
            <>
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Title</label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Add task scope, acceptance criteria, or notes..."
                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Priority
                    </label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Complexity (1-10)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={complexity}
                      onChange={(e) => setComplexity(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Est. Days
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={estimatedDays}
                      onChange={(e) => setEstimatedDays(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-2">
                    <Users className="w-3.5 h-3.5" /> Assignees
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {members.map((m) => {
                      const active = selectedAssignees.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => toggleAssignee(m.id)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                            active
                              ? 'bg-brand-600 text-white border-brand-600'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {m.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-200">
                {/* Threaded Comments */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <MessageSquare className="w-4 h-4 text-brand-600" />
                    Comments ({comments.length})
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {comments.length === 0 ? (
                      <p className="text-xs text-slate-400">No comments yet.</p>
                    ) : (
                      comments.map((c) => (
                        <div key={c.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                          <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                            <span className="font-semibold text-slate-700">{c.author_name}</span>
                            <span>{new Date(c.created_at).toLocaleString()}</span>
                          </div>
                          <p className="text-slate-700 whitespace-pre-line">{c.content}</p>
                        </div>
                      ))
                    )}
                  </div>

                  <form onSubmit={handlePostComment} className="flex gap-2">
                    <input
                      type="text"
                      value={commentDraft}
                      onChange={(e) => setCommentDraft(e.target.value)}
                      placeholder="Write a comment..."
                      className="flex-1 min-w-0 px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <button
                      type="submit"
                      disabled={postingComment || !commentDraft.trim()}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-medium disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </div>

                {/* Status Audit History */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <History className="w-4 h-4 text-slate-500" />
                    Audit Trail ({history.length})
                  </div>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {history.length === 0 ? (
                      <p className="text-xs text-slate-400">No status history recorded.</p>
                    ) : (
                      history.map((h) => (
                        <div key={h.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-0.5">
                          <div className="font-medium text-slate-700">
                            {h.old_status ? `${h.old_status} -> ${h.new_status}` : `Created as ${h.new_status}`}{' '}
                            <span className="text-slate-400">({h.new_progress}%)</span>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {h.changed_by_name || 'Member'} • {new Date(h.changed_at).toLocaleString()}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Kanban() {
  const { projectId, members } = useWorkspace();
  const [columns, setColumns] = useState({
    todo: [],
    in_progress: [],
    review: [],
    done: [],
  });
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState('medium');
  const [creatingTask, setCreatingTask] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState(null);

  const fetchTasks = useCallback(async () => {
    if (!projectId) {
      setColumns({ todo: [], in_progress: [], review: [], done: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get(`/tasks/project/${projectId}`);
      const allTasks = res.data.tasks || [];

      const newCols = { todo: [], in_progress: [], review: [], done: [] };
      allTasks.forEach((task) => {
        const col = task.status || 'todo';
        if (newCols[col]) {
          newCols[col].push({
            id: String(task.id),
            title: task.title,
            priority: task.priority || 'medium',
            risk: task.risk_level || 'low',
            delay_prob: task.delay_probability,
            days: task.estimated_days || 3,
            assignees: task.assignees || [],
          });
        }
      });
      setColumns(newCols);
    } catch (err) {
      console.error('Failed to load tasks', err);
      toast.error('Failed to load live tasks from database.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const handleCreateTask = async (e) => {
    e.preventDefault();
    const title = newTaskTitle.trim();
    if (!title || !projectId) return;
    setCreatingTask(true);
    try {
      await api.post('/tasks', {
        project_id: projectId,
        title,
        priority: newTaskPriority,
        complexity: 4,
        estimated_days: 3,
      });
      toast.success('Task created!');
      setNewTaskTitle('');
      setShowNewForm(false);
      await fetchTasks();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create task.');
    } finally {
      setCreatingTask(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const onDragEnd = async (result) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const previousColumns = {
      todo: [...columns.todo],
      in_progress: [...columns.in_progress],
      review: [...columns.review],
      done: [...columns.done],
    };

    const sourceCol = [...columns[source.droppableId]];
    const destCol =
      source.droppableId === destination.droppableId
        ? sourceCol
        : [...columns[destination.droppableId]];
    const [movedTask] = sourceCol.splice(source.index, 1);
    destCol.splice(destination.index, 0, movedTask);

    setColumns({
      ...columns,
      [source.droppableId]: sourceCol,
      [destination.droppableId]: destCol,
    });

    try {
      await api.patch(`/tasks/${draggableId}/status`, {
        status: destination.droppableId,
      });
      toast.success(`Task moved to ${destination.droppableId}`);
      fetchTasks();
    } catch (err) {
      console.error('Kanban drag error:', err);
      toast.error(err.response?.data?.error || 'Failed to persist task status to database.');
      setColumns(previousColumns);
    }
  };

  const handleMoveTask = async (taskId, newColId) => {
    try {
      await api.patch(`/tasks/${taskId}/status`, { status: newColId });
      toast.success(`Task moved to ${newColId}`);
      fetchTasks();
    } catch {
      toast.error('Failed to move task. Please verify login.');
    }
  };

  const getRiskBadge = (risk, prob) => {
    if (risk === 'high') {
      return (
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-100 text-rose-700">
          🔴 High Delay Risk {prob ? `(${Math.round(prob * 100)}%)` : ''}
        </span>
      );
    }
    if (risk === 'medium') {
      return (
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-700">
          🟡 Moderate Risk {prob ? `(${Math.round(prob * 100)}%)` : ''}
        </span>
      );
    }
    return (
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
        🟢 On Track
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Project Kanban Board</h2>
          <p className="text-sm text-slate-500">
            Click any card to edit assignees, comments &amp; audit trail. Status changes append to{' '}
            <code className="bg-slate-100 px-1 py-0.5 rounded text-xs font-mono">task_status_history</code>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {projectId && (
            <button
              type="button"
              onClick={() => setShowNewForm((prev) => !prev)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium transition shadow-sm"
            >
              <Plus className="w-4 h-4" /> New Task
            </button>
          )}
          <button
            onClick={fetchTasks}
            className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh Tasks
          </button>
        </div>
      </div>

      {showNewForm && (
        <form
          onSubmit={handleCreateTask}
          className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col sm:flex-row gap-3 items-stretch sm:items-center"
        >
          <input
            type="text"
            required
            minLength={2}
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            placeholder="Enter task title..."
            className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <select
            value={newTaskPriority}
            onChange={(e) => setNewTaskPriority(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700"
          >
            <option value="low">Low Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="high">High Priority</option>
          </select>
          <button
            type="submit"
            disabled={creatingTask || newTaskTitle.trim().length < 2}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {creatingTask ? 'Saving...' : 'Add Task'}
          </button>
        </form>
      )}

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          {columnOrder.map((col) => {
            const items = columns[col.id] || [];
            return (
              <div key={col.id} className="bg-slate-100 rounded-xl p-4 flex flex-col min-h-[500px]">
                <div className="flex items-center justify-between mb-4">
                  <span className="font-semibold text-slate-700 text-sm">{col.name}</span>
                  <span className="bg-white text-slate-500 text-xs font-bold px-2 py-0.5 rounded-full shadow-sm">
                    {items.length}
                  </span>
                </div>

                <Droppable droppableId={col.id}>
                  {(provided, snapshot) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className={`flex-1 space-y-3 p-1 rounded-lg transition ${
                        snapshot.isDraggingOver ? 'bg-slate-200/50' : ''
                      }`}
                    >
                      {items.map((item, index) => (
                        <Draggable key={item.id} draggableId={item.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              onClick={() => setActiveTaskId(Number(item.id))}
                              className={`bg-white rounded-lg p-4 border border-slate-200 shadow-sm transition hover:shadow-md cursor-pointer ${
                                snapshot.isDragging ? 'rotate-1 shadow-lg' : ''
                              }`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                {getRiskBadge(item.risk, item.delay_prob)}
                                <span className="text-xs font-semibold text-slate-400 capitalize">
                                  {item.priority}
                                </span>
                              </div>
                              <h4 className="font-medium text-slate-800 text-sm mb-2">{item.title}</h4>
                              {item.assignees?.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-2">
                                  {item.assignees.map((a) => (
                                    <span
                                      key={a.id}
                                      className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600"
                                    >
                                      {a.name.split(' ')[0]}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-100">
                                <div className="flex items-center gap-2">
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3.5 h-3.5" /> {item.days}d
                                  </span>
                                  <select
                                    value={col.id}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      handleMoveTask(item.id, e.target.value);
                                    }}
                                    className="bg-slate-50 border border-slate-200 text-slate-600 rounded px-1.5 py-0.5 text-[11px] focus:outline-none"
                                    title="Move task to another column"
                                  >
                                    {columnOrder.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        Move: {c.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-[10px]">
                                  T{item.id}
                                </div>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      {activeTaskId && (
        <TaskDetailModal
          taskId={activeTaskId}
          members={members}
          onClose={() => setActiveTaskId(null)}
          onChanged={fetchTasks}
        />
      )}
    </div>
  );
}
