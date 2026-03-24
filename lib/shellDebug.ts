/**
 * Gated shell/tab-resume diagnostics (Phase 1). No production behavior change when off.
 * Enable: import.meta.env.DEV or VITE_SHELL_RESUME_DEBUG=1
 */
export const SHELL_RESUME_DEBUG =
  Boolean(import.meta.env.DEV) || import.meta.env.VITE_SHELL_RESUME_DEBUG === '1';

export type ShellZTier = 'none' | 'shellChrome' | 'modalStandard' | 'modalElevated' | 'docPreview';

export type ShellDebugSnapshot = {
  source: 'accountDashboard';
  modalFlags: Record<string, boolean>;
  blockingLayerOwnerLabel: string;
  expectedZTier: ShellZTier;
};

let snapshotGetter: (() => ShellDebugSnapshot) | null = null;

/** Register getter for global hit-test logging (AccountDashboard). */
export function registerShellDebugSnapshotGetter(fn: () => ShellDebugSnapshot): () => void {
  snapshotGetter = fn;
  return () => {
    if (snapshotGetter === fn) snapshotGetter = null;
  };
}

export function getShellDebugSnapshot(): ShellDebugSnapshot | null {
  return snapshotGetter?.() ?? null;
}

/** Short string for console (tag, id, class prefix). */
export function describeElementBrief(el: Element | null | undefined): string {
  if (el == null) return 'null';
  if (!(el instanceof Element)) return String(el);
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const cls =
    typeof (el as HTMLElement).className === 'string'
      ? (el as HTMLElement).className
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 4)
          .join('.')
      : '';
  return `${tag}${id}${cls ? `.${cls}` : ''}`;
}

/** Hit-test line for pointer logs (`target` may be a text node). */
export function describeEventTarget(t: EventTarget | null): string {
  if (t == null) return 'null';
  if (t instanceof Element) return describeElementBrief(t);
  if (t instanceof Node) return `${t.nodeName}#text`;
  return String(t);
}

/**
 * Declared stacking order (highest first). Keys must match AccountDashboard `modalFlags` booleans.
 * z values mirror primary `fixed inset-0` layers / child modal roots in AccountDashboard.
 */
const ACCOUNT_DASHBOARD_LAYER_STACK: Array<{ key: string; z: number; label: string }> = [
  { key: 'editingLead', z: 250, label: 'leadEditModal' },
  { key: 'clientHistoryLead', z: 250, label: 'clientHistoryModal' },
  { key: 'isCreateLeadModalOpen', z: 250, label: 'leadCreateModal' },
  { key: 'isOfferEditModalOpen', z: 250, label: 'offerEditModal' },
  { key: 'docPreviewOpen', z: 230, label: 'docPreview' },
  { key: 'sendChannelOpen', z: 230, label: 'sendChannelModal' },
  { key: 'isMultiOfferDetailsOpen', z: 230, label: 'multiOfferDetailsModal' },
  { key: 'openMediaModal', z: 222, label: 'mediaModal' },
  { key: 'meterGallery', z: 221, label: 'meterGallery' },
  { key: 'depositProofOverlay', z: 220, label: 'depositProofModal' },
  { key: 'addApartmentGroupModalOpen', z: 220, label: 'addApartmentGroupModal' },
  { key: 'isAddressBookModalOpen', z: 220, label: 'addressBookModal' },
  { key: 'isMeterNumbersModalOpen', z: 220, label: 'meterNumbersModal' },
  { key: 'isInvoiceModalOpen', z: 220, label: 'invoiceModal' },
  { key: 'confirmPaymentModalOpen', z: 220, label: 'confirmPaymentModal' },
  { key: 'paymentProofModalOpen', z: 220, label: 'paymentProofPdfModal' },
  { key: 'isOfferViewModalOpen', z: 220, label: 'offerViewModal' },
  { key: 'isZweckentfremdungModalOpen', z: 218, label: 'zweckModal' },
  { key: 'isManageModalOpen', z: 200, label: 'bookingDetailsModal' },
  { key: 'isPropertyAddModalOpen', z: 200, label: 'propertyAddModal' },
  { key: 'isRequestModalOpen', z: 200, label: 'requestModal' },
  { key: 'archiveModalOpen', z: 50, label: 'archiveConfirm' },
  { key: 'deleteModalOpen', z: 50, label: 'deleteConfirm' },
  { key: 'isTransferModalOpen', z: 40, label: 'transferModal' },
  { key: 'isAddInventoryModalOpen', z: 40, label: 'addInventoryModal' },
  { key: 'isPropertyAddFromDocumentOpen', z: 40, label: 'propertyAddFromDocument' },
  { key: 'isExpenseAddFromDocumentOpen', z: 40, label: 'expenseAddFromDocument' },
  { key: 'isExpenseCategoriesModalOpen', z: 40, label: 'expenseCategoriesModal' },
  { key: 'isCreateWarehouseModalOpen', z: 40, label: 'createWarehouseModal' },
];

export function zTierFromStackZ(z: number): ShellZTier {
  if (z >= 250) return 'modalElevated';
  if (z >= 230) return 'docPreview';
  if (z >= 200) return 'modalElevated';
  if (z >= 50) return 'modalStandard';
  return 'modalStandard';
}

export function buildAccountDashboardShellDebugSnapshot(
  modalFlags: Record<string, boolean>
): ShellDebugSnapshot {
  for (const layer of ACCOUNT_DASHBOARD_LAYER_STACK) {
    if (modalFlags[layer.key]) {
      return {
        source: 'accountDashboard',
        modalFlags,
        blockingLayerOwnerLabel: layer.label,
        expectedZTier: zTierFromStackZ(layer.z),
      };
    }
  }
  return {
    source: 'accountDashboard',
    modalFlags,
    blockingLayerOwnerLabel: 'none',
    expectedZTier: 'none',
  };
}
