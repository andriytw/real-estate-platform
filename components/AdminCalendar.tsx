
import React, { useState, useRef, useEffect } from 'react';
import { Plus, ChevronDown, Calendar as CalendarIcon, X, Check, Building, Clock, CheckCircle2, MoreHorizontal, User, AlignLeft, Tag, LayoutGrid, List, Filter, Paperclip, Send, Image as ImageIcon, FileText, Mail, ClipboardList, Loader, CheckSquare, ArrowUpDown, Layers, Archive, History, ShieldCheck, Hammer, Zap, Droplets, Flame } from 'lucide-react';
import { MOCK_PROPERTIES } from '../constants';
import { CalendarEvent, TaskType, TaskStatus, Property, BookingStatus, Worker } from '../types';
import { updateBookingStatusFromTask } from '../bookingUtils';
import { workersService, tasksService } from '../services/supabaseService';
import { ACCOUNTING_TASK_TYPES, getTaskColor } from '../utils/taskColors';

type ViewMode = 'month' | 'week' | 'day';

const TASK_TYPES: TaskType[] = ['Einzug', 'Auszug', 'Putzen', 'Reklamation', 'Arbeit nach plan', 'Zeit Abgabe von wohnung', 'Zählerstand'];

interface TaskMessage {
  id: string;
  sender: 'admin' | 'worker';
  text: string;
  timestamp: string;
  attachment?: {
    name: string;
    type: 'image' | 'file';
  };
}

interface AdminCalendarProps {
  events: CalendarEvent[];
  onAddEvent: (event: CalendarEvent) => void;
  onUpdateEvent: (event: CalendarEvent) => void;
  showLegend?: boolean;
  properties?: Property[];
  categories?: TaskType[]; // Task categories for filtering
  onUpdateBookingStatus?: (bookingId: string | number, newStatus: BookingStatus) => void; // Callback for updating booking status
}

