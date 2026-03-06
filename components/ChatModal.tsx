
import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Paperclip, MoreVertical, Check, CheckCheck, Bot, User } from 'lucide-react';
import { requestsService, chatRoomsService, messagesService } from '../services/supabaseService';
import { Client, ChatRoom, Message as SupabaseMessage, Worker } from '../types';

const clientsService = {
  getById: async (_id: string) => null as Client | null,
  getByEmailOrPhone: async (_email: string, _phone: string) => null as Client | null,
  create: async (_data: any) => ({} as Client),
};

const leadsServiceEnhanced = {
  createOrUpdate: async (_data: any) => ({} as any),
};

interface ChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyTitle: string;
  propertyId?: string;
  worker?: Worker | null;
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
  preferences?: string; // Побажання клієнта
  initialMessage?: string; // Перше повідомлення клієнта
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
  | 'ask_preferences' // Новий етап
  | 'summary' // Новий етап підтвердження
  | 'connected';

const ChatModal: React.FC<ChatModalProps> = ({ isOpen, onClose, propertyTitle, propertyId, worker }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Guest mode: simple form state
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestMessage, setGuestMessage] = useState('');
  const [guestSubmitting, setGuestSubmitting] = useState(false);
  const [guestSent, setGuestSent] = useState(false);

  // Data Collection State
  const [chatStage, setChatStage] = useState<ChatStage>('ask_name');
  const [userDetails, setUserDetails] = useState<UserDetails>({ name: '', email: '', phone: '' });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isGuestMode = !worker;
  const showGuestForm = isGuestMode && propertyId;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Initialize chat when opened
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      // Initial AI Message - покращене формулювання
      const initialMsg: Message = {
        id: '1',
        text: `Привіт! Я допоможу вам знайти ідеальну квартиру. Як до вас звертатися?`,
        sender: 'system',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages([initialMsg]);
      setChatStage('ask_name');
      setUserDetails({ name: '', email: '', phone: '' });
    }
  }, [isOpen]);

  // Зберегти Lead при закритті чату (якщо є email + phone)
  useEffect(() => {
    return () => {
      // Cleanup: зберегти Lead при unmount якщо є дані
      if (!isOpen && userDetails.email && userDetails.phone) {
        createOrUpdateLead(userDetails).catch(error => {
          console.error('Error saving Lead on unmount:', error);
        });
      }
    };
  }, [isOpen, userDetails.email, userDetails.phone]);

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

  // Helper functions
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const parseDate = (input: string): string | null => {
    const today = new Date();
    
    if (input.toLowerCase().includes('якнайшвидше') || 
        input.toLowerCase().includes('asap') ||
        input.toLowerCase().includes('скоро')) {
      return today.toISOString().split('T')[0];
    }
    
    if (input.toLowerCase().includes('довгостроково') ||
        input.toLowerCase().includes('long term')) {
      return null;
    }
    
    // Парсинг DD.MM.YYYY
    const dateMatch = input.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (dateMatch) {
      const [, day, month, year] = dateMatch;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    return null;
  };

  const parsePeopleCount = (input: string): number => {
    const numbers = input.match(/\d+/g);
    if (numbers) {
      return numbers.reduce((sum, num) => sum + parseInt(num), 0);
    }
    return 1;
  };

  const generateSummary = (details: UserDetails): string => {
    let summary = `📋 Ось що я зібрав:\n\n`;
    
    summary += `👤 **Контактна інформація:**\n`;
    summary += `   • Ім'я: ${details.name}\n`;
    summary += `   • Email: ${details.email}\n`;
    summary += `   • Телефон: ${details.phone}\n`;
    
    if (details.clientType === 'company' && details.companyName) {
      summary += `\n🏢 **Компанія:**\n`;
      summary += `   • Назва: ${details.companyName}\n`;
      if (details.companyAddress) {
        summary += `   • Адреса: ${details.companyAddress}\n`;
      }
    }
    
    summary += `\n📅 **Дати оренди:**\n`;
    summary += `   • З: ${details.dateFrom}\n`;
    summary += `   • До: ${details.dateTo}\n`;
    
    summary += `\n👥 **Кількість людей:** ${details.peopleCount}\n`;
    
    if (details.preferences && 
        !details.preferences.toLowerCase().includes('немає') && 
        !details.preferences.toLowerCase().includes('ok') &&
        !details.preferences.toLowerCase().includes('все ок')) {
      summary += `\n💭 **Ваші побажання:**\n`;
      summary += `   ${details.preferences}\n`;
    }
    
    return summary;
  };

  // Створення/оновлення Lead при зборі email + phone
  const createOrUpdateLead = async (details: Partial<UserDetails> & { email: string; phone: string }) => {
    try {
      const leadData = {
        name: details.name || `${details.email}`,
        email: details.email,
        phone: details.phone,
        type: (details.clientType === 'company' ? 'Company' : 'Private') as 'Company' | 'Private',
        contactPerson: details.clientType === 'company' ? details.name : undefined,
        address: details.companyAddress || '',
        source: 'chat' as const,
        propertyId: propertyId,
        preferredDates: details.dateFrom && details.dateTo ? [{
          start: parseDate(details.dateFrom) || details.dateFrom,
          end: parseDate(details.dateTo) || details.dateTo,
          peopleCount: parsePeopleCount(details.peopleCount || '1')
        }] : []
      };
      
      return await leadsServiceEnhanced.createOrUpdate(leadData);
    } catch (error) {
      console.error('Error creating/updating Lead:', error);
      // Fallback: зберегти в localStorage
      const backupLead = {
        name: details.name,
        email: details.email,
        phone: details.phone,
        timestamp: new Date().toISOString()
      };
      localStorage.setItem('pending_lead', JSON.stringify(backupLead));
      return null;
    }
  };

  // Фіналізація заявки - створення Request, ChatRoom, Message
  const finalizeRequest = async (details: UserDetails) => {
    try {
      // 1. Створити/Оновити Lead
      const lead = await createOrUpdateLead(details);
      
      // 2. Створити/Знайти Client
      let client = await clientsService.getByEmailOrPhone(details.email, details.phone);
      if (!client) {
        client = await clientsService.create({
          firstName: details.name.split(' ')[0],
          lastName: details.name.split(' ').slice(1).join(' ') || '',
          email: details.email,
          phone: details.phone,
          companyName: details.companyName,
          companyAddress: details.companyAddress,
          clientType: details.clientType === 'company' ? 'Company' : 'Private'
        });
      }
      
      // 3. Створити Request
      const request = await requestsService.create(
        {
          firstName: details.name.split(' ')[0],
          lastName: details.name.split(' ').slice(1).join(' ') || '',
          email: details.email,
          phone: details.phone,
          companyName: details.companyName,
          peopleCount: parsePeopleCount(details.peopleCount || '1'),
          startDate: parseDate(details.dateFrom || '') || new Date().toISOString().split('T')[0],
          endDate: parseDate(details.dateTo || '') || new Date().toISOString().split('T')[0],
          message: details.preferences || '', // Побажання зберігаються тут
          propertyId: propertyId,
          status: 'pending',
        },
        { origin: 'chat' }
      );
      
      // 4. Створити ChatRoom
      const chatRoom = await chatRoomsService.create({
        requestId: request.id,
        propertyId: propertyId,
        clientId: client.id,
        status: 'active'
      });
      
      // 5. Зберегти перше повідомлення клієнта (якщо було)
      if (details.initialMessage) {
        await messagesService.create({
          chatRoomId: chatRoom.id,
          senderType: 'client',
          senderId: client.id,
          text: details.initialMessage,
          isRead: false
        });
      }
      
      return { request, chatRoom, client, lead };
    } catch (error) {
      console.error('Error finalizing request:', error);
      throw error;
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim()) return;

    const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userInput = inputValue.trim();
    
    // Add User Message
    const userMsg: Message = {
      id: Date.now().toString(),
      text: userInput,
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
      addBotMessage(`Чудово, ${inputValue}! На яку електронну пошту надіслати деталі?`);
    } 
    else if (chatStage === 'ask_email') {
      // Валідація email
      if (!validateEmail(inputValue)) {
        addBotMessage(`Схоже, це не валідна електронна пошта. Спробуйте ще раз, будь ласка.`);
        return;
      }
      setUserDetails(prev => ({ ...prev, email: inputValue }));
      setChatStage('ask_phone');
      addBotMessage(`Дякую! Який у вас номер телефону? Ми можемо подзвонити для уточнення деталей.`);
    } 
    else if (chatStage === 'ask_phone') {
      const updated = { ...userDetails, phone: userInput };
      setUserDetails(updated);
      
      // Створити/оновлювати Lead після збору email + phone
      if (updated.email && updated.phone) {
        try {
          await createOrUpdateLead(updated);
        } catch (error) {
          console.error('Error creating/updating Lead:', error);
          // Продовжуємо навіть якщо Lead не створився
        }
      }
      
      setChatStage('ask_client_type');
      addBotMessage(`Ви шукаєте квартиру для себе чи для компанії?`);
    }
    else if (chatStage === 'ask_client_type') {
      const lowerInput = inputValue.toLowerCase();
      const isCompany = lowerInput.includes('company') || lowerInput.includes('firm') || 
                       lowerInput.includes('business') || lowerInput.includes('фірма') ||
                       lowerInput.includes('компанія');
      
      if (isCompany) {
        setUserDetails(prev => ({ ...prev, clientType: 'company' }));
        setChatStage('ask_company_name');
        addBotMessage(`Зрозуміло. Яка назва вашої компанії?`);
      } else {
        setUserDetails(prev => ({ ...prev, clientType: 'private' }));
        setChatStage('ask_people');
        addBotMessage(`Зрозуміло. Скільки людей планує проживати?`);
      }
    }
    else if (chatStage === 'ask_company_name') {
      setUserDetails(prev => ({ ...prev, companyName: inputValue }));
      setChatStage('ask_company_address');
      addBotMessage(`Яка адреса компанії?`);
    }
    else if (chatStage === 'ask_company_address') {
      setUserDetails(prev => ({ ...prev, companyAddress: inputValue }));
      setChatStage('ask_people');
      addBotMessage(`Дякую. Скільки людей планує проживати?`);
    }
    else if (chatStage === 'ask_people') {
      setUserDetails(prev => ({ ...prev, peopleCount: inputValue }));
      setChatStage('ask_date_from');
      addBotMessage(`З якої дати вам потрібна квартира? (наприклад: ДД.ММ.РРРР або "якнайшвидше")`);
    }
    else if (chatStage === 'ask_date_from') {
      setUserDetails(prev => ({ ...prev, dateFrom: inputValue }));
      setChatStage('ask_date_to');
      addBotMessage(`До якої дати плануєте орендувати? (наприклад: ДД.ММ.РРРР або "довгостроково")`);
    }
    else if (chatStage === 'ask_date_to') {
      setUserDetails(prev => ({ ...prev, dateTo: inputValue }));
      setChatStage('ask_preferences');
      addBotMessage(
        `Чудово! Я зібрав основну інформацію. ` +
        `Чи є у вас якісь особливі побажання або вимоги до квартири? ` +
        `Наприклад: паркінг, балкон, ліфт, домашні тварини, тощо. ` +
        `Якщо нічого особливого - просто напишіть "немає" або "все ок".`
      );
    }
    else if (chatStage === 'ask_preferences') {
      const preferences = inputValue.trim();
      const skipKeywords = ['немає', 'все ок', 'нічого', 'нема', 'ok', 'nothing', 'no', 'все добре'];
      const shouldSkip = skipKeywords.some(keyword => 
        preferences.toLowerCase().includes(keyword.toLowerCase())
      );
      
      const updatedDetails = {
        ...userDetails,
        preferences: shouldSkip ? 'Немає особливих побажань' : preferences
      };
      setUserDetails(updatedDetails);
      
      // Оновити Lead з усіма даними (дати, люди, побажання)
      if (updatedDetails.email && updatedDetails.phone) {
        try {
          await createOrUpdateLead(updatedDetails);
        } catch (error) {
          console.error('Error updating Lead with full data:', error);
        }
      }
      
      setChatStage('summary');
      
      // Показуємо summary
      const summary = generateSummary(updatedDetails);
      addBotMessage(summary, 'system', 1000);
      
      // Питаємо підтвердження
      setTimeout(() => {
        addBotMessage(
          `Все правильно? Якщо так, я зараз підключу вас до нашого менеджера, ` +
          `який підготує для вас персональну пропозицію! 🏠`,
          'system',
          500
        );
      }, 2000);
    }
    else if (chatStage === 'summary') {
      const lowerInput = inputValue.toLowerCase().trim();
      
      // Перевірка підтвердження
      const confirmKeywords = ['так', 'yes', 'ok', 'правильно', 'все ок', 'підтверджую', 'згоден', 'підтвердити'];
      const cancelKeywords = ['ні', 'no', 'виправити', 'змінити', 'edit', 'change', 'виправ'];
      
      const isConfirmed = confirmKeywords.some(keyword => lowerInput.includes(keyword));
      const isCancelled = cancelKeywords.some(keyword => lowerInput.includes(keyword));
      
      if (isConfirmed) {
        // Створюємо Lead, Request, ChatRoom
        finalizeRequest(userDetails)
          .then(({ request, chatRoom, client }) => {
            setChatStage('connected');
            addBotMessage(
              `Чудово! Заявка створена. Зараз підключаю вас до менеджера...`,
              'system',
              1000
            );
            
            // Підключення менеджера
            setTimeout(() => {
              addBotMessage(
                `Привіт, ${userDetails.name}! 👋\n\n` +
                `Я бачу вашу заявку на квартиру "${propertyTitle}". ` +
                `Дякую за детальну інформацію! Я підготую для вас персональну пропозицію. ` +
                `Чи є якісь додаткові питання?`,
                'agent',
                500
              );
            }, 3000);
          })
          .catch((error) => {
            console.error('Error finalizing request:', error);
            addBotMessage(
              `Вибачте, сталася помилка при створенні заявки. Спробуйте ще раз або зв'яжіться з нами безпосередньо.`,
              'system',
              1000
            );
          });
      } else if (isCancelled) {
        // Пропонуємо виправити
        addBotMessage(
          `Зрозуміло! Що саме потрібно виправити? ` +
          `Напишіть номер питання або що саме змінити.`,
          'system',
          1000
        );
        // Можна додати логіку редагування
      } else {
        // Не зрозуміло, уточнюємо
        addBotMessage(
          `Якщо все правильно - напишіть "так" або "підтверджую". ` +
          `Якщо потрібно щось змінити - напишіть "виправити".`,
          'system',
          1000
        );
      }
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
      case 'ask_name': return { placeholder: 'Наприклад: Іван', type: 'text' };
      case 'ask_email': return { placeholder: 'ivan@example.com', type: 'email' };
      case 'ask_phone': return { placeholder: '+380 50 123 4567', type: 'tel' };
      case 'ask_client_type': return { placeholder: "Напишіть 'Приватна особа' або 'Компанія'", type: 'text' };
      case 'ask_company_name': return { placeholder: 'Наприклад: TechCorp GmbH', type: 'text' };
      case 'ask_company_address': return { placeholder: 'Адреса компанії', type: 'text' };
      case 'ask_people': return { placeholder: 'Наприклад: 2 дорослих, 1 дитина', type: 'text' };
      case 'ask_date_from': return { placeholder: 'ДД.ММ.РРРР або "якнайшвидше"', type: 'text' };
      case 'ask_date_to': return { placeholder: 'ДД.ММ.РРРР або "довгостроково"', type: 'text' };
      case 'ask_preferences': return { placeholder: 'Ваші побажання або "немає"', type: 'text' };
      case 'summary': return { placeholder: 'Напишіть "так" або "виправити"', type: 'text' };
      default: return { placeholder: 'Введіть повідомлення...', type: 'text' };
    }
  };

  const inputConfig = getInputConfig();

  const handleGuestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyId || guestSubmitting) return;
    setGuestSubmitting(true);
    try {
      const contactLine = `Name: ${guestName.trim()} | Email: ${guestEmail.trim()} | Phone: ${guestPhone.trim()}`;
      await chatRoomsService.createMarketplaceGuestChat(
        propertyId,
        contactLine,
        guestMessage.trim()
      );
      setGuestSent(true);
      setTimeout(() => onClose(), 2000);
    } catch (err) {
      console.error('Guest chat submit failed:', err);
      setGuestSubmitting(false);
    }
  };

  if (!isOpen) return null;

  if (showGuestForm) {
    return (
      <div className="fixed inset-0 z-[120] flex items-center justify-center px-4 font-sans">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-[#1C1F24] border border-gray-700 rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-gray-800">
            <h3 className="text-lg font-bold text-white">Chat</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6">
            {guestSent ? (
              <p className="text-emerald-400 font-medium">Sent. We will get back to you soon.</p>
            ) : (
              <form onSubmit={handleGuestSubmit} className="space-y-4">
                <p className="text-sm text-gray-400">{propertyTitle}</p>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Name</label>
                  <input type="text" value={guestName} onChange={(e) => setGuestName(e.target.value)} required className="w-full bg-[#111315] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" placeholder="Your name" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Email</label>
                  <input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} required className="w-full bg-[#111315] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" placeholder="your@email.com" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Phone</label>
                  <input type="tel" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} required className="w-full bg-[#111315] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" placeholder="+49 ..." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Message</label>
                  <textarea value={guestMessage} onChange={(e) => setGuestMessage(e.target.value)} rows={3} className="w-full bg-[#111315] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white resize-none" placeholder="Your message..." />
                </div>
                <button type="submit" disabled={guestSubmitting} className="w-full px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-bold">
                  {guestSubmitting ? 'Sending…' : 'Send'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

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
                {chatStage === 'connected' ? agentName : 'HeroRooms Assistant'}
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
