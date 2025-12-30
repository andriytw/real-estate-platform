import React, { useState, useMemo, useEffect } from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { CalendarEvent, Worker, KanbanColumn as IKanbanColumn, TaskStatus, TaskType } from '../../types';
import KanbanTaskCard from './KanbanTaskCard';
import { Plus, MoreHorizontal, User, Briefcase, Trash2, Save, X } from 'lucide-react';
import TaskCreateModal from './TaskCreateModal';
import WorkerSelectDropdown from './WorkerSelectDropdown';
import TaskTypeFilters from './TaskTypeFilters';
import ColumnSortButtons from './ColumnSortButtons';
import { FACILITY_TASK_TYPES, ACCOUNTING_TASK_TYPES } from '../../utils/taskColors';

interface KanbanColumnProps {
  column: IKanbanColumn;
  currentUser: Worker | null;
  onTaskCreated: (task: CalendarEvent) => void;
  onColumnDeleted?: (columnId: string) => void;
  canDelete?: boolean;
  onWorkerAssigned?: (workerId: string) => void;
  workers?: Worker[];
  columnId: string; // Unique column ID for state management
  onTaskClick?: (task: CalendarEvent) => void;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({ 
  column, 
  currentUser, 
  onTaskCreated,
  onColumnDeleted,
  canDelete = false,
  onWorkerAssigned,
  workers = [],
  columnId,
  onTaskClick,
}) => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(column.workerId || null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [selectedTaskTypes, setSelectedTaskTypes] = useState<TaskType[]>([]);
  const [sortBy, setSortBy] = useState<'date' | 'type'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);

  // Sync selectedWorkerId with column.workerId when it changes
  useEffect(() => {
    if (column.workerId && column.workerId !== selectedWorkerId) {
      setSelectedWorkerId(column.workerId);
      setIsAssigning(false);
    } else if (!column.workerId) {
      setSelectedWorkerId(null);
      setIsAssigning(false);
    }
  }, [column.workerId]);

  // Get worker's department
  const workerDepartment = useMemo(() => {
    if (!column.workerId) return null;
    const worker = workers.find(w => w.id === column.workerId);
    return worker?.department || null;
  }, [column.workerId, workers]);

  // Get available task types from column tasks, filtered by department
  const availableTaskTypes = useMemo(() => {
    // Determine which task types are allowed based on worker's department
    let allowedTypes: TaskType[] = [];
    if (workerDepartment === 'facility') {
      allowedTypes = FACILITY_TASK_TYPES;
    } else if (workerDepartment === 'accounting') {
      allowedTypes = ACCOUNTING_TASK_TYPES;
    } else {
      // If no department or unknown, show all types
      allowedTypes = [...FACILITY_TASK_TYPES, ...ACCOUNTING_TASK_TYPES];
    }

    // If worker has a department, always show ALL task types for that department
    // (not just the ones that exist in current tasks)
    if (column.workerId && workerDepartment) {
      return allowedTypes.sort();
    }
    
    // If no worker assigned, show only types that exist in tasks
    if (column.tasks.length > 0) {
      const types = new Set<TaskType>();
      column.tasks.forEach(task => {
        if (task.type && task.type !== 'other') {
          types.add(task.type as TaskType);
        }
      });
      return Array.from(types).sort();
    }
    
    return [];
  }, [column.tasks, column.workerId, workerDepartment]);

