/**
 * Virtual Documents Manager — read-only list/open/navigate.
 * Two top-level folders: Документи (property-level), Оренди (one subfolder per booking).
 * Lazy loading: Документи list and each rental folder list loaded on expand only.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Folder, FolderOpen, FileIcon, Loader2 } from 'lucide-react';
import {
  getInitialVirtualFolders,
  loadDocumentsFolder,
  loadRentalFolderFiles,
  type RentalFolderMeta,
  type VirtualEntry,
  type VirtualEntryType,
} from '../services/virtualDocumentsService';

type ViewState = 'none' | 'documents' | 'rentals' | { rental: string };

const BADGE_LABELS: Record<VirtualEntryType, string> = {
  offer: 'Offer',
  proforma: 'Proforma',
  invoice: 'Invoice',
  payment_proof: 'Payment Proof',
  upload: 'Upload',
  task: 'Task',
  workflow: 'Workflow',
};

function RentalEntryBadge({ type }: { type: VirtualEntryType }) {
  const label = BADGE_LABELS[type];
  return (
    <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">
      {label}
    </span>
  );
}

interface VirtualDocumentsManagerProps {
  propertyId: string;
}

export const VirtualDocumentsManager: React.FC<VirtualDocumentsManagerProps> = ({ propertyId }) => {
  const [rentalFolders, setRentalFolders] = useState<RentalFolderMeta[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);

  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [documentsList, setDocumentsList] = useState<VirtualEntry[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);

  const [rentalsOpen, setRentalsOpen] = useState(false);
  const [expandedRentalId, setExpandedRentalId] = useState<string | null>(null);
  const [rentalFiles, setRentalFiles] = useState<VirtualEntry[]>([]);
  const [rentalFilesLoading, setRentalFilesLoading] = useState(false);
  const [rentalFilesError, setRentalFilesError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingInitial(true);
    setInitialError(null);
    getInitialVirtualFolders(propertyId)
      .then(({ rentalFolders: folders }) => {
        if (!cancelled) setRentalFolders(folders);
      })
      .catch((e) => {
        if (!cancelled) setInitialError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoadingInitial(false);
      });
    return () => { cancelled = true; };
  }, [propertyId]);

  const loadDocuments = useCallback(() => {
    if (documentsList.length > 0) return;
    setDocumentsLoading(true);
    setDocumentsError(null);
    loadDocumentsFolder(propertyId)
      .then(setDocumentsList)
      .catch((e) => setDocumentsError(e instanceof Error ? e.message : String(e)))
      .finally(() => setDocumentsLoading(false));
  }, [propertyId, documentsList.length]);

  const loadRental = useCallback((bookingId: string) => {
    setExpandedRentalId(bookingId);
    setRentalFiles([]);
    setRentalFilesLoading(true);
    setRentalFilesError(null);
    loadRentalFolderFiles(propertyId, bookingId)
      .then(setRentalFiles)
      .catch((e) => setRentalFilesError(e instanceof Error ? e.message : String(e)))
      .finally(() => setRentalFilesLoading(false));
  }, [propertyId]);

  const openEntry = useCallback(async (entry: VirtualEntry) => {
    try {
      const url = await entry.getOpenUrl();
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      console.error('Open document failed', e);
    }
  }, []);

  if (loadingInitial) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span>Завантаження…</span>
      </div>
    );
  }

  if (initialError) {
    return (
      <div className="py-4 text-amber-500 text-sm">
        Помилка завантаження: {initialError}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-h-[400px]">
      <div className="border border-gray-700 rounded-lg bg-[#16181D] p-4 overflow-y-auto">
        <h4 className="text-sm font-bold text-white mb-2 border-b border-gray-700 pb-2">Навігація</h4>
        <ul className="space-y-1 text-sm text-gray-400">
          <li
            onClick={() => {
              setDocumentsOpen(true);
              setRentalsOpen(false);
              setExpandedRentalId(null);
              loadDocuments();
            }}
            className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors ${
              documentsOpen ? 'bg-[#1C1F24] text-emerald-500 font-bold' : 'hover:bg-[#1C1F24]'
            }`}
          >
            {documentsOpen ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4 text-yellow-500" />}
            Документи
          </li>
          <li
            onClick={() => {
              setRentalsOpen(true);
              setDocumentsOpen(false);
            }}
            className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors ${
              rentalsOpen ? 'bg-[#1C1F24] text-emerald-500 font-bold' : 'hover:bg-[#1C1F24]'
            }`}
          >
            {rentalsOpen ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4 text-yellow-500" />}
            Оренди ({rentalFolders.length})
          </li>
          {rentalsOpen &&
            rentalFolders.map((r) => (
              <li
                key={r.bookingId}
                onClick={() => loadRental(r.bookingId)}
                className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors ml-4 ${
                  expandedRentalId === r.bookingId ? 'bg-[#1C1F24] text-emerald-400 font-bold' : 'hover:bg-[#1C1F24] text-gray-400'
                }`}
              >
                <Folder className="w-3 h-3 text-yellow-500" />
                {r.label}
              </li>
            ))}
        </ul>
      </div>

      <div className="border border-gray-700 rounded-lg bg-[#16181D] p-4 overflow-y-auto">
        <h4 className="text-sm font-bold text-white mb-2 border-b border-gray-700 pb-2">
          {documentsOpen && 'Файли в "Документи"'}
          {rentalsOpen && expandedRentalId && 'Файли в обраній оренді'}
          {rentalsOpen && !expandedRentalId && 'Виберіть папку оренди'}
          {!documentsOpen && !rentalsOpen && 'Виберіть папку'}
        </h4>

        {documentsOpen && (
          <>
            {documentsLoading && (
              <div className="flex items-center gap-2 py-4 text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Завантаження файлів…</span>
              </div>
            )}
            {documentsError && <p className="text-amber-500 text-sm py-2">{documentsError}</p>}
            {!documentsLoading && !documentsError && documentsList.length === 0 && (
              <p className="text-gray-500 text-sm py-4">Немає файлів</p>
            )}
            {!documentsLoading && documentsList.length > 0 && (
              <ul className="space-y-2 text-sm">
                {documentsList.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex justify-between items-center p-2 bg-[#1C1F24] rounded border border-gray-700 hover:bg-[#23262b] transition-colors cursor-pointer"
                    onClick={() => openEntry(entry)}
                  >
                    <span className="flex items-center gap-2 text-white truncate">
                      <FileIcon className="w-4 h-4 text-red-500 shrink-0" />
                      <span className="truncate">{entry.label}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {rentalsOpen && expandedRentalId && (
          <>
            {rentalFilesLoading && (
              <div className="flex items-center gap-2 py-4 text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Завантаження файлів…</span>
              </div>
            )}
            {rentalFilesError && <p className="text-amber-500 text-sm py-2">{rentalFilesError}</p>}
            {!rentalFilesLoading && !rentalFilesError && rentalFiles.length === 0 && (
              <p className="text-gray-500 text-sm py-4">Немає файлів</p>
            )}
            {!rentalFilesLoading && rentalFiles.length > 0 && (
              <ul className="space-y-2 text-sm">
                {rentalFiles.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex justify-between items-center p-2 bg-[#1C1F24] rounded border border-gray-700 hover:bg-[#23262b] transition-colors cursor-pointer"
                    onClick={() => openEntry(entry)}
                  >
                    <span className="flex items-center gap-2 text-white truncate min-w-0">
                      <FileIcon className="w-4 h-4 text-red-500 shrink-0" />
                      <span className="truncate">{entry.label}</span>
                      {entry.entryType && (
                        <RentalEntryBadge type={entry.entryType} />
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {rentalsOpen && !expandedRentalId && !documentsOpen && (
          <p className="text-gray-500 text-sm py-4">Відкрийте папку оренди зі списку зліва</p>
        )}

        {!documentsOpen && !rentalsOpen && (
          <p className="text-gray-500 text-sm py-4">Виберіть «Документи» або «Оренди» зі списку зліва</p>
        )}
      </div>
    </div>
  );
};
