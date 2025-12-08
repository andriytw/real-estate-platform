import React, { useState, useEffect } from 'react';
import { usersService } from '../../services/supabaseService';
import { Worker, CategoryAccess } from '../../types';
import { Plus, Trash2, Save, X, User, Mail, Shield, Building2, CheckSquare, Square, Edit } from 'lucide-react';

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editedUser, setEditedUser] = useState<Partial<Worker> | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    firstName: '',
    lastName: '',
    email: '',
    role: 'worker' as 'super_manager' | 'manager' | 'worker',
    department: 'facility' as 'facility' | 'accounting' | 'sales' | 'general',
    categoryAccess: ['properties', 'facility', 'accounting', 'sales', 'tasks'] as CategoryAccess[]
  });

  const allCategories: CategoryAccess[] = ['properties', 'facility', 'accounting', 'sales', 'tasks'];
  const categoryLabels: Record<CategoryAccess, string> = {
    properties: 'Properties',
    facility: 'Facility',
    accounting: 'Accounting',
    sales: 'Sales Department',
    tasks: 'Tasks'
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const allUsers = await usersService.getAll();
      setUsers(allUsers);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (user: Worker) => {
    setEditingUser(user.id);
    setEditedUser({
      role: user.role,
      department: user.department,
      categoryAccess: user.categoryAccess || allCategories,
      firstName: user.firstName,
      lastName: user.lastName
    });
  };

  const handleSave = async (userId: string) => {
    if (!editedUser) return;
    
    try {
      await usersService.update(userId, {
        role: editedUser.role,
        department: editedUser.department,
        categoryAccess: editedUser.categoryAccess,
        firstName: editedUser.firstName,
        lastName: editedUser.lastName
      });
      await loadUsers(); // Reload to get updated data
      
      // Trigger workers list refresh in KanbanBoard
      window.dispatchEvent(new CustomEvent('workersUpdated'));
      
      setEditingUser(null);
      setEditedUser(null);
    } catch (error) {
      console.error('Error updating user:', error);
      alert('Помилка оновлення користувача');
    }
  };

  const handleCancel = () => {
    setEditingUser(null);
    setEditedUser(null);
  };

  const handleDeactivate = async (userId: string) => {
    if (!window.confirm('Ви впевнені, що хочете деактивувати цього користувача? Він не зможе ввійти в систему.')) {
      return;
    }

    try {
      await usersService.deactivate(userId);
      await loadUsers();
    } catch (error) {
      console.error('Error deactivating user:', error);
      alert('Помилка деактивації користувача');
    }
  };

  const handleCreateUser = async () => {
    if (!newUser.firstName || !newUser.lastName || !newUser.email) {
      alert('Будь ласка, заповніть всі обов\'язкові поля');
      return;
    }

    try {
      await usersService.create(newUser);
      await loadUsers(); // Reload to show new user
      setIsCreateModalOpen(false);
      setNewUser({
        firstName: '',
        lastName: '',
        email: '',
        role: 'worker',
        department: 'facility',
        categoryAccess: ['properties', 'facility', 'accounting', 'sales', 'tasks']
      });
      alert('Користувача створено! Користувач з\'явиться в списку Kanban дошки. Користувач може використати "Забули пароль?" для встановлення пароля.');
    } catch (error: any) {
      console.error('Error creating user:', error);
      alert(`Помилка створення користувача: ${error.message || 'Невідома помилка'}`);
    }
  };

  const toggleCategory = (category: CategoryAccess, isNewUser: boolean = false) => {
    if (isNewUser) {
      setNewUser(prev => ({
        ...prev,
        categoryAccess: prev.categoryAccess.includes(category)
          ? prev.categoryAccess.filter(c => c !== category)
          : [...prev.categoryAccess, category]
      }));
    } else if (editedUser) {
      setEditedUser(prev => ({
        ...prev,
        categoryAccess: prev.categoryAccess?.includes(category)
          ? prev.categoryAccess.filter(c => c !== category)
          : [...(prev.categoryAccess || []), category]
      }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Завантаження користувачів...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Управління користувачами</h2>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Створити користувача
        </button>
      </div>

      {/* Users Table */}
      <div className="bg-[#1C1F24] rounded-lg border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#111315] border-b border-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Користувач</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Роль</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Департамент</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Доступ до категорій</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Дії</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {users.map(user => (
                <tr key={user.id} className={`hover:bg-gray-800/50 ${!user.isActive ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
                        <User className="w-4 h-4 text-gray-400" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">
                          {user.firstName && user.lastName 
                            ? `${user.firstName} ${user.lastName}` 
                            : user.name}
                        </div>
                        <div className="text-xs text-gray-500">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {editingUser === user.id ? (
                      <select
                        value={editedUser?.role || user.role}
                        onChange={(e) => setEditedUser(prev => ({ ...prev, role: e.target.value as any }))}
                        className="bg-[#0D0F11] border border-gray-700 rounded px-2 py-1 text-sm text-white"
                      >
                        <option value="worker">Працівник</option>
                        <option value="manager">Менеджер</option>
                        <option value="super_manager">Адмін</option>
                      </select>
                    ) : (
                      <span className="text-sm text-gray-300">
                        {user.role === 'super_manager' ? 'Адмін' : user.role === 'manager' ? 'Менеджер' : 'Працівник'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingUser === user.id ? (
                      <select
                        value={editedUser?.department || user.department}
                        onChange={(e) => setEditedUser(prev => ({ ...prev, department: e.target.value as any }))}
                        className="bg-[#0D0F11] border border-gray-700 rounded px-2 py-1 text-sm text-white"
                      >
                        <option value="facility">Facility</option>
                        <option value="accounting">Accounting</option>
                        <option value="sales">Sales</option>
                        <option value="general">General</option>
                      </select>
                    ) : (
                      <span className="text-sm text-gray-300 capitalize">{user.department}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingUser === user.id ? (
                      <div className="flex flex-wrap gap-2">
                        {allCategories.map(category => (
                          <label key={category} className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editedUser?.categoryAccess?.includes(category) || false}
                              onChange={() => toggleCategory(category)}
                              className="w-4 h-4 rounded border-gray-600 bg-[#0D0F11] text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className="text-xs text-gray-400">{categoryLabels[category]}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {(user.categoryAccess || allCategories).map(category => (
                          <span
                            key={category}
                            className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded border border-blue-500/30"
                          >
                            {categoryLabels[category]}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {editingUser === user.id ? (
                        <>
                          <button
                            onClick={() => handleSave(user.id)}
                            className="p-1.5 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors"
                            title="Зберегти"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button
                            onClick={handleCancel}
                            className="p-1.5 rounded bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                            title="Скасувати"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleEdit(user)}
                            className="p-1.5 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/30 transition-colors"
                            title="Редагувати"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeactivate(user.id)}
                            className="p-1.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 transition-colors"
                            title="Деактивувати"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create User Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1C1F24] w-full max-w-md rounded-xl border border-gray-800 shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-[#111315]">
              <h2 className="text-lg font-semibold text-white">Створити користувача</h2>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">Ім'я *</label>
                <input
                  type="text"
                  value={newUser.firstName}
                  onChange={(e) => setNewUser(prev => ({ ...prev, firstName: e.target.value }))}
                  className="w-full bg-[#0D0F11] border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  placeholder="Введіть ім'я"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">Прізвище *</label>
                <input
                  type="text"
                  value={newUser.lastName}
                  onChange={(e) => setNewUser(prev => ({ ...prev, lastName: e.target.value }))}
                  className="w-full bg-[#0D0F11] border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  placeholder="Введіть прізвище"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">Email *</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full bg-[#0D0F11] border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  placeholder="user@example.com"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">Роль</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser(prev => ({ ...prev, role: e.target.value as any }))}
                  className="w-full bg-[#0D0F11] border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="worker">Працівник</option>
                  <option value="manager">Менеджер</option>
                  <option value="super_manager">Адмін</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">Департамент</label>
                <select
                  value={newUser.department}
                  onChange={(e) => setNewUser(prev => ({ ...prev, department: e.target.value as any }))}
                  className="w-full bg-[#0D0F11] border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="facility">Facility</option>
                  <option value="accounting">Accounting</option>
                  <option value="sales">Sales</option>
                  <option value="general">General</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">Доступ до категорій</label>
                <div className="space-y-2">
                  {allCategories.map(category => (
                    <label key={category} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newUser.categoryAccess.includes(category)}
                        onChange={() => toggleCategory(category, true)}
                        className="w-4 h-4 rounded border-gray-600 bg-[#0D0F11] text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-sm text-gray-300">{categoryLabels[category]}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                >
                  Скасувати
                </button>
                <button
                  onClick={handleCreateUser}
                  className="px-6 py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                >
                  Створити
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;

