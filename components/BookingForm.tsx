import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, RefreshCw, Mail, MessageSquare, Send, FileText, Phone } from 'lucide-react';

const BookingForm: React.FC = () => {
  const [selectedDay, setSelectedDay] = useState<number>(19);
  const [selectedTime, setSelectedTime] = useState<string>('19:00');

  const days = [
    // Previous month
    { day: 26, current: false }, { day: 27, current: false }, { day: 28, current: false }, { day: 29, current: false }, { day: 30, current: false }, { day: 31, current: false },
    // Current month (November 2025)
    { day: 1, current: true }, { day: 2, current: true }, { day: 3, current: true }, { day: 4, current: true }, { day: 5, current: true }, { day: 6, current: true }, { day: 7, current: true },
    { day: 8, current: true }, { day: 9, current: true }, { day: 10, current: true }, { day: 11, current: true }, { day: 12, current: true }, { day: 13, current: true }, { day: 14, current: true },
    { day: 15, current: true }, { day: 16, current: true }, { day: 17, current: true }, { day: 18, current: true }, { day: 19, current: true }, { day: 20, current: true }, { day: 21, current: true },
    { day: 22, current: true }, { day: 23, current: true }, { day: 24, current: true }, { day: 25, current: true }, { day: 26, current: true }, { day: 27, current: true }, { day: 28, current: true }, { day: 29, current: true }, { day: 30, current: true },
    // Next month
    { day: 1, current: false }, { day: 2, current: false }, { day: 3, current: false }, { day: 4, current: false }, { day: 5, current: false }, { day: 6, current: false }
  ];

  const timeSlots = ['09:00', '11:00', '13:00', '15:00', '17:00', '19:00'];

  return (
    <div className="p-8 text-white font-sans max-w-2xl mx-auto">
      
      {/* Section A: Tenant Details */}
      <div className="mb-8">
        <h3 className="text-lg font-bold mb-4">A. Tenant Details</h3>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="flex flex-col gap-2">
             <label className="text-sm text-gray-400">First Name</label>
             <input type="text" placeholder="First Name" className="bg-transparent border border-gray-700 rounded-md p-3 text-sm focus:border-emerald-500 focus:outline-none" />
          </div>
          <div className="flex flex-col gap-2">
             <label className="text-sm text-gray-400">Last Name</label>
             <input type="text" placeholder="Last Name" className="bg-transparent border border-gray-700 rounded-md p-3 text-sm focus:border-emerald-500 focus:outline-none" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="flex flex-col gap-2">
             <label className="text-sm text-gray-400">Email</label>
             <input type="email" placeholder="Email" className="bg-transparent border border-gray-700 rounded-md p-3 text-sm focus:border-emerald-500 focus:outline-none" />
          </div>
          <div className="flex flex-col gap-2">
             <label className="text-sm text-gray-400">Phone Number</label>
             <input type="tel" placeholder="Phone Number" className="bg-transparent border border-gray-700 rounded-md p-3 text-sm focus:border-emerald-500 focus:outline-none" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
           <label className="text-sm text-gray-400">Language</label>
           <select className="bg-transparent border border-gray-700 rounded-md p-3 text-sm focus:border-emerald-500 focus:outline-none appearance-none text-gray-400">
             <option>Select language</option>
             <option>English</option>
             <option>German</option>
           </select>
        </div>
      </div>

      {/* Section B: Select Date & Time */}
      <div className="mb-8">
        <h3 className="text-lg font-bold mb-4">B. Select Date & Time</h3>
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Calendar */}
          <div className="bg-[#16181D] border border-gray-800 rounded-lg p-4 flex-1">
            <div className="flex justify-between items-center mb-4 px-2">
              <span className="font-bold text-sm">November 2025</span>
              <div className="flex gap-2">
                <button className="p-1 hover:text-white text-gray-500"><ChevronLeft className="w-4 h-4" /></button>
                <button className="p-1 hover:text-white text-gray-500"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs mb-2 text-gray-500">
               <div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map((d, i) => {
                const isSelected = d.current && d.day === selectedDay;
                return (
                  <button 
                    key={i}
                    onClick={() => d.current && setSelectedDay(d.day)}
                    disabled={!d.current}
                    className={`
                      h-8 w-8 mx-auto flex items-center justify-center rounded-md text-xs transition-colors
                      ${!d.current ? 'text-gray-600 cursor-default' : 'hover:bg-gray-800 cursor-pointer'}
                      ${isSelected ? 'bg-emerald-500 text-white hover:bg-emerald-600 font-bold' : d.current ? 'text-gray-300' : ''}
                    `}
                  >
                    {d.day}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time Slots */}
          <div className="w-full lg:w-32 flex flex-col gap-2">
             {timeSlots.map((time, i) => (
               <button 
                 key={i}
                 onClick={() => setSelectedTime(time)}
                 className={`
                   py-2 px-4 rounded-md text-xs font-medium border transition-colors
                   ${time === selectedTime 
                     ? 'bg-[#1C1F24] border-emerald-500 text-white' 
                     : 'bg-transparent border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-300'}
                 `}
               >
                 {time}
               </button>
             ))}
          </div>
        </div>
      </div>

      {/* Section C: Access Code */}
      <div className="mb-8">
        <h3 className="text-lg font-bold mb-4">C. Access Code</h3>
        <div className="bg-[#16181D] border border-gray-800 rounded-lg p-4 flex justify-between items-center">
          <div>
             <span className="block text-gray-400 text-xs mb-1">Access Code</span>
             <span className="text-3xl font-bold text-white">743815</span>
          </div>
          <div className="flex gap-2">
            <button className="p-2 border border-gray-700 rounded-md hover:bg-gray-800 text-gray-400"><RefreshCw className="w-4 h-4" /></button>
            <button className="p-2 border border-gray-700 rounded-md hover:bg-gray-800 text-gray-400"><Copy className="w-4 h-4" /></button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">Valid for 24 hours from selected time.</p>
      </div>

      {/* Section D: Send Options */}
      <div className="mb-8">
         <h3 className="text-lg font-bold mb-4">D. Send Options</h3>
         <div className="flex gap-3 mb-6">
           {/* Email */}
           <button className="w-12 h-10 bg-emerald-500 rounded-md flex items-center justify-center text-white shadow-lg shadow-emerald-900/20 hover:bg-emerald-600 transition-colors">
             <Mail className="w-4 h-4" />
           </button>
           
           {/* SMS */}
           <button className="w-12 h-10 bg-[#1C1F24] border border-gray-700 rounded-md flex items-center justify-center text-gray-400 hover:text-white transition-colors">
             <MessageSquare className="w-4 h-4" />
           </button>
           
           {/* WhatsApp - Brand Green */}
           <button className="w-12 h-10 bg-[#25D366] rounded-md flex items-center justify-center text-white hover:opacity-90 transition-opacity">
             <Phone className="w-4 h-4 fill-current" />
           </button>
           
           {/* Telegram */}
           <button className="w-12 h-10 bg-[#1C1F24] border border-gray-700 rounded-md flex items-center justify-center text-gray-400 hover:text-white transition-colors">
             <Send className="w-4 h-4 -rotate-45 -ml-0.5 mt-0.5" />
           </button>
           
           {/* File/Copy */}
           <button className="w-12 h-10 bg-[#1C1F24] border border-gray-700 rounded-md flex items-center justify-center text-gray-400 hover:text-white transition-colors">
             <FileText className="w-4 h-4" />
           </button>
         </div>

         <button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-md transition-colors shadow-lg shadow-emerald-900/20">
            Confirm & Send
         </button>
      </div>

    </div>
  );
};

export default BookingForm;