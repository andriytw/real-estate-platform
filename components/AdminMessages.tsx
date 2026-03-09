
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Paperclip, Send, MapPin, User, Clock, FileText, FileIcon, Image as ImageIcon, X, Calendar } from 'lucide-react';
import {
  listTaskChatThreadsForFacilityInbox,
  getTaskChatMessages,
  insertTaskChatMessage,
  insertTaskChatMessageWithAttachment,
  getTaskAttachmentSignedUrl,
  type TaskChatThreadInbox,
  type TaskChatMessageRow,
  type TaskChatAttachment,
} from '../services/supabaseService';
import { supabase } from '../utils/supabase/client';
import { getTaskColor } from '../utils/taskColors';

const TASK_MEDIA_BUCKET = 'task-media';
const SIGNED_URL_EXPIRY_SEC = 300;
const CACHE_REFRESH_BEFORE_MS = 5000;
const FACILITY_INBOX_LAST_SEEN_PREFIX = 'facility_inbox_last_seen_';

type AttachmentCacheEntry = { url: string; expiresAt: number };
function isCacheValid(entry: AttachmentCacheEntry): boolean {
  return Date.now() <= entry.expiresAt - CACHE_REFRESH_BEFORE_MS;
}
function isImageAtt(att: TaskChatAttachment): boolean {
  return (att.mimeType?.startsWith('image/') ?? false) || /\.(jpe?g|png|gif|webp)$/i.test(att.filename ?? '');
}
function isPdfAtt(att: TaskChatAttachment): boolean {
  return att.mimeType === 'application/pdf' || (att.filename?.toLowerCase().endsWith('.pdf') ?? false);
}

function getLastSeenAt(calendarEventId: string): string | null {
  try {
    return localStorage.getItem(FACILITY_INBOX_LAST_SEEN_PREFIX + calendarEventId);
  } catch {
    return null;
  }
}
function setLastSeenAt(calendarEventId: string, iso: string): void {
  try {
    localStorage.setItem(FACILITY_INBOX_LAST_SEEN_PREFIX + calendarEventId, iso);
  } catch {
    // ignore
  }
}

