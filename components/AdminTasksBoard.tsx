import React, { useState, useEffect } from 'react';
import KanbanBoard from './KanbanBoard';
import { useWorker } from '../contexts/WorkerContext';

type DepartmentTab = 'facility' | 'accounting' | 'sales';

export default function AdminTasksBoard() {
  const { worker, isAdmin } = useWorker();
  const [activeDepartment, setActiveDepartment] = useState<DepartmentTab>('facility');

  // Redirect if not admin
  useEffect(() => {
    if (worker && !isAdmin) {
      window.location.href = '/dashboard';
    }
  }, [worker, isAdmin]);

  if (!worker || !isAdmin) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Доступ заборонено. Потрібні права адміністратора.</div>
      </div>
    );
  }

  const departments: { id: DepartmentTab; label: string }[] = [
    { id: 'facility', label: 'Facility Management' },
    { id: 'accounting', label: 'Accounting' },
    { id: 'sales', label: 'Sales' }
  ];

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
          <KanbanBoard department={activeDepartment} />
        </div>
      </div>
    </div>
  );
}

