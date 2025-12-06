import React, { useState, useEffect } from 'react';
import { CalendarEvent } from '../types';
import { calendarEventsService } from '../services/supabaseService';
import KanbanColumn from './KanbanColumn';
import { useWorker } from '../contexts/WorkerContext';

interface KanbanBoardProps {
  department: 'facility' | 'accounting' | 'sales';
}

// Mock columns for now - will be replaced with real data from Supabase later
const MOCK_COLUMNS = [
  { id: 'backlog', name: 'Backlog', orderIndex: 0, isBacklog: true },
  { id: 'todo', name: 'To Do', orderIndex: 1, isBacklog: false },
  { id: 'in-progress', name: 'In Progress', orderIndex: 2, isBacklog: false },
  { id: 'done', name: 'Done', orderIndex: 3, isBacklog: false },
];

export default function KanbanBoard({ department }: KanbanBoardProps) {
  const { worker } = useWorker();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        
        // Load events for department
        const allEvents = await calendarEventsService.getAll();
        const departmentEvents = allEvents.filter(e => e.department === department);
        setEvents(departmentEvents);
      } catch (error) {
        console.error('Error loading Kanban data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [department]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Завантаження...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex gap-4 overflow-x-auto pb-4">
        {MOCK_COLUMNS.map((column) => {
          const columnEvents = events.filter(e => e.columnId === column.id || (!e.columnId && column.isBacklog));
          return (
            <KanbanColumn
              key={column.id}
              column={{ ...column, department, workers: [] } as any}
              events={columnEvents}
              onTaskDrop={async (eventId, targetColumnId) => {
                // Update event column
                try {
                  await calendarEventsService.update(eventId, { columnId: targetColumnId });
                  // Reload events
                  const allEvents = await calendarEventsService.getAll();
                  const deptEvents = allEvents.filter(e => e.department === department);
                  setEvents(deptEvents);
                } catch (error) {
                  console.error('Error moving task:', error);
                }
              }}
              onEdit={() => {}}
              canEdit={worker?.role === 'super_manager' || worker?.role === 'manager'}
              canAddTask={worker?.role === 'super_manager' || worker?.role === 'manager' || column.isBacklog}
            />
          );
        })}
      </div>
    </div>
  );
}

