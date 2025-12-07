import React, { useState } from 'react';
import { CalendarEvent, Worker, KanbanColumn as IKanbanColumn } from '../../types';
import KanbanTaskCard from './KanbanTaskCard';
import { Plus, MoreHorizontal, User, Briefcase } from 'lucide-react';
import TaskCreateModal from './TaskCreateModal';

interface KanbanColumnProps {
  column: IKanbanColumn;
  currentUser: Worker | null;
  onTaskCreated: (task: CalendarEvent) => void;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({ column, currentUser, onTaskCreated }) => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Sort tasks: Urgent first, then by time/date
  const sortedTasks = [...column.tasks].sort((a, b) => {
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    const pA = priorityOrder[a.priority || 'medium'];
    const pB = priorityOrder[b.priority || 'medium'];
    if (pA !== pB) return pA - pB;
    // If priority same, sort by time
    return (a.time || '23:59').localeCompare(b.time || '23:59');
  });

  const isPersonalColumn = currentUser?.id === column.workerId;
  const isSuperAdmin = currentUser?.role === 'super_manager';
  // Allow creating tasks if: It's my column OR I am manager/admin
  const canCreateTask = isPersonalColumn || isSuperAdmin || currentUser?.role === 'manager';

  return (
    <div className="flex-shrink-0 w-80 flex flex-col h-full bg-[#111315] border-r border-gray-800/50">
      {/* Header */}
      <div className="p-3 border-b border-gray-800 flex items-center justify-between bg-[#16181b]">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="relative">
            {column.type === 'backlog' ? (
              <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                <Briefcase className="w-5 h-5 text-indigo-400" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden border border-gray-600">
                {/* Use avatar_url if available in future */}
                <User className="w-5 h-5 text-gray-400" />
              </div>
            )}
            <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-[#1C1F24] rounded-full flex items-center justify-center text-[10px] font-bold text-gray-400 border border-gray-700">
              {column.tasks.length}
            </span>
          </div>
          
          {/* Name */}
          <div>
            <h3 className="text-sm font-bold text-white truncate max-w-[150px]">
              {column.title}
            </h3>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">
              {column.type === 'backlog' ? 'Inbox' : column.type}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {canCreateTask && (
            <button 
              onClick={() => setIsCreateModalOpen(true)}
              className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
              title="Add Task"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
          <button className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
        {sortedTasks.length === 0 ? (
          <div className="h-32 flex flex-col items-center justify-center text-gray-600 border-2 border-dashed border-gray-800 rounded-lg m-2">
            <span className="text-xs">No tasks</span>
          </div>
        ) : (
          sortedTasks.map(task => (
            <KanbanTaskCard 
              key={task.id} 
              task={task} 
              onClick={() => console.log('Task clicked', task.id)} 
            />
          ))
        )}
      </div>

      {/* Modal */}
      <TaskCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onTaskCreated={onTaskCreated}
        initialWorkerId={column.workerId} // Pre-fill assignee
      />
    </div>
  );
};

export default KanbanColumn;

