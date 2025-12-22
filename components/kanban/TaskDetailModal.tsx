import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, User, CheckCircle2, Circle, Building2, Wrench, Check } from 'lucide-react';
import { tasksService, workersService, propertiesService } from '../../services/supabaseService';
import { CalendarEvent, TaskStatus, Property, Worker } from '../../types';
import { getTaskColor } from '../../utils/taskColors';

interface TaskDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: CalendarEvent | null;
  onUpdateTask: (task: CalendarEvent) => void;
  onDeleteTask?: (taskId: string) => void;
}

const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  isOpen,
  onClose,
  task,
  onUpdateTask,
  onDeleteTask
}) => {
  const [property, setProperty] = useState<Property | null>(null);
  const [assignee, setAssignee] = useState<Worker | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (isOpen && task) {
      loadTaskDetails();
    }
  }, [isOpen, task]);

  const loadTaskDetails = async () => {
    if (!task) return;

    try {
      if (task.propertyId) {
        const prop = await propertiesService.getById(task.propertyId);
        setProperty(prop);
      }
      if (task.workerId) {
        const worker = await workersService.getById(task.workerId);
        setAssignee(worker);
      }
    } catch (error) {
      console.error('Error loading task details:', error);
    }
  };

  const handleStatusChange = async (newStatus: TaskStatus) => {
    if (!task || isUpdating) return;

    try {
      setIsUpdating(true);
      const updatedTask = await tasksService.update(task.id, { status: newStatus });
      onUpdateTask(updatedTask);
      window.dispatchEvent(new CustomEvent('taskUpdated'));
    } catch (error) {
      console.error('Error updating task status:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const getStatusButton = (status: TaskStatus, label: string, icon: React.ReactNode) => {
    const isActive = task?.status === status;
    return (
      <button
        onClick={() => handleStatusChange(status)}
        disabled={isUpdating || isActive}
        className={`
          flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-all
          ${isActive 
            ? 'bg-blue-500/20 border-blue-500 text-blue-400 cursor-not-allowed' 
            : 'bg-[#1C1F24] border-gray-700 text-gray-300 hover:border-blue-500 hover:text-blue-400'
          }
          ${isUpdating ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        {icon}
        <span>{label}</span>
      </button>
    );
  };

  if (!isOpen || !task) return null;

  const colorClass = getTaskColor(task.type);
  let parsedDescription: any = null;
  let displayDescription = task.description || 'No description';

  // Парсимо JSON, якщо це transfer task, показуємо зрозумілий текст
  try {
    if (task.description) {
      parsedDescription = JSON.parse(task.description);
      // Якщо це transfer task, показуємо originalDescription
      if (parsedDescription?.action === 'transfer_inventory' && parsedDescription.originalDescription) {
        displayDescription = parsedDescription.originalDescription;
      } else if (parsedDescription?.originalDescription) {
        displayDescription = parsedDescription.originalDescription;
      }
      // Якщо не знайшли originalDescription, залишаємо як є (може бути інший формат JSON)
    }
  } catch (e) {
    // Не JSON, використовуємо як є
    displayDescription = task.description || 'No description';
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#16181D] rounded-xl border border-gray-800 w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <span className={`text-xs font-medium px-2 py-1 rounded border ${colorClass}`}>
              {task.type}
            </span>
            <h2 className="text-lg font-bold text-white">{task.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-4">
            {/* Worker Action Card */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Wrench className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-semibold text-white">Worker Action</h3>
              </div>
              <p className="text-xs text-gray-400 mb-3">
                Change task status to mark progress
              </p>
              <div className="flex flex-wrap gap-2">
                {getStatusButton('in_progress', 'In Progress', <Circle className="w-3 h-3" />)}
                {getStatusButton('completed', 'Mark as Done', <CheckCircle2 className="w-3 h-3" />)}
                {getStatusButton('verified', 'Verified', <Check className="w-3 h-3" />)}
              </div>
            </div>

            {/* Date & Time */}
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Calendar className="w-4 h-4" />
              <span>
                {task.date ? new Date(task.date).toLocaleDateString('uk-UA', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric'
                }) : 'No date'}
                {task.time && ` • ${task.time}`}
              </span>
            </div>

            {/* Assignee */}
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <User className="w-4 h-4" />
              <span>{assignee?.name || task.assignee || 'Unassigned'}</span>
              {assignee?.role && (
                <span className="text-xs text-gray-500">({assignee.role})</span>
              )}
            </div>

            {/* Property */}
            {property && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Building2 className="w-4 h-4" />
                <span>{property.title}</span>
              </div>
            )}

            {/* Description */}
            <div>
              <h3 className="text-xs font-semibold text-gray-400 mb-2">Description</h3>
              <div className="bg-[#1C1F24] rounded-lg p-3 border border-gray-800">
                <p className="text-sm text-gray-300 whitespace-pre-wrap">
                  {displayDescription}
                </p>
                {/* Приховано Transfer Data JSON - він не потрібен для відображення */}
              </div>
            </div>

            {/* Status */}
            <div>
              <h3 className="text-xs font-semibold text-gray-400 mb-2">Status</h3>
              <div className="flex items-center gap-2">
                {task.status === 'completed' || task.status === 'verified' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Circle className="w-4 h-4 text-gray-500" />
                )}
                <span className="text-sm text-white capitalize">{task.status.replace('_', ' ')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskDetailModal;

