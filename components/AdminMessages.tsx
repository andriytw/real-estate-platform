
import React, { useState, useRef, useEffect } from 'react';
import { Search, Paperclip, Send, MapPin, User, Circle, CheckCheck, Clock, Filter, MoreVertical, Phone, Video, Image as ImageIcon, FileText, AlertCircle, Archive, Users } from 'lucide-react';
import { MOCK_PROPERTIES } from '../constants';

// Types for the messaging system
interface Message {
  id: string;
  sender: 'admin' | 'worker';
  senderName: string;
  text: string;
  timestamp: string;
  isRead: boolean;
  // Context: Is this message linked to a specific task?
  taskContext?: {
    taskId: string;
    taskTitle: string;
    taskType: string; // e.g., 'Reklamation', 'Einzug'
    status: 'Open' | 'In Review' | 'Solved' | 'Archived';
  };
  attachment?: {
    type: 'image' | 'video' | 'file';
    name: string;
    url?: string;
  };
}

interface PropertyChat {
  id: string; // Unique ID for the chat context
  propertyId?: string; // Optional, as General Chat has no property ID
  title: string;
  subtitle?: string;
  image: string | React.ReactNode; // Can be URL or Icon component
  unreadCount: number;
  lastMessage: Message;
  messages: Message[];
  isGeneral?: boolean;
}

// Mock Data Generation
const generateMockChats = (): PropertyChat[] => {
  // 1. Create General Chat
  const generalChat: PropertyChat = {
    id: 'chat-general',
    title: 'General Team Chat',
    subtitle: 'All Staff',
    image: 'icon-users', // Marker to render icon instead of img
    unreadCount: 3,
    isGeneral: true,
    lastMessage: {
      id: 'm-gen-last',
      sender: 'worker',
      senderName: 'Anna Schmidt',
      text: 'Does anyone have the master key for the Charlottenburg office?',
      timestamp: '10:45',
      isRead: false
    },
    messages: [
      {
        id: 'm-gen-1',
        sender: 'admin',
        senderName: 'Me',
        text: 'Weekly team meeting is moved to Friday 10 AM.',
        timestamp: 'Mon, 09:00',
        isRead: true
      },
      {
        id: 'm-gen-2',
        sender: 'worker',
        senderName: 'Anna Schmidt',
        text: 'Does anyone have the master key for the Charlottenburg office?',
        timestamp: '10:45',
        isRead: false
      }
    ]
  };

  // 2. Create Property Chats
  const propertyChats = MOCK_PROPERTIES.map((prop, index) => {
    const hasUnread = index === 0 || index === 2;
    
    const messages: Message[] = [
      {
        id: `m-${prop.id}-1`,
        sender: 'admin',
        senderName: 'Me',
        text: 'Please check the radiator in the living room during your visit.',
        timestamp: 'Yesterday, 14:00',
        isRead: true,
        taskContext: {
          taskId: 't-101',
          taskTitle: 'Annual Inspection',
          taskType: 'Arbeit nach plan',
          status: 'Archived' // This should be hidden by default
        }
      }
    ];

    if (index === 0) { // Friedrichstraße (Active Issue)
      messages.push({
        id: `m-${prop.id}-2`,
        sender: 'worker',
        senderName: 'Hans Weber',
        text: 'I found the issue. The valve is stuck. Do we have spare parts in the warehouse or should I buy one?',
        timestamp: '09:15',
        isRead: false,
        taskContext: {
          taskId: 't-102',
          taskTitle: 'Heating Repair',
          taskType: 'Reklamation',
          status: 'In Review'
        },
        attachment: {
          type: 'image',
          name: 'valve_photo.jpg',
          url: 'https://images.unsplash.com/photo-1585909695334-9360a31772a3?q=80&w=2070&auto=format&fit=crop'
        }
      });
    } else if (index === 2) { // Kurfürstendamm (General Question)
        messages.push({
            id: `m-${prop.id}-3`,
            sender: 'worker',
            senderName: 'Julia Müller',
            text: 'The tenant is asking for an extra set of keys. Is this approved?',
            timestamp: '10:30',
            isRead: false,
            // No task context (General property message)
        });
    } else {
        messages.push({
            id: `m-${prop.id}-last`,
            sender: 'worker',
            senderName: 'Max Mustermann',
            text: 'Task completed. Everything looks good.',
            timestamp: 'Mon, 16:00',
            isRead: true,
            taskContext: {
                taskId: 't-99',
                taskTitle: 'Final Cleaning',
                taskType: 'Putzen',
                status: 'Solved'
            }
        });
    }

    return {
      id: `chat-prop-${prop.id}`,
      propertyId: prop.id,
      title: prop.address,
      subtitle: `${prop.zip} ${prop.city}, ${prop.district}`,
      image: prop.image,
      unreadCount: hasUnread ? (index === 0 ? 1 : 2) : 0,
      lastMessage: messages[messages.length - 1],
      messages: messages
    };
  });

  return [generalChat, ...propertyChats];
};

