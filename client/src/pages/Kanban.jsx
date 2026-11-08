import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { AlertCircle, Calendar, Plus, RefreshCw } from 'lucide-react';
import api from '../api/client';
import toast from 'react-hot-toast';

const columnOrder = [
  { id: 'todo', name: 'To Do' },
  { id: 'in_progress', name: 'In Progress' },
  { id: 'review', name: 'Review' },
  { id: 'done', name: 'Done' },
];

export default function Kanban() {
  const [columns, setColumns] = useState({
    todo: [],
    in_progress: [],
    review: [],
    done: [],
  });
  const [loading, setLoading] = useState(true);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      // Default to Project ID 1 (seeded in 002_seed_data.sql)
      const res = await api.get('/tasks/project/1');
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
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const onDragEnd = async (result) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    // Snapshot previous state for reliable rollback on network/auth failure
    const previousColumns = {
      todo: [...columns.todo],
      in_progress: [...columns.in_progress],
      review: [...columns.review],
      done: [...columns.done],
    };

    // Optimistically update UI
    const sourceCol = [...columns[source.droppableId]];
    const destCol = source.droppableId === destination.droppableId ? sourceCol : [...columns[destination.droppableId]];
    const [movedTask] = sourceCol.splice(source.index, 1);
    destCol.splice(destination.index, 0, movedTask);

    setColumns({
      ...columns,
      [source.droppableId]: sourceCol,
      [destination.droppableId]: destCol,
    });

    // Send real PATCH update to database
    try {
      await api.patch(`/tasks/${draggableId}/status`, {
        status: destination.droppableId,
      });
      toast.success(`Task moved to ${destination.droppableId}`);
    } catch (err) {
      console.error('Kanban drag error:', err);
      toast.error(err.response?.data?.error || 'Failed to persist task status to database.');
      setColumns(previousColumns); // Rollback card on failure
    }
  };

  const handleMoveTask = async (taskId, newColId) => {
    try {
      await api.patch(`/tasks/${taskId}/status`, { status: newColId });
      toast.success(`Task moved to ${newColId}`);
      fetchTasks();
    } catch (err) {
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
            Connected to live PostgreSQL database. Status changes automatically append to <code className="bg-slate-100 px-1 py-0.5 rounded text-xs font-mono">task_status_history</code>.
          </p>
        </div>
        <button
          onClick={fetchTasks}
          className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh Tasks
        </button>
      </div>

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
                              className={`bg-white rounded-lg p-4 border border-slate-200 shadow-sm transition hover:shadow-md ${
                                snapshot.isDragging ? 'rotate-1 shadow-lg' : ''
                              }`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                {getRiskBadge(item.risk, item.delay_prob)}
                                <span className="text-xs font-semibold text-slate-400 capitalize">{item.priority}</span>
                              </div>
                              <h4 className="font-medium text-slate-800 text-sm mb-3">{item.title}</h4>
                              <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-100">
                                <div className="flex items-center gap-2">
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3.5 h-3.5" /> {item.days}d
                                  </span>
                                  {/* Mobile & Touch Column Mover */}
                                  <select
                                    value={col.id}
                                    onChange={(e) => handleMoveTask(item.id, e.target.value)}
                                    className="bg-slate-50 border border-slate-200 text-slate-600 rounded px-1.5 py-0.5 text-[11px] focus:outline-none"
                                    title="Move task to another column"
                                  >
                                    {columnOrder.map((c) => (
                                      <option key={c.id} value={c.id}>Move: {c.name}</option>
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
    </div>
  );
}
