import React, { useState, useEffect } from 'react';
import { CalendarEvent, Property } from '../../types';
import { getTaskColor, getTaskBadgeColor, getTaskTextColor } from '../../utils/taskColors';
import { Clock, AlertTriangle, CheckCircle2, Circle, AlertCircle, Building2, Calendar } from 'lucide-react';
import { propertiesService } from '../../services/supabaseService';

function formatPropertyLabel(p: Property): string {
  const addr = p.address ?? p.fullAddress ?? (p as any).full_address ?? '—';
  return `${p.title} — ${addr}`;
}

function getDescriptionPreview(description: string | undefined): string {
  if (!description || !description.trim()) return '—';
  try {
    const parsed = JSON.parse(description);
    const text = parsed?.originalDescription ?? parsed?.description ?? description;
    return String(text).replace(/\r?\n/g, ' ').trim().slice(0, 120) || '—';
  } catch {
    return description.replace(/\r?\n/g, ' ').trim().slice(0, 120) || '—';
  }
}

interface KanbanTaskCardProps {
  task: CalendarEvent;
  onClick: () => void;
}

const KanbanTaskCard: React.FC<KanbanTaskCardProps> = ({ task, onClick }) => {
  const colorClass = getTaskColor(task.type);
  const badgeColor = getTaskBadgeColor(task.type);
  const textColor = getTaskTextColor(task.type);
  const [property, setProperty] = useState<Property | null>(null);

  // Load property (title + address) if propertyId exists
  useEffect(() => {
    if (task.propertyId) {
      propertiesService.getById(task.propertyId)
        .then(p => p && setProperty(p))
        .catch(err => console.error('Error loading property:', err));
    } else {
      setProperty(null);
    }
  }, [task.propertyId]);

  // Priority Icon
  const getPriorityIcon = () => {
    switch (task.priority) {
      case 'urgent': return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'high': return <AlertTriangle className="w-4 h-4 text-orange-500" />;
      case 'low': return <Circle className="w-3 h-3 text-green-500" />;
      default: return null; // Medium doesn't need icon
    }
  };

  const isCompleted = task.status === 'completed' || task.status === 'verified' || task.status === 'archived';

  return (
    <div 
      onClick={onClick}
      className={`
        group relative p-3 rounded-lg border transition-all cursor-pointer mb-3
        ${isCompleted 
          ? 'bg-[#1C1F24]/50 border-gray-700/50 opacity-60' 
          : 'bg-[#1C1F24] hover:bg-[#25282e] border-gray-800 hover:border-gray-700'
        }
        ${task.priority === 'urgent' && !isCompleted ? 'border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.1)]' : ''}
      `}
    >
      {/* Header: Priority & Time/Date */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {!isCompleted && getPriorityIcon()}
          <span className={`text-xs font-medium px-2 py-0.5 rounded border ${
            isCompleted ? 'border-gray-600 text-gray-500 bg-gray-800/30' : colorClass
          }`}>
            {task.type}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Creation Date */}
          {task.createdAt && (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Calendar className="w-3 h-3" />
              {new Date(task.createdAt).toLocaleDateString('uk-UA', { 
                day: '2-digit', 
                month: '2-digit',
                year: 'numeric'
              })}
            </div>
          )}
          {/* Time */}
          {task.time && (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Clock className="w-3 h-3" />
              {task.time}
            </div>
          )}
        </div>
      </div>

      {/* Title */}
      <h4 className={`text-sm font-medium mb-1 line-clamp-2 transition-colors ${
        isCompleted 
          ? 'text-gray-500 line-through' 
          : `${textColor} group-hover:opacity-80`
      }`}>
        {task.title}
      </h4>

      {/* Description preview */}
      <p className="text-[10px] text-gray-500 line-clamp-2 mb-1.5 min-h-[1.25rem]">
        {getDescriptionPreview(task.description)}
      </p>

      {/* Property / Location */}
      {(task.locationText || property || task.propertyId) && (
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
          <Building2 className="w-3 h-3 shrink-0" />
          <span className="truncate max-w-[180px]">
            {task.locationText || (property ? formatPropertyLabel(property) : (task.propertyId ? 'Property #' + task.propertyId : ''))}
          </span>
        </div>
      )}

      {/* Footer: Status & Assigned badge */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-800/50">
        <div className="flex items-center gap-1.5">
          {task.status === 'completed' || task.status === 'verified' ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          ) : (
            <div className={`w-2 h-2 rounded-full ${
              task.status === 'in_progress' ? 'bg-blue-500' :
              task.status === 'review' ? 'bg-yellow-500' :
              'bg-gray-600'
            }`} />
          )}
          <span className="text-[10px] text-gray-500 capitalize">{task.status.replace('_', ' ')}</span>
          {/* Assigned: green when worker assigned, gray when not */}
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
            (task.workerId ?? task.assignedWorkerId) ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-700/50 text-gray-500'
          }`}>
            {(task.workerId ?? task.assignedWorkerId) ? 'Assigned' : 'Unassigned'}
          </span>
        </div>
        
        {/* Issue Indicator */}
        {task.isIssue && (
          <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
            ISSUE
          </span>
        )}
      </div>
    </div>
  );
};

export default KanbanTaskCard;

