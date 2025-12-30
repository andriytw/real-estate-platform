import React, { useState, useEffect, useRef } from 'react';
import { X, Calendar, Clock, User, AlertCircle, Check, Building2, Wallet, ChevronDown, Sparkles, ArrowRight, ArrowLeft, FileText, FileCheck } from 'lucide-react';
import { tasksService, workersService, propertiesService } from '../../services/supabaseService';
import { Worker, CalendarEvent, TaskType, TaskPriority, Property } from '../../types';
import { FACILITY_TASK_TYPES, ACCOUNTING_TASK_TYPES, getTaskTextColor } from '../../utils/taskColors';
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
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const typeDropdownRef = useRef<HTMLDivElement>(null);
  
  // Data
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get task type icon
  const getTaskTypeIcon = (taskType: TaskType) => {
    const iconMap: Record<TaskType, React.ReactNode> = {
      'Putzen': <Sparkles className="w-4 h-4" />,
      'Einzug': <ArrowRight className="w-4 h-4" />,
      'Auszug': <ArrowLeft className="w-4 h-4" />,
      'Reklamation': <AlertCircle className="w-4 h-4" />,
      'Arbeit nach plan': <Calendar className="w-4 h-4" />,
      'Zeit Abgabe von wohnung': <Clock className="w-4 h-4" />,
      'Zählerstand': <FileCheck className="w-4 h-4" />,
      'Tax Payment': <FileText className="w-4 h-4" />,
      'Payroll': <FileText className="w-4 h-4" />,
      'Invoice Processing': <FileText className="w-4 h-4" />,
      'Audit': <FileText className="w-4 h-4" />,
      'Monthly Closing': <Calendar className="w-4 h-4" />,
      'Rent Collection': <FileText className="w-4 h-4" />,
      'Utility Payment': <FileText className="w-4 h-4" />,
      'Insurance': <FileText className="w-4 h-4" />,
      'Mortgage Payment': <FileText className="w-4 h-4" />,
      'VAT Return': <FileText className="w-4 h-4" />,
      'Financial Report': <FileText className="w-4 h-4" />,
      'Budget Review': <FileText className="w-4 h-4" />,
      'Asset Depreciation': <FileText className="w-4 h-4" />,
      'Vendor Payment': <FileText className="w-4 h-4" />,
      'Bank Reconciliation': <FileCheck className="w-4 h-4" />
    };
    return iconMap[taskType] || <FileText className="w-4 h-4" />;
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(event.target as Node)) {
        setIsTypeDropdownOpen(false);
      }
    };

    if (isTypeDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isTypeDropdownOpen]);

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
      
      // Auto-determine department based on task type if not explicitly set
      let finalDepartment = department;
      if (!finalDepartment || finalDepartment === 'facility') {
        // If type is Facility task, ensure department is 'facility'
        if (FACILITY_TASK_TYPES.includes(type as TaskType)) {
          finalDepartment = 'facility';
        } else if (ACCOUNTING_TASK_TYPES.includes(type as TaskType)) {
          finalDepartment = 'accounting';
        }
      }
      
      // Get property name if propertyId is provided
      let locationText: string | undefined = undefined;
      if (propertyId) {
        const selectedProperty = properties.find(p => p.id === propertyId);
        if (selectedProperty) {
          locationText = selectedProperty.title;
        }
      }

      const newTask = await tasksService.create({
        title,
        description,
        department: finalDepartment,
        type: type as TaskType,
        priority,
        workerId: workerId || undefined, // If empty string, send undefined
        propertyId: propertyId || undefined,
        locationText: locationText,
        date: date || undefined, // If empty, service sets to Today
        time: time || undefined,
        // Default values
        status: 'pending',
        day: date ? new Date(date).getDate() : new Date().getDate(),
        managerId: currentUser?.id,
        isIssue: false
      });
      
      // Dispatch event to notify other components
      window.dispatchEvent(new CustomEvent('taskUpdated'));

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
                <div className="relative" ref={typeDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)}
                    className={`w-full bg-[#0D0F11] border border-gray-700 rounded-lg px-3 py-2 text-left flex items-center justify-between focus:border-blue-500 focus:outline-none ${
                      type 
                        ? (FACILITY_TASK_TYPES.includes(type) ? getTaskTextColor(type) : 'text-gray-300')
                        : 'text-gray-400'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {type && (
                        <div className="flex-shrink-0">
                          {getTaskTypeIcon(type)}
                        </div>
                      )}
                      <span>{type || 'Select Type'}</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${isTypeDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isTypeDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-[#1C1F24] border border-gray-700 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto custom-scrollbar">
                      {availableTaskTypes.map((taskType) => {
                        // Apply colors only for Facility tasks, keep gray for Accounting
                        const isFacilityTask = FACILITY_TASK_TYPES.includes(taskType);
                        const textColor = isFacilityTask ? getTaskTextColor(taskType) : 'text-gray-300';
                        const isSelected = type === taskType;
                        return (
                          <button
                            key={taskType}
                            type="button"
                            onClick={() => {
                              setType(taskType);
                              setIsTypeDropdownOpen(false);
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors ${
                              isSelected
                                ? 'bg-blue-500/20 text-blue-400'
                                : `${textColor} hover:bg-gray-700`
                            }`}
                          >
                            <div className="flex-shrink-0">
                              {getTaskTypeIcon(taskType)}
                            </div>
                            <span className="flex-1 text-left">{taskType}</span>
                            {isSelected && (
                              <Check className="w-4 h-4 flex-shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
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


