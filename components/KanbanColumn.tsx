import React, { useState } from 'react';
import { Edit, Users, Plus } from 'lucide-react';
import { KanbanColumn, CalendarEvent } from '../types';
import { getTaskColor, getTaskBadgeColor } from '../utils/taskColors';
import KanbanTask from './KanbanTask';
import KanbanTaskModal from './KanbanTaskModal';

interface KanbanColumnProps {
  column: KanbanColumn;
  events: CalendarEvent[];
  onTaskDrop: (eventId: string, targetColumnId: string) => void;
  onEdit: () => void;
  canEdit: boolean;
  canAddTask: boolean;
}

export default function KanbanColumnComponent({
  column,
  events,
  onTaskDrop,
  onEdit,
  canEdit,
  canAddTask
}: KanbanColumnProps) {
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [draggedOver, setDraggedOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggedOver(true);
  };

  const handleDragLeave = () => {
    setDraggedOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggedOver(false);
    const eventId = e.dataTransfer.getData('text/plain');
    if (eventId) {
      onTaskDrop(eventId, column.id);
    }
  };

  return (
    <div
      className={`flex flex-col w-80 bg-[#161B22] rounded-lg border ${column.isBacklog ? 'border-gray-600' : 'border-gray-700'} ${draggedOver ? 'border-blue-500 bg-blue-500/10' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column Header */}
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-white">{column.name}</h3>
          {column.isBacklog && (
            <span className="text-xs px-2 py-0.5 bg-gray-700 text-gray-300 rounded">
              Нерозподілені
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {column.workers && column.workers.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <Users className="w-3 h-3" />
              <span>{column.workers.length}</span>
            </div>
          )}
          {canEdit && (
            <button
              onClick={onEdit}
              className="p-1 hover:bg-gray-700 rounded transition-colors"
              title="Edit column"
            >
              <Edit className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* Column Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[200px]">
        {events.map(event => (
          <KanbanTask
            key={event.id}
            event={event}
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', event.id);
            }}
          />
        ))}
        {events.length === 0 && (
          <div className="text-center text-gray-500 text-sm py-8">
            {column.isBacklog ? 'Немає нерозподілених завдань' : 'Немає завдань'}
          </div>
        )}
      </div>

      {/* Add Task Button */}
      {canAddTask && (
        <div className="p-2 border-t border-gray-700">
          <button
            onClick={() => setIsTaskModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            Add Task
          </button>
        </div>
      )}

      {/* Task Modal */}
      {isTaskModalOpen && (
        <KanbanTaskModal
          isOpen={true}
          onClose={() => setIsTaskModalOpen(false)}
          columnId={column.id}
          department={column.department}
          onSave={async (task) => {
            // Task will be created and added to column
            setIsTaskModalOpen(false);
            // Reload events (parent will handle this)
            window.dispatchEvent(new CustomEvent('kanbanTaskCreated'));
          }}
        />
      )}
    </div>
  );
}