function formatLastActivity(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** Format dueAt (ISO) as DD.MM.YYYY HH:mm; time "00:00" shown as "—" when date-only. */
function formatDueDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const dateStr = `${day}.${month}.${year}`;
  const hours = d.getHours();
  const mins = d.getMinutes();
  const timeStr = hours === 0 && mins === 0 ? '—' : `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  return timeStr === '—' ? dateStr : `${dateStr} ${timeStr}`;
}

const AdminMessages: React.FC = () => {
  const [threads, setThreads] = useState<TaskChatThreadInbox[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<TaskChatMessageRow[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [chatMyUserId, setChatMyUserId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [attachmentUrlCache, setAttachmentUrlCache] = useState<Record<string, AttachmentCacheEntry>>({});
  const [lightboxAtt, setLightboxAtt] = useState<TaskChatAttachment | null>(null);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [chatUploading, setChatUploading] = useState(false);
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedThread = selectedThreadId ? threads.find((t) => t.calendarEventId === selectedThreadId) : null;
  const isClosedTask = selectedThread && ['completed', 'verified'].includes(selectedThread.status);

  // Load threads on mount
  useEffect(() => {
    let cancelled = false;
    setThreadsLoading(true);
    listTaskChatThreadsForFacilityInbox()
      .then((list) => {
        if (!cancelled) setThreads(list);
      })
      .catch((e) => {
        if (!cancelled) console.warn('Facility inbox load failed', e);
      })
      .finally(() => {
        if (!cancelled) setThreadsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Current user id for bubbles
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setChatMyUserId(user?.id ?? null);
    });
  }, []);

  // Load messages when thread selected; set lastSeenAt
  useEffect(() => {
    if (!selectedThreadId) {
      setThreadMessages([]);
      return;
    }
    setLastSeenAt(selectedThreadId, new Date().toISOString());
    let cancelled = false;
    setMessagesLoading(true);
    getTaskChatMessages(selectedThreadId)
      .then((rows) => {
        if (!cancelled) setThreadMessages(rows);
      })
      .catch((e) => {
        if (!cancelled) console.warn('Task chat messages load failed', e);
      })
      .finally(() => {
        if (!cancelled) setMessagesLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedThreadId]);

  useEffect(() => {
    if (threadMessages.length) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages.length]);

  const getCachedOrFetchUrl = useCallback(async (att: TaskChatAttachment): Promise<string> => {
    const bucket = (att.bucket ?? TASK_MEDIA_BUCKET).trim();
    const path = (att.path ?? '').trim();
    if (!bucket || !path) throw new Error('Attachment is missing bucket or path.');
    const key = `${bucket}:${path}`;
    const entry = attachmentUrlCache[key];
    if (entry && isCacheValid(entry)) return entry.url;
    const url = await getTaskAttachmentSignedUrl(bucket, path, SIGNED_URL_EXPIRY_SEC);
    const expiresAt = Date.now() + SIGNED_URL_EXPIRY_SEC * 1000;
    setAttachmentUrlCache((prev) => ({ ...prev, [key]: { url, expiresAt } }));
    return url;
  }, [attachmentUrlCache]);

  const openAttachment = useCallback(async (att: TaskChatAttachment) => {
    if (!att.bucket?.trim() || !att.path?.trim()) {
      alert('Attachment is missing bucket/path.');
      return;
    }
    try {
      const url = await getCachedOrFetchUrl(att);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      alert('Could not open file (permission or missing object).');
    }
  }, [getCachedOrFetchUrl]);

  // Lightbox close on Esc
  useEffect(() => {
    if (!lightboxAtt) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxAtt(null);
        setLightboxImageUrl(null);
      }
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [lightboxAtt]);

  // Prefetch image thumbnails (last 10, concurrency 3)
  useEffect(() => {
    if (!threadMessages.length) return;
    const imageAtts: TaskChatAttachment[] = [];
    const seen = new Set<string>();
    for (let i = threadMessages.length - 1; i >= 0 && imageAtts.length < 10; i--) {
      const msg = threadMessages[i];
      if (!msg.attachments?.length) continue;
      for (const att of msg.attachments) {
        if (!isImageAtt(att) || !att.bucket || !att.path) continue;
        const key = `${att.bucket}:${att.path}`;
        if (seen.has(key)) continue;
        seen.add(key);
        imageAtts.push(att);
        if (imageAtts.length >= 10) break;
      }
    }
    const CONCURRENCY = 3;
    let index = 0;
    const run = async () => {
      while (index < imageAtts.length) {
        const batch = imageAtts.slice(index, index + CONCURRENCY);
        index += batch.length;
        await Promise.all(
          batch.map(async (att) => {
            const key = `${att.bucket ?? TASK_MEDIA_BUCKET}:${att.path}`;
            if (attachmentUrlCache[key] && isCacheValid(attachmentUrlCache[key])) return;
            try {
              const url = await getTaskAttachmentSignedUrl(att.bucket ?? TASK_MEDIA_BUCKET, att.path, SIGNED_URL_EXPIRY_SEC);
              const expiresAt = Date.now() + SIGNED_URL_EXPIRY_SEC * 1000;
              setAttachmentUrlCache((prev) => ({ ...prev, [key]: { url, expiresAt } }));
            } catch {
              // ignore
            }
          })
        );
      }
    };
    run();
  }, [threadMessages]);

  const handleSendMessage = async () => {
    if (!inputText.trim() || !selectedThreadId) return;
    setSending(true);
    try {
      await insertTaskChatMessage(selectedThreadId, inputText.trim());
      setInputText('');
      const [rows, list] = await Promise.all([
        getTaskChatMessages(selectedThreadId),
        listTaskChatThreadsForFacilityInbox(),
      ]);
      setThreadMessages(rows);
      setThreads(list);
    } catch (e) {
      console.error('Send message failed', e);
      alert('Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedThreadId || isClosedTask) return;
    const safeName = file.name.replace(/[/\\:]/g, '_').trim() || 'file';
    const path = `${selectedThreadId}/${Date.now()}-${safeName}`;
    setChatUploading(true);
    try {
      const { error: uploadError } = await supabase.storage.from(TASK_MEDIA_BUCKET).upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;
      const payload: TaskChatAttachment[] = [{
        bucket: TASK_MEDIA_BUCKET,
        path,
        filename: file.name,
        mimeType: file.type || undefined,
        size: file.size,
      }];
      const row = await insertTaskChatMessageWithAttachment(selectedThreadId, payload);
      if (row) {
        setThreadMessages((prev) => [...prev, row]);
      } else {
        const messages = await getTaskChatMessages(selectedThreadId);
        setThreadMessages(messages);
      }
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setThreads(await listTaskChatThreadsForFacilityInbox());
    } catch (err: any) {
      const msg = err?.message ?? String(err ?? '');
      const errStr = (msg + (err?.error ?? '')).toLowerCase();
      const isBucketNotFound = err?.statusCode === 400 || (errStr.includes('bucket') && errStr.includes('not found'));
      if (isBucketNotFound) {
        alert('Storage bucket "task-media" not found. Create it in Supabase Dashboard → Storage.');
      } else {
        console.error('Task chat attachment upload failed', { error: msg });
        alert(`Upload failed: ${msg}`);
      }
    } finally {
      setChatUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const sortedThreads = [...threads].sort((a, b) => {
    const aClosed = ['completed', 'verified'].includes(a.status);
    const bClosed = ['completed', 'verified'].includes(b.status);
    if (aClosed !== bClosed) return aClosed ? 1 : -1;
    return new Date(b.lastMessageCreatedAt).getTime() - new Date(a.lastMessageCreatedAt).getTime();
  });

  const filteredThreads = searchTerm.trim()
    ? sortedThreads.filter((t) => {
        const q = searchTerm.toLowerCase();
        return (
          t.title.toLowerCase().includes(q) ||
          (t.propertyLabel?.toLowerCase().includes(q) ?? false) ||
          (t.assigneeName?.toLowerCase().includes(q) ?? false)
        );
      })
    : sortedThreads;

  return (
    <div className="flex h-[calc(100vh-6rem)] bg-[#0D1117] rounded-xl border border-gray-800 shadow-2xl overflow-hidden">
      {/* LEFT: Thread list */}
      <div className="w-full md:w-[380px] bg-[#161B22] border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-lg font-bold text-white mb-4">Messages</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search property or task..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#0D1117] border border-gray-700 rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {threadsLoading && (
            <div className="p-4 text-center text-gray-500 text-sm">Loading threads…</div>
          )}
          {!threadsLoading && filteredThreads.length === 0 && (
            <div className="p-4 text-center text-gray-500 text-sm">
              {threads.length === 0 ? 'No task chats yet.' : 'No threads match your search.'}
            </div>
          )}
          {!threadsLoading && (
            <div className="space-y-2">
              {filteredThreads.map((thread) => {
                const lastSeen = getLastSeenAt(thread.calendarEventId);
                const unread =
                  chatMyUserId && thread.lastMessageSenderId !== chatMyUserId && lastSeen && thread.lastMessageCreatedAt > lastSeen ? 1 : 0;
                const isClosed = ['completed', 'verified'].includes(thread.status);
                const snippet =
                  thread.lastMessageText.length > 60 ? thread.lastMessageText.slice(0, 60) + '…' : thread.lastMessageText;
                const taskTypeForColor = thread.taskType || thread.taskTypeLabel || 'other';
                const colorString = getTaskColor(taskTypeForColor);
                const parts = colorString.split(' ');
                const borderClass = parts.find((p) => p.startsWith('border-')) || 'border-gray-500';
                const textClass = parts.find((p) => p.startsWith('text-')) || 'text-gray-400';
                const isSelected = selectedThreadId === thread.calendarEventId;
                return (
                  <div
                    key={thread.calendarEventId}
                    onClick={() => setSelectedThreadId(thread.calendarEventId)}
                    className={`rounded-2xl p-[2px] border-2 ${borderClass} cursor-pointer transition-colors ${isClosed ? 'opacity-60' : ''}`}
                  >
                    <div
                      className={`
                        relative rounded-[14px] bg-white/[0.03] p-3 transition-colors
                        shadow-[0_1px_0_0_rgba(255,255,255,0.04)]
                        hover:bg-white/[0.06]
                        ${isSelected ? 'ring-2 ring-white/15 bg-white/[0.06]' : ''}
                      `}
                    >
                    <div className="relative flex flex-col space-y-1">
                      <div className="flex justify-between items-start gap-2">
                        <h3
                          className={`text-sm font-semibold truncate flex-1 min-w-0 ${textClass} ${isClosed ? 'line-through' : ''}`}
                        >
                          {thread.taskTitle || thread.title}
                        </h3>
                        <span className="text-xs text-white/50 whitespace-nowrap flex-shrink-0">
                          {formatLastActivity(thread.lastMessageCreatedAt)}
                        </span>
                      </div>
                      {thread.propertyLabel && (
                        <p className="text-xs text-white/60 truncate">{thread.propertyLabel}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-white/55">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 flex-shrink-0" />
                          {thread.dueAt ? formatDueDate(thread.dueAt) : '—'}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3 flex-shrink-0" />
                          {thread.assigneeName ?? '—'}
                        </span>
                      </div>
                      <p className={`text-xs truncate mt-1 ${unread ? 'text-white/60 font-medium' : 'text-white/50'}`}>
                        {snippet || '—'}
                      </p>
                    </div>
                    {unread > 0 && (
                      <div className="absolute top-3 right-3 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white">
                        1
                      </div>
                    )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Chat panel */}
      <div className="flex-1 flex flex-col bg-[#0D1117] relative">
        {threads.length === 0 && !threadsLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-8 text-center">
            <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4">
              <Clock className="w-8 h-8" />
            </div>
            <p className="font-medium text-white mb-1">No task chats yet</p>
            <p className="text-sm">Task chats appear when messages are sent from tasks in Calendar or Kanban.</p>
          </div>
        ) : !selectedThread ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
            <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4">
              <Clock className="w-8 h-8" />
            </div>
            <p>Select a thread to view messages</p>
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-gray-800 bg-[#161B22] flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center border-l-4 ${(() => {
                    const cs = getTaskColor(selectedThread.taskType || selectedThread.taskTypeLabel || 'other').split(' ');
                    const border = cs.find((p) => p.startsWith('border-')) || 'border-gray-500';
                    const bg = cs.find((p) => p.startsWith('bg-')) || 'bg-gray-500/10';
                    const text = cs.find((p) => p.startsWith('text-')) || 'text-gray-400';
                    return `${border} ${bg} ${text}`;
                  })()}`}
                  aria-hidden
                >
                  <Calendar className="w-5 h-5 opacity-90" />
                </div>
                <div>
                  <h2 className={`text-white font-bold ${isClosedTask ? 'line-through opacity-80' : ''}`}>
                    {selectedThread.taskTitle || selectedThread.title}
                  </h2>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    {selectedThread.propertyLabel && (
                      <>
                        <MapPin className="w-3 h-3" />
                        <span>{selectedThread.propertyLabel}</span>
                      </>
                    )}
                    {isClosedTask && (
                      <span className="text-amber-400/90">Task closed</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0D1117] min-h-0">
              {messagesLoading && (
                <div className="text-center text-gray-500 text-sm py-2">Loading messages…</div>
              )}
              {!messagesLoading &&
                threadMessages.map((msg) => {
                  const isMe = !!chatMyUserId && msg.senderId === chatMyUserId;
                  const senderLabel = isMe ? 'You' : 'Worker';
                  const hidePlaceholder =
                    msg.attachments?.length && ['📎 Attachment', 'Attachment'].includes((msg.messageText ?? '').trim());
                  return (
                    <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        <span className="text-[11px] text-white/40 mb-1">{senderLabel}</span>
                        <div
                          className={`p-3 text-sm ${
                            isMe
                              ? 'bg-[#005c4b] text-white rounded-tr-md rounded-tl-2xl rounded-bl-2xl rounded-br-2xl'
                              : 'bg-[#202c33] text-gray-200 rounded-tl-md rounded-tr-2xl rounded-br-2xl rounded-bl-2xl'
                          }`}
                        >
                          {!hidePlaceholder && msg.messageText ? (
                            <span className="block">{msg.messageText}</span>
                          ) : null}
                          {msg.attachments?.length ? (
                            <div className="space-y-2 mt-1">
                              {msg.attachments.map((att, attIdx) => {
                                const bucket = att.bucket ?? TASK_MEDIA_BUCKET;
                                const path = att.path ?? '';
                                const cacheKey = `${bucket}:${path}`;
                                const cached = attachmentUrlCache[cacheKey];
                                const thumbUrl = cached && isCacheValid(cached) ? cached.url : null;
                                const image = isImageAtt(att);
                                const pdf = isPdfAtt(att);
                                const handleCardClick = () => {
                                  if (image) {
                                    getCachedOrFetchUrl(att)
                                      .then((url) => {
                                        setLightboxImageUrl(url);
                                        setLightboxAtt(att);
                                      })
                                      .catch(() => alert('Could not open image.'));
                                  } else {
                                    openAttachment(att);
                                  }
                                };
                                return (
                                  <div
                                    key={attIdx}
                                    role="button"
                                    tabIndex={0}
                                    onClick={handleCardClick}
                                    onKeyDown={(e) => e.key === 'Enter' && handleCardClick()}
                                    className="mt-2 w-full max-w-[320px] rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition px-3 py-2 cursor-pointer"
                                  >
                                    {image ? (
                                      <>
                                        {thumbUrl ? (
                                          <img
                                            src={thumbUrl}
                                            alt={att.filename ?? ''}
                                            className="mt-2 max-h-36 w-auto rounded-lg border border-white/10 object-cover"
                                          />
                                        ) : (
                                          <div className="flex items-center gap-3 py-1">
                                            <div className="h-9 w-9 rounded-lg bg-black/20 flex items-center justify-center border border-white/10">
                                              <ImageIcon className="w-5 h-5 text-white/60" />
                                            </div>
                                            <p className="text-xs text-white/60">Loading…</p>
                                          </div>
                                        )}
                                        <p className="text-xs text-white/60 mt-1 truncate">{att.filename ?? 'Image'}</p>
                                      </>
                                    ) : (
                                      <div className="flex items-center gap-3">
                                        <div className="h-9 w-9 rounded-lg bg-black/20 flex items-center justify-center border border-white/10">
                                          {pdf ? (
                                            <FileText className="w-5 h-5 text-white/70" />
                                          ) : (
                                            <FileIcon className="w-5 h-5 text-white/70" />
                                          )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <p className="text-sm font-medium text-white truncate">{att.filename ?? 'File'}</p>
                                          <p className="text-xs text-white/60">
                                            {pdf ? 'PDF' : att.mimeType ?? 'File'}
                                            {att.size != null ? ` · ${Math.round(att.size / 1024)} KB` : ''}
                                          </p>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                          <div className="text-[10px] text-white/50 text-right mt-1">
                            {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="p-4 bg-[#161B22] border-t border-gray-800">
              {isClosedTask ? (
                <div className="text-center text-gray-500 text-xs py-2 flex items-center justify-center gap-2">
                  <span>Task closed — chat is read-only.</span>
                </div>
              ) : (
                <div className="flex items-end gap-2 bg-[#0D1117] p-1 rounded-xl border border-gray-700">
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleAttachmentUpload}
                    disabled={chatUploading}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={chatUploading}
                    className="p-3 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Paperclip className="w-5 h-5" />
                  </button>
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Type a message..."
                    className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none px-2 py-3"
                  />
                  <button
                    type="button"
                    onClick={handleSendMessage}
                    disabled={!inputText.trim() || sending}
                    className="p-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors m-1"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* Lightbox */}
        {lightboxAtt && (
          <div
            className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-6"
            onClick={() => {
              setLightboxAtt(null);
              setLightboxImageUrl(null);
            }}
          >
            <div
              className="relative max-w-5xl w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => {
                  setLightboxAtt(null);
                  setLightboxImageUrl(null);
                }}
                className="absolute -top-10 right-0 p-2 text-white hover:bg-white/10 rounded-lg"
              >
                <X className="w-6 h-6" />
              </button>
              {lightboxImageUrl && (
                <img
                  src={lightboxImageUrl}
                  alt={lightboxAtt.filename ?? ''}
                  className="max-h-[80vh] w-auto mx-auto rounded-xl border border-white/10"
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminMessages;
