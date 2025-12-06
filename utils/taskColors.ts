import { TaskType } from '../types';

// Facility Task Types
export const FACILITY_TASK_TYPES: TaskType[] = [
  'Einzug',
  'Auszug',
  'Putzen',
  'Reklamation',
  'Arbeit nach plan',
  'Zeit Abgabe von wohnung',
  'Zählerstand'
];

// Accounting Task Types
export const ACCOUNTING_TASK_TYPES: TaskType[] = [
  'Tax Payment',
  'Payroll',
  'Invoice Processing',
  'Audit',
  'Monthly Closing',
  'Rent Collection',
  'Utility Payment',
  'Insurance',
  'Mortgage Payment',
  'VAT Return',
  'Financial Report',
  'Budget Review',
  'Asset Depreciation',
  'Vendor Payment',
  'Bank Reconciliation'
];

// Task color mapping
const TASK_COLORS: Record<TaskType | string, { bg: string; border: string; text: string }> = {
  'Einzug': { bg: 'bg-blue-500/10', border: 'border-blue-500', text: 'text-blue-400' },
  'Auszug': { bg: 'bg-purple-500/10', border: 'border-purple-500', text: 'text-purple-400' },
  'Putzen': { bg: 'bg-emerald-500/10', border: 'border-emerald-500', text: 'text-emerald-400' },
  'Reklamation': { bg: 'bg-red-500/10', border: 'border-red-500', text: 'text-red-400' },
  'Arbeit nach plan': { bg: 'bg-orange-500/10', border: 'border-orange-500', text: 'text-orange-400' },
  'Zeit Abgabe von wohnung': { bg: 'bg-yellow-500/10', border: 'border-yellow-500', text: 'text-yellow-400' },
  'Zählerstand': { bg: 'bg-cyan-500/10', border: 'border-cyan-500', text: 'text-cyan-400' },
  // Accounting tasks
  'Tax Payment': { bg: 'bg-red-500/10', border: 'border-red-500', text: 'text-red-400' },
  'Payroll': { bg: 'bg-green-500/10', border: 'border-green-500', text: 'text-green-400' },
  'Invoice Processing': { bg: 'bg-blue-500/10', border: 'border-blue-500', text: 'text-blue-400' },
  'Audit': { bg: 'bg-purple-500/10', border: 'border-purple-500', text: 'text-purple-400' },
  'Monthly Closing': { bg: 'bg-indigo-500/10', border: 'border-indigo-500', text: 'text-indigo-400' },
  'Rent Collection': { bg: 'bg-emerald-500/10', border: 'border-emerald-500', text: 'text-emerald-400' },
  'Utility Payment': { bg: 'bg-teal-500/10', border: 'border-teal-500', text: 'text-teal-400' },
  'Insurance': { bg: 'bg-pink-500/10', border: 'border-pink-500', text: 'text-pink-400' },
  'Mortgage Payment': { bg: 'bg-rose-500/10', border: 'border-rose-500', text: 'text-rose-400' },
  'VAT Return': { bg: 'bg-amber-500/10', border: 'border-amber-500', text: 'text-amber-400' },
  'Financial Report': { bg: 'bg-violet-500/10', border: 'border-violet-500', text: 'text-violet-400' },
  'Budget Review': { bg: 'bg-sky-500/10', border: 'border-sky-500', text: 'text-sky-400' },
  'Asset Depreciation': { bg: 'bg-slate-500/10', border: 'border-slate-500', text: 'text-slate-400' },
  'Vendor Payment': { bg: 'bg-lime-500/10', border: 'border-lime-500', text: 'text-lime-400' },
  'Bank Reconciliation': { bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500', text: 'text-fuchsia-400' },
  // Default
  'other': { bg: 'bg-gray-500/10', border: 'border-gray-500', text: 'text-gray-400' }
};

// Get task color classes
export function getTaskColor(taskType: TaskType | string): string {
  const colors = TASK_COLORS[taskType] || TASK_COLORS['other'];
  return `${colors.bg} ${colors.border} ${colors.text}`;
}

// Get task badge color
export function getTaskBadgeColor(taskType: TaskType | string): string {
  const colors = TASK_COLORS[taskType] || TASK_COLORS['other'];
  return colors.border;
}

// Get task dot color
export function getTaskDotColor(taskType: TaskType | string): string {
  const colors = TASK_COLORS[taskType] || TASK_COLORS['other'];
  return colors.border.replace('border-', '');
}


