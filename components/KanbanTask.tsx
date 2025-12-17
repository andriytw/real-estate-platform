import React from 'react';
import { CalendarEvent } from '../types';
import { getTaskColor, getTaskBadgeColor } from '../utils/taskColors';
import { Clock, MapPin } from 'lucide-react';

interface KanbanTaskProps {
  event: CalendarEvent;
  onDragStart: (e: React.DragEvent) => void;
}

export default function KanbanTask({ event, onDragStart }: KanbanTaskProps) {
  const colorClasses = getTaskColor(event.type);
  const borderColor = getTaskBadgeColor(event.type);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={`p-3 bg-[#0D1117] border-l-4 ${borderColor} rounded cursor-move hover:bg-[#161B22] transition-colors`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-white text-sm mb-1 truncate">
            {event.title}
          </h4>
          {event.description && (
            <p className="text-xs text-gray-400 line-clamp-2 mb-2">
              {event.description}
            </p>
          )}
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {event.time && (
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>{event.time}</span>
              </div>
            )}
            {event.propertyId && (
              <div className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                <span>Property</span>
              </div>
            )}
          </div>
        </div>
        <div className={`px-2 py-0.5 rounded text-xs font-medium ${colorClasses.split(' ')[2]}`}>
          {event.type}
        </div>
      </div>
    </div>
  );
}



