
import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Paperclip, MoreVertical, Check, CheckCheck, Bot, User } from 'lucide-react';

interface ChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyTitle: string;
}

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'agent' | 'system';
  time: string;
  isRead?: boolean;
}

interface UserDetails {
  name: string;
  email: string;
  phone: string;
  clientType?: 'private' | 'company';
  companyName?: string;
  companyAddress?: string;
  peopleCount?: string;
  dateFrom?: string;
  dateTo?: string;
}

type ChatStage = 
  | 'ask_name' 
  | 'ask_email' 
  | 'ask_phone' 
  | 'ask_client_type'
  | 'ask_company_name'
  | 'ask_company_address'
  | 'ask_people'
  | 'ask_date_from'
  | 'ask_date_to'
  | 'connected';

const ChatModal: React.FC<ChatModalProps> = ({ isOpen, onClose, propertyTitle }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  
  // Data Collection State
  const [chatStage, setChatStage] = useState<ChatStage>('ask_name');
  const [userDetails, setUserDetails] = useState<UserDetails>({ name: '', email: '', phone: '' });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Agent Details
  const agentName = "Julia Müller";
  const agentAvatar = "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=1887&auto=format&fit=crop";

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Initialize chat when opened
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      // Initial AI Message
      const initialMsg: Message = {
        id: '1',
        text: `Hello! I am the BIM/LAF digital assistant. Before I connect you with our rental manager, may I have your name?`,
        sender: 'system',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages([initialMsg]);
      setChatStage('ask_name');
    }
  }, [isOpen]);

  const addBotMessage = (text: string, sender: 'agent' | 'system' = 'system', delay = 1000) => {
    setIsTyping(true);
    setTimeout(() => {
      const msg: Message = {
        id: Date.now().toString(),
        text,
        sender,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, msg]);
      setIsTyping(false);
    }, delay);
  };

  const handleSend = () => {
    if (!inputValue.trim()) return;

    const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Add User Message
    const userMsg: Message = {
      id: Date.now().toString(),
      text: inputValue,
      sender: 'user',
      time: currentTime,
      isRead: false
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');

    // Logic based on Chat Stage
    if (chatStage === 'ask_name') {
      setUserDetails(prev => ({ ...prev, name: inputValue }));
      setChatStage('ask_email');
      addBotMessage(`Nice to meet you, ${inputValue}. Please provide your email address.`);
    } 
    else if (chatStage === 'ask_email') {
      setUserDetails(prev => ({ ...prev, email: inputValue }));
      setChatStage('ask_phone');
      addBotMessage(`Thank you. What is your phone number?`);
    } 
    else if (chatStage === 'ask_phone') {
      setUserDetails(prev => ({ ...prev, phone: inputValue }));
      setChatStage('ask_client_type');
      addBotMessage(`Are you looking for accommodation as a private person or as a company? (Please type 'Private' or 'Company')`);
    }
    else if (chatStage === 'ask_client_type') {
      const lowerInput = inputValue.toLowerCase();
      const isCompany = lowerInput.includes('company') || lowerInput.includes('firm') || lowerInput.includes('business') || lowerInput.includes('фірма');
      
      if (isCompany) {
        setUserDetails(prev => ({ ...prev, clientType: 'company' }));
        setChatStage('ask_company_name');
        addBotMessage(`Understood. What is the name of your company?`);
      } else {
        setUserDetails(prev => ({ ...prev, clientType: 'private' }));
        setChatStage('ask_people');
        addBotMessage(`Got it. How many people will be staying?`);
      }
    }
    else if (chatStage === 'ask_company_name') {
      setUserDetails(prev => ({ ...prev, companyName: inputValue }));
      setChatStage('ask_company_address');
      addBotMessage(`And what is the company address?`);
    }
    else if (chatStage === 'ask_company_address') {
      setUserDetails(prev => ({ ...prev, companyAddress: inputValue }));
      setChatStage('ask_people');
      addBotMessage(`Thank you. How many people will be staying?`);
    }
    else if (chatStage === 'ask_people') {
      setUserDetails(prev => ({ ...prev, peopleCount: inputValue }));
      setChatStage('ask_date_from');
      addBotMessage(`From which date do you need the accommodation? (e.g., DD.MM.YYYY)`);
    }
    else if (chatStage === 'ask_date_from') {
      setUserDetails(prev => ({ ...prev, dateFrom: inputValue }));
      setChatStage('ask_date_to');
      addBotMessage(`And until which date?`);
    }
    else if (chatStage === 'ask_date_to') {
      const finalDetails = { ...userDetails, dateTo: inputValue };
      setUserDetails(finalDetails);
      setChatStage('connected');
      
      // Simulate saving to database
      console.log("SAVING COMPLETE LEAD TO DATABASE:", finalDetails);

      addBotMessage(`Perfect. I've collected all the details. Connecting you to Julia now...`, 'system', 1000);
      
      // Julia joins
      setTimeout(() => {
         addBotMessage(`Hi ${finalDetails.name}! Julia here. I see you're interested in ${propertyTitle} for ${finalDetails.peopleCount} people. How can I help you further?`, 'agent', 500);
      }, 3000);
    } 
    else {
      // Standard Chat Logic (Agent replies)
      setIsTyping(true);
      setTimeout(() => {
        setMessages(prev => prev.map(msg => msg.id === userMsg.id ? { ...msg, isRead: true } : msg));
        const replyMsg: Message = {
          id: (Date.now() + 1).toString(),
          text: "I can definitely help with that. Would you like to proceed with the reservation request based on the details you provided?",
          sender: 'agent',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => [...prev, replyMsg]);
        setIsTyping(false);
      }, 2000);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const userMsg: Message = {
        id: Date.now().toString(),
        text: `📎 Sent attachment: ${file.name}`,
        sender: 'user',
        time: currentTime,
        isRead: false
      };
      setMessages(prev => [...prev, userMsg]);
      
      // If connected, simulate agent receipt
      if (chatStage === 'connected') {
          setIsTyping(true);
          setTimeout(() => {
              setMessages(prev => prev.map(msg => msg.id === userMsg.id ? { ...msg, isRead: true } : msg));
              const replyMsg: Message = {
                  id: (Date.now() + 1).toString(),
                  text: "I've received your file. I'll take a look at it shortly.",
                  sender: 'agent',
                  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              };
              setMessages(prev => [...prev, replyMsg]);
              setIsTyping(false);
          }, 2000);
      } else {
        // If not connected yet (talking to bot)
        addBotMessage("File uploaded successfully. Please continue answering the questions.");
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSend();
  };

  const getInputConfig = () => {
    switch (chatStage) {
      case 'ask_name': return { placeholder: 'Enter your name...', type: 'text' };
      case 'ask_email': return { placeholder: 'Enter your email address...', type: 'email' };
      case 'ask_phone': return { placeholder: 'Enter your phone number...', type: 'tel' };
      case 'ask_client_type': return { placeholder: "Type 'Private' or 'Company'...", type: 'text' };
      case 'ask_company_name': return { placeholder: 'Enter company name...', type: 'text' };
      case 'ask_company_address': return { placeholder: 'Enter company address...', type: 'text' };
      case 'ask_people': return { placeholder: 'e.g. 2 adults, 1 child', type: 'text' };
      case 'ask_date_from': return { placeholder: 'DD.MM.YYYY', type: 'text' };
      case 'ask_date_to': return { placeholder: 'DD.MM.YYYY', type: 'text' };
      default: return { placeholder: 'Type a message...', type: 'text' };
    }
  };

  const inputConfig = getInputConfig();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center px-0 sm:px-4 font-sans pointer-events-none">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto transition-opacity" 
        onClick={onClose}
      />

      {/* Chat Interface */}
      <div className="pointer-events-auto relative bg-[#0b141a] w-full sm:w-[400px] h-[85vh] sm:h-[600px] rounded-t-xl sm:rounded-xl border border-gray-800 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 duration-300">
        
        {/* Header */}
        <div className="bg-[#202c33] p-4 border-b border-[#2a3942] flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="relative">
              {chatStage === 'connected' ? (
                <img 
                  src={agentAvatar} 
                  alt="Agent" 
                  className="w-10 h-10 rounded-full object-cover ring-2 ring-gray-800"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center ring-2 ring-gray-800">
                  <Bot className="w-6 h-6 text-emerald-500" />
                </div>
              )}
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#1C1F24]"></div>
            </div>
            <div>
              <h3 className="text-white font-bold text-sm">
                {chatStage === 'connected' ? agentName : 'BIM/LAF Assistant'}
              </h3>
              <p className="text-emerald-500 text-xs font-medium">
                {chatStage === 'connected' ? 'Rental Manager' : 'Automated Support'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="p-2 text-gray-400 hover:text-white transition-colors">
              <MoreVertical className="w-5 h-5" />
            </button>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#0b141a] bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-fixed">
          {messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div 
                className={`
                  max-w-[85%] rounded-lg px-3 py-1.5 text-sm relative shadow-sm
                  ${msg.sender === 'user' 
                    ? 'bg-[#005c4b] text-white rounded-tr-none' 
                    : msg.sender === 'system'
                      ? 'bg-[#202c33] text-gray-200 rounded-tl-none'
                      : 'bg-[#202c33] text-gray-200 rounded-tl-none'}
                `}
              >
                {msg.sender === 'system' && <Bot className="w-3 h-3 text-emerald-500 mb-1" />}
                <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                <div className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${msg.sender === 'user' ? 'text-emerald-200' : 'text-gray-500'}`}>
                  <span>{msg.time}</span>
                  {msg.sender === 'user' && (
                    msg.isRead ? <CheckCheck className="w-3 h-3 text-[#53bdeb]" /> : <Check className="w-3 h-3" />
                  )}
                </div>
              </div>
            </div>
          ))}
          
          {/* Typing Indicator */}
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-[#202c33] rounded-lg rounded-tl-none px-4 py-3 flex gap-1">
                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce"></span>
                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce delay-75"></span>
                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce delay-150"></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-2 bg-[#202c33]">
          <div className="flex items-end gap-2">
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              onChange={handleFileSelect}
            />
            <button 
              onClick={() => fileInputRef.current?.click()} 
              className="p-3 text-gray-400 hover:text-gray-200 transition-colors"
              title="Attach file"
            >
              <Paperclip className="w-6 h-6" />
            </button>
            <div className="flex-1 bg-[#2a3942] rounded-lg flex items-center mb-1">
              <input 
                type={inputConfig.type}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={inputConfig.placeholder}
                className="w-full bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none px-4 py-3"
                autoFocus
              />
            </div>
            <button 
              onClick={handleSend}
              disabled={!inputValue.trim()}
              className={`
                p-3 rounded-full transition-all mb-1
                ${inputValue.trim() 
                  ? 'bg-[#00a884] text-white hover:bg-[#008f6f]' 
                  : 'bg-transparent text-gray-500'}
              `}
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ChatModal;
