import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, User, AlertCircle, Check, Building2, Wallet } from 'lucide-react';
import { tasksService, workersService, propertiesService } from '../../services/supabaseService';
import { Worker, CalendarEvent, TaskType, TaskPriority, Property } from '../../types';
import { FACILITY_TASK_TYPES, ACCOUNTING_TASK_TYPES } from '../../utils/taskColors';
import { useWorker } from '../../contexts/WorkerContext';

interface TaskCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTaskCreated: (task: CalendarEvent) => void;
  initialWorkerId?: string;
  initialDepartment?: 'facility' | 'accounting';
}

const TaskCreateModal: React.FC<TaskCreateModalProps> = ({ 
  isOpen, 
  onClose, 
  onTaskCreated, 
  initialWorkerId,
  initialDepartment 
}) => {
  const { worker: currentUser } = useWorker();
  
  // State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [department, setDepartment] = useState<'facility' | 'accounting'>(initialDepartment || 'facility');
  const [type, setType] = useState<TaskType | ''>('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [workerId, setWorkerId] = useState<string>(initialWorkerId || '');
  const [propertyId, setPropertyId] = useState<string>('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  
  // Data
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize based on role
  useEffect(() => {
    if (currentUser) {
      if (currentUser.department === 'facility') {
        setDepartment('facility');
      } else if (currentUser.department === 'accounting') {
        setDepartment('accounting');
      }
      // Super admin can choose
    }
  }, [currentUser]);

  // Load workers and properties
  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    try {
      const [workersData, propertiesData] = await Promise.all([
        workersService.getAll(),
        propertiesService.getAll()
      ]);
      setWorkers(workersData);
      setProperties(propertiesData);
    } catch (err) {
      console.error('Error loading data:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !type) {
      setError('Please fill in required fields');
      return;
    }

    try {
      setLoading(true);
      const newTask = await tasksService.create({
        title,
        description,
        department,
        type: type as TaskType,
        priority,
        workerId: workerId || undefined, // If empty string, send undefined
        propertyId: propertyId || undefined,
        date: date || undefined, // If empty, service sets to Today
        time: time || undefined,
        // Default values
        status: 'pending',
        day: date ? new Date(date).getDate() : new Date().getDate(),
        managerId: currentUser?.id,
        isIssue: false
      });

      onTaskCreated(newTask);
      onClose();
      resetForm();
    } catch (err: any) {
      console.error('Error creating task:', err);
      setError(err.message || 'Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setType('');
    setPriority('medium');
    setWorkerId(initialWorkerId || '');
    setPropertyId('');
    setDate('');
    setTime('');
    setError(null);
  };

  if (!isOpen) return null;

  const isSuperAdmin = currentUser?.role === 'super_manager';
  const availableTaskTypes = department === 'facility' ? FACILITY_TASK_TYPES : ACCOUNTING_TASK_TYPES;

  // Filter workers by department if needed, or show all for admin
  const filteredWorkers = workers.filter(w => 
    isSuperAdmin ? true : w.department === department || w.role === 'super_manager'
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#1C1F24] w-full max-w-lg rounded-xl border border-gray-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-[#111315]">
          <h2 className="text-lg font-semibold text-white">Create New Task</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Department Selector (Admin Only) */}
            {isSuperAdmin && (
              <div className="grid grid-cols-2 gap-2 p-1 bg-[#0D0F11] rounded-lg">
                <button
                  type="button"
                  onClick={() => { setDepartment('facility'); setType(''); }}
                  className={`flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors ${
                    department === 'facility' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                  Facility
                </button>
                <button
                  type="button"
                  onClick={() => { setDepartment('accounting'); setType(''); }}
                  className={`flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors ${
                    department === 'accounting' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Wallet className="w-4 h-4" />
                  Accounting
                </button>
              </div>
            )}

            {/* Title */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Task Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Repair heating in Apt 4"
                className="w-full bg-[#0D0F11] border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                required
              />
            </div>

            {/* Type & Priority Row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Type *</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as TaskType)}
                  className="w-full bg-[#0D0F11] border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  required
                >
                  <option value="">Select Type</option>
                  {availableTaskTypes.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  className="w-full bg-[#0D0F11] border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="low">🟢 Low</option>
                  <option value="medium">🟡 Medium</option>
                  <option value="high">🟠 High</option>
                  <option value="urgent">🔴 Urgent</option>
                </select>
              </div>
            </div>

            {/* Property & Assignee Row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Property</label>
                <select
                  value={propertyId}
                  onChange={(e) => setPropertyId(e.target.value)}
                  className="w-full bg-[#0D0F11] border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="">No Property</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Assignee</label>
                <select
                  value={workerId}
                  onChange={(e) => setWorkerId(e.target.value)}
                  className="w-full bg-[#0D0F11] border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Unassigned</option>
                  {filteredWorkers.map(w => (
                    <option key={w.id} value={w.id}>{w.name} ({w.role})</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Date & Time (Optional) */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Date (Optional)</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-[#0D0F11] border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <p className="text-[10px] text-gray-500 mt-1">Leave empty for "Today"</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Time (Optional)</label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full bg-[#0D0F11] border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Additional details..."
                className="w-full bg-[#0D0F11] border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Footer Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? 'Creating...' : 'Create Task'}
                {!loading && <Check className="w-4 h-4" />}
              </button>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
};

export default TaskCreateModal;


