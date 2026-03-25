import React, { useState, useEffect } from 'react';
import { CalendarEvent, Property } from '../../types';
import { getTaskColor, getTaskBadgeColor, getTaskTextColor } from '../../utils/taskColors';
import { AlertTriangle, CheckCircle2, Circle, AlertCircle, Building2, Calendar } from 'lucide-react';
import { propertiesService } from '../../services/supabaseService';
import { getFacilityTaskPrimaryLine } from '../../lib/facilityTaskCardDisplay';

function formatPropertyLabelAddressFirst(p: Property): string {
  const address = p.address ?? p.fullAddress ?? (p as any).full_address ?? '—';
  const title = p.title ?? '—';
  return `${address} — ${title}`;
}

function normalize(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
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

  const propLabel = property ? formatPropertyLabelAddressFirst(property) : null;
  const titleNorm = normalize(task.title ?? '');
  const unitNorm = property ? normalize(property.title ?? '') : null;
  const titleEqualsUnit = Boolean(property && titleNorm && titleNorm === unitNorm);
  const isExplicitFacilityTask = task.department === 'facility';

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
          <span className={`text-xs font-medium px-2 py-0.5 rounded border whitespace-nowrap max-w-[100px] truncate ${
            isCompleted ? 'border-gray-600 text-gray-500 bg-gray-800/30' : colorClass
          }`} title={task.type}>
            {task.type}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Scheduled / execution date (same as Task modal); fallback to created_at */}
          {(task.date || task.createdAt) && (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Calendar className="w-3 h-3" />
              {new Date(task.date || task.createdAt!).toLocaleDateString('uk-UA', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
              })}
              {task.time && ` • ${task.time}`}
            </div>
          )}
        </div>
      </div>

      {/* Title */}
      {isExplicitFacilityTask ? (
        <div className="mb-1 min-w-0">
          <h4
            className={`text-sm font-medium min-w-0 truncate transition-colors ${
              isCompleted ? 'text-gray-500 line-through' : `${textColor} group-hover:opacity-80`
            }`}
          >
            {getFacilityTaskPrimaryLine(task, property)}
          </h4>
          {propLabel && (
            <p className="text-xs text-gray-400 truncate mt-0.5 min-w-0">{propLabel}</p>
          )}
        </div>
      ) : titleEqualsUnit ? (
        <h4 className={`text-sm font-medium mb-1 min-w-0 truncate transition-colors ${
          isCompleted ? 'text-gray-500 line-through' : `${textColor} group-hover:opacity-80`
        }`}>
          {propLabel}
        </h4>
      ) : (
        <div className="mb-1 min-w-0">
          <h4 className={`text-sm font-medium min-w-0 truncate transition-colors ${
            isCompleted ? 'text-gray-500 line-through' : `${textColor} group-hover:opacity-80`
          }`}>
            {task.title}
          </h4>
          {propLabel && (
            <p className="text-xs text-gray-400 truncate mt-0.5 min-w-0">
              {propLabel}
            </p>
          )}
        </div>
      )}

      {/* Description preview */}
      <p className="text-[10px] text-gray-500 line-clamp-2 mb-1.5 min-h-[1.25rem]">
        {getDescriptionPreview(task.description)}
      </p>

      {/* Property / Location — only when no property (fallback) and not duplicating title */}
      {!isExplicitFacilityTask && !titleEqualsUnit && !property && (task.locationText || task.propertyId) &&
        normalize(task.locationText ?? '') !== titleNorm && (
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
          <Building2 className="w-3 h-3 shrink-0" />
          <span className="truncate max-w-[180px] min-w-0">
            {task.locationText || (task.propertyId ? 'Property #' + task.propertyId : '')}
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

