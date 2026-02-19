
import React, { useState, useEffect } from 'react';
import { Search, Filter, MessageSquare, User, Calendar, FileText, Plus, Send, CheckCircle2, Clock } from 'lucide-react';
import { ChatRoom, Message, RequestData, Client } from '../types';
import { chatRoomsService, messagesService, type ChatRoomWithContext } from '../services/supabaseService';

// Parse marketplace guest first message (contact header + optional message)
function parseMarketplaceHeader(text: string | null | undefined): { isHeader: boolean; name: string; email: string; phone: string; message: string } {
  const t = (text ?? '').trim();
  const hasAll = t.includes('Name:') && t.includes('Email:') && t.includes('Phone:') && t.includes('Message:');
  if (!hasAll) return { isHeader: false, name: '', email: '', phone: '', message: '' };
  const after = (key: string) => {
    const i = t.indexOf(key);
    if (i === -1) return '';
    const start = i + key.length;
    const rest = t.slice(start);
    const pipe = rest.indexOf('|');
    const nl = rest.indexOf('\n');
    const end = pipe === -1 ? (nl === -1 ? rest.length : nl) : (nl === -1 ? pipe : Math.min(pipe, nl));
    return rest.slice(0, end).trim();
  };
  const msgStart = t.indexOf('Message:');
  const messagePart = msgStart === -1 ? '' : t.slice(msgStart + 'Message:'.length).trim();
  const message = (messagePart === '' || /^\(no message\)$/i.test(messagePart.trim())) ? '' : messagePart;
  return {
    isHeader: true,
    name: after('Name:'),
    email: after('Email:'),
    phone: after('Phone:'),
    message,
  };
}

function extractGuestName(text: string | null | undefined): string {
  const parsed = parseMarketplaceHeader(text);
  return parsed.isHeader && parsed.name ? parsed.name : 'Client';
}

const clientsService = {
  getById: async (_id: string) => null as Client | null,
};

interface SalesChatProps {
  onCreateOffer?: (request: RequestData) => void;
  onViewRequest?: (request: RequestData) => void;
}

type FilterType = 'all' | 'active' | 'unread' | 'archived';

