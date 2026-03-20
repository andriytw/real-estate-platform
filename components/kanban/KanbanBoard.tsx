import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { tasksService, workersService } from '../../services/supabaseService';
import { CalendarEvent, Worker, KanbanColumn as IKanbanColumn, TaskStatus, CustomColumn } from '../../types';
import KanbanColumn from './KanbanColumn';
import ColumnCreateModal from './ColumnCreateModal';
import TaskDetailModal from './TaskDetailModal';
import { useWorker } from '../../contexts/WorkerContext';
import { Filter, Plus } from 'lucide-react';

type DepartmentFilter = 'all' | 'facility' | 'accounting';

/** Safety net if Supabase client hangs (not the primary fix). */
const BOARD_FETCH_TIMEOUT_MS = 45_000;

function withFetchTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`[KanbanBoard] ${label} timed out after ${BOARD_FETCH_TIMEOUT_MS}ms`)), BOARD_FETCH_TIMEOUT_MS)
    ),
  ]);
}

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
  const [loadIssues, setLoadIssues] = useState<{ tasks?: string; workers?: string }>({});

  const loadBoardData = useCallback(async () => {
    setLoading(true);
    setLoadIssues({});
    console.log('[KanbanBoard] loadBoardData:start', { departmentFilter });

    let tasksData: CalendarEvent[] = [];
    let workersData: Worker[] = [];

    try {
      console.log('[KanbanBoard] tasks fetch:start');
      try {
        tasksData = await withFetchTimeout(tasksService.getAll(), 'tasks fetch');
        console.log('[KanbanBoard] tasks fetch:ok', { count: tasksData.length });
      } catch (e) {
        console.error('[KanbanBoard] tasks fetch:error', e);
        const msg = e instanceof Error ? e.message : String(e);
        setLoadIssues((prev) => ({ ...prev, tasks: msg || 'Failed to load tasks' }));
        tasksData = [];
      }

      console.log('[KanbanBoard] workers fetch:start');
      try {
        workersData = await withFetchTimeout(workersService.getAll(), 'workers fetch');
        console.log('[KanbanBoard] workers fetch:ok', { count: workersData.length });
      } catch (e) {
        console.error('[KanbanBoard] workers fetch:error', e);
        const msg = e instanceof Error ? e.message : String(e);
        setLoadIssues((prev) => ({ ...prev, workers: msg || 'Failed to load workers' }));
        workersData = [];
      }

      console.log('[KanbanBoard] transform:start');
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      let validTasks: CalendarEvent[] = [];
      try {
        validTasks = tasksData.filter((t) => uuidRegex.test(t.id));
        console.log('[KanbanBoard] transform:ok', {
          valid: validTasks.length,
          dropped: tasksData.length - validTasks.length,
        });
      } catch (e) {
        console.error('[KanbanBoard] transform:error', e);
        validTasks = [];
      }

      setTasks(validTasks);
      setWorkers(workersData);

      if (workersData.length > 0) {
        const validWorkerIds = new Set(workersData.map((w) => w.id));
        setCustomColumns((prev) => {
          console.log('[KanbanBoard] customColumns sanitize:start', { prevCount: prev.length });
          const removedEntries = prev.filter(
            (col) => col.workerId && !validWorkerIds.has(col.workerId)
          );
          const next = prev.filter((col) => !col.workerId || validWorkerIds.has(col.workerId));
          const removed = prev.length - next.length;
          console.log('[KanbanBoard] customColumns sanitize:ok', { removed, remaining: next.length });
          if (removed > 0) {
            console.info('[KanbanBoard] customColumns pruned stale workerIds', {
              removedWorkerIds: removedEntries.map((c) => c.workerId).filter(Boolean),
              removedColumnIds: removedEntries.map((c) => c.id),
            });
          }
          return next;
        });
      } else {
        console.log('[KanbanBoard] customColumns sanitize:skip', { reason: 'no workers loaded' });
      }
    } catch (error) {
      console.error('[KanbanBoard] loadBoardData:unexpected', error);
    } finally {
      setLoading(false);
      console.log('[KanbanBoard] loadBoardData:end');
    }
  }, [departmentFilter]);

  // Load Data
  useEffect(() => {
    loadBoardData();
  }, [loadBoardData]);

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
  }, [loadBoardData]);

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
  }, [loadBoardData]);

  // Save custom columns to localStorage
  useEffect(() => {
    localStorage.setItem('kanban_custom_columns', JSON.stringify(customColumns));
  }, [customColumns]);

  /** Derived columns: matches sanitized state after workers load; avoids rendering columns for unknown worker IDs. */
  const effectiveCustomColumns = useMemo(() => {
    if (workers.length === 0) return customColumns;
    const valid = new Set(workers.map((w) => w.id));
    return customColumns.filter((c) => !c.workerId || valid.has(c.workerId));
  }, [customColumns, workers]);

  const knownWorkerIds = useMemo(() => new Set(workers.map((w) => w.id)), [workers]);

  const orphanAssignedTaskCount = useMemo(
    () =>
      tasks.filter((t) => t.workerId && !knownWorkerIds.has(t.workerId)).length,
    [tasks, knownWorkerIds]
  );

  // Open task detail modal when card is clicked
  const handleTaskClick = (task: CalendarEvent) => {
    setSelectedTask(task);
    setIsTaskDetailModalOpen(true);
  };

  // Generate Columns - Inbox + custom columns
  const columns = useMemo(() => {
    const cols: IKanbanColumn[] = [];

    const adminWorker = workers.find(w => w.role === 'super_manager');
    
    const unassignedTasks = tasks.filter(t => !t.workerId);
    const facilityUnassigned = unassignedTasks.filter(t => t.department === 'facility');
    const accountingUnassigned = unassignedTasks.filter(t => t.department === 'accounting');
    const otherUnassigned = unassignedTasks.filter(t => 
      !t.department || (t.department !== 'facility' && t.department !== 'accounting')
    );
    
    const adminTasks = [
      ...tasks.filter(t => adminWorker && t.workerId === adminWorker.id),
      ...otherUnassigned
    ];
    
    cols.push({
      id: 'admin-inbox',
      title: adminWorker ? `Inbox (${adminWorker.name})` : 'Backlog / Inbox',
      type: 'backlog',
      workerId: adminWorker?.id,
      tasks: adminTasks
    });

    effectiveCustomColumns.forEach(customCol => {
      if (!customCol.workerId) {
        cols.push({
          id: customCol.id,
          title: 'Виберіть працівника',
          type: 'backlog',
          workerId: undefined,
          tasks: []
        });
        return;
      }

      const worker = workers.find(w => w.id === customCol.workerId);
      if (!worker) {
        if (workers.length > 0 && customCol.workerId) {
          console.warn(
            '[KanbanBoard] Custom column references worker not in loaded list (data mismatch or race)',
            { columnId: customCol.id, workerId: customCol.workerId }
          );
        }
        return;
      }

      if (departmentFilter !== 'all' && worker.department !== departmentFilter) {
        return;
      }

      const columnType = worker.role === 'manager' ? 'manager' : 'worker';
      
      let columnTasks: CalendarEvent[] = [];
      if (worker.role === 'manager') {
        const assignedToManager = tasks.filter(t => t.workerId === worker.id);
        const unassignedInDepartment = worker.department === 'facility' 
          ? facilityUnassigned 
          : worker.department === 'accounting' 
          ? accountingUnassigned 
          : [];
        columnTasks = [...assignedToManager, ...unassignedInDepartment];
      } else {
        columnTasks = tasks.filter(t => t.workerId === worker.id);
      }
      
      cols.push({
        id: customCol.id,
        title: worker.name,
        type: columnType,
        workerId: worker.id,
        tasks: columnTasks
      });
    });

    return cols;
  }, [tasks, workers, departmentFilter, effectiveCustomColumns]);

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
        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(draggableId)) {
            // If ID is not a valid UUID, try to find the task in database by other fields
            console.warn('⚠️ Task ID is not a valid UUID, attempting to find task in database:', draggableId);
            const task = tasks.find(t => t.id === draggableId);
            if (!task) {
                console.error('❌ Task not found in local state:', draggableId);
                loadBoardData(); // Reload to get fresh data
                return;
            }
            
            // Try to find task in database by other fields
            const allTasks = await tasksService.getAll();
            const foundTask = allTasks.find(t => 
                t.propertyId === task.propertyId &&
                t.bookingId === task.bookingId &&
                t.type === task.type &&
                t.date === task.date &&
                t.title === task.title
            );
            
            if (!foundTask) {
                console.error('❌ Task not found in database. Please refresh the page.');
                loadBoardData(); // Reload to get fresh data
                return;
            }
            
            // Update found task with correct UUID - preserve date and day
            const taskToUpdate = tasks.find(t => t.id === draggableId);
            await tasksService.update(foundTask.id, { 
                workerId: newWorkerId,
                status: 'assigned',
                date: taskToUpdate?.date,
                day: taskToUpdate?.day
            });
            
            // Update local state with correct ID
            setTasks(prev => prev.map(t => 
                t.id === draggableId 
                    ? { ...t, id: foundTask.id, workerId: newWorkerId, status: 'assigned' }
                    : t
            ));
            
            return;
        }
        
        // Normal update with valid UUID - preserve date and day
        const taskToUpdate = tasks.find(t => t.id === draggableId);
        await tasksService.update(draggableId, { 
            workerId: newWorkerId,
            status: 'assigned', // Reset status to assigned when re-assigning
            date: taskToUpdate?.date,
            day: taskToUpdate?.day
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
          // Validate UUID before updating
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (uuidRegex.test(task.id)) {
            await tasksService.update(task.id, { workerId: undefined });
          } else {
            console.warn('⚠️ Skipping task with invalid UUID:', task.id);
          }
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

      {(loadIssues.tasks || loadIssues.workers) && (
        <div
          className="border-b border-amber-900/50 bg-amber-950/30 px-4 py-2 text-amber-100 text-sm"
          role="status"
        >
          <p className="font-medium text-amber-200">Board data could not be loaded completely</p>
          <ul className="mt-1 list-disc list-inside text-xs text-amber-100/90 space-y-0.5">
            {loadIssues.tasks && <li>Tasks: {loadIssues.tasks}</li>}
            {loadIssues.workers && <li>Workers: {loadIssues.workers}</li>}
          </ul>
          <p className="mt-1 text-[11px] text-amber-200/70">
            Fix connectivity or permissions and refresh. Empty sections below reflect missing data, not an idle board.
          </p>
        </div>
      )}

      {orphanAssignedTaskCount > 0 && (
        <div
          className="border-b border-amber-900/40 bg-amber-950/20 px-4 py-2 text-amber-100/95 text-xs"
          role="status"
        >
          {orphanAssignedTaskCount} task(s) are assigned to a worker ID that is not in the current worker list. They are
          shown in <span className="font-semibold">Inbox</span> so they are not lost — reassign or restore the worker.
        </div>
      )}

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
        existingColumnIds={effectiveCustomColumns}
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

