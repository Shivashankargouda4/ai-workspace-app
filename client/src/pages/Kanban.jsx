import React, { useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { AlertCircle, Plus, Calendar, User } from 'lucide-react';

const initialColumns = {
  todo: {
    name: 'To Do',
    items: [
      { id: '1', title: 'Setup PostgreSQL local instance', priority: 'high', risk: 'low', days: 2 },
      { id: '2', title: 'Prepare PowerPoint slides for viva', priority: 'medium', risk: 'medium', days: 4 },
    ],
  },
  in_progress: {
    name: 'In Progress',
    items: [
      { id: '3', title: 'Implement JWT refresh cookie flow', priority: 'high', risk: 'low', days: 3 },
      { id: '4', title: 'Connect Socket.IO chat rooms', priority: 'medium', risk: 'medium', days: 2 },
    ],
  },
  review: {
    name: 'Review',
    items: [
      { id: '5', title: 'Validate synthetic data distribution', priority: 'high', risk: 'high', days: 1 },
    ],
  },
  done: {
    name: 'Done',
    items: [
      { id: '6', title: 'Project Structure & Scaffolding', priority: 'high', risk: 'low', days: 1 },
      { id: '7', title: 'Synopsis and Abstract generation', priority: 'high', risk: 'low', days: 1 },
    ],
  },
};

export default function Kanban() {
  const [columns, setColumns] = useState(initialColumns);

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const { source, destination } = result;

    if (source.droppableId !== destination.droppableId) {
      const sourceColumn = columns[source.droppableId];
      const destColumn = columns[destination.droppableId];
      const sourceItems = [...sourceColumn.items];
      const destItems = [...destColumn.items];
      const [removed] = sourceItems.splice(source.index, 1);
      destItems.splice(destination.index, 0, removed);

      setColumns({
        ...columns,
        [source.droppableId]: { ...sourceColumn, items: sourceItems },
        [destination.droppableId]: { ...destColumn, items: destItems },
      });
    } else {
      const column = columns[source.droppableId];
      const copiedItems = [...column.items];
      const [removed] = copiedItems.splice(source.index, 1);
      copiedItems.splice(destination.index, 0, removed);

      setColumns({
        ...columns,
        [source.droppableId]: { ...column, items: copiedItems },
      });
    }
  };

  const getRiskBadge = (risk) => {
    if (risk === 'high') {
      return <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-100 text-rose-700">🔴 High Delay Risk</span>;
    }
    if (risk === 'medium') {
      return <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-700">🟡 Moderate Risk</span>;
    }
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">🟢 On Track</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Project Kanban Board</h2>
          <p className="text-sm text-slate-500">Drag and drop tasks across workflow stages. Live status updates persist to audit trail.</p>
        </div>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          {Object.entries(columns).map(([columnId, column]) => (
            <div key={columnId} className="bg-slate-100 rounded-xl p-4 flex flex-col min-h-[500px]">
              <div className="flex items-center justify-between mb-4">
                <span className="font-semibold text-slate-700 text-sm">{column.name}</span>
                <span className="bg-white text-slate-500 text-xs font-bold px-2 py-0.5 rounded-full shadow-sm">
                  {column.items.length}
                </span>
              </div>

              <Droppable droppableId={columnId}>
                {(provided, snapshot) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className={`flex-1 space-y-3 p-1 rounded-lg transition ${
                      snapshot.isDraggingOver ? 'bg-slate-200/50' : ''
                    }`}
                  >
                    {column.items.map((item, index) => (
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
                              {getRiskBadge(item.risk)}
                              <span className="text-xs font-semibold text-slate-400 capitalize">{item.priority}</span>
                            </div>
                            <h4 className="font-medium text-slate-800 text-sm mb-3">{item.title}</h4>
                            <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-100">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5" /> {item.days}d est
                              </span>
                              <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center font-bold text-[10px] text-slate-600">
                                S
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
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}
