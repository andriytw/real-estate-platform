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
          flex items-center gap-2 px-4 py-2 rounded-lg border transition-all
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
  try {
    if (task.description) {
      parsedDescription = JSON.parse(task.description);
    }
  } catch (e) {
    // Not JSON, use as is
  }

  const displayDescription = parsedDescription?.originalDescription || task.description || 'No description';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#16181D] rounded-xl border border-gray-800 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <span className={`text-xs font-medium px-3 py-1 rounded border ${colorClass}`}>
              {task.type}
            </span>
            <h2 className="text-xl font-bold text-white">{task.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Task Details */}
            <div className="space-y-6">
              {/* Worker Action Card */}
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Wrench className="w-5 h-5 text-blue-400" />
                  <h3 className="text-lg font-semibold text-white">Worker Action</h3>
                </div>
                <p className="text-sm text-gray-400 mb-4">
                  Change task status to mark progress
                </p>
                <div className="flex flex-col gap-2">
                  {getStatusButton('in_progress', 'In Progress', <Circle className="w-4 h-4" />)}
                  {getStatusButton('completed', 'Mark as Done', <CheckCircle2 className="w-4 h-4" />)}
                  {getStatusButton('verified', 'Verified', <Check className="w-4 h-4" />)}
                </div>
              </div>

              {/* Date & Time */}
              <div className="flex items-center gap-2 text-gray-400">
                <Calendar className="w-5 h-5" />
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
              <div className="flex items-center gap-2 text-gray-400">
                <User className="w-5 h-5" />
                <span>{assignee?.name || task.assignee || 'Unassigned'}</span>
                {assignee?.role && (
                  <span className="text-xs text-gray-500">({assignee.role})</span>
                )}
              </div>

              {/* Property */}
              {property && (
                <div className="flex items-center gap-2 text-gray-400">
                  <Building2 className="w-5 h-5" />
                  <span>{property.title}</span>
                </div>
              )}

              {/* Description */}
              <div>
                <h3 className="text-sm font-semibold text-gray-400 mb-2">Description</h3>
                <div className="bg-[#1C1F24] rounded-lg p-4 border border-gray-800">
                  <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono">
                    {displayDescription}
                  </pre>
                  {parsedDescription?.action === 'transfer_inventory' && (
                    <div className="mt-4 pt-4 border-t border-gray-700">
                      <p className="text-xs text-gray-500 mb-2">Transfer Data:</p>
                      <pre className="text-xs text-gray-400 whitespace-pre-wrap">
                        {JSON.stringify(parsedDescription.transferData, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>

              {/* Status */}
              <div>
                <h3 className="text-sm font-semibold text-gray-400 mb-2">Status</h3>
                <div className="flex items-center gap-2">
                  {task.status === 'completed' || task.status === 'verified' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <Circle className="w-5 h-5 text-gray-500" />
                  )}
                  <span className="text-white capitalize">{task.status.replace('_', ' ')}</span>
                </div>
              </div>
            </div>

            {/* Right: Task Chat (placeholder) */}
            <div className="bg-[#1C1F24] rounded-lg border border-gray-800 p-4">
              <h3 className="text-lg font-semibold text-white mb-2">Task Chat</h3>
              <p className="text-sm text-gray-400 mb-4">Communication history</p>
              <div className="space-y-2">
                <div className="bg-[#16181D] rounded-lg p-3 border border-gray-700">
                  <p className="text-sm text-gray-300">Task received. I will be there on time.</p>
                  <p className="text-xs text-gray-500 mt-1">08:30</p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-700">
                <input
                  type="text"
                  placeholder="Type a message to the worker..."
                  className="w-full bg-[#16181D] border border-gray-700 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskDetailModal;

