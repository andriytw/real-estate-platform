import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Copy, RefreshCw, Mail, MessageSquare, Send, FileText, Phone, AlertCircle, Building2, Users, CheckCircle2 } from 'lucide-react';
import { RequestData } from '../types';
import { requestsService } from '../services/supabaseService';

interface BookingFormProps {
  onAddRequest?: (request: RequestData) => void;
  prefilledData?: Partial<RequestData>; // Для префілу з Request
  propertyId?: string;
  property?: { id: string }; // Property object (for compatibility)
  onSuccess?: () => void; // Callback after successful submission
}

interface FormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  peopleCount?: string;
  startDate?: string;
  endDate?: string;
  message?: string;
}

const BookingForm: React.FC<BookingFormProps> = ({ onAddRequest, prefilledData, propertyId, property, onSuccess }) => {
  const [selectedDay, setSelectedDay] = useState<number>(19);
  const [selectedTime, setSelectedTime] = useState<string>('19:00');
  const [currentMonth, setCurrentMonth] = useState(new Date(2025, 10, 1)); // November 2025
  
  // Form state
  const [formData, setFormData] = useState({
    firstName: prefilledData?.firstName || '',
    lastName: prefilledData?.lastName || '',
    email: prefilledData?.email || '',
    phone: prefilledData?.phone || '',
    companyName: prefilledData?.companyName || '',
    peopleCount: prefilledData?.peopleCount?.toString() || '1',
    startDate: prefilledData?.startDate || '',
    endDate: prefilledData?.endDate || '',
    message: prefilledData?.message || '',
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Префіл форми якщо є prefilledData
  useEffect(() => {
    if (prefilledData) {
      setFormData(prev => ({
        ...prev,
        firstName: prefilledData.firstName || prev.firstName,
        lastName: prefilledData.lastName || prev.lastName,
        email: prefilledData.email || prev.email,
        phone: prefilledData.phone || prev.phone,
        companyName: prefilledData.companyName || prev.companyName,
        peopleCount: prefilledData.peopleCount?.toString() || prev.peopleCount,
        startDate: prefilledData.startDate || prev.startDate,
        endDate: prefilledData.endDate || prev.endDate,
        message: prefilledData.message || prev.message,
      }));
    }
  }, [prefilledData]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }
    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    }
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }
    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    }
    if (!formData.peopleCount || parseInt(formData.peopleCount) < 1) {
      newErrors.peopleCount = 'Number of people must be at least 1';
    }
    if (!formData.startDate) {
      newErrors.startDate = 'Start date is required';
    }
    if (!formData.endDate) {
      newErrors.endDate = 'End date is required';
    }
    if (formData.startDate && formData.endDate && formData.startDate >= formData.endDate) {
      newErrors.endDate = 'End date must be after start date';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    const requestData: Omit<RequestData, 'id'> = {
      firstName: formData.firstName.trim(),
      lastName: formData.lastName.trim(),
      email: formData.email.trim(),
      phone: formData.phone.trim(),
      companyName: formData.companyName.trim() || undefined,
      peopleCount: parseInt(formData.peopleCount),
      startDate: formData.startDate,
      endDate: formData.endDate,
      message: formData.message.trim() || undefined,
      propertyId: propertyId || property?.id,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    try {
      // Save to Supabase
      const savedRequest = await requestsService.create(requestData);
      
      // Call callback if provided
      if (onAddRequest) {
        onAddRequest(savedRequest);
      }

      // Show success message
      setSubmitSuccess(true);
      
      // Reset form
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        companyName: '',
        peopleCount: '1',
        startDate: '',
        endDate: '',
        message: '',
      });

      // Call onSuccess callback if provided
      if (onSuccess) {
        setTimeout(() => {
          onSuccess();
        }, 2000); // Wait 2 seconds to show success message
      }

      // Clear success message after 3 seconds
      setTimeout(() => {
        setSubmitSuccess(false);
      }, 3000);
    } catch (error: any) {
      console.error('Error saving request:', error);
      setSubmitError(error.message || 'Failed to send request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDateForInput = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleDaySelect = (day: number) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    if (!formData.startDate) {
      setFormData(prev => ({ ...prev, startDate: formatDateForInput(date) }));
    } else if (!formData.endDate || formData.endDate <= formData.startDate) {
      setFormData(prev => ({ ...prev, endDate: formatDateForInput(date) }));
    }
  };

  // Generate calendar days
  const getCalendarDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    // Previous month days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      days.push({ day: prevMonthLastDay - i, current: false });
    }
    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ day: i, current: true });
    }
    // Next month days to fill the grid
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({ day: i, current: false });
    }
    return days;
  };

  const days = getCalendarDays();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  return (
    <form onSubmit={handleSubmit} className="p-8 text-white font-sans max-w-2xl mx-auto">
      {/* Success Message */}
      {submitSuccess && (
        <div className="mb-6 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
          <p className="text-emerald-400 text-sm">Request sent successfully! We will contact you soon.</p>
        </div>
      )}

      {/* Error Message */}
      {submitError && (
        <div className="mb-6 bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-400 text-sm">{submitError}</p>
        </div>
      )}

      {/* Section A: Tenant Details */}
      <div className="mb-8">
        <h3 className="text-lg font-bold mb-4">A. Tenant Details</h3>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-400">First Name *</label>
            <input
              type="text"
              value={formData.firstName}
              onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
              placeholder="First Name"
              className={`bg-transparent border rounded-md p-3 text-sm focus:outline-none ${
                errors.firstName ? 'border-red-500' : 'border-gray-700 focus:border-emerald-500'
              }`}
            />
            {errors.firstName && (
              <div className="flex items-center gap-1 text-red-500 text-xs">
                <AlertCircle className="w-3 h-3" />
                <span>{errors.firstName}</span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-400">Last Name *</label>
            <input
              type="text"
              value={formData.lastName}
              onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
              placeholder="Last Name"
              className={`bg-transparent border rounded-md p-3 text-sm focus:outline-none ${
                errors.lastName ? 'border-red-500' : 'border-gray-700 focus:border-emerald-500'
              }`}
            />
            {errors.lastName && (
              <div className="flex items-center gap-1 text-red-500 text-xs">
                <AlertCircle className="w-3 h-3" />
                <span>{errors.lastName}</span>
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-400">Email *</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              placeholder="Email"
              className={`bg-transparent border rounded-md p-3 text-sm focus:outline-none ${
                errors.email ? 'border-red-500' : 'border-gray-700 focus:border-emerald-500'
              }`}
            />
            {errors.email && (
              <div className="flex items-center gap-1 text-red-500 text-xs">
                <AlertCircle className="w-3 h-3" />
                <span>{errors.email}</span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-400">Phone Number *</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              placeholder="Phone Number"
              className={`bg-transparent border rounded-md p-3 text-sm focus:outline-none ${
                errors.phone ? 'border-red-500' : 'border-gray-700 focus:border-emerald-500'
              }`}
            />
            {errors.phone && (
              <div className="flex items-center gap-1 text-red-500 text-xs">
                <AlertCircle className="w-3 h-3" />
                <span>{errors.phone}</span>
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-400">Company Name</label>
            <input
              type="text"
              value={formData.companyName}
              onChange={(e) => setFormData(prev => ({ ...prev, companyName: e.target.value }))}
              placeholder="Company Name (optional)"
              className="bg-transparent border border-gray-700 rounded-md p-3 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-400">Number of People *</label>
            <input
              type="number"
              min="1"
              value={formData.peopleCount}
              onChange={(e) => setFormData(prev => ({ ...prev, peopleCount: e.target.value }))}
              placeholder="1"
              className={`bg-transparent border rounded-md p-3 text-sm focus:outline-none ${
                errors.peopleCount ? 'border-red-500' : 'border-gray-700 focus:border-emerald-500'
              }`}
            />
            {errors.peopleCount && (
              <div className="flex items-center gap-1 text-red-500 text-xs">
                <AlertCircle className="w-3 h-3" />
                <span>{errors.peopleCount}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Section B: Select Date & Time */}
      <div className="mb-8">
        <h3 className="text-lg font-bold mb-4">B. Select Dates</h3>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-400">Start Date *</label>
            <input
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
              className={`bg-transparent border rounded-md p-3 text-sm focus:outline-none ${
                errors.startDate ? 'border-red-500' : 'border-gray-700 focus:border-emerald-500'
              }`}
            />
            {errors.startDate && (
              <div className="flex items-center gap-1 text-red-500 text-xs">
                <AlertCircle className="w-3 h-3" />
                <span>{errors.startDate}</span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-400">End Date *</label>
            <input
              type="date"
              value={formData.endDate}
              onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
              min={formData.startDate}
              className={`bg-transparent border rounded-md p-3 text-sm focus:outline-none ${
                errors.endDate ? 'border-red-500' : 'border-gray-700 focus:border-emerald-500'
              }`}
            />
            {errors.endDate && (
              <div className="flex items-center gap-1 text-red-500 text-xs">
                <AlertCircle className="w-3 h-3" />
                <span>{errors.endDate}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Section C: Message */}
      <div className="mb-8">
        <h3 className="text-lg font-bold mb-4">C. Additional Message</h3>
        <textarea
          value={formData.message}
          onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
          placeholder="Any additional information or special requests..."
          rows={4}
          className="w-full bg-transparent border border-gray-700 rounded-md p-3 text-sm focus:border-emerald-500 focus:outline-none resize-none"
        />
      </div>

      {/* Section D: Submit */}
      <div className="mb-8">
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 rounded-md transition-colors shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2"
        >
          <Send className="w-4 h-4" />
          {isSubmitting ? 'Sending...' : 'Confirm & Send Request'}
        </button>
      </div>
    </form>
  );
};

export default BookingForm;