const AdminCalendar: React.FC<AdminCalendarProps> = ({ events, onAddEvent, onUpdateEvent, showLegend = true, properties, categories, onUpdateBookingStatus }) => {
  // Initialize with current date
  const now = new Date();
  const [currentMonthIdx, setCurrentMonthIdx] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  
  // Use passed properties or fallback to mock
  const propertyList = properties || MOCK_PROPERTIES;
  
  // Use passed categories or fallback to default
  const availableTaskTypes = categories || TASK_TYPES;
  
  // Determine department based on categories
  const isAccountingCalendar = categories && categories.length > 0 && 
    categories.every(cat => ACCOUNTING_TASK_TYPES.includes(cat));

  // Selection States
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [viewEvent, setViewEvent] = useState<CalendarEvent | null>(null); // For Task Detail Modal
  
  // Filter State
  const [filterTask, setFilterTask] = useState<TaskType | 'All'>('All');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);

  // Date Range Filter State
  const [dateFilterStart, setDateFilterStart] = useState('');
  const [dateFilterEnd, setDateFilterEnd] = useState('');

  // Sort States
  const [sidebarSort, setSidebarSort] = useState<'time' | 'type'>('time');
  const [calendarSort, setCalendarSort] = useState<'time' | 'type'>('time');

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [dayToAdd, setDayToAdd] = useState<number | 20>(20);
  
  // Custom Dropdown State
  const [isTaskTypeDropdownOpen, setIsTaskTypeDropdownOpen] = useState(false);
  
  // Workers from database
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loadingWorkers, setLoadingWorkers] = useState(true);

  // Form Data
  const [newTaskProperty, setNewTaskProperty] = useState('');
  const [newTaskType, setNewTaskType] = useState<TaskType>('Arbeit nach plan');
  const [newTaskTime, setNewTaskTime] = useState('09:00');
  const [newTaskAssignee, setNewTaskAssignee] = useState<string>(''); // Store worker ID, not name
  const [newTaskComment, setNewTaskComment] = useState('');

  // Chat State for Task Detail Modal
  const [taskMessages, setTaskMessages] = useState<TaskMessage[]>([]);
  const [chatInputValue, setChatInputValue] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);

  // Функція для отримання зрозумілого опису (прибирає JSON, показує тільки текст)
  const getReadableDescription = (description: string | undefined): string => {
    if (!description) return '';
    
    try {
      const parsed = JSON.parse(description);
      // Якщо це transfer task, повертаємо originalDescription
      if (parsed?.action === 'transfer_inventory' && parsed.originalDescription) {
        return parsed.originalDescription;
      }
      if (parsed?.originalDescription) {
        return parsed.originalDescription;
      }
      // Якщо не знайшли originalDescription, повертаємо весь JSON як текст (не ідеально, але краще ніж нічого)
      return description;
    } catch (e) {
      // Не JSON, повертаємо як є
      return description;
    }
  };
  
  // Refs for clicking outside
  const dropdownRef = useRef<HTMLDivElement>(null);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  // Statistics Calculation
  const totalTasks = events.length;
  const archivedTasks = events.filter(e => e.status === 'archived').length;
  const pendingTasks = events.filter(e => e.status === 'pending' || e.status === 'review').length;

  // Load workers from database
  useEffect(() => {
    const loadWorkers = async () => {
      try {
        setLoadingWorkers(true);
        console.log('🔄 Loading workers for AdminCalendar...');
        const workersData = await workersService.getAll();
        console.log('✅ Loaded workers:', workersData.length);
        setWorkers(workersData);
      } catch (error) {
        console.error('❌ Error loading workers:', error);
      } finally {
        setLoadingWorkers(false);
      }
    };
    loadWorkers();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsTaskTypeDropdownOpen(false);
      }
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setIsFilterDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Scroll to bottom of chat
  useEffect(() => {
    if (viewEvent) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [taskMessages, viewEvent]);

  // Initialize mock chat when opening a task
  useEffect(() => {
    if (viewEvent) {
      setTaskMessages([
        { id: '1', sender: 'worker', text: 'Task received. I will be there on time.', timestamp: '08:30' },
        ...(viewEvent.hasUnreadMessage ? [{ id: '2', sender: 'worker', text: 'Urgent update: I need access to the basement key.', timestamp: '09:15' } as TaskMessage] : [])
      ]);
    }
  }, [viewEvent]);

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June', 
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const daysInMonth = new Date(selectedYear, currentMonthIdx + 1, 0).getDate();
  const startDay = new Date(selectedYear, currentMonthIdx, 1).getDay();
  const startDayAdjusted = startDay === 0 ? 6 : startDay - 1;
  
  // Generate days array
  const allDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Calculate visible days based on view mode
  const getVisibleDays = () => {
    if (viewMode === 'month') {
      return allDays;
    } else if (viewMode === 'week') {
      // Mock logic: Assume "current week" is around the 20th for demo
      const weekStart = 17; // Monday 17th
      return allDays.slice(weekStart - 1, weekStart + 6);
    } else if (viewMode === 'day') {
      // Show selected day or default to 20
      const targetDay = selectedDay || 20;
      return [targetDay];
    }
    return allDays;
  };

  const visibleDays = getVisibleDays();
  const emptyDays = viewMode === 'month' ? Array.from({ length: startDayAdjusted }, (_, i) => i) : [];

  const getEventsForDay = (day: number) => {
    return events.filter(e => {
      // Properly match by date, month and year so tasks don't appear in every month
      let dayMatch = false;
      let monthMatch = true;
      let yearMatch = true;

      if (e.date) {
        const eventDate = new Date(e.date);
        const eventDay = eventDate.getDate();
        const eventMonth = eventDate.getMonth(); // 0-based
        const eventYear = eventDate.getFullYear();

        dayMatch = eventDay === day;
        monthMatch = eventMonth === currentMonthIdx;
        yearMatch = eventYear === selectedYear;
      } else {
        // Legacy events without full date: fall back to day only, assume current month/year
        dayMatch = e.day === day;
      }

      const filterMatch = filterTask === 'All' || e.type === filterTask;
      return dayMatch && monthMatch && yearMatch && filterMatch;
    });
  };

  const sortEvents = (eventsList: CalendarEvent[], sortType: 'time' | 'type') => {
    return [...eventsList].sort((a, b) => {
      if (sortType === 'time') {
        return (a.time || '').localeCompare(b.time || '');
      } else {
        return availableTaskTypes.indexOf(a.type as TaskType) - availableTaskTypes.indexOf(b.type as TaskType);
      }
    });
  };

  // Calendar Event Color - uses getTaskColor to match board colors
  const getCalendarEventColor = (type: string) => {
    // getTaskColor повертає: "bg-blue-500/10 border-blue-500 text-blue-400"
    // Потрібно перетворити на: "border-l-2 border-blue-500 bg-blue-500/10 text-blue-400"
    const colorString = getTaskColor(type);
    const parts = colorString.split(' ');
    
    const borderClass = parts.find(p => p.startsWith('border-')) || 'border-gray-500';
    const bgClass = parts.find(p => p.startsWith('bg-')) || 'bg-gray-500/10';
    const textClass = parts.find(p => p.startsWith('text-')) || 'text-gray-300';
    
    return `border-l-2 ${borderClass} ${bgClass} ${textClass}`;
  };

  // Sidebar Item Border Color Logic - uses getTaskColor to match board colors
  const getSidebarBorderClass = (type: string) => {
    const colors = getTaskColor(type).split(' ');
    const borderClass = colors.find(c => c.startsWith('border-')) || 'border-gray-500';
    return `${borderClass}/50 hover:${borderClass}`;
  };

  // Event Badge Color - uses getTaskColor to match board colors
  const getEventBadgeColor = (type: string) => {
    const colors = getTaskColor(type).split(' ');
    const borderClass = colors.find(c => c.startsWith('border-')) || 'border-gray-500';
    const textClass = colors.find(c => c.startsWith('text-')) || 'text-gray-400';
    const bgClass = colors.find(c => c.startsWith('bg-')) || 'bg-gray-400/10';
    return `${textClass} ${bgClass} border ${borderClass}/20`;
  };

  // Dot Color for Legend - uses getTaskColor to match board colors
  const getDotColor = (type: string) => {
    const colors = getTaskColor(type).split(' ');
    const borderClass = colors.find(c => c.startsWith('border-')) || 'border-gray-500';
    // Extract color from border class (e.g., "border-blue-500" -> "bg-blue-500")
    const colorName = borderClass.replace('border-', 'bg-');
    return colorName;
  };

  // Helper for dropdown text color
  const getTaskTextColor = (type: string) => {
    switch (type) {
      case 'Einzug': return 'text-purple-400';
      case 'Auszug': return 'text-blue-400';
      case 'Putzen': return 'text-orange-400';
      case 'Reklamation': return 'text-red-500';
      case 'Arbeit nach plan': return 'text-emerald-400';
      case 'Zeit Abgabe von wohnung': return 'text-yellow-400';
      case 'Zählerstand': return 'text-cyan-400';
      default: return 'text-gray-300';
    }
  };

  const openAddModal = (e: React.MouseEvent, day: number) => {
    e.stopPropagation();
    setDayToAdd(day);
    setNewTaskProperty(propertyList[0]?.id || '');
    setNewTaskType('Arbeit nach plan');
    setNewTaskAssignee(''); // Reset to empty (unassigned)
    setNewTaskComment('');
    setIsAddModalOpen(true);
  };

  const handleSaveTask = async () => {
    const property = propertyList.find(p => p.id === newTaskProperty);
    if (!property) return;

    try {
      // Create date string for the task
      const taskDate = `${selectedYear}-${String(currentMonthIdx + 1).padStart(2, '0')}-${String(dayToAdd).padStart(2, '0')}`;
      
      // Determine department based on task type and calendar type
      const department = isAccountingCalendar 
        ? 'accounting' 
        : (TASK_TYPES.includes(newTaskType) ? 'facility' : 'accounting');
      
      // Create task in database
      const newTask = await tasksService.create({
        title: property.title,
        description: newTaskComment,
        department: department,
        type: newTaskType,
        priority: 'medium',
        workerId: newTaskAssignee || undefined,
        propertyId: property.id,
        locationText: property.title, // Add property name for display
        date: taskDate,
        time: newTaskTime,
        status: newTaskAssignee ? 'assigned' : 'pending',
        day: dayToAdd,
        isIssue: false
      });

      console.log('✅ Task created in database:', newTask.id);
      
      // Notify other components (Kanban) about new task
      window.dispatchEvent(new CustomEvent('taskUpdated'));
      
      // Add to local state via callback
      onAddEvent(newTask);
      setIsAddModalOpen(false);
    } catch (error: any) {
      console.error('❌ Error creating task:', error);
      alert(`Помилка створення завдання: ${error.message || 'Невідома помилка'}`);
    }
  };

  const markTaskAsReview = (eventId: string) => {
    const targetEvent = events.find(e => e.id === eventId);
    if (targetEvent && (targetEvent.status === 'open' || targetEvent.status === 'assigned')) {
        // Worker marks task as done - перехід на done_by_worker
        const updated = { ...targetEvent, status: 'done_by_worker' as TaskStatus };
        onUpdateEvent(updated);
        // If this event is currently open in modal, update the local view state too
        if (viewEvent && viewEvent.id === eventId) {
            setViewEvent(updated);
        }
    }
  };

  const approveAndArchiveTask = (eventId: string) => {
    const targetEvent = events.find(e => e.id === eventId);
    if (targetEvent) {
        const updated = { ...targetEvent, status: 'verified' as TaskStatus };
        onUpdateEvent(updated);
        setViewEvent(updated);
        
        // Оновити статус броні якщо таска пов'язана з бронюванням
        if (targetEvent.bookingId && onUpdateBookingStatus) {
            const newBookingStatus = updateBookingStatusFromTask(updated);
            if (newBookingStatus) {
                onUpdateBookingStatus(targetEvent.bookingId, newBookingStatus);
            }
        }
    }
  };

  // Handle Event Click - Marks message as read
  const handleEventClick = (e: React.MouseEvent, event: CalendarEvent) => {
    e.stopPropagation();
    
    // If there is an unread message, mark it as read
    if (event.hasUnreadMessage) {
      const updated = { ...event, hasUnreadMessage: false };
      onUpdateEvent(updated);
      setViewEvent(updated);
    } else {
      setViewEvent(event);
    }
  };

  const handleChatSend = () => {
    if (!chatInputValue.trim()) return;
    
    const newMsg: TaskMessage = {
      id: Date.now().toString(),
      sender: 'admin',
      text: chatInputValue,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setTaskMessages([...taskMessages, newMsg]);
    setChatInputValue('');
  };

  const handleChatFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const newMsg: TaskMessage = {
        id: Date.now().toString(),
        sender: 'admin',
        text: 'Attached a file',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        attachment: {
          name: file.name,
          type: file.type.startsWith('image/') ? 'image' : 'file'
        }
      };
      setTaskMessages([...taskMessages, newMsg]);
    }
  };

  const handleMeterReadingChange = (field: 'electricity' | 'water' | 'gas', value: string) => {
      if (!viewEvent) return;
      const updatedReadings = { ...viewEvent.meterReadings, [field]: value };
      const updatedEvent = { ...viewEvent, meterReadings: updatedReadings };
      setViewEvent(updatedEvent);
      onUpdateEvent(updatedEvent);
  };

  const selectedDayEvents = selectedDay ? getEventsForDay(selectedDay) : [];

  // Sort Sidebar Events
  const sortedSidebarEvents = sortEvents(selectedDayEvents, sidebarSort);

  return (
    <div className="flex flex-col bg-[#0D1117] font-sans text-white p-6 rounded-xl border border-gray-800 shadow-2xl relative min-w-[1400px] overflow-auto h-full">
      
      {/* Top Header Bar */}
      <div className="flex flex-col mb-6 gap-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
            Unified Platform Calendar
          </h1>
        </div>

        {/* Statistics Tiles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full mb-2">
          <div className="bg-[#161B22] border border-gray-800 rounded-lg p-4 flex items-center justify-between shadow-sm">
             <div>
                <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">Total Tasks</p>
                <p className="text-2xl font-bold text-white">{totalTasks}</p>
             </div>
             <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <ClipboardList className="w-5 h-5 text-blue-400" />
             </div>
          </div>
          
          <div className="bg-[#161B22] border border-gray-800 rounded-lg p-4 flex items-center justify-between shadow-sm">
             <div>
                <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">In Progress</p>
                <p className="text-2xl font-bold text-white">{pendingTasks}</p>
             </div>
             <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                <Loader className="w-5 h-5 text-yellow-400" />
             </div>
          </div>
          
          <div className="bg-[#161B22] border border-gray-800 rounded-lg p-4 flex items-center justify-between shadow-sm">
             <div>
                <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">Completed / Archived</p>
                <p className="text-2xl font-bold text-white">{archivedTasks}</p>
             </div>
             <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Archive className="w-5 h-5 text-emerald-400" />
             </div>
          </div>
        </div>
      </div>

      {/* Navigation Controls */}
      <div className="space-y-6 mb-6 flex-shrink-0">
        
        {/* Year Row */}
        <div className="flex justify-between items-end">
          <div className="w-full">
             <h3 className="text-emerald-400 font-bold text-sm uppercase tracking-wide mb-2">Navigation by Year: {selectedYear}</h3>
             <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide border-b border-gray-800">
              {months.map((month, idx) => (
                <button
                  key={month}
                  onClick={() => setCurrentMonthIdx(idx)}
                  className={`
                    px-4 py-2 rounded-t-lg text-sm font-medium transition-all whitespace-nowrap relative top-[1px]
                    ${idx === currentMonthIdx 
                      ? 'bg-[#0099FF] text-white font-bold' 
                      : 'text-gray-400 hover:text-white hover:bg-[#1C2128]'}
                  `}
                >
                  {month}
                </button>
              ))}
             </div>
          </div>
        </div>

        {/* View Mode, Filter & Legend */}
        <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
          
          {/* Left Group: View Switcher + Filter + Date Picker */}
          <div className="flex items-center gap-4 flex-wrap">
            {/* View Switcher */}
            <div className="flex items-center bg-[#161B22] p-2 rounded-lg border border-gray-800 self-start">
              <div className="flex bg-[#0D1117] p-1 rounded-md border border-gray-700">
                <button 
                  onClick={() => setViewMode('day')}
                  className={`px-4 py-1.5 text-sm font-bold rounded transition-all ${viewMode === 'day' ? 'bg-[#0099FF] text-white shadow' : 'text-gray-400 hover:text-white'}`}
                >
                  Day
                </button>
                <button 
                  onClick={() => setViewMode('week')}
                  className={`px-4 py-1.5 text-sm font-bold rounded transition-all ${viewMode === 'week' ? 'bg-[#0099FF] text-white shadow' : 'text-gray-400 hover:text-white'}`}
                >
                  Week
                </button>
                <button 
                  onClick={() => setViewMode('month')}
                  className={`px-4 py-1.5 text-sm font-bold rounded transition-all ${viewMode === 'month' ? 'bg-[#0099FF] text-white shadow' : 'text-gray-400 hover:text-white'}`}
                >
                  Month
                </button>
              </div>
              
              <button 
                onClick={() => {
                  setSelectedYear(new Date().getFullYear());
                  setCurrentMonthIdx(new Date().getMonth());
                  setSelectedDay(new Date().getDate());
                }}
                className="ml-3 hidden md:block px-4 py-1.5 bg-[#D946EF] hover:bg-[#C026D3] text-white rounded text-sm font-bold transition-colors shadow-lg shadow-fuchsia-900/20"
              >
                Today
              </button>
            </div>

            {/* Task Filter */}
            <div className="relative" ref={filterDropdownRef}>
              <button 
                onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
                className="flex items-center gap-2 bg-[#1C1F24] border border-gray-700 hover:border-gray-500 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors shadow-sm"
              >
                <Filter className="w-4 h-4 text-gray-400" />
                <span>{filterTask === 'All' ? 'All Tasks' : filterTask}</span>
                <ChevronDown className="w-4 h-4 text-gray-500" />
              </button>
              
              {isFilterDropdownOpen && (
                <div className="absolute left-0 top-full mt-2 w-48 bg-[#161B22] border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
                  <div 
                    onClick={() => { setFilterTask('All'); setIsFilterDropdownOpen(false); }}
                    className={`px-4 py-2.5 text-sm font-medium cursor-pointer hover:bg-[#1C1F24] transition-colors ${filterTask === 'All' ? 'text-white bg-gray-800' : 'text-gray-300'}`}
                  >
                    All Tasks
                  </div>
                  {availableTaskTypes.map(type => (
                    <div 
                      key={type}
                      onClick={() => { setFilterTask(type); setIsFilterDropdownOpen(false); }}
                      className={`px-4 py-2.5 text-sm font-medium cursor-pointer hover:bg-[#1C1F24] transition-colors flex items-center gap-2`}
                    >
                      <div className={`w-2 h-2 rounded-full ${getDotColor(type)}`}></div>
                      <span className={getTaskTextColor(type)}>{type}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Manual Date Range Picker */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                 <span className="text-xs text-gray-400">From:</span>
                 <input 
                   type="date" 
                   value={dateFilterStart}
                   onChange={(e) => setDateFilterStart(e.target.value)}
                   className="bg-[#1C1F24] border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                 />
              </div>
              <div className="flex items-center gap-2">
                 <span className="text-xs text-gray-400">To:</span>
                 <input 
                   type="date" 
                   value={dateFilterEnd}
                   onChange={(e) => setDateFilterEnd(e.target.value)}
                   className="bg-[#1C1F24] border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                 />
              </div>
              <button className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors">
                Show
              </button>
            </div>

            {/* Sort Toggle Buttons */}
            <div className="flex gap-2 ml-2">
                <button 
                  onClick={() => setCalendarSort('time')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-colors border ${calendarSort === 'time' ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'bg-transparent border-gray-700 text-gray-400 hover:text-white'}`}
                >
                  <Clock className="w-3 h-3" /> Time
                </button>
                <button 
                  onClick={() => setCalendarSort('type')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-colors border ${calendarSort === 'type' ? 'bg-purple-500/20 border-purple-500 text-purple-400' : 'bg-transparent border-gray-700 text-gray-400 hover:text-white'}`}
                >
                  <Layers className="w-3 h-3" /> Group
                </button>
            </div>

          </div>

          {/* Right Group: Legend Tile */}
          {showLegend && (
            <div className="bg-[#1C2128] border border-gray-700 rounded-lg px-4 py-3 overflow-x-auto scrollbar-hide">
               <div className="flex items-center gap-4 whitespace-nowrap text-xs font-medium">
                  {availableTaskTypes.map(type => (
                     <div key={type} className="flex items-center gap-1.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${getDotColor(type)}`}></span>
                        <span className="text-gray-300">{type}</span>
                     </div>
                  ))}
               </div>
            </div>
          )}

        </div>
      </div>

      {/* Calendar Content */}
      <div className="flex flex-col relative">
        <div className="flex items-center gap-2 mb-4 flex-shrink-0">
          <CalendarIcon className="w-5 h-5 text-[#0099FF]" />
          <h2 className="text-xl font-bold">
             {viewMode === 'day' ? 'Daily View' : viewMode === 'week' ? 'Weekly Overview' : 'Monthly Overview'}: {months[currentMonthIdx]} {selectedYear}
          </h2>
        </div>

        {/* Grid Header (Only for Month/Week) */}
        {viewMode !== 'day' && (
          <div className="grid grid-cols-7 gap-4 mb-2 px-1 flex-shrink-0">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-gray-500 text-xs font-bold uppercase tracking-wider text-center">
                {day}
              </div>
            ))}
          </div>
        )}

        {/* Grid Body */}
        <div className={`
           gap-4 p-1 pb-10
           ${viewMode === 'day' ? 'flex flex-col' : 'grid grid-cols-7'}
        `}>
          {emptyDays.map(i => (
            <div key={`empty-${i}`} className="bg-transparent min-h-[300px]" />
          ))}
          
          {visibleDays.map(day => {
            const dayEvents = getEventsForDay(day);
            const sortedDayEvents = sortEvents(dayEvents, calendarSort);
            
            // Check if this is today's date
            const today = new Date();
            const isToday = day === today.getDate() && 
                          currentMonthIdx === today.getMonth() && 
                          selectedYear === today.getFullYear();

            return (
              <div 
                key={day} 
                onClick={() => setSelectedDay(day)}
                className={`
                  bg-[#161B22] border rounded-xl p-3 flex flex-col relative group transition-all cursor-pointer
                  hover:border-gray-500 hover:bg-[#1C1F24]
                  ${viewMode === 'day' ? 'min-h-[600px]' : viewMode === 'week' ? 'h-[600px]' : 'h-[320px]'}
                  ${isToday 
                    ? 'border-blue-500 border-2 shadow-[0_0_0_2px_rgba(59,130,246,0.3)]' 
                    : 'border-gray-800'
                  }
                `}
              >
                {/* Day Header */}
                <div className="flex justify-between items-start mb-4 border-b border-gray-800 pb-2 flex-shrink-0">
                  <div className="flex items-baseline gap-2">
                     <span className="text-3xl font-bold text-white/80">{day}</span>
                     {viewMode === 'day' && <span className="text-xl text-gray-500">{months[currentMonthIdx]}</span>}
                  </div>
                  <button 
                    onClick={(e) => openAddModal(e, day)}
                    className="text-gray-600 hover:text-white transition-colors p-1 hover:bg-gray-800 rounded"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>

                {/* Events List */}
                <div className="flex flex-col gap-2 flex-1 overflow-y-auto min-h-0 pr-1 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                  {sortedDayEvents.length > 0 ? sortedDayEvents.map((event) => (
                    <div 
                      key={event.id}
                      onClick={(e) => handleEventClick(e, event)}
                      className={`
                        relative p-2 rounded border hover:bg-opacity-80 transition-colors flex-shrink-0
                        ${getCalendarEventColor(event.type as string)}
                        ${event.status === 'archived' ? 'opacity-50 grayscale' : ''}
                        ${event.status === 'done_by_worker' ? 'ring-1 ring-yellow-500' : ''}
                        ${viewMode === 'day' ? 'p-4 text-base' : ''}
                      `}
                    >
                      {/* Unread Message Notification */}
                      {event.hasUnreadMessage && (
                        <div className="absolute -top-1.5 -right-1.5 bg-red-500 text-white p-1 rounded-full shadow-sm z-10 ring-2 ring-[#161B22]">
                           <Mail className="w-3 h-3" />
                        </div>
                      )}
                      
                      <div className={`font-semibold leading-snug text-white mb-0.5 truncate ${viewMode === 'day' ? 'text-lg' : 'text-xs'}`}>
                         {event.title}
                      </div>
                      <div className="flex justify-between items-center mt-1">
                         <div className="flex items-center gap-1">
                            <span className="font-mono opacity-70 bg-black/20 px-1 rounded text-[10px]">{event.time}</span>
                            {event.assignee && <User className="w-3 h-3 opacity-70" />}
                         </div>
                         <span className="text-[10px] opacity-80 font-bold uppercase tracking-tighter">{event.type}</span>
                      </div>
                      {event.status === 'done_by_worker' && (
                          <div className="mt-1 bg-yellow-500/20 text-yellow-500 text-[10px] px-1 rounded inline-block">Awaiting Verification</div>
                      )}
                      {viewMode === 'day' && event.description && (
                         <p className="mt-2 text-sm opacity-70">{getReadableDescription(event.description)}</p>
                      )}
                    </div>
                  )) : viewMode === 'day' && (
                     <div className="flex flex-col items-center justify-center h-full text-gray-500">
                        <p>No tasks scheduled for this day.</p>
                     </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* --- ADD TASK MODAL --- */}
        {isAddModalOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm">
             <div 
               className="bg-[#1C1F24] w-full max-w-lg rounded-xl shadow-2xl border border-gray-700 overflow-hidden animate-in zoom-in duration-200 flex flex-col max-h-[90%]"
               onClick={(e) => e.stopPropagation()}
             >
                <div className="p-5 border-b border-gray-800 flex justify-between items-center bg-[#23262b]">
                   <div>
                      <h3 className="text-lg font-bold text-white">New Task</h3>
                      <p className="text-xs text-gray-400">Date: {months[currentMonthIdx]} {dayToAdd}, {selectedYear}</p>
                   </div>
                   <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
                </div>
                
                <div className="p-6 space-y-5 overflow-y-auto">
                   {/* Property Selection */}
                   <div>
                      <label className="block text-xs font-medium text-gray-400 mb-2 flex items-center gap-2">
                         <Building className="w-3 h-3" /> Property
                      </label>
                      <div className="relative">
                         <select 
                           value={newTaskProperty}
                           onChange={(e) => setNewTaskProperty(e.target.value)}
                           className="w-full appearance-none bg-[#111315] border border-gray-700 rounded-lg p-3 pl-3 pr-8 text-sm text-white focus:border-emerald-500 focus:outline-none"
                         >
                           {propertyList.map(p => (
                              <option key={p.id} value={p.id}>{p.title}</option>
                           ))}
                         </select>
                         <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                      </div>
                   </div>

                   <div className="grid grid-cols-2 gap-4">
                      {/* Task Type Custom Dropdown */}
                      <div ref={dropdownRef}>
                         <label className="block text-xs font-medium text-gray-400 mb-2 flex items-center gap-2">
                            <Tag className="w-3 h-3" /> Task Type
                         </label>
                         <div className="relative">
                            <div 
                               onClick={() => setIsTaskTypeDropdownOpen(!isTaskTypeDropdownOpen)}
                               className="w-full bg-[#111315] border border-gray-700 rounded-lg p-3 pr-8 text-sm cursor-pointer flex items-center justify-between focus:border-emerald-500"
                            >
                               <span className={`font-bold ${getTaskTextColor(newTaskType)}`}>
                                 {newTaskType}
                               </span>
                               <ChevronDown className="w-4 h-4 text-gray-500" />
                            </div>
                            
                            {/* Dropdown Options */}
                            {isTaskTypeDropdownOpen && (
                               <div className="absolute top-full left-0 w-full mt-1 bg-[#161B22] border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
                                  {TASK_TYPES.map((type) => (
                                     <div 
                                        key={type}
                                        onClick={() => {
                                           setNewTaskType(type);
                                           setIsTaskTypeDropdownOpen(false);
                                        }}
                                        className={`
                                           px-3 py-2.5 text-sm font-bold cursor-pointer hover:bg-[#1C1F24] transition-colors
                                           ${getTaskTextColor(type)}
                                        `}
                                     >
                                        {type}
                                     </div>
                                  ))}
                               </div>
                            )}
                         </div>
                      </div>

                      {/* Time Selection */}
                      <div>
                         <label className="block text-xs font-medium text-gray-400 mb-2 flex items-center gap-2">
                            <Clock className="w-3 h-3" /> Time
                         </label>
                         <input 
                           type="time" 
                           value={newTaskTime}
                           onChange={(e) => setNewTaskTime(e.target.value)}
                           className="w-full bg-[#111315] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-emerald-500 focus:outline-none"
                         />
                      </div>
                   </div>

                   {/* Assign Employee Dropdown */}
                   <div>
                      <label className="block text-xs font-medium text-gray-400 mb-2 flex items-center gap-2">
                         <User className="w-3 h-3" /> Assign Employee
                      </label>
                      <div className="relative">
                         <select 
                           value={newTaskAssignee}
                           onChange={(e) => setNewTaskAssignee(e.target.value)}
                           className="w-full appearance-none bg-[#111315] border border-gray-700 rounded-lg p-3 pr-8 text-sm text-white focus:border-emerald-500 focus:outline-none"
                           disabled={loadingWorkers}
                         >
                           <option value="">Unassigned</option>
                           {workers
                             .filter(w => 
                               isAccountingCalendar 
                                 ? (w.department === 'accounting' || w.role === 'super_manager' || w.role === 'manager')
                                 : (w.department === 'facility' || w.role === 'super_manager' || w.role === 'manager')
                             )
                             .map(worker => (
                              <option key={worker.id} value={worker.id}>
                                {worker.name} {worker.role === 'manager' ? '(Manager)' : worker.role === 'super_manager' ? '(Super Admin)' : ''}
                              </option>
                           ))}
                         </select>
                         <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                      </div>
                   </div>

                   {/* Comments / Description */}
                   <div>
                      <label className="block text-xs font-medium text-gray-400 mb-2 flex items-center gap-2">
                         <AlignLeft className="w-3 h-3" /> Comments / Notes
                      </label>
                      <textarea 
                         rows={3}
                         value={newTaskComment}
                         onChange={(e) => setNewTaskComment(e.target.value)}
                         placeholder="Add details about this task..."
                         className="w-full bg-[#111315] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-emerald-500 focus:outline-none resize-none"
                      />
                   </div>

                   <button 
                     onClick={handleSaveTask}
                     className="w-full bg-[#0099FF] hover:bg-[#0088EE] text-white font-bold py-3 rounded-lg shadow-lg shadow-blue-900/20 transition-colors mt-2"
                   >
                      Create Task
                   </button>
                </div>
             </div>
          </div>
        )}

        {/* --- TASK DETAIL & CHAT MODAL --- */}
        {viewEvent && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-sm">
             <div 
               className="bg-[#1C1F24] w-full max-w-4xl h-[85vh] rounded-xl shadow-2xl border border-gray-700 overflow-hidden animate-in zoom-in duration-200 flex flex-col"
               onClick={(e) => e.stopPropagation()}
             >
               {/* Modal Header */}
               <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-[#23262b]">
                 <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${getDotColor(viewEvent.type as string)}`}></div>
                    <div>
                       <h3 className="text-lg font-bold text-white leading-none flex items-center gap-2">
                         {viewEvent.title}
                         {viewEvent.status === 'archived' && <Archive className="w-4 h-4 text-gray-500" />}
                       </h3>
                       <span className={`text-xs font-bold ${getTaskTextColor(viewEvent.type as string)}`}>{viewEvent.type}</span>
                    </div>
                 </div>
                 <button onClick={() => setViewEvent(null)} className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors">
                    <X className="w-6 h-6" />
                 </button>
               </div>

               {/* Body Container */}
               <div className="flex-1 flex overflow-hidden">
                  
                  {/* Left: Details */}
                  <div className="w-1/3 border-r border-gray-700 p-6 overflow-y-auto bg-[#161B22]">
                     <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-6">Task Details</h4>
                     
                     {/* --- ACTION AREA FOR WORKER (SIMULATION) --- */}
                     {(viewEvent.status === 'open' || viewEvent.status === 'assigned') && (
                        <div className="mb-6 bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                           <div className="flex items-center gap-2 text-blue-500 mb-2">
                              <Hammer className="w-5 h-5" />
                              <span className="font-bold text-sm">Worker Action</span>
                           </div>
                           <p className="text-xs text-gray-300 mb-4">
                              Simulate the worker marking this task as completed on their mobile app.
                           </p>
                           <button 
                              onClick={() => markTaskAsReview(viewEvent.id)}
                              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-md text-xs flex items-center justify-center gap-2 transition-colors"
                           >
                              <Check className="w-4 h-4" />
                              Mark as Done
                           </button>
                        </div>
                     )}

                     {/* --- METER READING CHECKLIST (Only for Einzug/Auszug/Zählerstand) --- */}
                     {(viewEvent.type === 'Einzug' || viewEvent.type === 'Auszug' || viewEvent.type === 'Zählerstand') && (
                        <div className="mb-6 bg-[#0D1117] border border-gray-700 rounded-lg p-4 shadow-inner">
                           <h5 className="text-xs font-bold text-white mb-3 flex items-center gap-2">
                              <ClipboardList className="w-4 h-4 text-emerald-500" />
                              Checklist: Meter Readings
                           </h5>
                           <div className="space-y-3">
                              <div>
                                 <label className="text-[10px] font-bold text-gray-500 mb-1 flex items-center gap-1">
                                    <Zap className="w-3 h-3 text-yellow-500" /> Electricity (kWh)
                                 </label>
                                 <input 
                                    type="text" 
                                    className="w-full bg-[#161B22] border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:border-emerald-500 focus:outline-none disabled:opacity-50"
                                    placeholder="e.g. 12345"
                                    disabled={viewEvent.status === 'archived'}
                                    value={viewEvent.meterReadings?.electricity || ''}
                                    onChange={(e) => handleMeterReadingChange('electricity', e.target.value)}
                                 />
                              </div>
                              <div>
                                 <label className="text-[10px] font-bold text-gray-500 mb-1 flex items-center gap-1">
                                    <Droplets className="w-3 h-3 text-blue-500" /> Water (m³)
                                 </label>
                                 <input 
                                    type="text" 
                                    className="w-full bg-[#161B22] border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:border-emerald-500 focus:outline-none disabled:opacity-50"
                                    placeholder="e.g. 543"
                                    disabled={viewEvent.status === 'archived'}
                                    value={viewEvent.meterReadings?.water || ''}
                                    onChange={(e) => handleMeterReadingChange('water', e.target.value)}
                                 />
                              </div>
                              <div>
                                 <label className="text-[10px] font-bold text-gray-500 mb-1 flex items-center gap-1">
                                    <Flame className="w-3 h-3 text-orange-500" /> Gas (m³)
                                 </label>
                                 <input 
                                    type="text" 
                                    className="w-full bg-[#161B22] border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:border-emerald-500 focus:outline-none disabled:opacity-50"
                                    placeholder="e.g. 890"
                                    disabled={viewEvent.status === 'archived'}
                                    value={viewEvent.meterReadings?.gas || ''}
                                    onChange={(e) => handleMeterReadingChange('gas', e.target.value)}
                                 />
                              </div>
                           </div>
                        </div>
                     )}

                     {/* --- INVENTORY LIST FOR TRANSFER TASKS --- */}
                     {(() => {
                       try {
                         if (viewEvent.description) {
                           const parsed = JSON.parse(viewEvent.description as string);
                           if (parsed?.action === 'transfer_inventory' && Array.isArray(parsed.transferData)) {
                             return (
                               <div className="mb-6 bg-[#0D1117] border border-gray-700 rounded-lg p-4 shadow-inner">
                                 <h5 className="text-xs font-bold text-white mb-3 flex items-center gap-2">
                                   <ClipboardList className="w-4 h-4 text-emerald-500" />
                                   Inventory to transfer
                                 </h5>
                                 <div className="border border-gray-800 rounded-lg overflow-hidden">
                                   <table className="w-full text-[11px]">
                                     <thead className="bg-[#111319] text-gray-400">
                                       <tr>
                                         <th className="px-3 py-2 text-left">ID</th>
                                         <th className="px-3 py-2 text-left">Item</th>
                                         <th className="px-3 py-2 text-right">Qty</th>
                                       </tr>
                                     </thead>
                                     <tbody className="divide-y divide-gray-800">
                                       {parsed.transferData.map((item: any, idx: number) => (
                                         <tr key={idx} className="hover:bg-[#1E2027]">
                                           <td className="px-3 py-2 text-gray-400 font-mono">
                                             {item.sku || item.itemId || idx + 1}
                                           </td>
                                           <td className="px-3 py-2 text-gray-100">
                                             {item.itemName || '—'}
                                           </td>
                                           <td className="px-3 py-2 text-right text-gray-200 font-mono">
                                             {item.quantity ?? '—'}
                                           </td>
                                         </tr>
                                       ))}
                                     </tbody>
                                   </table>
                                 </div>
                               </div>
                             );
                           }
                         }
                       } catch (e) {
                         // ignore parse errors
                       }
                       return null;
                     })()}

                     {/* --- REVIEW/APPROVAL MODE --- */}
                     {viewEvent.status === 'done_by_worker' || viewEvent.status === 'completed' ? (
                        <div className="mb-6 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                           <div className="flex items-center gap-2 text-yellow-500 mb-2">
                              <ShieldCheck className="w-5 h-5" />
                              <span className="font-bold text-sm">Completion Report</span>
                           </div>
                           <p className="text-xs text-gray-300 mb-4">
                              Worker marked this task as done. Please review the timeline and chat history before verifying.
                           </p>
                           
                           <div className="space-y-3 mb-4">
                              <div className="text-xs flex justify-between">
                                 <span className="text-gray-500">Assigned:</span>
                                 <span className="text-white">Nov {viewEvent.day}, 08:00</span>
                              </div>
                              <div className="text-xs flex justify-between">
                                 <span className="text-gray-500">Completed:</span>
                                 <span className="text-white">Nov {viewEvent.day}, 14:30</span>
                              </div>
                           </div>

                           <button 
                              onClick={() => approveAndArchiveTask(viewEvent.id)}
                              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-md text-xs flex items-center justify-center gap-2 transition-colors"
                           >
                              <CheckSquare className="w-4 h-4" />
                              Verify & Complete
                           </button>
                        </div>
                     ) : null}

                     {/* --- MEDIA FROM WORKER --- */}
                     {viewEvent.images && viewEvent.images.length > 0 && (
                       <div className="mb-6 bg-[#0D1117] border border-gray-700 rounded-lg p-4">
                         <h5 className="text-xs font-bold text-white mb-3">
                           Photos & Videos from worker
                         </h5>
                         <div className="grid grid-cols-3 gap-2">
                           {viewEvent.images.map((url, idx) => (
                             <a
                               key={idx}
                               href={url}
                               target="_blank"
                               rel="noreferrer"
                               className="block group"
                             >
                               <div className="aspect-video bg-black/40 rounded-lg overflow-hidden border border-gray-800 group-hover:border-blue-500 transition-colors flex items-center justify-center">
                                 <img
                                   src={url}
                                   className="w-full h-full object-cover"
                                   onError={(e) => {
                                     (e.target as HTMLImageElement).style.display = 'none';
                                   }}
                                 />
                               </div>
                             </a>
                           ))}
                         </div>
                       </div>
                     )}

                     <div className={`space-y-6 ${viewEvent.status === 'archived' ? 'opacity-60' : ''}`}>
                        <div>
                           <label className="text-xs text-gray-500 font-medium block mb-1">Date & Time</label>
                           <div className="flex items-center gap-2 text-white">
                              <CalendarIcon className="w-4 h-4 text-emerald-500" />
                              <span className="text-sm font-medium">Nov {viewEvent.day}, {selectedYear} • {viewEvent.time}</span>
                           </div>
                        </div>

                        <div>
                           <label className="text-xs text-gray-500 font-medium block mb-1">Assignee</label>
                           <div className="relative group">
                              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                  <User className="w-4 h-4 text-blue-500" />
                              </div>
                              <select 
                                  value={viewEvent.workerId || ''}
                                  onChange={async (e) => {
                                      const val = e.target.value;
                                      const newWorkerId = val === '' ? undefined : val;
                                      // Оновити статус: якщо призначається працівник і статус open/pending → assigned
                                      const newStatus = (newWorkerId && (viewEvent.status === 'open' || viewEvent.status === 'pending')) ? 'assigned' : viewEvent.status;
                                      
                                      try {
                                          // Update in database
                                          const updated = await tasksService.update(viewEvent.id, {
                                              workerId: newWorkerId,
                                              status: newStatus
                                          });
                                          
                                          // Find worker name for display
                                          const worker = workers.find(w => w.id === newWorkerId);
                                          const updatedWithName = {
                                              ...updated,
                                              assignee: worker?.name,
                                              assignedWorkerId: newWorkerId
                                          };
                                          
                                          onUpdateEvent(updatedWithName);
                                          setViewEvent(updatedWithName);
                                          
                                          // Notify other components
                                          window.dispatchEvent(new CustomEvent('taskUpdated'));
                                      } catch (error: any) {
                                          console.error('❌ Error updating task assignee:', error);
                                          alert(`Помилка оновлення завдання: ${error.message || 'Невідома помилка'}`);
                                      }
                                  }}
                                  disabled={viewEvent.status === 'archived' || viewEvent.status === 'verified' || loadingWorkers}
                                  className="w-full appearance-none bg-[#0D1117] border border-gray-700 hover:border-gray-500 rounded-lg py-2 pl-10 pr-8 text-sm text-white focus:border-emerald-500 focus:outline-none cursor-pointer transition-colors"
                              >
                                  <option value="">Unassigned</option>
                                  {workers
                                    .filter(w => 
                                      isAccountingCalendar 
                                        ? (w.department === 'accounting' || w.role === 'super_manager' || w.role === 'manager')
                                        : (w.department === 'facility' || w.role === 'super_manager' || w.role === 'manager')
                                    )
                                    .map(worker => (
                                      <option key={worker.id} value={worker.id}>
                                        {worker.name} {worker.role === 'manager' ? '(Manager)' : worker.role === 'super_manager' ? '(Super Admin)' : ''}
                                      </option>
                                  ))}
                              </select>
                              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none group-hover:text-white transition-colors" />
                           </div>
                        </div>

                        <div>
                             <label className="text-xs text-gray-500 font-medium block mb-1">Description</label>
                             <p className="text-sm text-gray-300 leading-relaxed">
                               {getReadableDescription(viewEvent.description) || "No additional description provided."}
                           </p>
                        </div>
                        
                        <div>
                           <label className="text-xs text-gray-500 font-medium block mb-1">Current Status</label>
                           <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border transition-colors border-gray-700 bg-gray-800 text-gray-300">
                              {viewEvent.status.toUpperCase()}
                           </div>
                        </div>
                     </div>
                  </div>

                  {/* Right: Task Chat */}
                  <div className="w-2/3 flex flex-col bg-[#0D1117]">
                     <div className="p-4 border-b border-gray-700 bg-[#161B22] flex items-center justify-between">
                        <div>
                           <h4 className="text-sm font-bold text-white">Task Chat</h4>
                           <p className="text-xs text-gray-500">Communication history</p>
                        </div>
                     </div>

                     {/* Messages Area */}
                     <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {taskMessages.map((msg) => (
                           <div key={msg.id} className={`flex ${msg.sender === 'admin' ? 'justify-end' : 'justify-start'}`}>
                              <div 
                                 className={`max-w-[75%] p-3 rounded-lg text-sm ${
                                    msg.sender === 'admin' 
                                       ? 'bg-[#005c4b] text-white rounded-tr-none' 
                                       : 'bg-[#202c33] text-gray-200 rounded-tl-none'
                                 }`}
                              >
                                 {msg.text}
                                 
                                 {msg.attachment && (
                                    <div className="mt-2 p-2 bg-black/20 rounded flex items-center gap-2">
                                       {msg.attachment.type === 'image' ? <ImageIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                                       <span className="text-xs underline truncate">{msg.attachment.name}</span>
                                    </div>
                                 )}

                                 <div className="text-[10px] text-white/50 text-right mt-1">
                                    {msg.timestamp}
                                 </div>
                              </div>
                           </div>
                        ))}
                        <div ref={chatEndRef} />
                     </div>

                     {/* Input Area - Disabled if Archived */}
                     <div className="p-3 bg-[#161B22] border-t border-gray-700">
                        {viewEvent.status === 'archived' ? (
                           <div className="text-center text-gray-500 text-xs py-2 flex items-center justify-center gap-2">
                              <Archive className="w-4 h-4" />
                              This task is archived. Chat is read-only.
                           </div>
                        ) : (
                           <div className="flex items-center gap-2">
                              <button 
                                 onClick={() => chatFileInputRef.current?.click()}
                                 className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-full transition-colors"
                              >
                                 <Paperclip className="w-5 h-5" />
                                 <input 
                                    type="file" 
                                    ref={chatFileInputRef} 
                                    className="hidden" 
                                    onChange={handleChatFile}
                                 />
                              </button>
                              <input 
                                 type="text" 
                                 value={chatInputValue}
                                 onChange={(e) => setChatInputValue(e.target.value)}
                                 onKeyDown={(e) => e.key === 'Enter' && handleChatSend()}
                                 placeholder="Type a message to the worker..."
                                 className="flex-1 bg-[#0D1117] border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                              />
                              <button 
                                 onClick={handleChatSend}
                                 disabled={!chatInputValue.trim()}
                                 className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                 <Send className="w-5 h-5" />
                              </button>
                           </div>
                        )}
                     </div>
                  </div>

               </div>
             </div>
          </div>
        )}

        {/* DAY SIDEBAR / DRAWER */}
        <div className={`
            fixed top-0 right-0 h-full w-full md:w-[450px] bg-[#0D1117] border-l border-gray-800 shadow-2xl z-[60] transform transition-transform duration-300 ease-in-out
            ${selectedDay !== null ? 'translate-x-0' : 'translate-x-full'}
        `}>
          {selectedDay !== null && (
            <div className="flex flex-col h-full">
              {/* Sidebar Header */}
              <div className="p-6 border-b border-gray-800 bg-[#161B22]">
                <div className="flex justify-between items-start mb-4">
                   <div>
                      <h2 className="text-2xl font-bold text-white">
                         {months[currentMonthIdx]} {selectedDay}
                      </h2>
                      <p className="text-gray-400 text-sm mt-1">{selectedYear} • {selectedDayEvents.length} Tasks</p>
                   </div>
                   <button 
                      onClick={(e) => { e.stopPropagation(); setSelectedDay(null); }}
                      className="p-2 bg-gray-800 hover:bg-gray-700 rounded-full text-white transition-colors"
                   >
                      <X className="w-6 h-6" />
                   </button>
                </div>

                {/* Sorting Buttons */}
                <div className="flex gap-2">
                   <button 
                      onClick={() => setSidebarSort('time')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-colors border ${sidebarSort === 'time' ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'bg-transparent border-gray-700 text-gray-400 hover:text-white'}`}
                   >
                      <Clock className="w-3 h-3" /> Time
                   </button>
                   <button 
                      onClick={() => setSidebarSort('type')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-colors border ${sidebarSort === 'type' ? 'bg-purple-500/20 border-purple-500 text-purple-400' : 'bg-transparent border-gray-700 text-gray-400 hover:text-white'}`}
                   >
                      <Layers className="w-3 h-3" /> Group
                   </button>
                </div>
              </div>

              {/* Sidebar Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                {sortedSidebarEvents.length > 0 ? (
                  sortedSidebarEvents.map((event) => (
                    <div 
                        key={event.id} 
                        onClick={(e) => handleEventClick(e, event)}
                        className={`
                          border rounded-lg p-3 transition-colors group flex items-center justify-between gap-4 shadow-sm hover:shadow-md cursor-pointer relative
                          ${event.status === 'archived' || event.status === 'verified' || event.status === 'completed'
                             ? 'bg-[#161B22]/50 border-gray-800 opacity-50 grayscale' 
                             : event.status === 'done_by_worker'
                                ? 'bg-[#161B22] border-yellow-500/50'
                                : `bg-[#161B22] ${getSidebarBorderClass(event.type as string)}`}
                        `}
                    >
                      {/* Unread Message Notification */}
                      {event.hasUnreadMessage && (
                        <div className="absolute -top-1.5 -right-1.5 bg-red-500 text-white p-1 rounded-full shadow-sm z-10 ring-2 ring-[#161B22]">
                           <Mail className="w-3 h-3" />
                        </div>
                      )}

                      {/* Content Left */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${getEventBadgeColor(event.type as string)}`}>
                                {event.type}
                            </span>
                            <div className="flex items-center gap-1 text-xs text-gray-400 font-mono">
                                <Clock className="w-3 h-3" />
                                <span>{event.isAllDay ? 'All Day' : event.time}</span>
                            </div>
                        </div>
                        <h3 className={`text-sm font-bold truncate ${event.status === 'archived' || event.status === 'completed' || event.status === 'verified' ? 'text-gray-500 line-through' : 'text-white'}`}>
                          {event.title}
                        </h3>
                         {event.status === 'done_by_worker' && (
                            <p className="text-xs text-yellow-500 mt-1 font-bold flex items-center gap-1">
                               <ShieldCheck className="w-3 h-3" /> Awaiting Verification
                            </p>
                         )}
                         {event.description && event.status !== 'done_by_worker' && (
                            <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                               {getReadableDescription(event.description)}
                            </p>
                         )}
                         {event.assignee && (
                            <div className="flex items-center gap-1 mt-2 text-xs text-gray-400">
                               <User className="w-3 h-3" />
                               <span>{event.assignee}</span>
                            </div>
                         )}
                      </div>

                      {/* Actions Right */}
                      <div className="flex items-center gap-1">
                         {event.status !== 'archived' && event.status !== 'verified' && event.status !== 'completed' && (
                             <button 
                                className={`
                                   p-2 rounded-lg transition-colors
                                   ${event.status === 'done_by_worker' 
                                     ? 'text-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20' 
                                     : 'text-gray-600 hover:text-emerald-500 hover:bg-emerald-500/10'}
                                `}
                                title={event.status === 'done_by_worker' ? "Waiting for verification" : "Mark as Done (Worker Action)"}
                                onClick={(e) => { e.stopPropagation(); markTaskAsReview(event.id); }}
                             >
                                {event.status === 'done_by_worker' ? <History className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                             </button>
                         )}
                         {(event.status === 'archived' || event.status === 'verified' || event.status === 'completed') && (
                             <Archive className="w-5 h-5 text-gray-600" />
                         )}
                         
                         <button className="p-2 text-gray-500 hover:text-white hover:bg-gray-700 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                            <MoreHorizontal className="w-5 h-5" />
                         </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-center border-2 border-dashed border-gray-800 rounded-xl bg-[#161B22]/50">
                    <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4">
                       <CalendarIcon className="w-8 h-8 text-gray-600" />
                    </div>
                    <h3 className="text-white font-bold mb-1">No tasks yet</h3>
                    <p className="text-gray-500 text-sm max-w-[200px]">Click + to add a task for this day.</p>
                  </div>
                )}
              </div>

              {/* Sidebar Footer */}
              <div className="p-6 border-t border-gray-800 bg-[#161B22]">
                <button 
                  onClick={(e) => {
                      if (selectedDay) openAddModal(e, selectedDay);
                  }}
                  className="w-full bg-[#0099FF] hover:bg-[#0088EE] text-white font-bold py-3 rounded-lg transition-colors shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Add New Task
                </button>
              </div>
            </div>
          )}
        </div>
        
        {/* Backdrop for Sidebar */}
        {selectedDay !== null && (
           <div 
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[55]"
              onClick={() => setSelectedDay(null)}
           />
        )}

      </div>
    </div>
  );
};

export default AdminCalendar;
