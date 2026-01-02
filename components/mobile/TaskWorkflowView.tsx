import React, { useState, useEffect } from 'react';
import { CalendarEvent, TaskWorkflowStep, Property } from '../../types';
import { ChevronLeft, Camera, CheckSquare, Check, Play, Upload, X, Zap, Droplets, Flame, Video, CheckCircle2 } from 'lucide-react';
import { tasksService, bookingsService, propertiesService, fileUploadService } from '../../services/supabaseService';

interface TaskWorkflowViewProps {
  task: CalendarEvent;
  onBack: () => void;
}

const TaskWorkflowView: React.FC<TaskWorkflowViewProps> = ({ task, onBack }) => {
  const isEinzugAuszug = task.type === 'Einzug' || task.type === 'Auszug';
  
  // Initialize workflow steps from task or create new ones
  const [workflowSteps, setWorkflowSteps] = useState<TaskWorkflowStep[]>(() => {
    if (task.workflowSteps && task.workflowSteps.length > 0) {
      return task.workflowSteps;
    }
    // Initialize empty steps for Einzug/Auszug
    if (isEinzugAuszug) {
      return [
        { stepNumber: 1, stepName: 'Взяти ключі', completed: false, photos: [], videos: [], comment: '' },
        { stepNumber: 2, stepName: 'Фото до заселення', completed: false, photos: [], videos: [], comment: '' },
        { stepNumber: 3, stepName: 'Фото лічильників + заповнення', completed: false, photos: [], videos: [], comment: '', meterReadings: { electricity: '', water: '', gas: '' } }
      ];
    }
    return [];
  });

  const [currentStep, setCurrentStep] = useState(() => {
    if (isEinzugAuszug && workflowSteps.length > 0) {
      // Find first incomplete step
      const incomplete = workflowSteps.find(s => !s.completed);
      return incomplete ? incomplete.stepNumber : workflowSteps.length;
    }
    return 1;
  });

  const [status, setStatus] = useState(task.status);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [property, setProperty] = useState<Property | null>(null);
  const [companyName, setCompanyName] = useState<string>('');
  const [taskDate, setTaskDate] = useState<string>('');

  // Load property and booking data
  useEffect(() => {
    const loadData = async () => {
      if (!task.propertyId) return;

      try {
        // Load property
        const prop = await propertiesService.getById(task.propertyId);
        if (prop) setProperty(prop);

        // Load booking to get company name
        if (task.bookingId) {
          try {
            const booking = await bookingsService.getById(task.bookingId);
            if (booking) {
              const name = booking.internalCompany || booking.companyName || booking.company || booking.guest || prop?.address || 'Unknown';
              setCompanyName(name);
            } else {
              setCompanyName(prop?.address || 'Unknown');
            }
          } catch (error) {
            console.error('Error loading booking:', error);
            setCompanyName(prop?.address || 'Unknown');
          }
        } else {
          setCompanyName(prop?.address || 'Unknown');
        }

        // Format task date
        if (task.date) {
          const date = new Date(task.date);
          const day = date.getDate().toString().padStart(2, '0');
          const month = (date.getMonth() + 1).toString().padStart(2, '0');
          const year = date.getFullYear();
          setTaskDate(`${day}.${month}.${year}`);
        }
      } catch (error) {
        console.error('Error loading data:', error);
      }
    };

    loadData();
  }, [task.propertyId, task.bookingId, task.date]);

  // If not Einzug/Auszug, use old workflow
  if (!isEinzugAuszug) {
    return <TaskWorkflowViewLegacy task={task} onBack={onBack} />;
  }

  const currentStepData = workflowSteps.find(s => s.stepNumber === currentStep);
  if (!currentStepData) return null;

  const handleFileUpload = async (file: File, isVideo: boolean = false) => {
    if (!task.propertyId || !companyName || !taskDate) {
      alert('Missing property or booking information');
      return;
    }

    try {
      setUploading(true);
      const stepName = currentStepData.stepName.toLowerCase().replace(/\s+/g, '_');
      const url = await fileUploadService.uploadTaskFile(
        file,
        task.propertyId,
        task.type as 'Einzug' | 'Auszug',
        taskDate,
        companyName,
        currentStep,
        stepName
      );

      // Update workflow step
      const updatedSteps = workflowSteps.map(step => {
        if (step.stepNumber === currentStep) {
          if (isVideo) {
            return { ...step, videos: [...step.videos, url] };
          } else {
            return { ...step, photos: [...step.photos, url] };
          }
        }
        return step;
      });

      setWorkflowSteps(updatedSteps);
      await saveWorkflowSteps(updatedSteps);
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Failed to upload file. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleCommentChange = (comment: string) => {
    const updatedSteps = workflowSteps.map(step => {
      if (step.stepNumber === currentStep) {
        return { ...step, comment };
      }
      return step;
    });
    setWorkflowSteps(updatedSteps);
  };

  const handleMeterReadingChange = (type: 'electricity' | 'water' | 'gas', value: string) => {
    const updatedSteps = workflowSteps.map(step => {
      if (step.stepNumber === currentStep) {
        return {
          ...step,
          meterReadings: {
            ...(step.meterReadings || { electricity: '', water: '', gas: '' }),
            [type]: value
          }
        };
      }
      return step;
    });
    setWorkflowSteps(updatedSteps);
  };

  const saveWorkflowSteps = async (steps: TaskWorkflowStep[]) => {
    try {
      await tasksService.update(task.id, { workflowSteps: steps });
    } catch (error) {
      console.error('Error saving workflow steps:', error);
    }
  };

  const handleStepComplete = async () => {
    const updatedSteps = workflowSteps.map(step => {
      if (step.stepNumber === currentStep) {
        return { ...step, completed: true, completedAt: new Date().toISOString() };
      }
      return step;
    });

    setWorkflowSteps(updatedSteps);
    await saveWorkflowSteps(updatedSteps);

    // If step 3, save meter readings to property
    if (currentStep === 3 && currentStepData.meterReadings && property) {
      try {
        const meterLog = property.meterLog || [];
        const newEntry = {
          id: `meter-${Date.now()}`,
          date: task.date || new Date().toISOString().split('T')[0],
          type: task.type === 'Einzug' ? 'Check-In' : 'Check-Out' as 'Initial' | 'Check-In' | 'Check-Out' | 'Interim',
          bookingId: task.bookingId,
          readings: currentStepData.meterReadings
        };
        meterLog.unshift(newEntry);
        await propertiesService.update(property.id, { meterLog });
      } catch (error) {
        console.error('Error saving meter readings:', error);
      }
    }

    // Move to next step or complete task
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
      if (currentStep === 1) {
        await tasksService.update(task.id, { status: 'in_progress' });
        setStatus('in_progress');
      }
    } else {
      // Task completed
      await tasksService.update(task.id, { status: 'review' });
      setStatus('review');
      onBack();
    }
  };

  const canProceedToNextStep = () => {
    if (currentStep === 1) return true; // Step 1: optional
    if (currentStep === 2) {
      // Step 2: requires at least one photo or video
      return currentStepData.photos.length > 0 || currentStepData.videos.length > 0;
    }
    if (currentStep === 3) {
      // Step 3: requires meter readings
      const readings = currentStepData.meterReadings;
      if (!readings) return false;
      return readings.electricity.trim() !== '' && 
             readings.water.trim() !== '' && 
             readings.gas.trim() !== '';
    }
    return false;
  };

  const handleRemoveFile = async (url: string, isVideo: boolean) => {
    const updatedSteps = workflowSteps.map(step => {
      if (step.stepNumber === currentStep) {
        if (isVideo) {
          return { ...step, videos: step.videos.filter(v => v !== url) };
        } else {
          return { ...step, photos: step.photos.filter(p => p !== url) };
        }
      }
      return step;
    });
    setWorkflowSteps(updatedSteps);
    await saveWorkflowSteps(updatedSteps);
  };

  return (
    <div className="flex flex-col h-full bg-[#0D0F11]">
      {/* Header */}
      <div className="p-4 bg-[#111315] border-b border-gray-800 flex items-center gap-4 sticky top-0 z-10">
        <button onClick={onBack} className="text-gray-400 hover:text-white p-1">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-white line-clamp-1">{task.title}</h1>
          <p className="text-xs text-gray-400 capitalize">{status.replace('_', ' ')}</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-24">
        {/* Progress Steps */}
        <div className="flex justify-between mb-6 px-2">
          {[1, 2, 3].map((stepNum) => {
            const step = workflowSteps.find(s => s.stepNumber === stepNum);
            const isCompleted = step?.completed || false;
            const isCurrent = currentStep === stepNum;
            
            return (
              <div key={stepNum} className="flex flex-col items-center gap-1 flex-1">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                  isCompleted
                    ? 'bg-emerald-600 border-emerald-600 text-white' 
                    : isCurrent
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-transparent border-gray-700 text-gray-500'
                }`}>
                  {isCompleted ? <Check className="w-5 h-5" /> : stepNum}
                </div>
                <span className="text-[10px] text-gray-400 text-center mt-1">{step?.stepName || ''}</span>
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="bg-[#1C1F24] rounded-xl p-6 border border-gray-800 min-h-[400px] flex flex-col">
          
          {/* Step 1: Взяти ключі */}
          {currentStep === 1 && (
            <div className="flex-1 flex flex-col">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center">
                  <Camera className="w-6 h-6 text-blue-500" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">1. Взяти ключі</h2>
                  <p className="text-gray-400 text-sm">Додайте фото або відео (необов'язково)</p>
                </div>
              </div>

              {/* File Upload */}
              <div className="mb-4">
                <label className="block text-sm font-bold text-gray-400 mb-2">Фото / Відео</label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="aspect-square rounded-lg border-2 border-dashed border-gray-700 flex flex-col items-center justify-center text-gray-500 hover:border-gray-500 hover:text-gray-300 cursor-pointer">
                    <Camera className="w-6 h-6 mb-1" />
                    <span className="text-xs">Додати фото</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file, false);
                      }}
                      disabled={uploading}
                    />
                  </label>
                  <label className="aspect-square rounded-lg border-2 border-dashed border-gray-700 flex flex-col items-center justify-center text-gray-500 hover:border-gray-500 hover:text-gray-300 cursor-pointer">
                    <Video className="w-6 h-6 mb-1" />
                    <span className="text-xs">Додати відео</span>
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file, true);
                      }}
                      disabled={uploading}
                    />
                  </label>
                </div>

                {/* Display uploaded files */}
                {(currentStepData.photos.length > 0 || currentStepData.videos.length > 0) && (
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {currentStepData.photos.map((url, idx) => (
                      <div key={idx} className="relative aspect-square rounded-lg overflow-hidden bg-gray-800">
                        <img src={url} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          onClick={() => handleRemoveFile(url, false)}
                          className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {currentStepData.videos.map((url, idx) => (
                      <div key={`video-${idx}`} className="relative aspect-square rounded-lg overflow-hidden bg-gray-800">
                        <video src={url} className="w-full h-full object-cover" controls />
                        <button
                          onClick={() => handleRemoveFile(url, true)}
                          className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Comment */}
              <div className="mb-6">
                <label className="block text-sm font-bold text-gray-400 mb-2">Коментар (необов'язково)</label>
                <textarea
                  value={currentStepData.comment || ''}
                  onChange={(e) => handleCommentChange(e.target.value)}
                  className="w-full bg-[#0D0F11] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none resize-none"
                  rows={3}
                  placeholder="Додайте коментар..."
                />
              </div>

              <button
                onClick={handleStepComplete}
                disabled={loading || uploading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading || uploading ? 'Збереження...' : 'Далі'}
              </button>
            </div>
          )}

          {/* Step 2: Фото до заселення */}
          {currentStep === 2 && (
            <div className="flex-1 flex flex-col">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-purple-500/10 rounded-full flex items-center justify-center">
                  <Camera className="w-6 h-6 text-purple-500" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">2. Фото до заселення</h2>
                  <p className="text-gray-400 text-sm">Обов'язково додайте хоча б одне фото або відео</p>
                </div>
              </div>

              {/* File Upload */}
              <div className="mb-4">
                <label className="block text-sm font-bold text-gray-400 mb-2">Фото / Відео *</label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="aspect-square rounded-lg border-2 border-dashed border-gray-700 flex flex-col items-center justify-center text-gray-500 hover:border-gray-500 hover:text-gray-300 cursor-pointer">
                    <Camera className="w-6 h-6 mb-1" />
                    <span className="text-xs">Додати фото</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file, false);
                      }}
                      disabled={uploading}
                    />
                  </label>
                  <label className="aspect-square rounded-lg border-2 border-dashed border-gray-700 flex flex-col items-center justify-center text-gray-500 hover:border-gray-500 hover:text-gray-300 cursor-pointer">
                    <Video className="w-6 h-6 mb-1" />
                    <span className="text-xs">Додати відео</span>
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file, true);
                      }}
                      disabled={uploading}
                    />
                  </label>
                </div>

                {/* Display uploaded files */}
                {(currentStepData.photos.length > 0 || currentStepData.videos.length > 0) && (
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {currentStepData.photos.map((url, idx) => (
                      <div key={idx} className="relative aspect-square rounded-lg overflow-hidden bg-gray-800">
                        <img src={url} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          onClick={() => handleRemoveFile(url, false)}
                          className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {currentStepData.videos.map((url, idx) => (
                      <div key={`video-${idx}`} className="relative aspect-square rounded-lg overflow-hidden bg-gray-800">
                        <video src={url} className="w-full h-full object-cover" controls />
                        <button
                          onClick={() => handleRemoveFile(url, true)}
                          className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {currentStepData.photos.length === 0 && currentStepData.videos.length === 0 && (
                  <p className="text-xs text-red-400 mt-2">Потрібно додати хоча б одне фото або відео</p>
                )}
              </div>

              {/* Comment */}
              <div className="mb-6">
                <label className="block text-sm font-bold text-gray-400 mb-2">Коментар (необов'язково)</label>
                <textarea
                  value={currentStepData.comment || ''}
                  onChange={(e) => handleCommentChange(e.target.value)}
                  className="w-full bg-[#0D0F11] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none resize-none"
                  rows={3}
                  placeholder="Додайте коментар..."
                />
              </div>

              <button
                onClick={handleStepComplete}
                disabled={loading || uploading || !canProceedToNextStep()}
                className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading || uploading ? 'Збереження...' : 'Далі'}
              </button>
            </div>
          )}

          {/* Step 3: Фото лічильників + заповнення */}
          {currentStep === 3 && (
            <div className="flex-1 flex flex-col">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center">
                  <Zap className="w-6 h-6 text-emerald-500" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">3. Фото лічильників + заповнення</h2>
                  <p className="text-gray-400 text-sm">Заповніть показання лічильників</p>
                </div>
              </div>

              {/* Meter Readings */}
              <div className="mb-4 space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-400 mb-2 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-yellow-500" />
                    Електрика (kWh) *
                  </label>
                  <input
                    type="text"
                    value={currentStepData.meterReadings?.electricity || ''}
                    onChange={(e) => handleMeterReadingChange('electricity', e.target.value)}
                    className="w-full bg-[#0D0F11] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                    placeholder="Введіть показник"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-400 mb-2 flex items-center gap-2">
                    <Droplets className="w-4 h-4 text-blue-500" />
                    Вода (m³) *
                  </label>
                  <input
                    type="text"
                    value={currentStepData.meterReadings?.water || ''}
                    onChange={(e) => handleMeterReadingChange('water', e.target.value)}
                    className="w-full bg-[#0D0F11] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                    placeholder="Введіть показник"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-400 mb-2 flex items-center gap-2">
                    <Flame className="w-4 h-4 text-orange-500" />
                    Газ (m³) *
                  </label>
                  <input
                    type="text"
                    value={currentStepData.meterReadings?.gas || ''}
                    onChange={(e) => handleMeterReadingChange('gas', e.target.value)}
                    className="w-full bg-[#0D0F11] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                    placeholder="Введіть показник"
                  />
                </div>
              </div>

              {/* File Upload for meter readings */}
              <div className="mb-4">
                <label className="block text-sm font-bold text-gray-400 mb-2">Фото лічильників (необов'язково)</label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="aspect-square rounded-lg border-2 border-dashed border-gray-700 flex flex-col items-center justify-center text-gray-500 hover:border-gray-500 hover:text-gray-300 cursor-pointer">
                    <Camera className="w-6 h-6 mb-1" />
                    <span className="text-xs">Додати фото</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file, false);
                      }}
                      disabled={uploading}
                    />
                  </label>
                </div>

                {/* Display uploaded photos */}
                {currentStepData.photos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {currentStepData.photos.map((url, idx) => (
                      <div key={idx} className="relative aspect-square rounded-lg overflow-hidden bg-gray-800">
                        <img src={url} alt={`Meter photo ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          onClick={() => handleRemoveFile(url, false)}
                          className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Comment */}
              <div className="mb-6">
                <label className="block text-sm font-bold text-gray-400 mb-2">Коментар (необов'язково)</label>
                <textarea
                  value={currentStepData.comment || ''}
                  onChange={(e) => handleCommentChange(e.target.value)}
                  className="w-full bg-[#0D0F11] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none resize-none"
                  rows={3}
                  placeholder="Додайте коментар..."
                />
              </div>

              <button
                onClick={handleStepComplete}
                disabled={loading || uploading || !canProceedToNextStep()}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading || uploading ? 'Завершення...' : 'Завершити завдання'}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

// Legacy workflow for non-Einzug/Auszug tasks
const TaskWorkflowViewLegacy: React.FC<TaskWorkflowViewProps> = ({ task, onBack }) => {
  const [status, setStatus] = useState(task.status);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    try {
      setLoading(true);
      await tasksService.update(task.id, { status: 'in_progress' });
      setStatus('in_progress');
      setStep(2);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    setStep(prev => prev + 1);
  };

  const handleFinish = async () => {
    try {
      setLoading(true);
      await tasksService.update(task.id, { status: 'review' });
      setStatus('review');
      onBack();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0D0F11]">
      <div className="p-4 bg-[#111315] border-b border-gray-800 flex items-center gap-4 sticky top-0 z-10">
        <button onClick={onBack} className="text-gray-400 hover:text-white p-1">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-white line-clamp-1">{task.title}</h1>
          <p className="text-xs text-gray-400 capitalize">{status.replace('_', ' ')}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-24">
        <div className="flex justify-between mb-8 px-2">
          {[1, 2, 3, 4, 5].map((s) => (
            <div key={s} className="flex flex-col items-center gap-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                step >= s 
                  ? 'bg-blue-600 border-blue-600 text-white' 
                  : 'bg-transparent border-gray-700 text-gray-500'
              }`}>
                {step > s ? <Check className="w-4 h-4" /> : s}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-[#1C1F24] rounded-xl p-6 border border-gray-800 min-h-[300px] flex flex-col">
          {step === 1 && (
            <div className="text-center my-auto">
              <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Play className="w-10 h-10 text-blue-500 ml-1" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Ready to Start?</h2>
              <p className="text-gray-400 mb-8">Make sure you are at the location and have all necessary equipment.</p>
              <button 
                onClick={handleStart}
                disabled={loading}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-900/20 transition-transform active:scale-95"
              >
                {loading ? 'Starting...' : 'Start Task'}
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="text-center my-auto">
              <div className="w-20 h-20 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Camera className="w-10 h-10 text-purple-500" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Photos Before</h2>
              <p className="text-gray-400 mb-8">Take photos of the initial state.</p>
              <button 
                onClick={handleNext}
                className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl"
              >
                Next Step
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="my-auto">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center">
                  <CheckSquare className="w-6 h-6 text-emerald-500" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Checklist</h2>
                  <p className="text-gray-400 text-sm">Complete all items</p>
                </div>
              </div>
              <button 
                onClick={handleNext}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl"
              >
                Next Step
              </button>
            </div>
          )}

          {step === 4 && (
            <div className="text-center my-auto">
              <div className="w-20 h-20 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Camera className="w-10 h-10 text-purple-500" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Photos After</h2>
              <p className="text-gray-400 mb-8">Prove your work is done perfectly.</p>
              <button 
                onClick={handleNext}
                className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl"
              >
                Final Review
              </button>
            </div>
          )}

          {step === 5 && (
            <div className="text-center my-auto">
              <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckSquare className="w-10 h-10 text-green-500" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">All Done!</h2>
              <p className="text-gray-400 mb-8">Great job. Submit for manager review.</p>
              <button 
                onClick={handleFinish}
                disabled={loading}
                className="w-full py-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-lg shadow-green-900/20 transition-transform active:scale-95"
              >
                {loading ? 'Submitting...' : 'Complete Task'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TaskWorkflowView;
