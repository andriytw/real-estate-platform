import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { CalendarEvent, Property, TaskType } from '../types';
import { calendarEventsService, propertiesService } from '../services/supabaseService';
import { FACILITY_TASK_TYPES, ACCOUNTING_TASK_TYPES } from '../utils/taskColors';

interface KanbanTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  columnId: string;
  department: 'facility' | 'accounting' | 'sales';
  onSave: (task: CalendarEvent) => void;
}

export default function KanbanTaskModal({
  isOpen,
  onClose,
  columnId,
  department,
  onSave
}: KanbanTaskModalProps) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<TaskType>('Putzen');
  const [description, setDescription] = useState('');
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');
  const [day, setDay] = useState(new Date().getDate());
  const [propertyId, setPropertyId] = useState<string>('');
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadProperties();
      // Set default date to today
      const today = new Date();
      setDate(today.toISOString().split('T')[0]);
      setDay(today.getDate());
    }
  }, [isOpen]);

  const loadProperties = async () => {
    try {
      const props = await propertiesService.getAll();
      setProperties(props);
    } catch (error) {
      console.error('Error loading properties:', error);
    }
  };

  const availableTaskTypes = department === 'facility' ? FACILITY_TASK_TYPES : ACCOUNTING_TASK_TYPES;

  const handleSave = async () => {
    if (!title.trim()) {
      alert('Please enter a task title');
      return;
    }

    setLoading(true);
    try {
      const newEvent: Omit<CalendarEvent, 'id'> = {
        title,
        type,
        description,
        time: time || undefined,
        date: date || undefined,
        day,
        propertyId: propertyId || undefined,
        status: 'open',
        department,
        columnId,
        createdFrom: 'kanban'
      };

      const created = await calendarEventsService.create(newEvent);
      onSave(created);
      onClose();
      
      // Reset form
      setTitle('');
      setType('Putzen');
      setDescription('');
      setTime('');
      setPropertyId('');
    } catch (error) {
      console.error('Error creating task:', error);
      alert('Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[#161B22] rounded-lg border border-gray-700 w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white">Create Task</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Task title"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as TaskType)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {availableTaskTypes.map(taskType => (
                <option key={taskType} value={taskType}>{taskType}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Property (Optional)
            </label>
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">None</option>
              {properties.map(prop => (
                <option key={prop.id} value={prop.id}>{prop.title}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Task description"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  if (e.target.value) {
                    const d = new Date(e.target.value);
                    setDay(d.getDate());
                  }
                }}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Time
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-4">
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg transition-colors"
            >
              {loading ? 'Creating...' : 'Create Task'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

