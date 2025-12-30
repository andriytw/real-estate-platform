import React, { useState, useEffect, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { tasksService, workersService } from '../../services/supabaseService';
import { CalendarEvent, Worker, KanbanColumn as IKanbanColumn, TaskStatus, CustomColumn } from '../../types';
import KanbanColumn from './KanbanColumn';
import ColumnCreateModal from './ColumnCreateModal';
import TaskDetailModal from './TaskDetailModal';
import { useWorker } from '../../contexts/WorkerContext';
import { Filter, Plus } from 'lucide-react';

type DepartmentFilter = 'all' | 'facility' | 'accounting';

const KanbanBoard: React.FC = () => {
  const { worker: currentUser } = useWorker();
  
  // State
  const [tasks, setTasks] = useState<CalendarEvent[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [departmentFilter, setDepartmentFilter] = useState<DepartmentFilter>('all');
  
  // State for custom columns (stored in localStorage)
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>(() => {
    // Load from localStorage on initialization
    const saved = localStorage.getItem('kanban_custom_columns');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Migration: if old format (string[]), convert to CustomColumn[]
        if (Array.isArray(parsed)) {
          if (parsed.length > 0 && typeof parsed[0] === 'string') {
            // Old format: string[] (worker IDs)
            console.log('🔄 Migrating customColumns from old format (string[]) to new format (CustomColumn[])');
            return parsed.map((workerId: string) => ({
              id: crypto.randomUUID(),
              workerId: workerId,
              createdAt: new Date().toISOString()
            }));
          } else {
            // New format: CustomColumn[]
            return parsed;
          }
        }
      } catch (e) {
        console.error('Error parsing customColumns from localStorage:', e);
      }
    }
    // If no valid data, start with empty array
    return [];
  });
  const [isColumnCreateModalOpen, setIsColumnCreateModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<CalendarEvent | null>(null);
  const [isTaskDetailModalOpen, setIsTaskDetailModalOpen] = useState(false);

  // Load Data
  useEffect(() => {
    loadBoardData();
  }, [departmentFilter]); // Reload when filter changes (optional, could filter locally)

  // Listen for workers update event (when new user is created/updated)
  useEffect(() => {
    const handleWorkersUpdated = () => {
      console.log('🔄 Workers updated event received, reloading board data...');
      loadBoardData();
    };

    window.addEventListener('workersUpdated', handleWorkersUpdated);
    return () => {
      window.removeEventListener('workersUpdated', handleWorkersUpdated);
    };
  }, []);

  // Listen for task updates from calendar
  useEffect(() => {
    const handleTaskUpdated = () => {
      console.log('🔄 Task updated event received, reloading board data...');
      loadBoardData();
    };

    window.addEventListener('taskUpdated', handleTaskUpdated);
    return () => {
      window.removeEventListener('taskUpdated', handleTaskUpdated);
    };
  }, []);

  // Save custom columns to localStorage
  useEffect(() => {
    localStorage.setItem('kanban_custom_columns', JSON.stringify(customColumns));
  }, [customColumns]);

  const loadBoardData = async () => {
    try {
      setLoading(true);
      const [tasksData, workersData] = await Promise.all([
        tasksService.getAll(), // Fetch all tasks, then filter locally for columns
        workersService.getAll()
      ]);
      setTasks(tasksData);
      setWorkers(workersData);
    } catch (error) {
      console.error('Error loading board:', error);
    } finally {
      setLoading(false);
    }
  };

  // Open task detail modal when card is clicked
  const handleTaskClick = (task: CalendarEvent) => {
    setSelectedTask(task);
    setIsTaskDetailModalOpen(true);
  };

  // Generate Columns - ТІЛЬКИ Inbox + колонки з customColumns (створені вручну Super Admin)
  const columns = useMemo(() => {
    const cols: IKanbanColumn[] = [];

    // 1. Super Admin / Inbox Column (завжди видима)
    const adminWorker = workers.find(w => w.role === 'super_manager');
    const adminTasks = tasks.filter(t => 
      !t.workerId || (adminWorker && t.workerId === adminWorker.id)
    );
    
    cols.push({
      id: 'admin-inbox',
      title: adminWorker ? `Inbox (${adminWorker.name})` : 'Backlog / Inbox',
      type: 'backlog',
      workerId: adminWorker?.id,
      tasks: adminTasks
    });

    // 2. Створені вручну колонки (з customColumns)
    customColumns.forEach(customCol => {
      if (!customCol.workerId) {
        // Empty column - show placeholder
        cols.push({
          id: customCol.id,
          title: 'Виберіть працівника',
          type: 'backlog',
          workerId: undefined,
          tasks: [] // No tasks until worker is assigned
        });
        return;
      }

      // Find worker by ID
      const worker = workers.find(w => w.id === customCol.workerId);
      if (!worker) {
        // Worker not found - skip this column
        console.warn('⚠️ Worker not found for column:', customCol.id, customCol.workerId);
        return;
      }

      // Фільтр по департаменту
      if (departmentFilter !== 'all' && worker.department !== departmentFilter) {
        return; // Пропустити, якщо не відповідає фільтру
      }

      // Визначити тип колонки
      const columnType = worker.role === 'manager' ? 'manager' : 'worker';
      
      cols.push({
        id: customCol.id,
        title: worker.name,
        type: columnType,
        workerId: worker.id,
        tasks: tasks.filter(t => t.workerId === worker.id)
      });
    });

    return cols;
  }, [tasks, workers, departmentFilter, customColumns]);

  // Handle Drag End
  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    // Determine new workerId based on destination column
    const destColumnId = destination.droppableId;
    // Find the column definition
    const destColumn = columns.find(c => c.id === destColumnId);
    
    let newWorkerId: string | undefined = undefined;
    
    if (destColumnId === 'admin-inbox') {
        // If moved to Inbox, check if we assign to admin or unassign
        // Logic: Inbox is usually Unassigned OR Admin. 
        // If admin exists, assign to admin? Or leave null?
        // Prompt said "Unassigned tasks wait here". So maybe null.
        // BUT Super Admin creates tasks here.
        // Let's set to NULL to mean "Unassigned". 
        // Unless we explicitly want to assign to Super Admin user.
        // Let's keep it simple: Inbox = Unassigned (worker_id = null).
        newWorkerId = undefined; // or null in DB
    } else {
        // It's a person's column
        newWorkerId = destColumn?.workerId;
    }

    // Optimistic Update
    const updatedTasks = tasks.map(t => {
      if (t.id === draggableId) {
        return { ...t, workerId: newWorkerId, status: 'assigned' }; // Auto-update status to assigned?
      }
      return t;
    });
    setTasks(updatedTasks);

    // API Call
    try {
        await tasksService.update(draggableId, { 
            workerId: newWorkerId,
            status: 'assigned' // Reset status to assigned when re-assigning
        });
    } catch (error) {
        console.error('Failed to move task:', error);
        loadBoardData(); // Revert on error
    }
  };

  const handleTaskCreated = (newTask: CalendarEvent) => {
    setTasks(prev => [newTask, ...prev]);
  };

  // Handle column creation (creates empty column)
  const handleColumnCreated = React.useCallback(() => {
    console.log('🔄 Creating empty column');
    const newColumn: CustomColumn = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };
    setCustomColumns(prev => {
      const updated = [...prev, newColumn];
      console.log('✅ Empty column created. New customColumns count:', updated.length);
      return updated;
    });
  }, []);

  // Handle worker assignment to column
  const handleColumnWorkerAssigned = React.useCallback((columnId: string, workerId: string) => {
    console.log('🔄 Assigning worker to column:', columnId, workerId);
    setCustomColumns(prev => {
      return prev.map(col => 
        col.id === columnId 
          ? { ...col, workerId }
          : col
      );
    });
  }, []);

  // Handle column deletion (only if empty or all tasks completed)
  const handleColumnDeleted = (columnId: string) => {
    // Find the column
    const column = columns.find(c => c.id === columnId);
    if (!column) return;

    // Check if there are incomplete tasks
    const completedStatuses: TaskStatus[] = ['completed', 'verified', 'archived'];
    const incompleteTasks = column.tasks.filter(task => {
      return !completedStatuses.includes(task.status);
    });

    if (incompleteTasks.length > 0) {
      alert(`Неможливо видалити колонку: є ${incompleteTasks.length} невиконаних завдань. Спочатку завершіть або видаліть завдання.`);
      return;
    }

    // If all tasks are completed or column is empty, can delete
    if (window.confirm('Ви впевнені, що хочете видалити цю колонку? Всі виконані завдання будуть переміщені в Inbox.')) {
      setCustomColumns(prev => prev.filter(col => col.id !== columnId));
      
      // Move all tasks from this column to Inbox (if any)
      const tasksToMove = column.tasks;
      tasksToMove.forEach(async (task) => {
        try {
          await tasksService.update(task.id, { workerId: undefined });
        } catch (error) {
          console.error('Error moving task to inbox:', error);
        }
      });
      
      // Update local state
      setTasks(prev => prev.map(t => 
        t.workerId === workerId ? { ...t, workerId: undefined } : t
      ));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0D0F11]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Завантаження дошки...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#0D0F11]">
      {/* Toolbar */}
      <div className="h-14 border-b border-gray-800 flex items-center justify-between px-4 bg-[#111315]">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-white">Task Board</h1>
          
          {/* Filter Tabs */}
          <div className="flex bg-[#1C1F24] rounded-lg p-1">
            <button
              onClick={() => setDepartmentFilter('all')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                departmentFilter === 'all' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setDepartmentFilter('facility')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                departmentFilter === 'facility' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Facility
            </button>
            <button
              onClick={() => setDepartmentFilter('accounting')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                departmentFilter === 'accounting' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Accounting
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Clear localStorage button (for debugging) - only for Super Admin */}
          {currentUser?.role === 'super_manager' && customColumns.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm('Очистити всі створені колонки? Це видалить всі колонки з дошки.')) {
                  localStorage.removeItem('kanban_custom_columns');
                  setCustomColumns([]);
                  console.log('🗑️ Cleared customColumns from localStorage');
                }
              }}
              className="px-3 py-1 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-md transition-colors"
              title="Очистити всі колонки"
            >
              Очистити колонки
            </button>
          )}
           {/* View Toggles could go here (Board/List) */}
        </div>
      </div>

      {/* Board Area */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex h-full p-4 gap-4 min-w-max">
            {columns.map(column => (
              <Droppable key={column.id} droppableId={column.id}>
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="h-full"
                  >
                    <KanbanColumn 
                      column={column} 
                      currentUser={currentUser}
                      onTaskCreated={handleTaskCreated}
                      onColumnDeleted={handleColumnDeleted}
                      canDelete={currentUser?.role === 'super_manager' && column.id !== 'admin-inbox'}
                      onWorkerAssigned={column.id !== 'admin-inbox' ? (workerId) => handleColumnWorkerAssigned(column.id, workerId) : undefined}
                      workers={workers}
                      columnId={column.id}
                      onTaskClick={handleTaskClick}
                    />
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            ))}
            
            {/* Add Column Button (only for Super Admin) */}
            {currentUser?.role === 'super_manager' && (
              <div className="flex-shrink-0 w-80 flex flex-col h-full">
                <button
                  onClick={() => setIsColumnCreateModalOpen(true)}
                  className="h-full flex flex-col items-center justify-center bg-[#111315] border-2 border-dashed border-gray-700 rounded-lg hover:border-emerald-500 hover:bg-[#1C1F24] transition-colors group"
                >
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3 group-hover:bg-emerald-500/20 transition-colors">
                    <Plus className="w-6 h-6 text-emerald-500" />
                  </div>
                  <span className="text-sm font-medium text-gray-400 group-hover:text-emerald-400 transition-colors">
                    Додати колонку
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </DragDropContext>

      {/* Column Create Modal */}
      <ColumnCreateModal
        isOpen={isColumnCreateModalOpen}
        onClose={() => setIsColumnCreateModalOpen(false)}
        onColumnCreated={handleColumnCreated}
        workers={workers}
        existingColumnIds={customColumns}
      />

      {/* Task Detail Modal */}
      {isTaskDetailModalOpen && selectedTask && (
        <TaskDetailModal
          isOpen={isTaskDetailModalOpen}
          onClose={() => {
            setIsTaskDetailModalOpen(false);
            setSelectedTask(null);
          }}
          task={selectedTask}
          onUpdateTask={async (updatedTask) => {
            await tasksService.update(updatedTask.id, updatedTask);
            loadBoardData(); // Reload all tasks to reflect changes
            window.dispatchEvent(new CustomEvent('taskUpdated'));
          }}
          onDeleteTask={async (taskId) => {
            await tasksService.delete(taskId);
            loadBoardData(); // Reload all tasks
            window.dispatchEvent(new CustomEvent('taskUpdated'));
            setIsTaskDetailModalOpen(false);
            setSelectedTask(null);
          }}
          currentUser={currentUser}
        />
      )}
    </div>
  );
};

export default KanbanBoard;

