import React, { useState, useEffect, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { tasksService, workersService } from '../../services/supabaseService';
import { CalendarEvent, Worker, KanbanColumn as IKanbanColumn } from '../../types';
import KanbanColumn from './KanbanColumn';
import { useWorker } from '../../contexts/WorkerContext';
import { Filter } from 'lucide-react';

type DepartmentFilter = 'all' | 'facility' | 'accounting';

const KanbanBoard: React.FC = () => {
  const { worker: currentUser } = useWorker();
  
  // State
  const [tasks, setTasks] = useState<CalendarEvent[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [departmentFilter, setDepartmentFilter] = useState<DepartmentFilter>('all');

  // Load Data
  useEffect(() => {
    loadBoardData();
  }, [departmentFilter]); // Reload when filter changes (optional, could filter locally)

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

  // Generate Columns based on Workers and Roles
  const columns = useMemo(() => {
    const cols: IKanbanColumn[] = [];

    // 1. Super Admin / Inbox Column
    const adminWorker = workers.find(w => w.role === 'super_manager');
    const adminTasks = tasks.filter(t => 
      !t.workerId || (adminWorker && t.workerId === adminWorker.id)
    );
    
    cols.push({
      id: 'admin-inbox',
      title: adminWorker ? `Inbox (${adminWorker.name})` : 'Backlog / Inbox',
      type: 'backlog',
      workerId: adminWorker?.id, // If assigned to admin, it goes here
      tasks: adminTasks
    });

    // Filter workers based on department tab
    const relevantWorkers = workers.filter(w => {
      if (departmentFilter === 'all') return true;
      return w.department === departmentFilter;
    });

    // 2. Manager Columns
    const managers = relevantWorkers.filter(w => w.role === 'manager');
    managers.forEach(m => {
      cols.push({
        id: m.id,
        title: m.name,
        type: 'manager',
        workerId: m.id,
        tasks: tasks.filter(t => t.workerId === m.id)
      });
    });

    // 3. Worker Columns
    const simpleWorkers = relevantWorkers.filter(w => w.role === 'worker');
    simpleWorkers.forEach(w => {
      cols.push({
        id: w.id,
        title: w.name,
        type: 'worker',
        workerId: w.id,
        tasks: tasks.filter(t => t.workerId === w.id)
      });
    });

    return cols;
  }, [tasks, workers, departmentFilter]);

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
                    />
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            ))}
          </div>
        </div>
      </DragDropContext>
    </div>
  );
};

export default KanbanBoard;