const SalesChat: React.FC<SalesChatProps> = ({ onCreateOffer, onViewRequest }) => {
  const [chatRooms, setChatRooms] = useState<ChatRoomWithContext[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoomWithContext | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [request, setRequest] = useState<RequestData | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [messageText, setMessageText] = useState('');

  // Load chat rooms
  useEffect(() => {
    loadChatRooms();
  }, [filter]);

  // Load messages when room is selected
  useEffect(() => {
    if (selectedRoom) {
      loadMessages(selectedRoom.id);
      if (selectedRoom.requestId) loadRequest(selectedRoom.requestId);
      if (selectedRoom.clientId) loadClient(selectedRoom.clientId);
    }
  }, [selectedRoom]);

  const loadChatRooms = async () => {
    try {
      setLoading(true);
      const rooms = await chatRoomsService.getAll();
      setChatRooms(rooms);
    } catch (error) {
      console.error('Error loading chat rooms:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (roomId: string) => {
    try {
      const roomMessages = await messagesService.getByRoomId(roomId);
      setMessages(roomMessages);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const loadRequest = async (requestId: string) => {
    try {
      // TODO: Implement requestsService.getById()
      setRequest(null);
    } catch (error) {
      console.error('Error loading request:', error);
    }
  };

  const loadClient = async (clientId: string) => {
    try {
      // TODO: Implement clientsService.getById()
      setClient(null);
    } catch (error) {
      console.error('Error loading client:', error);
    }
  };

  const sendMessage = async () => {
    if (!messageText.trim() || !selectedRoom) return;

    try {
      // TODO: Implement messagesService.create()
      // For now, just clear input
      setMessageText('');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const filteredRooms = chatRooms.filter(room => {
    if (filter === 'active' && room.status !== 'active') return false;
    if (filter === 'unread' && room.unreadCountManager === 0) return false;
    if (filter === 'archived' && room.status !== 'archived') return false;
    if (searchQuery && !client) return false; // Need client data for search
    return true;
  });

  return (
    <div className="flex h-full bg-[#0D0F11]">
      {/* Left Panel - Chat List */}
      <div className="w-1/3 border-r border-gray-800 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Chats</h2>
            <button className="p-2 hover:bg-gray-800 rounded-lg">
              <Plus className="w-5 h-5 text-gray-400" />
            </button>
          </div>
          
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[#1C1F24] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Filters */}
          <div className="flex gap-2">
            {(['all', 'active', 'unread', 'archived'] as FilterType[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  filter === f
                    ? 'bg-emerald-500 text-white'
                    : 'bg-[#1C1F24] text-gray-400 hover:bg-gray-800'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-gray-400">Loading...</div>
          ) : filteredRooms.length === 0 ? (
            <div className="p-4 text-center text-gray-400">No chats found</div>
          ) : (
            filteredRooms.map((room) => (
              <div
                key={room.id}
                onClick={() => setSelectedRoom(room)}
                className={`p-4 border-b border-gray-800 cursor-pointer hover:bg-[#1C1F24] transition-colors ${
                  selectedRoom?.id === room.id ? 'bg-[#1C1F24] border-l-2 border-emerald-500' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="font-medium text-white">{extractGuestName(room.first_message_text)}</span>
                      {room.unreadCountManager > 0 && (
                        <span className="bg-emerald-500 text-white text-xs px-2 py-0.5 rounded-full">
                          {room.unreadCountManager}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-400 truncate">
                      {room.property ? `${room.property.address ?? ''} — ${room.property.title ?? ''}`.trim() : (room.lastMessageAt ? new Date(room.lastMessageAt).toLocaleDateString() : 'No messages')}
                    </p>
                  </div>
                  <div className={`w-2 h-2 rounded-full ${
                    room.status === 'active' ? 'bg-emerald-500' : 'bg-gray-500'
                  }`} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Panel - Chat Details */}
      <div className="flex-1 flex flex-col">
        {selectedRoom ? (
          <>
            {/* Request Details */}
            {request && (
              <div className="p-4 border-b border-gray-800 bg-[#1C1F24]">
                <h3 className="text-lg font-semibold text-white mb-2">Request Details</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-gray-300">
                    <Calendar className="w-4 h-4" />
                    <span>{request.dateFrom} - {request.dateTo}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-300">
                    <User className="w-4 h-4" />
                    <span>{request.guests} guests</span>
                  </div>
                  {request.message && (
                    <div className="mt-2 p-2 bg-[#0D0F11] rounded border border-gray-700">
                      <p className="text-gray-300 text-xs">{request.message}</p>
                    </div>
                  )}
                  <div className="flex gap-2 mt-3">
                    {onCreateOffer && (
                      <button
                        onClick={() => onCreateOffer(request)}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        Create Offer
                      </button>
                    )}
                    {onViewRequest && (
                      <button
                        onClick={() => onViewRequest(request)}
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        View Request
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Chat context header (guest + property) when no Request Details */}
            {selectedRoom && !request && (
              <div className="p-4 border-b border-gray-800 bg-[#1C1F24]">
                <p className="text-sm text-white">
                  {extractGuestName(selectedRoom.first_message_text)}
                  {selectedRoom.property && (selectedRoom.property.address || selectedRoom.property.title) && (
                    <> · {`${selectedRoom.property.address ?? ''} — ${selectedRoom.property.title ?? ''}`.trim()}</>
                  )}
                </p>
              </div>
            )}

            {/* Messages: contact header never as bubble; show only real message text */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="text-center text-gray-400 py-8">No messages yet</div>
              ) : (
                messages.map((msg) => {
                  const parsed = parseMarketplaceHeader(msg.text);
                  if (parsed.isHeader) {
                    if (parsed.message === '') return null;
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${msg.senderType === 'manager' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-lg p-3 ${
                            msg.senderType === 'manager'
                              ? 'bg-emerald-500 text-white'
                              : 'bg-[#1C1F24] text-gray-300'
                          }`}
                        >
                          <p className="text-sm">{parsed.message}</p>
                          <p className="text-xs mt-1 opacity-70">
                            {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString() : ''}
                          </p>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${msg.senderType === 'manager' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-lg p-3 ${
                          msg.senderType === 'manager'
                            ? 'bg-emerald-500 text-white'
                            : 'bg-[#1C1F24] text-gray-300'
                        }`}
                      >
                        <p className="text-sm">{msg.text}</p>
                        <p className="text-xs mt-1 opacity-70">
                          {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString() : ''}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Message Input */}
            <div className="p-4 border-t border-gray-800">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 bg-[#1C1F24] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                />
                <button
                  onClick={sendMessage}
                  disabled={!messageText.trim()}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>Select a chat to start messaging</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SalesChat;

