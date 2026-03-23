import React, { useState, useEffect, useMemo } from 'react';
import KanbanBoard from './kanban/KanbanBoard';
import { useWorker } from '../contexts/WorkerContext';
import { canViewModule, canAccessDepartment } from '../lib/permissions';

type DepartmentTab = 'facility' | 'accounting' | 'sales';

export default function AdminTasksBoard() {
  const { worker } = useWorker();
  const [activeDepartment, setActiveDepartment] = useState<DepartmentTab>('facility');

  const departments = useMemo(() => {
    const all: { id: DepartmentTab; label: string }[] = [
      { id: 'facility', label: 'Facility Management' },
      { id: 'accounting', label: 'Accounting' },
      { id: 'sales', label: 'Sales' },
    ];
    if (!worker) return all;
    return all.filter((d) => canAccessDepartment(worker, d.id));
  }, [worker]);

  useEffect(() => {
    if (departments.length === 0) return;
    if (!departments.some((d) => d.id === activeDepartment)) {
      setActiveDepartment(departments[0].id);
    }
  }, [departments, activeDepartment]);

  if (!worker || !canViewModule(worker, 'tasks')) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
        <div className="text-white text-xl text-center">Немає доступу до цього розділу.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Team Board - All Departments</h1>
          <p className="text-gray-400">Перегляд та управління завданнями всіх відділів</p>
        </div>

        {/* Department Tabs */}
        <div className="mb-6 flex gap-2 border-b border-gray-700">
          {departments.map((dept) => (
            <button
              key={dept.id}
              onClick={() => setActiveDepartment(dept.id)}
              className={`px-6 py-3 font-semibold transition-colors border-b-2 ${
                activeDepartment === dept.id
                  ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                  : 'border-transparent text-gray-400 hover:text-white hover:border-gray-600'
              }`}
            >
              {dept.label}
            </button>
          ))}
        </div>

        {/* Kanban Board for Active Department */}
        <div className="bg-gray-800 rounded-lg p-6">
          <KanbanBoard />
          {/* Note: New KanbanBoard has internal department filter, 
              but AdminTasksBoard tabs are kept for UI consistency */}
        </div>
      </div>
    </div>
  );
}

