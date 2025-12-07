import React from 'react';
import { CalendarEvent } from '../../types';
import { getTaskColor, getTaskBadgeColor } from '../../utils/taskColors';
import { Clock, AlertTriangle, CheckCircle2, Circle, AlertCircle, Building2 } from 'lucide-react';

interface KanbanTaskCardProps {
  task: CalendarEvent;
  onClick: () => void;
}

const KanbanTaskCard: React.FC<KanbanTaskCardProps> = ({ task, onClick }) => {
  const colorClass = getTaskColor(task.type);
  const badgeColor = getTaskBadgeColor(task.type);

  // Priority Icon
  const getPriorityIcon = () => {
    switch (task.priority) {
      case 'urgent': return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'high': return <AlertTriangle className="w-4 h-4 text-orange-500" />;
      case 'low': return <Circle className="w-3 h-3 text-green-500" />;
      default: return null; // Medium doesn't need icon
    }
  };

  return (
    <div 
      onClick={onClick}
      className={`
        group relative p-3 rounded-lg border bg-[#1C1F24] hover:bg-[#25282e] transition-all cursor-pointer mb-3
        ${task.priority === 'urgent' ? 'border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.1)]' : 'border-gray-800 hover:border-gray-700'}
      `}
    >
      {/* Header: Priority & Time */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {getPriorityIcon()}
          <span className={`text-xs font-medium px-2 py-0.5 rounded border ${colorClass}`}>
            {task.type}
          </span>
        </div>
        {task.time && (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Clock className="w-3 h-3" />
            {task.time}
          </div>
        )}
      </div>

      {/* Title */}
      <h4 className="text-sm font-medium text-white mb-1 line-clamp-2 group-hover:text-blue-400 transition-colors">
        {task.title}
      </h4>

      {/* Property / Location */}
      {(task.propertyId || task.locationText) && (
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
          <Building2 className="w-3 h-3" />
          <span className="truncate max-w-[180px]">
            {task.locationText || 'Property #' + task.propertyId} 
            {/* Ideally we should look up property name, but we only have ID here. 
                Usually data is joined or we pass property name. 
                For now, assume title contains property name or we rely on ID.
                Or we fetch property name in parent. 
                Actually calendar_events usually have 'title' as property name in current logic.
            */}
          </span>
        </div>
      )}

      {/* Footer: Status & Assignee Avatar (if in backlog) */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-800/50">
        {/* Status */}
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

