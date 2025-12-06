import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Image as ImageIcon } from 'lucide-react';
import { TaskChatMessage } from '../types';
import { taskChatService } from '../services/supabaseService';
import { useWorker } from '../contexts/WorkerContext';

interface TaskChatModalProps {
  eventId: string;
  onClose: () => void;
}

export default function TaskChatModal({ eventId, onClose }: TaskChatModalProps) {
  const { worker } = useWorker();
  const [messages, setMessages] = useState<TaskChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadMessages = async () => {
      try {
        setLoading(true);
        const loadedMessages = await taskChatService.getMessagesByEventId(eventId);
        setMessages(loadedMessages);
      } catch (error) {
        console.error('Error loading messages:', error);
      } finally {
        setLoading(false);
      }
    };

    loadMessages();

    // Subscribe to new messages
    const subscription = taskChatService.subscribeToMessages(eventId, (newMessage) => {
      setMessages(prev => [...prev, newMessage]);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [eventId]);

  useEffect(() => {
    // Scroll to bottom when messages change
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!inputText.trim() || !worker || sending) return;

    try {
      setSending(true);
      const newMessage = await taskChatService.sendMessage(eventId, worker.id, inputText.trim());
      setMessages(prev => [...prev, newMessage]);
      setInputText('');
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Помилка відправки повідомлення');
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-end justify-end" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 w-full max-w-md h-[500px] rounded-t-xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-3 bg-indigo-600 text-white rounded-t-xl">
          <h3 className="text-lg font-semibold truncate">💬 Чат для Завдання</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-indigo-500 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Messages */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto p-3 space-y-2"
          style={{ maxHeight: 'calc(500px - 100px)' }}
        >
          {loading ? (
            <div className="text-center py-4">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Завантаження...</p>
            </div>
          ) : messages.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">
              Історія чату порожня. Надішліть перше повідомлення!
            </p>
          ) : (
            messages.map((msg) => {
              const isWorker = msg.senderId === worker?.id;
              return (
                <div key={msg.id} className={`flex ${isWorker ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`px-3 py-2 text-sm shadow-md rounded-lg max-w-[85%] ${
                      isWorker
                        ? 'bg-indigo-500 text-white rounded-br-sm'
                        : 'bg-red-200 dark:bg-red-900/50 text-gray-800 dark:text-gray-100 rounded-bl-sm'
                    }`}
                  >
                    <span className="block font-semibold mb-1 text-xs opacity-80">
                      {isWorker ? 'Ви' : 'Менеджер'}
                    </span>
                    <div>{msg.messageText}</div>
                    <div className={`text-xs mt-1 ${isWorker ? 'text-white/60' : 'text-gray-500'} text-right`}>
                      {formatTime(msg.createdAt)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="p-2 border-t border-gray-200 dark:border-gray-700">
          <div className="flex space-x-2">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={handleKeyPress}
              rows={1}
              placeholder="Ваше повідомлення менеджеру..."
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 resize-none"
              disabled={sending}
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || sending}
              className="p-2 rounded-lg bg-indigo-500 text-white font-medium hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 shadow-md flex-shrink-0"
            >
              <Send className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

