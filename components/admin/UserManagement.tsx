import React, { useState, useEffect } from 'react';
import { usersService } from '../../services/supabaseService';
import type { Worker, DepartmentScope } from '../../types';
import { workerRoleLabelUk } from '../../lib/workerRoleLabels';
import { useWorker } from '../../contexts/WorkerContext';
import { canManageUsers } from '../../lib/permissions';
import { Plus, Trash2, Save, X, User, Edit, Send, Loader2, CheckCircle2, AlertCircle, RotateCcw } from 'lucide-react';

const DEPARTMENT_SCOPE_OPTIONS: { value: DepartmentScope; label: string }[] = [
  { value: 'facility', label: 'Facility' },
  { value: 'accounting', label: 'Accounting' },
  { value: 'sales', label: 'Sales' },
  { value: 'properties', label: 'Properties' },
  { value: 'all', label: 'All (full scope)' },
];

function formatScopeDisplay(w: Worker): string {
  if (w.departmentScope) return w.departmentScope;
  const d = w.department;
  if (d === 'facility' || d === 'accounting' || d === 'sales') {
    return `${d} (legacy row, no department_scope)`;
  }
  return '— unresolved (set scope)';
}

const UserManagement: React.FC = () => {
  const { worker: currentUser } = useWorker();
  const [users, setUsers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editedUser, setEditedUser] = useState<Partial<Worker> | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [resendingInvite, setResendingInvite] = useState<Set<string>>(new Set());
  const [deactivatingUser, setDeactivatingUser] = useState<Set<string>>(new Set());
  const [reactivatingUser, setReactivatingUser] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [newUser, setNewUser] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    role: 'worker' as 'super_manager' | 'manager' | 'worker',
    departmentScope: 'facility' as DepartmentScope,
    canManageUsers: false,
    canBeTaskAssignee: true,
    isActive: true,
    password: '',
    confirmPassword: '',
  });

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
    const inferredScope =
      user.departmentScope ??
      (user.department === 'facility' || user.department === 'accounting' || user.department === 'sales'
        ? (user.department as DepartmentScope)
        : undefined);
    setEditedUser({
      role: user.role,
      departmentScope: inferredScope,
      canManageUsers: user.canManageUsers,
      canBeTaskAssignee: user.canBeTaskAssignee,
      isActive: user.isActive,
      firstName: user.firstName,
      lastName: user.lastName,
    });
  };

  const handleSave = async (userId: string, existing: Worker) => {
    if (!editedUser) return;

    const scope =
      editedUser.departmentScope !== undefined && editedUser.departmentScope !== null
        ? editedUser.departmentScope
        : existing.departmentScope;

    if (!scope) {
      alert('Оберіть область доступу (Department scope). Для legacy-користувачів без scope виберіть значення зі списку.');
      return;
    }

    try {
      await usersService.update(userId, {
        role: editedUser.role,
        departmentScope: scope,
        canManageUsers: editedUser.canManageUsers,
        canBeTaskAssignee: editedUser.canBeTaskAssignee,
        isActive: editedUser.isActive,
        firstName: editedUser.firstName,
        lastName: editedUser.lastName,
      });
      await loadUsers();
      window.dispatchEvent(new CustomEvent('workersUpdated'));
      setEditingUser(null);
      setEditedUser(null);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Невідома помилка';
      alert(`Помилка оновлення користувача: ${errorMessage}`);
    }
  };

  const handleCancel = () => {
    setEditingUser(null);
    setEditedUser(null);
  };

  const handleResendInvite = async (userId: string, email: string) => {
    setResendingInvite((prev) => new Set(prev).add(userId));
    setMessage(null);
    try {
      await usersService.resendInvite(userId, email);
      await loadUsers();
      setMessage({ type: 'success', text: `Запрошення надіслано на ${email}!` });
      setTimeout(() => setMessage(null), 3000);
    } catch (error: unknown) {
      setMessage({
        type: 'error',
        text: `Помилка: ${error instanceof Error ? error.message : 'Невідома помилка'}`,
      });
      setTimeout(() => setMessage(null), 5000);
    } finally {
      setResendingInvite((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  };

  const handleDeactivate = async (userId: string) => {
    if (!window.confirm('Деактивувати користувача? Він не зможе увійти.')) return;
    setDeactivatingUser((prev) => new Set(prev).add(userId));
    setMessage(null);
    try {
      await usersService.deactivate(userId);
      await loadUsers();
      setMessage({ type: 'success', text: 'Користувача деактивовано' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error: unknown) {
      setMessage({
        type: 'error',
        text: `Помилка: ${error instanceof Error ? error.message : 'Невідома помилка'}`,
      });
      setTimeout(() => setMessage(null), 5000);
    } finally {
      setDeactivatingUser((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  };

  const handleReactivate = async (userId: string) => {
    setReactivatingUser((prev) => new Set(prev).add(userId));
    setMessage(null);
    try {
      await usersService.reactivate(userId);
      await loadUsers();
      setMessage({ type: 'success', text: 'Користувача активовано' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error: unknown) {
      setMessage({
        type: 'error',
        text: `Помилка: ${error instanceof Error ? error.message : 'Невідома помилка'}`,
      });
      setTimeout(() => setMessage(null), 5000);
    } finally {
      setReactivatingUser((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  };

  const handleCreateUser = async () => {
    if (!newUser.firstName || !newUser.lastName || !newUser.email) {
      setMessage({ type: 'error', text: "Заповніть ім'я, прізвище та email" });
      setTimeout(() => setMessage(null), 3000);
      return;
    }
    if (!newUser.password) {
      setMessage({ type: 'error', text: 'Вкажіть пароль' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }
    if (newUser.password !== newUser.confirmPassword) {
      setMessage({ type: 'error', text: 'Підтвердження пароля не співпадає' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }
    // Reasonable minimum rule for admin-created initial passwords.
    if (newUser.password.length < 8 || !/[A-Za-z]/.test(newUser.password) || !/\d/.test(newUser.password)) {
      setMessage({ type: 'error', text: 'Пароль: мінімум 8 символів, хоча б 1 літера та 1 цифра' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    try {
      await usersService.createUserWithPassword({
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        phone: newUser.phone || undefined,
        role: newUser.role,
        departmentScope: newUser.departmentScope,
        canManageUsers: newUser.canManageUsers,
        canBeTaskAssignee: newUser.canBeTaskAssignee,
        isActive: newUser.isActive,
        password: newUser.password,
      });
      await loadUsers();
      setIsCreateModalOpen(false);
      setNewUser({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        role: 'worker',
        departmentScope: 'facility',
        canManageUsers: false,
        canBeTaskAssignee: true,
        isActive: true,
        password: '',
        confirmPassword: '',
      });
      setMessage({
        type: 'success',
        text: 'Користувача створено. Вхід доступний одразу через email + пароль.',
      });
      setTimeout(() => setMessage(null), 5000);
    } catch (error: unknown) {
      setMessage({
        type: 'error',
        text: `Помилка: ${error instanceof Error ? error.message : 'Невідома помилка'}`,
      });
      setTimeout(() => setMessage(null), 5000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Завантаження користувачів...</div>
      </div>
    );
  }

  if (!currentUser || !canManageUsers(currentUser)) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-300 text-sm">
          Недостатньо прав для управління користувачами.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Управління користувачами</h2>
        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Створити користувача
        </button>
      </div>

      <p className="text-xs text-gray-500 mb-4 max-w-3xl">
        Доступ до модулів задається лише полем <span className="text-gray-400 font-medium">Department scope</span>. Колонка{' '}
        <code className="text-gray-400">department</code> у БД оновлюється автоматично для RLS (для scope «all» використовується
        sentinel <code className="text-gray-400">facility</code> — див. <code className="text-gray-400">lib/profileDepartmentSync.ts</code>
        ).
      </p>

      {message && (
        <div
          className={`mb-4 p-4 rounded-lg border flex items-center gap-3 ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}
        >
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
          <span className="text-sm font-medium">{message.text}</span>
          <button type="button" onClick={() => setMessage(null)} className="ml-auto text-gray-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-[#1C1F24] rounded-lg border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#111315] border-b border-gray-800">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Користувач</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Роль</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Scope</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Адмін юзерів</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Assignee</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Активний</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Дії</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {users.map((u) => (
                <tr key={u.id} className={`hover:bg-gray-800/50 ${!u.isActive ? 'opacity-50' : ''}`}>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
                        <User className="w-4 h-4 text-gray-400" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">
                          {u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.name}
                        </div>
                        <div className="text-xs text-gray-500">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {editingUser === u.id ? (
                      <select
                        value={editedUser?.role || u.role}
                        onChange={(e) => setEditedUser((prev) => ({ ...prev, role: e.target.value as Worker['role'] }))}
                        className="bg-[#0D0F11] border border-gray-700 rounded px-2 py-1 text-sm text-white max-w-[140px]"
                      >
                        <option value="worker">Працівник</option>
                        <option value="manager">Менеджер</option>
                        <option value="super_manager">Супер-менеджер</option>
                      </select>
                    ) : (
                      <span className="text-sm text-gray-300">
                        {workerRoleLabelUk(u.role)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {editingUser === u.id ? (
                      <select
                        value={editedUser?.departmentScope ?? ''}
                        onChange={(e) =>
                          setEditedUser((prev) => ({
                            ...prev,
                            departmentScope: (e.target.value || undefined) as DepartmentScope | undefined,
                          }))
                        }
                        className="bg-[#0D0F11] border border-gray-700 rounded px-2 py-1 text-sm text-white max-w-[160px]"
                      >
                        <option value="">— оберіть scope —</option>
                        {DEPARTMENT_SCOPE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-sm text-amber-200/90" title={`Legacy department: ${u.department}`}>
                        {formatScopeDisplay(u)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {editingUser === u.id ? (
                      <input
                        type="checkbox"
                        checked={!!editedUser?.canManageUsers}
                        onChange={(e) => setEditedUser((prev) => ({ ...prev, canManageUsers: e.target.checked }))}
                        className="w-4 h-4 rounded border-gray-600"
                      />
                    ) : (
                      <span className="text-sm text-gray-300">{u.canManageUsers ? 'Так' : 'Ні'}</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {editingUser === u.id ? (
                      <input
                        type="checkbox"
                        checked={editedUser?.canBeTaskAssignee !== false}
                        onChange={(e) => setEditedUser((prev) => ({ ...prev, canBeTaskAssignee: e.target.checked }))}
                        className="w-4 h-4 rounded border-gray-600"
                      />
                    ) : (
                      <span className="text-sm text-gray-300">{u.canBeTaskAssignee !== false ? 'Так' : 'Ні'}</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {editingUser === u.id ? (
                      <input
                        type="checkbox"
                        checked={editedUser?.isActive !== false}
                        onChange={(e) => setEditedUser((prev) => ({ ...prev, isActive: e.target.checked }))}
                        className="w-4 h-4 rounded border-gray-600"
                      />
                    ) : (
                      <span className={`text-sm ${u.isActive ? 'text-emerald-400' : 'text-red-400'}`}>
                        {u.isActive ? 'Так' : 'Ні'}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-1">
                        {editingUser === u.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleSave(u.id, u)}
                              className="p-1.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              title="Зберегти"
                            >
                              <Save className="w-4 h-4" />
                            </button>
                            <button type="button" onClick={handleCancel} className="p-1.5 rounded bg-gray-800 text-gray-400" title="Скасувати">
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleEdit(u)}
                              className="p-1.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30"
                              title="Редагувати"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResendInvite(u.id, u.email)}
                              disabled={resendingInvite.has(u.id)}
                              className="p-1.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 disabled:opacity-50"
                              title="Надіслати запрошення (за потреби)"
                            >
                              {resendingInvite.has(u.id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            </button>
                            {u.isActive ? (
                              <button
                                type="button"
                                onClick={() => handleDeactivate(u.id)}
                                disabled={deactivatingUser.has(u.id)}
                                className="p-1.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 disabled:opacity-50"
                                title="Деактивувати"
                              >
                                {deactivatingUser.has(u.id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleReactivate(u.id)}
                                disabled={reactivatingUser.has(u.id)}
                                className="p-1.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 disabled:opacity-50"
                                title="Активувати"
                              >
                                {reactivatingUser.has(u.id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-500">
                        {u.lastInviteSentAt
                          ? `Запрошення: ${new Date(u.lastInviteSentAt).toLocaleString('uk-UA')}`
                          : 'Запрошення не надсилалось'}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1C1F24] w-full max-w-md rounded-xl border border-gray-800 shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-[#111315]">
              <h2 className="text-lg font-semibold text-white">Створити користувача</h2>
              <button type="button" onClick={() => setIsCreateModalOpen(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">Ім&apos;я *</label>
                <input
                  type="text"
                  value={newUser.firstName}
                  onChange={(e) => setNewUser((p) => ({ ...p, firstName: e.target.value }))}
                  className="w-full bg-[#0D0F11] border border-gray-700 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">Прізвище *</label>
                <input
                  type="text"
                  value={newUser.lastName}
                  onChange={(e) => setNewUser((p) => ({ ...p, lastName: e.target.value }))}
                  className="w-full bg-[#0D0F11] border border-gray-700 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">Email *</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
                  className="w-full bg-[#0D0F11] border border-gray-700 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">Телефон (опційно)</label>
                <input
                  type="text"
                  value={newUser.phone}
                  onChange={(e) => setNewUser((p) => ({ ...p, phone: e.target.value }))}
                  className="w-full bg-[#0D0F11] border border-gray-700 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">Роль</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser((p) => ({ ...p, role: e.target.value as Worker['role'] }))}
                  className="w-full bg-[#0D0F11] border border-gray-700 rounded-lg px-3 py-2 text-white"
                >
                  <option value="worker">Працівник</option>
                  <option value="manager">Менеджер</option>
                  <option value="super_manager">Супер-менеджер</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">Department scope</label>
                <select
                  value={newUser.departmentScope}
                  onChange={(e) => setNewUser((p) => ({ ...p, departmentScope: e.target.value as DepartmentScope }))}
                  className="w-full bg-[#0D0F11] border border-gray-700 rounded-lg px-3 py-2 text-white"
                >
                  {DEPARTMENT_SCOPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newUser.canManageUsers}
                  onChange={(e) => setNewUser((p) => ({ ...p, canManageUsers: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-600"
                />
                Може керувати користувачами
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newUser.canBeTaskAssignee}
                  onChange={(e) => setNewUser((p) => ({ ...p, canBeTaskAssignee: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-600"
                />
                Може бути assignee задач
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newUser.isActive}
                  onChange={(e) => setNewUser((p) => ({ ...p, isActive: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-600"
                />
                Активний
              </label>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">Пароль *</label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
                  className="w-full bg-[#0D0F11] border border-gray-700 rounded-lg px-3 py-2 text-white"
                  autoComplete="new-password"
                />
                <p className="mt-1 text-[11px] text-gray-500">Мінімум 8 символів, хоча б 1 літера та 1 цифра.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">Підтвердження пароля *</label>
                <input
                  type="password"
                  value={newUser.confirmPassword}
                  onChange={(e) => setNewUser((p) => ({ ...p, confirmPassword: e.target.value }))}
                  className="w-full bg-[#0D0F11] border border-gray-700 rounded-lg px-3 py-2 text-white"
                  autoComplete="new-password"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">
                  Скасувати
                </button>
                <button type="button" onClick={handleCreateUser} className="px-6 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg">
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