const AdminMessages: React.FC = () => {
  const [chats, setChats] = useState<PropertyChat[]>(generateMockChats());
  const [selectedChatId, setSelectedChatId] = useState<string>(chats[0].id);
  const [inputText, setInputText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedChat = chats.find(c => c.id === selectedChatId);

  // Scroll to bottom on new message or chat change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedChat?.messages, showArchived]);

  const handleSendMessage = () => {
    if (!inputText.trim() || !selectedChat) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      sender: 'admin',
      senderName: 'Me',
      text: inputText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isRead: true,
      // If the last message had a context, we assume the reply is in the same context unless archived
      taskContext: selectedChat.messages[selectedChat.messages.length - 1].taskContext?.status !== 'Archived' 
        ? selectedChat.messages[selectedChat.messages.length - 1].taskContext 
        : undefined
    };

    const updatedChats = chats.map(chat => {
      if (chat.id === selectedChatId) {
        return {
          ...chat,
          messages: [...chat.messages, newMessage],
          lastMessage: newMessage
        };
      }
      return chat;
    });

    setChats(updatedChats);
    setInputText('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && selectedChat) {
        const file = e.target.files[0];
        const newMessage: Message = {
            id: Date.now().toString(),
            sender: 'admin',
            senderName: 'Me',
            text: `Sent an attachment: ${file.name}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isRead: true,
            attachment: {
                type: file.type.startsWith('image') ? 'image' : 'file',
                name: file.name
            }
        };

        const updatedChats = chats.map(chat => {
            if (chat.id === selectedChatId) {
              return {
                ...chat,
                messages: [...chat.messages, newMessage],
                lastMessage: newMessage
              };
            }
            return chat;
          });
      
          setChats(updatedChats);
    }
  };

  const filteredChats = chats.filter(chat => 
    chat.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Helper to get status color
  const getStatusColor = (status: string) => {
      switch(status) {
          case 'Open': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
          case 'In Review': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
          case 'Solved': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
          case 'Archived': return 'bg-gray-700 text-gray-400 border-gray-600';
          default: return 'bg-gray-700 text-gray-400';
      }
  };

  // Filter messages for display based on archive status
  const displayedMessages = selectedChat?.messages.filter(msg => {
    if (showArchived) return true;
    // If message belongs to an Archived task, hide it
    if (msg.taskContext?.status === 'Archived') return false;
    return true;
  }) || [];

  return (
    <div className="flex h-[calc(100vh-6rem)] bg-[#0D1117] rounded-xl border border-gray-800 shadow-2xl overflow-hidden">
      
      {/* LEFT SIDEBAR: Property List */}
      <div className="w-full md:w-[380px] bg-[#161B22] border-r border-gray-800 flex flex-col">
        
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-lg font-bold text-white mb-4">Messages</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input 
              type="text" 
              placeholder="Search property or team..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#0D1117] border border-gray-700 rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto">
          {filteredChats.map((chat) => (
            <div 
              key={chat.id}
              onClick={() => setSelectedChatId(chat.id)}
              className={`
                p-4 border-b border-gray-800 cursor-pointer transition-colors hover:bg-[#1C2128] flex gap-3 items-start relative
                ${selectedChatId === chat.id ? 'bg-[#1C2128] border-l-4 border-l-emerald-500' : 'border-l-4 border-l-transparent'}
              `}
            >
              {/* Avatar / Image */}
              {chat.image === 'icon-users' ? (
                <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0 text-blue-400 border border-blue-500/30">
                  <Users className="w-6 h-6" />
                </div>
              ) : (
                <img 
                  src={chat.image as string} 
                  alt={chat.title} 
                  className="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-gray-700"
                />
              )}
              
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-1">
                  <h3 className={`text-sm font-bold truncate pr-2 ${chat.unreadCount > 0 ? 'text-white' : 'text-gray-300'}`}>
                    {chat.title}
                  </h3>
                  <span className="text-[10px] text-gray-500 whitespace-nowrap">
                    {chat.lastMessage.timestamp.includes(',') ? chat.lastMessage.timestamp.split(',')[0] : chat.lastMessage.timestamp}
                  </span>
                </div>
                
                <p className={`text-xs truncate ${chat.unreadCount > 0 ? 'text-gray-300 font-medium' : 'text-gray-500'}`}>
                  <span className="text-emerald-500 mr-1">{chat.lastMessage.sender === 'admin' ? 'You:' : `${chat.lastMessage.senderName}:`}</span>
                  {chat.lastMessage.text}
                </p>

                {chat.lastMessage.taskContext && (
                    <div className="mt-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-gray-800 text-gray-400 border border-gray-700">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Task: {chat.lastMessage.taskContext.taskTitle}
                    </div>
                )}
              </div>

              {chat.unreadCount > 0 && (
                <div className="absolute top-4 right-4 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-lg shadow-emerald-900/20">
                  {chat.unreadCount}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT SIDEBAR: Chat Area */}
      <div className="flex-1 flex flex-col bg-[#0D1117] relative">
        {selectedChat ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-gray-800 bg-[#161B22] flex justify-between items-center shadow-sm z-10">
              <div className="flex items-center gap-4">
                <div className="relative">
                    {selectedChat.image === 'icon-users' ? (
                      <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
                        <Users className="w-5 h-5" />
                      </div>
                    ) : (
                      <img 
                        src={selectedChat.image as string} 
                        alt="Property" 
                        className="w-10 h-10 rounded-lg object-cover"
                      />
                    )}
                    <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-green-500 border-2 border-[#161B22] rounded-full"></div>
                </div>
                <div>
                  <h2 className="text-white font-bold flex items-center gap-2">
                    {selectedChat.title}
                  </h2>
                  {selectedChat.isGeneral ? (
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <Users className="w-3 h-3" />
                      <span>All Staff (3)</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <MapPin className="w-3 h-3" />
                      <span>{selectedChat.subtitle}</span>
                      <span className="text-gray-600">•</span>
                      <User className="w-3 h-3" />
                      <span>Workers: Hans, Julia</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2 items-center">
                {/* Archive Toggle */}
                <button 
                  onClick={() => setShowArchived(!showArchived)}
                  className={`
                    p-2 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium mr-2
                    ${showArchived ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'}
                  `}
                  title={showArchived ? "Hide Archive" : "Show Archive"}
                >
                  <Archive className="w-4 h-4" />
                  <span className="hidden md:inline">{showArchived ? 'Hide Archive' : 'Show Archive'}</span>
                </button>

                <div className="h-6 w-px bg-gray-700 mx-1"></div>

                <button className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors">
                    <Phone className="w-5 h-5" />
                </button>
                <button className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors">
                    <Video className="w-5 h-5" />
                </button>
                <button className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors">
                    <MoreVertical className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Messages Stream */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-[#0D1117] bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-fixed bg-opacity-5">
              
              {displayedMessages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <p>No messages to show.</p>
                  {!showArchived && selectedChat.messages.some(m => m.taskContext?.status === 'Archived') && (
                    <button onClick={() => setShowArchived(true)} className="text-emerald-500 text-sm mt-2 hover:underline">
                      View archived messages
                    </button>
                  )}
                </div>
              )}

              {displayedMessages.map((msg, index) => {
                const showAvatar = index === 0 || displayedMessages[index - 1].sender !== msg.sender;
                
                return (
                  <div key={msg.id} className={`flex flex-col ${msg.sender === 'admin' ? 'items-end' : 'items-start'}`}>
                    
                    {/* Task Context Pill */}
                    {msg.taskContext && (
                        <div className={`
                            mb-1 flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border bg-[#1C1F24] shadow-sm max-w-xs
                            ${msg.sender === 'admin' ? 'mr-2' : 'ml-12'}
                            ${msg.taskContext.status === 'Archived' ? 'opacity-60 grayscale' : ''}
                        `}>
                            <span className={`w-2 h-2 rounded-full ${msg.taskContext.status === 'Solved' ? 'bg-emerald-500' : msg.taskContext.status === 'Archived' ? 'bg-gray-500' : 'bg-yellow-500'}`}></span>
                            <span className="text-gray-300">Task: {msg.taskContext.taskTitle}</span>
                            <span className={`px-1.5 rounded text-[9px] border ${getStatusColor(msg.taskContext.status)}`}>
                                {msg.taskContext.status}
                            </span>
                        </div>
                    )}

                    <div className="flex gap-3 max-w-[80%]">
                        {/* Avatar for Worker */}
                        {msg.sender === 'worker' && (
                            <div className={`w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 ${!showAvatar ? 'opacity-0' : ''}`}>
                                <span className="text-emerald-500 font-bold text-xs">{msg.senderName.charAt(0)}</span>
                            </div>
                        )}

                        {/* Message Bubble */}
                        <div 
                            className={`
                                relative px-4 py-3 text-sm shadow-md
                                ${msg.sender === 'admin' 
                                    ? 'bg-[#005c4b] text-white rounded-2xl rounded-tr-none' 
                                    : 'bg-[#1F2C34] text-gray-100 rounded-2xl rounded-tl-none'}
                            `}
                        >
                            {/* Sender Name (Only for worker in group context) */}
                            {msg.sender === 'worker' && showAvatar && (
                                <p className="text-emerald-500 text-xs font-bold mb-1">{msg.senderName}</p>
                            )}

                            {/* Attachment */}
                            {msg.attachment && (
                                <div className="mb-2 mt-1">
                                    {msg.attachment.type === 'image' && msg.attachment.url ? (
                                        <img src={msg.attachment.url} alt="Attachment" className="rounded-lg max-h-48 object-cover border border-white/10" />
                                    ) : (
                                        <div className="flex items-center gap-2 bg-black/20 p-3 rounded-lg">
                                            <FileText className="w-5 h-5 text-white/70" />
                                            <span className="underline">{msg.attachment.name}</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                            
                            <div className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${msg.sender === 'admin' ? 'text-emerald-200' : 'text-gray-500'}`}>
                                <span>{msg.timestamp}</span>
                                {msg.sender === 'admin' && <CheckCheck className="w-3 h-3" />}
                            </div>
                        </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-[#161B22] border-t border-gray-800">
              <div className="flex items-end gap-2 bg-[#0D1117] p-1 rounded-xl border border-gray-700">
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    onChange={handleFileUpload}
                />
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="p-3 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
                
                <input 
                  type="text" 
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Type a message to the team..."
                  className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none px-2 py-3"
                />
                
                <button 
                  onClick={handleSendMessage}
                  disabled={!inputText.trim()}
                  className="p-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors m-1"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[10px] text-center text-gray-600 mt-2">
                  Messages sent here are visible to all assigned workers for this property.
              </p>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
            <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4">
                <Clock className="w-8 h-8" />
            </div>
            <p>Select a property or chat to view messages</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminMessages;
