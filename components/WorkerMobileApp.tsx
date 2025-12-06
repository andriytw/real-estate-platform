import React, { useState, useEffect } from 'react';
import { Calendar, Clock, MapPin, CheckCircle2, AlertCircle } from 'lucide-react';
import { useWorker } from '../contexts/WorkerContext';
import { CalendarEvent, TaskWorkflow } from '../types';
import { calendarEventsService, taskWorkflowsService } from '../services/supabaseService';
import { getTaskColor, getTaskBadgeColor } from '../utils/taskColors';
import TaskWorkflowView from './TaskWorkflowView';
import TaskChatModal from './TaskChatModal';

export default function WorkerMobileApp() {
  const { worker, isWorker } = useWorker();
  const [tasks, setTasks] = useState<CalendarEvent[]>([]);
  const [workflows, setWorkflows] = useState<Map<string, TaskWorkflow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<CalendarEvent | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Redirect if not worker
  useEffect(() => {
    if (worker && !isWorker) {
      window.location.href = '/dashboard';
    }
  }, [worker, isWorker]);

  // Load tasks for worker
  useEffect(() => {
    const loadTasks = async () => {
      if (!worker) return;

      try {
        setLoading(true);
        // Get events assigned to this worker
        const allEvents = await calendarEventsService.getAll();
        const workerEvents = allEvents.filter(e => e.workerId === worker.id || e.assignedWorkerId === worker.id);
        
        // Load workflows for these events
        const workflowsMap = new Map<string, TaskWorkflow>();
        for (const event of workerEvents) {
          try {
            const workflow = await taskWorkflowsService.getByEventId(event.id);
            if (workflow) {
              workflowsMap.set(event.id, workflow);
            }
          } catch (error) {
            console.error(`Error loading workflow for event ${event.id}:`, error);
          }
        }

        setTasks(workerEvents);
        setWorkflows(workflowsMap);
      } catch (error) {
        console.error('Error loading tasks:', error);
      } finally {
        setLoading(false);
      }
    };

    loadTasks();
  }, [worker]);

  // Initialize dark mode
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (savedTheme === null && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    localStorage.setItem('theme', !isDarkMode ? 'dark' : 'light');
    if (!isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const activeTasks = tasks.filter(t => {
    const workflow = workflows.get(t.id);
    return !workflow || workflow.status !== 'completed';
  });

  const completedTasks = tasks.filter(t => {
    const workflow = workflows.get(t.id);
    return workflow && workflow.status === 'completed';
  });

  const formatDateTime = (dateStr?: string, timeStr?: string) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year} ${timeStr || ''}`.trim();
  };

  const getGoogleMapsLink = (address: string) => {
    return `https://maps.google.com/?q=${encodeURIComponent(address)}`;
  };

  if (!worker || !isWorker) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="text-gray-700 dark:text-gray-300 text-center">
          <p className="text-lg font-semibold mb-2">Доступ заборонено</p>
          <p className="text-sm">Потрібні права працівника</p>
        </div>
      </div>
    );
  }

  if (selectedTask) {
    return (
      <TaskWorkflowView
        event={selectedTask}
        workflow={workflows.get(selectedTask.id)}
        onBack={() => setSelectedTask(null)}
        onUpdateWorkflow={async (workflow) => {
          setWorkflows(prev => {
            const updated = new Map(prev);
            updated.set(selectedTask.id, workflow);
            return updated;
          });
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 transition-colors duration-300">
      {/* Header */}
      <header className="mb-6 flex justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-xl shadow-lg transition-colors duration-300">
        <h1 className="text-2xl font-extrabold text-gray-800 dark:text-gray-100">
          Мої Завдання <span className="text-indigo-500">({activeTasks.length})</span>
        </h1>
        <div className="text-right flex items-center space-x-3">
          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors duration-300 shadow"
            title="Перемкнути тему"
          >
            {isDarkMode ? '☀️' : '🌙'}
          </button>
          <div className="text-left">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Вітаю, {worker.name}!</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Відділ: {worker.department}</p>
          </div>
        </div>
      </header>

      <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-200 mb-3">Активні на сьогодні</h2>

      {loading ? (
        <div className="text-center py-8">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-gray-400">Завантаження...</p>
        </div>
      ) : activeTasks.length === 0 ? (
        <div className="text-center p-6 bg-white dark:bg-gray-800 rounded-xl mt-6 shadow-md">
          <p className="text-lg font-medium text-gray-500 dark:text-gray-400">✅ Усі завдання виконано! Гарного дня.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeTasks.map((task) => {
            const workflow = workflows.get(task.id);
            const isCompleted = workflow?.status === 'completed';
            const colorClass = isCompleted ? 'border-green-500' : getTaskColor(task.type).split(' ')[1]; // Extract border color
            const statusBgClass = isCompleted
              ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
              : 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300';

            let currentStep = 0;
            if (workflow) {
              if (workflow.step1Completed) currentStep = 1;
              if (workflow.step2Completed) currentStep = 2;
              if (workflow.step3Completed) currentStep = 3;
              if (workflow.step4Completed) currentStep = 4;
              if (workflow.step5Completed) currentStep = 5;
            }
            const statusText = isCompleted ? 'ГОТОВО' : currentStep > 0 ? `Крок ${currentStep}/5` : 'Нове';

            return (
              <div
                key={task.id}
                onClick={() => setSelectedTask(task)}
                className={`task-list-card bg-white dark:bg-gray-800 p-4 rounded-xl shadow ${colorClass} border-l-4 text-gray-800 dark:text-gray-100 cursor-pointer hover:shadow-lg transition-shadow`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-grow">
                    <p className={`text-xs font-semibold uppercase mb-1 ${getTaskTextColor(task.type)}`}>
                      {isCompleted ? '✅' : '🟧'} {task.type} | {task.propertyId ? 'Property' : 'General'}
                    </p>
                    {task.description && (
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-1">{task.description}</p>
                    )}
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4 text-green-500" />
                        {formatDateTime(task.date, task.time)}
                      </span>
                    </p>
                  </div>
                  <span className={`px-3 py-1 text-sm font-semibold rounded-full ${statusBgClass} flex-shrink-0 ml-2`}>
                    {statusText}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Chat Toggle Button */}
      {selectedTask && (
        <button
          onClick={() => setIsChatOpen(true)}
          className="fixed bottom-20 right-4 bg-indigo-500 hover:bg-indigo-600 text-white rounded-full w-14 h-14 shadow-lg transition-transform transform hover:scale-105 active:scale-95 flex items-center justify-center"
        >
          💬
        </button>
      )}

      {/* Chat Modal */}
      {isChatOpen && selectedTask && (
        <TaskChatModal
          eventId={selectedTask.id}
          onClose={() => setIsChatOpen(false)}
        />
      )}
    </div>
  );
}

// Helper function to get task text color
function getTaskTextColor(type: string): string {
  const colorMap: Record<string, string> = {
    'Einzug': 'text-purple-400',
    'Auszug': 'text-blue-400',
    'Putzen': 'text-orange-400',
    'Reklamation': 'text-red-500',
    'Arbeit nach plan': 'text-emerald-400',
    'Zeit Abgabe von wohnung': 'text-yellow-400',
    'Zählerstand': 'text-cyan-400'
  };
  return colorMap[type] || 'text-gray-300';
}

