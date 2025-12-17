import React, { useState, useEffect } from 'react';
import { tasksService } from '../../services/supabaseService';
import { CalendarEvent } from '../../types';
import { useWorker } from '../../contexts/WorkerContext';
import { AlertTriangle, Clock, MapPin, CheckCircle2, AlertCircle, Camera, Filter } from 'lucide-react';
import IssueReportModal from './IssueReportModal';
import TaskWorkflowView from './TaskWorkflowView';

const WorkerTaskListView: React.FC = () => {
  const { worker } = useWorker();
  const [tasks, setTasks] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<CalendarEvent | null>(null);
  const [filter, setFilter] = useState<'all' | 'urgent' | 'today'>('all');

  useEffect(() => {
    if (worker) {
      loadTasks();
    }
  }, [worker]);

  const loadTasks = async () => {
    try {
      setLoading(true);
      // Fetch tasks assigned to current worker
      const data = await tasksService.getAll({ workerId: worker?.id });
      setTasks(data);
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  // Sorting & Filtering
  const filteredTasks = tasks.filter(task => {
    if (task.status === 'completed' || task.status === 'verified') return false; // Hide completed
    if (filter === 'urgent') return task.priority === 'urgent' || task.priority === 'high';
    if (filter === 'today') {
      // Simple check for today
      // In real app check task.date === today
      return true; 
    }
    return true;
  }).sort((a, b) => {
    // Sort by Priority (Urgent first)
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    const pA = priorityOrder[a.priority || 'medium'];
    const pB = priorityOrder[b.priority || 'medium'];
    if (pA !== pB) return pA - pB;
    // Then by Time
    return (a.time || '23:59').localeCompare(b.time || '23:59');
  });

  const handleTaskClick = (task: CalendarEvent) => {
    // Check blocking logic: if any task is "in_progress", can't start another?
    // For simplicity, just open it. Workflow view handles status updates.
    setSelectedTask(task);
  };

  if (selectedTask) {
    return (
      <TaskWorkflowView 
        task={selectedTask} 
        onBack={() => {
          setSelectedTask(null);
          loadTasks(); // Refresh on back
        }}
      />
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0D0F11]">
      {/* Header */}
      <div className="p-4 pt-6 bg-[#111315] border-b border-gray-800 flex justify-between items-center sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-bold text-white">My Tasks</h1>
          <p className="text-xs text-gray-400">{new Date().toLocaleDateString()} • {filteredTasks.length} tasks</p>
        </div>
        <div className="w-10 h-10 rounded-full bg-gray-700 overflow-hidden border border-gray-600">
           {/* Avatar */}
           <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
             {worker?.name?.substring(0,2).toUpperCase()}
           </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 p-4 pb-2 overflow-x-auto">
        <button 
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
            filter === 'all' ? 'bg-white text-black' : 'bg-[#1C1F24] text-gray-400 border border-gray-800'
          }`}
        >
          All Tasks
        </button>
        <button 
          onClick={() => setFilter('urgent')}
          className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1 ${
            filter === 'urgent' ? 'bg-red-500 text-white' : 'bg-[#1C1F24] text-gray-400 border border-gray-800'
          }`}
        >
          <AlertTriangle className="w-3 h-3" />
          Urgent
        </button>
        <button 
          onClick={() => setFilter('today')}
          className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
            filter === 'today' ? 'bg-blue-500 text-white' : 'bg-[#1C1F24] text-gray-400 border border-gray-800'
          }`}
        >
          Today
        </button>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto p-4 pt-2 space-y-3 pb-24">
        {loading ? (
          <div className="text-center text-gray-500 py-10">Loading...</div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center text-gray-500 py-10 flex flex-col items-center">
            <CheckCircle2 className="w-12 h-12 mb-2 opacity-20" />
            <p>No tasks for today!</p>
          </div>
        ) : (
          filteredTasks.map(task => (
            <div 
              key={task.id}
              onClick={() => handleTaskClick(task)}
              className={`
                active:scale-95 transition-transform cursor-pointer
                bg-[#1C1F24] p-4 rounded-xl border border-gray-800 relative overflow-hidden
                ${task.priority === 'urgent' ? 'border-l-4 border-l-red-500' : ''}
                ${task.status === 'in_progress' ? 'ring-1 ring-blue-500' : ''}
              `}
            >
              {/* Time & Priority */}
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  {task.priority === 'urgent' && <AlertCircle className="w-4 h-4 text-red-500" />}
                  {task.priority === 'high' && <AlertTriangle className="w-4 h-4 text-orange-500" />}
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                    task.priority === 'urgent' ? 'bg-red-500/20 text-red-400' : 
                    'bg-gray-800 text-gray-400'
                  }`}>
                    {task.type}
                  </span>
                </div>
                <div className="text-xs font-mono text-gray-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {task.time || 'All Day'}
                </div>
              </div>

              {/* Title */}
              <h3 className="text-base font-bold text-white mb-1 leading-tight">
                {task.title}
              </h3>

              {/* Location */}
              <div className="flex items-center gap-1 text-xs text-gray-500 mb-3">
                <MapPin className="w-3 h-3" />
                <span className="truncate">{task.locationText || 'Property #' + task.propertyId}</span>
              </div>

              {/* Footer Status */}
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-800/50">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    task.status === 'in_progress' ? 'bg-blue-500 animate-pulse' : 'bg-gray-600'
                  }`} />
                  <span className={`text-xs font-medium capitalize ${
                    task.status === 'in_progress' ? 'text-blue-400' : 'text-gray-500'
                  }`}>
                    {task.status.replace('_', ' ')}
                  </span>
                </div>
                {task.status === 'in_progress' && (
                  <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full">Continue</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Floating Action Button (Report Issue) */}
      <button
        onClick={() => setIsIssueModalOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-red-600 hover:bg-red-700 text-white rounded-full shadow-xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95 z-20"
      >
        <AlertTriangle className="w-6 h-6" />
      </button>

      <IssueReportModal 
        isOpen={isIssueModalOpen} 
        onClose={() => setIsIssueModalOpen(false)} 
        onReported={loadTasks}
      />
    </div>
  );
};

export default WorkerTaskListView;