  // Filter and sort tasks
  const sortedTasks = useMemo(() => {
    let filtered = [...column.tasks];

    // Filter by department: only show tasks that match worker's department
    if (workerDepartment) {
      const allowedTypes = workerDepartment === 'facility' 
        ? FACILITY_TASK_TYPES 
        : workerDepartment === 'accounting'
        ? ACCOUNTING_TASK_TYPES
        : [...FACILITY_TASK_TYPES, ...ACCOUNTING_TASK_TYPES];
      
      filtered = filtered.filter(task => 
        task.type && allowedTypes.includes(task.type as TaskType)
      );
    }

    // Apply type filters
    if (selectedTaskTypes.length > 0) {
      filtered = filtered.filter(task => 
        task.type && selectedTaskTypes.includes(task.type as TaskType)
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      if (sortBy === 'date') {
        const dateA = a.createdAt || a.date || '';
        const dateB = b.createdAt || b.date || '';
        const comparison = dateA.localeCompare(dateB);
        return sortOrder === 'asc' ? comparison : -comparison;
      } else {
        // Sort by type
        const typeA = a.type || '';
        const typeB = b.type || '';
        const comparison = typeA.localeCompare(typeB);
        return sortOrder === 'asc' ? comparison : -comparison;
      }
    });

    // Secondary sort by priority (always urgent first)
    filtered.sort((a, b) => {
      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      const pA = priorityOrder[a.priority || 'medium'];
      const pB = priorityOrder[b.priority || 'medium'];
      return pA - pB;
    });

    return filtered;
  }, [column.tasks, selectedTaskTypes, sortBy, sortOrder, workerDepartment]);

  // Handle worker assignment
  const handleWorkerSelect = (workerId: string) => {
    setSelectedWorkerId(workerId);
    setIsAssigning(true);
  };

  const handleSaveWorker = () => {
    if (selectedWorkerId && onWorkerAssigned) {
      onWorkerAssigned(selectedWorkerId);
      setIsAssigning(false);
    }
  };

  const handleCancelAssignment = () => {
    setSelectedWorkerId(column.workerId || null);
    setIsAssigning(false);
  };

  const isPersonalColumn = currentUser?.id === column.workerId;
  const isSuperAdmin = currentUser?.role === 'super_manager';
  // Allow creating tasks if: worker is assigned AND (It's my column OR I am manager/admin)
  const canCreateTask = column.workerId && (isPersonalColumn || isSuperAdmin || currentUser?.role === 'manager');
  
  const isUnassigned = !column.workerId;
  const showWorkerDropdown = isUnassigned || (isAssigning && column.tasks.length === 0);

  const isInboxColumn = column.type === 'backlog';
  const showInlineFilters = column.workerId && !isInboxColumn;
  const showDropdownFilters = column.workerId && isInboxColumn;

  // Check if column can be deleted (empty or all tasks completed)
  const canDeleteColumn = useMemo(() => {
    if (!canDelete || !onColumnDeleted) return false;
    
    // If column is empty - can delete
    if (column.tasks.length === 0) return true;
    
    // Check if all tasks are completed
    const completedStatuses: TaskStatus[] = ['completed', 'verified', 'archived'];
    const allTasksCompleted = column.tasks.every(task => 
      completedStatuses.includes(task.status)
    );
    
    return allTasksCompleted;
  }, [canDelete, column.tasks, column.workerId, onColumnDeleted]);

  // Count incomplete tasks for tooltip
  const incompleteTasksCount = useMemo(() => {
    const completedStatuses: TaskStatus[] = ['completed', 'verified', 'archived'];
    return column.tasks.filter(task => !completedStatuses.includes(task.status)).length;
  }, [column.tasks]);

