import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, User, CheckCircle2, Circle, Building2, Wrench, Check, Image as ImageIcon, FileVideo, Zap, Droplets, Flame, ClipboardList } from 'lucide-react';
import { tasksService, workersService, propertiesService } from '../../services/supabaseService';
import { CalendarEvent, TaskStatus, Property, Worker } from '../../types';
import { getTaskColor } from '../../utils/taskColors';
import { createClient } from '../../utils/supabase/client';
import { useWorker } from '../../contexts/WorkerContext';

interface TaskDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: CalendarEvent | null;
  onUpdateTask: (task: CalendarEvent) => void;
  onDeleteTask?: (taskId: string) => void;
  currentUser?: Worker | null;
}

const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  isOpen,
  onClose,
  task,
  onUpdateTask,
  onDeleteTask,
  currentUser: propCurrentUser
}) => {
  const { worker: contextWorker } = useWorker();
  const currentUser = propCurrentUser || contextWorker;
  const isWorker = currentUser?.role === 'worker';
  
  const [property, setProperty] = useState<Property | null>(null);
  const [assignee, setAssignee] = useState<Worker | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [checklist, setChecklist] = useState(task?.checklist || []);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [media, setMedia] = useState<string[]>(task?.images || []);

  useEffect(() => {
    if (isOpen && task) {
      loadTaskDetails();
    }
  }, [isOpen, task]);

  useEffect(() => {
    if (task?.checklist) {
      setChecklist(task.checklist);
    } else {
      setChecklist([]);
    }
    if (task?.images) {
      setMedia(task.images);
    } else {
      setMedia([]);
    }
  }, [task]);

  const loadTaskDetails = async () => {
    if (!task) return;

    try {
      if (task.propertyId) {
        const prop = await propertiesService.getById(task.propertyId);
        setProperty(prop);
      }
      if (task.workerId) {
        const worker = await workersService.getById(task.workerId);
        setAssignee(worker);
      }
    } catch (error) {
      console.error('Error loading task details:', error);
    }
  };

  const handleStatusChange = async (newStatus: TaskStatus) => {
    if (!task || isUpdating) return;

    try {
      setIsUpdating(true);
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(task.id)) {
        console.error('❌ Task ID is not a valid UUID:', task.id);
        alert('Помилка: ID завдання невалідний. Будь ласка, оновіть сторінку.');
        return;
      }
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskDetailModal.tsx:86',message:'H1: BEFORE status update',data:{taskId:task.id,taskDate:task.date,taskDay:task.day,newStatus},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      
      // Preserve date and day to prevent loss when updating status
      const updatedTask = await tasksService.update(task.id, { 
        status: newStatus,
        date: task.date,
        day: task.day
      });
      
      // Ensure date and day are preserved in the returned object
      const updatedWithDate = {
        ...updatedTask,
        date: updatedTask.date || task.date,
        day: updatedTask.day !== undefined ? updatedTask.day : task.day
      };
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskDetailModal.tsx:100',message:'H1: AFTER status update',data:{taskId:updatedWithDate.id,updatedDate:updatedWithDate.date,updatedDay:updatedWithDate.day,newStatus},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      
      onUpdateTask(updatedWithDate);
      window.dispatchEvent(new CustomEvent('taskUpdated'));
    } catch (error) {
      console.error('Error updating task status:', error);
      alert('Помилка оновлення статусу завдання. Спробуйте ще раз.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleChecklistToggle = async (index: number) => {
    if (!task) return;
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(task.id)) {
      console.error('❌ Task ID is not a valid UUID:', task.id);
      alert('Помилка: ID завдання невалідний. Будь ласка, оновіть сторінку.');
      return;
    }
    
    try {
      const updated = checklist.map((item, i) =>
        i === index ? { ...item, checked: !item.checked } : item
      );
      setChecklist(updated);
      const updatedTask = await tasksService.update(task.id, { checklist: updated });
      onUpdateTask(updatedTask);
      window.dispatchEvent(new CustomEvent('taskUpdated'));
    } catch (error) {
      console.error('Error updating checklist:', error);
      alert('Помилка оновлення чеклисту. Спробуйте ще раз.');
    }
  };

  const handleMeterReadingChange = async (field: 'electricity' | 'water' | 'gas', value: string) => {
    if (!task) return;
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(task.id)) {
      console.error('❌ Task ID is not a valid UUID:', task.id);
      alert('Помилка: ID завдання невалідний. Будь ласка, оновіть сторінку.');
      return;
    }
    
    try {
      const updatedReadings = { ...task.meterReadings, [field]: value };
      const updatedTask = await tasksService.update(task.id, { meterReadings: updatedReadings });
      onUpdateTask(updatedTask);
      window.dispatchEvent(new CustomEvent('taskUpdated'));
    } catch (error) {
      console.error('Error updating meter readings:', error);
      alert('Помилка оновлення лічильників. Спробуйте ще раз.');
    }
  };

  const handleMediaUpload = async (files: FileList | null) => {
    if (!files || !task) return;
    const supabase = createClient();
    if (!supabase) return;

    setIsUploadingMedia(true);

    try {
      const uploadedUrls: string[] = [];

      for (const file of Array.from(files)) {
        const filePath = `task-media/${task.id}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase
          .storage
          .from('task-media')
          .upload(filePath, file);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          continue;
        }

        const { data } = supabase
          .storage
          .from('task-media')
          .getPublicUrl(filePath);

        if (data?.publicUrl) {
          uploadedUrls.push(data.publicUrl);
        }
      }

      if (uploadedUrls.length > 0) {
        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(task.id)) {
          console.error('❌ Task ID is not a valid UUID:', task.id);
          alert('Помилка: ID завдання невалідний. Будь ласка, оновіть сторінку.');
          return;
        }
        
        const updatedImages = [...(task.images || []), ...uploadedUrls];
        const updatedTask = await tasksService.update(task.id, { images: updatedImages });
        setMedia(updatedImages);
        onUpdateTask(updatedTask);
        window.dispatchEvent(new CustomEvent('taskUpdated'));
      }
    } catch (error) {
      console.error('Error uploading media:', error);
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const getStatusColor = (status: TaskStatus): string => {
    switch (status) {
      case 'pending':
        return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30';
      case 'in_progress':
        return 'text-blue-400 bg-blue-400/10 border-blue-400/30';
      case 'completed':
        return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30';
      case 'verified':
        return 'text-green-400 bg-green-400/10 border-green-400/30';
      case 'done_by_worker':
        return 'text-orange-400 bg-orange-400/10 border-orange-400/30';
      default:
        return 'text-gray-400 bg-gray-400/10 border-gray-400/30';
    }
  };

  const getStatusButton = (status: TaskStatus, label: string, icon: React.ReactNode) => {
    const isActive = task?.status === status;
    const isCompleted = status === 'completed';
    
    return (
      <button
        onClick={() => handleStatusChange(status)}
        disabled={isUpdating || isActive}
        className={`
          flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-all
          ${isActive 
            ? 'bg-blue-500/20 border-blue-500 text-blue-400 cursor-not-allowed' 
            : isCompleted
            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 hover:border-emerald-400 hover:bg-emerald-500/30'
            : 'bg-[#1C1F24] border-gray-700 text-gray-300 hover:border-blue-500 hover:text-blue-400'
          }
          ${isUpdating ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        {icon}
        <span>{label}</span>
      </button>
    );
  };

  if (!isOpen || !task) return null;

  const colorClass = getTaskColor(task.type);
  let parsedDescription: any = null;
  let displayDescription = task.description || 'No description';

  // Парсимо JSON, якщо це transfer task, показуємо зрозумілий текст
  try {
    if (task.description) {
      parsedDescription = JSON.parse(task.description);
      // Якщо це transfer task, показуємо originalDescription
      if (parsedDescription?.action === 'transfer_inventory' && parsedDescription.originalDescription) {
        displayDescription = parsedDescription.originalDescription;
      } else if (parsedDescription?.originalDescription) {
        displayDescription = parsedDescription.originalDescription;
      }
      // Якщо не знайшли originalDescription, залишаємо як є (може бути інший формат JSON)
    }
  } catch (e) {
    // Не JSON, використовуємо як є
    displayDescription = task.description || 'No description';
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#16181D] rounded-xl border border-gray-800 w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <span className={`text-xs font-medium px-2 py-1 rounded border ${colorClass}`}>
              {task.type}
            </span>
            <h2 className="text-lg font-bold text-white">{task.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-4">
            {/* Worker Action Card */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Wrench className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-semibold text-white">Worker Action</h3>
              </div>
              <p className="text-xs text-gray-400 mb-3">
                Change task status to mark progress
              </p>
              <div className="flex flex-wrap gap-2">
                {!isWorker && getStatusButton('in_progress', 'In Progress', <Circle className="w-3 h-3" />)}
                {getStatusButton('completed', 'Mark as Done', <CheckCircle2 className="w-3 h-3" />)}
                {getStatusButton('verified', 'Verified', <Check className="w-3 h-3" />)}
              </div>
              {/* Media upload for worker */}
              <div className="mt-3 border-t border-blue-500/20 pt-3">
                <label className="text-[10px] text-gray-300 mb-1 block">
                  Attach photos / videos
                </label>
                <input
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  disabled={isUploadingMedia}
                  onChange={(e) => handleMediaUpload(e.target.files)}
                  className="text-[10px] text-gray-400"
                />
                {isUploadingMedia && (
                  <p className="text-[10px] text-blue-300 mt-1">Uploading...</p>
                )}
              </div>
            </div>

            {/* Date & Time */}
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Calendar className="w-4 h-4" />
              <span>
                {task.date ? new Date(task.date).toLocaleDateString('uk-UA', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric'
                }) : 'No date'}
                {task.time && ` • ${task.time}`}
              </span>
            </div>

            {/* Assignee */}
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <User className="w-4 h-4" />
              <span>{assignee?.name || task.assignee || 'Unassigned'}</span>
              {assignee?.role && (
                <span className="text-xs text-gray-500">({assignee.role})</span>
              )}
            </div>

            {/* Property */}
            {property && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Building2 className="w-4 h-4" />
                <span>{property.title}</span>
              </div>
            )}

            {/* Description */}
            <div>
              <h3 className="text-xs font-semibold text-gray-400 mb-2">Description</h3>
              <div className="bg-[#1C1F24] rounded-lg p-3 border border-gray-800">
                <p className="text-sm text-gray-300 whitespace-pre-wrap">
                  {displayDescription}
                </p>
                {/* Приховано Transfer Data JSON - він не потрібен для відображення */}
              </div>
            </div>

            {/* Inventory to Transfer (for transfer_inventory tasks) */}
            {parsedDescription?.action === 'transfer_inventory' && Array.isArray(parsedDescription.transferData) && (
              <div>
                <h3 className="text-xs font-semibold text-gray-400 mb-2">
                  Inventory to transfer
                </h3>
                <div className="bg-[#1C1F24] rounded-lg border border-gray-800 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-[#111319] text-gray-400">
                      <tr>
                        <th className="px-3 py-2 text-left">Item</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Price</th>
                        <th className="px-3 py-2 text-left">SKU</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {parsedDescription.transferData.map((item: any, idx: number) => (
                        <tr key={idx} className="hover:bg-[#1E2027]">
                          <td className="px-3 py-2 text-gray-100">
                            {item.itemName || '—'}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-200 font-mono">
                            {item.quantity ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-300 font-mono">
                            {item.unitPrice != null ? `€${Number(item.unitPrice).toFixed(2)}` : '—'}
                          </td>
                          <td className="px-3 py-2 text-gray-400">
                            {item.sku || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Meter Readings Checklist (Only for Einzug/Auszug/Zählerstand) - Only for workers */}
            {isWorker && (task.type === 'Einzug' || task.type === 'Auszug' || task.type === 'Zählerstand') && (
              <div>
                <h3 className="text-xs font-semibold text-gray-400 mb-2 flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-emerald-500" />
                  Checklist: Meter Readings
                </h3>
                <div className="bg-[#1C1F24] rounded-lg p-3 border border-gray-800 space-y-3">
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 mb-1 flex items-center gap-1">
                      <Zap className="w-3 h-3 text-yellow-500" /> Electricity (kWh)
                    </label>
                    <input 
                      type="text" 
                      className="w-full bg-[#0D1117] border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                      placeholder="e.g. 12345"
                      disabled={task.status === 'archived' || task.status === 'verified'}
                      value={task.meterReadings?.electricity || ''}
                      onChange={(e) => handleMeterReadingChange('electricity', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 mb-1 flex items-center gap-1">
                      <Droplets className="w-3 h-3 text-blue-500" /> Water (m³)
                    </label>
                    <input 
                      type="text" 
                      className="w-full bg-[#0D1117] border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                      placeholder="e.g. 543"
                      disabled={task.status === 'archived' || task.status === 'verified'}
                      value={task.meterReadings?.water || ''}
                      onChange={(e) => handleMeterReadingChange('water', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 mb-1 flex items-center gap-1">
                      <Flame className="w-3 h-3 text-orange-500" /> Gas (m³)
                    </label>
                    <input 
                      type="text" 
                      className="w-full bg-[#0D1117] border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                      placeholder="e.g. 890"
                      disabled={task.status === 'archived' || task.status === 'verified'}
                      value={task.meterReadings?.gas || ''}
                      onChange={(e) => handleMeterReadingChange('gas', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Worker checklist based on transfer items */}
            {checklist && checklist.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-400 mb-2">
                  Worker checklist
                </h3>
                <div className="bg-[#1C1F24] rounded-lg p-3 border border-gray-800 space-y-2">
                  {checklist.map((item: any, idx: number) => (
                    <label
                      key={idx}
                      className="flex items-center gap-2 text-xs text-gray-200 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="h-3 w-3 rounded border-gray-600 bg-transparent text-emerald-500"
                        checked={!!item.checked}
                        onChange={() => handleChecklistToggle(idx)}
                      />
                      <span className={item.checked ? 'line-through text-gray-500' : ''}>
                        {item.text}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Media gallery */}
            {media && media.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-400 mb-2">Photos & Videos</h3>
                <div className="grid grid-cols-3 gap-2">
                  {media.map((url, idx) => (
                    <a
                      key={idx}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="block group"
                    >
                      <div className="aspect-video bg-black/40 rounded-lg overflow-hidden border border-gray-800 group-hover:border-blue-500 transition-colors flex items-center justify-center">
                        {/* Простий прев'ю: пробуємо як зображення; якщо не вдалось – показуємо іконку відео */}
                        <img
                          src={url}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                        {/* Overlay icons (не обов'язково, але красиво) */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 transition-opacity">
                          {url.match(/\\.mp4$|\\.mov$|\\.webm$/i) ? (
                            <FileVideo className="w-6 h-6 text-white" />
                          ) : (
                            <ImageIcon className="w-6 h-6 text-white" />
                          )}
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Status */}
            <div>
              <h3 className="text-xs font-semibold text-gray-400 mb-2">Status</h3>
              <div className="flex items-center gap-2">
                {task.status === 'completed' || task.status === 'verified' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Circle className="w-4 h-4 text-gray-500" />
                )}
                <span className={`text-sm capitalize px-2 py-1 rounded border ${getStatusColor(task.status)}`}>
                  {task.status.replace('_', ' ')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskDetailModal;