  return (
    <div className="flex-shrink-0 w-96 flex flex-col h-full bg-[#111315] border-r border-gray-800/50">
      {/* Header */}
      <div className="p-3 border-b border-gray-800 flex items-center justify-between bg-[#16181b]">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            {column.type === 'backlog' ? (
              <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                <Briefcase className="w-5 h-5 text-indigo-400" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden border border-gray-600">
                <User className="w-5 h-5 text-gray-400" />
              </div>
            )}
            <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-[#1C1F24] rounded-full flex items-center justify-center text-[10px] font-bold text-gray-400 border border-gray-700">
              {column.tasks.length}
            </span>
          </div>
          
          {/* Name or Worker Dropdown */}
          <div className="flex-1 min-w-0">
            {showWorkerDropdown ? (
              <div className="flex items-center gap-2">
                <WorkerSelectDropdown
                  workers={workers}
                  selectedWorkerId={selectedWorkerId}
                  onSelect={handleWorkerSelect}
                  disabled={column.tasks.length > 0}
                  columnId={columnId}
                />
                {isAssigning && selectedWorkerId && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleSaveWorker}
                      className="p-1.5 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors"
                      title="Зберегти"
                    >
                      <Save className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={handleCancelAssignment}
                      className="p-1.5 rounded bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                      title="Скасувати"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <h3 className="text-sm font-bold text-white truncate max-w-[150px]">
                  {column.title}
                </h3>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                  {column.type === 'backlog' ? 'Inbox' : column.type}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {canCreateTask && (
            <button 
              onClick={() => setIsCreateModalOpen(true)}
              className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
              title="Додати завдання"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
          {!column.workerId && (
            <button 
              disabled
              className="p-1.5 rounded text-gray-600 cursor-not-allowed opacity-50"
              title="Спочатку виберіть працівника"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
          
          {/* Delete Column Button */}
          {canDelete && onColumnDeleted && (
            <>
              {canDeleteColumn ? (
                <button
                  onClick={() => onColumnDeleted(columnId)}
                  className="p-1.5 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors"
                  title="Видалити колонку"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              ) : (
                <button
                  disabled
                  className="p-1.5 rounded text-gray-600 cursor-not-allowed opacity-50"
                  title={`Неможливо видалити: є ${incompleteTasksCount} невиконаних завдань`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </>
          )}
          
          {/* Filter menu button (dropdown for Inbox column) */}
          {showDropdownFilters && (
            <button
              onClick={() => setIsFilterMenuOpen(prev => !prev)}
              className={`p-1.5 rounded transition-colors ${
                isFilterMenuOpen
                  ? 'bg-gray-700 text-white'
                  : 'hover:bg-gray-700 text-gray-400 hover:text-white'
              }`}
              title="Фільтри"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Filters and Sorting */}
      {showInlineFilters && (
        <div className="overflow-visible">
          <TaskTypeFilters
            selectedTypes={selectedTaskTypes}
            onToggleType={(type) => {
              setSelectedTaskTypes(prev => 
                prev.includes(type) 
                  ? prev.filter(t => t !== type)
                  : [...prev, type]
              );
            }}
            onClearAll={() => setSelectedTaskTypes([])}
            availableTypes={availableTaskTypes}
            variant="dropdown"
          />
          <ColumnSortButtons
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={(newSortBy, newSortOrder) => {
              setSortBy(newSortBy);
              setSortOrder(newSortOrder);
            }}
          />
        </div>
      )}

      {showDropdownFilters && isFilterMenuOpen && (
        <div className="border-b border-gray-800 bg-[#111315] overflow-visible">
          <div className="space-y-2 overflow-visible">
            <TaskTypeFilters
              selectedTypes={selectedTaskTypes}
              onToggleType={(type) => {
                setSelectedTaskTypes(prev => 
                  prev.includes(type) 
                    ? prev.filter(t => t !== type)
                    : [...prev, type]
                );
              }}
              onClearAll={() => setSelectedTaskTypes([])}
              availableTypes={availableTaskTypes}
              variant="dropdown"
            />
            <ColumnSortButtons
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={(newSortBy, newSortOrder) => {
                setSortBy(newSortBy);
                setSortOrder(newSortOrder);
              }}
            />
          </div>
        </div>
      )}

      {/* Task List */}
      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
        {sortedTasks.length === 0 ? (
          <div className="h-32 flex flex-col items-center justify-center text-gray-600 border-2 border-dashed border-gray-800 rounded-lg m-2">
            <span className="text-xs">No tasks</span>
          </div>
        ) : (
          sortedTasks.map((task, index) => (
            <Draggable key={task.id} draggableId={task.id} index={index}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.draggableProps}
                  {...provided.dragHandleProps}
                  className={snapshot.isDragging ? 'opacity-50' : ''}
                >
                  <KanbanTaskCard 
                    task={task} 
                    onClick={() => onTaskClick?.(task)} 
                  />
                </div>
              )}
            </Draggable>
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

