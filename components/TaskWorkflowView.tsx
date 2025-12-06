import React, { useState, useEffect } from 'react';
import { ArrowLeft, Calendar, MapPin, CheckCircle2, Upload, Camera } from 'lucide-react';
import { CalendarEvent, TaskWorkflow } from '../types';
import { taskWorkflowsService, calendarEventsService } from '../services/supabaseService';
import { getTaskColor } from '../utils/taskColors';
import TaskChatModal from './TaskChatModal';

interface TaskWorkflowViewProps {
  event: CalendarEvent;
  workflow: TaskWorkflow | undefined;
  onBack: () => void;
  onUpdateWorkflow: (workflow: TaskWorkflow) => void;
}

const TOTAL_STEPS = 5;

export default function TaskWorkflowView({ event, workflow, onBack, onUpdateWorkflow }: TaskWorkflowViewProps) {
  const [currentWorkflow, setCurrentWorkflow] = useState<TaskWorkflow | null>(workflow || null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [uploading, setUploading] = useState<{ step: number; count: number } | null>(null);

  useEffect(() => {
    const loadWorkflow = async () => {
      if (!workflow) {
        // Create workflow if it doesn't exist
        try {
          const newWorkflow = await taskWorkflowsService.create({
            calendarEventId: event.id,
            step1Completed: false,
            step1Photos: [],
            step2Completed: false,
            step2Photos: [],
            step3Completed: false,
            step3Checklist: [
              { item: 'Кухня (Поверхні, Техніка)', checked: false },
              { item: 'Ванна кімната (Сантехніка, Дзеркала)', checked: false },
              { item: 'Кімнати (Протирання пилу, Підлога)', checked: false }
            ],
            step4Completed: false,
            step4Photos: [],
            step5Completed: false,
            status: 'active'
          });
          setCurrentWorkflow(newWorkflow);
          onUpdateWorkflow(newWorkflow);
        } catch (error) {
          console.error('Error creating workflow:', error);
        }
      } else {
        setCurrentWorkflow(workflow);
      }
    };

    loadWorkflow();
  }, [event.id, workflow]);

  const updateStep = async (stepNumber: 1 | 2 | 3 | 4 | 5, stepData: any) => {
    if (!currentWorkflow) return;

    try {
      const updated = await taskWorkflowsService.updateStep(currentWorkflow.id, stepNumber, stepData);
      setCurrentWorkflow(updated);
      onUpdateWorkflow(updated);

      // If all steps completed, update status
      if (updated.step5Completed) {
        await taskWorkflowsService.update(updated.id, { status: 'completed' });
        await calendarEventsService.update(event.id, { status: 'completed' });
      }
    } catch (error) {
      console.error(`Error updating step ${stepNumber}:`, error);
      alert('Помилка оновлення кроку');
    }
  };

  const handleFileUpload = async (stepNumber: 1 | 2 | 4, requiredCount: number, files: FileList | null) => {
    if (!files || files.length < requiredCount) {
      alert(`Будь ласка, завантажте мінімум ${requiredCount} фото.`);
      return;
    }

    if (!currentWorkflow) return;

    try {
      setUploading({ step: stepNumber, count: files.length });
      const photoUrls: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const url = await taskWorkflowsService.uploadPhoto(currentWorkflow.id, stepNumber, files[i]);
        photoUrls.push(url);
      }

      const currentPhotos = stepNumber === 1 
        ? currentWorkflow.step1Photos 
        : stepNumber === 2 
        ? currentWorkflow.step2Photos 
        : currentWorkflow.step4Photos;

      await updateStep(stepNumber, {
        photos: [...currentPhotos, ...photoUrls],
        completed: photoUrls.length >= requiredCount
      });

      if (stepNumber === 1 && !currentWorkflow.timeStart) {
        await taskWorkflowsService.update(currentWorkflow.id, {
          timeStart: new Date().toISOString()
        });
      }

      alert(`Крок ${stepNumber}: Успішно завантажено ${photoUrls.length} фото.`);
    } catch (error) {
      console.error('Error uploading photos:', error);
      alert('Помилка завантаження фото');
    } finally {
      setUploading(null);
    }
  };

  const handleChecklistChange = async (index: number, checked: boolean) => {
    if (!currentWorkflow) return;

    const updatedChecklist = [...currentWorkflow.step3Checklist];
    updatedChecklist[index] = { ...updatedChecklist[index], checked };

    const allChecked = updatedChecklist.every(item => item.checked);

    await updateStep(3, {
      checklist: updatedChecklist,
      completed: allChecked
    });
  };

  const handleFinalSubmit = async () => {
    if (!currentWorkflow) return;

    if (!window.confirm('Ви впевнені, що хочете здати об\'єкт менеджеру?')) {
      return;
    }

    try {
      await updateStep(5, {
        completed: true,
        timeEnd: new Date().toISOString()
      });

      await taskWorkflowsService.update(currentWorkflow.id, { status: 'completed' });
      await calendarEventsService.update(event.id, { status: 'completed' });

      alert('Об\'єкт здано менеджеру. Очікуйте на фінальну перевірку.');
      onBack();
    } catch (error) {
      console.error('Error finalizing task:', error);
      alert('Помилка здачі об\'єкта');
    }
  };

  if (!currentWorkflow) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-gray-400">Завантаження...</p>
        </div>
      </div>
    );
  }

  const completedSteps = [
    currentWorkflow.step1Completed,
    currentWorkflow.step2Completed,
    currentWorkflow.step3Completed,
    currentWorkflow.step4Completed,
    currentWorkflow.step5Completed
  ].filter(Boolean).length;

  const progress = (completedSteps / TOTAL_STEPS) * 100;

  const formatDateTime = (dateStr?: string, timeStr?: string) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year} ${timeStr || ''}`.trim();
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <button
        onClick={onBack}
        className="mb-4 flex items-center text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium transition-colors"
      >
        <ArrowLeft className="w-5 h-5 mr-1" />
        Повернутися до Моїх Завдань
      </button>

      {/* Header */}
      <header className="bg-white dark:bg-gray-800 p-4 rounded-xl mb-4 shadow-lg border-l-4 border-orange-500">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">
          <span className="text-orange-500">{event.type}</span>
        </h1>
        <div className="flex items-center text-sm text-gray-500 dark:text-gray-400 mb-2">
          <Calendar className="w-4 h-4 mr-1 text-green-500" />
          Дата: <span className="ml-1 font-bold text-indigo-600 dark:text-indigo-400">{formatDateTime(event.date, event.time)}</span>
        </div>

        {/* Progress Bar */}
        <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Прогрес:</span>
            <span className={`text-sm font-bold ${progress === 100 ? 'text-green-500' : 'text-orange-600'}`}>
              {Math.round(progress)}% ({completedSteps}/{TOTAL_STEPS})
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${progress === 100 ? 'bg-green-500' : 'bg-orange-500'}`}
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      </header>

      {/* Workflow Steps */}
      <div className="space-y-4 max-w-xl mx-auto">
        {/* Step 1: Key/Access */}
        <div className={`bg-white dark:bg-gray-800 p-4 rounded-xl border-l-4 ${currentWorkflow.step1Completed ? 'border-green-500' : 'border-orange-500'}`}>
          <h2 className="flex justify-between items-center text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">
            <span>1. Ключ отримати / Доступ</span>
            <span className={`text-sm font-bold ${currentWorkflow.step1Completed ? 'text-green-500' : 'text-orange-600'}`}>
              {currentWorkflow.step1Completed ? 'ЗАВЕРШЕНО' : 'АКТИВНО'}
            </span>
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mb-3 text-sm">Вимога: Зробіть фото ключа/сейфа (1 фото)</p>
          <div className="file-upload-btn flex items-center justify-center p-3 rounded-lg bg-indigo-500 text-white font-medium hover:bg-indigo-600 transition duration-150 shadow-md cursor-pointer">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleFileUpload(1, 1, e.target.files)}
              className="hidden"
              id="file-1"
              disabled={currentWorkflow.step1Completed}
            />
            <label htmlFor="file-1" className="cursor-pointer w-full text-center">
              {uploading?.step === 1 ? `Завантаження... (${uploading.count})` : currentWorkflow.step1Completed ? `✅ Завантажено (${currentWorkflow.step1Photos.length}/1)` : `Завантажити Фото Ключа (${currentWorkflow.step1Photos.length}/1)`}
            </label>
          </div>
        </div>

        {/* Step 2: Photos BEFORE */}
        <div className={`bg-white dark:bg-gray-800 p-4 rounded-xl border-l-4 ${currentWorkflow.step2Completed ? 'border-green-500' : currentWorkflow.step1Completed ? 'border-orange-500' : 'border-gray-400 opacity-50'}`}>
          <h2 className="flex justify-between items-center text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">
            <span>2. Фото ДО прибирання</span>
            <span className={`text-sm font-bold ${currentWorkflow.step2Completed ? 'text-green-500' : currentWorkflow.step1Completed ? 'text-orange-600' : 'text-gray-400'}`}>
              {currentWorkflow.step2Completed ? 'ЗАВЕРШЕНО' : currentWorkflow.step1Completed ? 'АКТИВНО' : 'ЗАКРИТО'}
            </span>
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mb-3 text-sm">Вимога: Завантажте мінімум 3 фото ДО прибирання</p>
          <div className={`file-upload-btn flex items-center justify-center p-3 rounded-lg font-medium transition duration-150 shadow-md ${currentWorkflow.step2Completed ? 'bg-green-500 text-white cursor-default' : currentWorkflow.step1Completed ? 'bg-indigo-500 text-white hover:bg-indigo-600 cursor-pointer' : 'bg-gray-300 text-gray-700 cursor-not-allowed'}`}>
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => handleFileUpload(2, 3, e.target.files)}
              className="hidden"
              id="file-2"
              disabled={!currentWorkflow.step1Completed || currentWorkflow.step2Completed}
            />
            <label htmlFor="file-2" className={`w-full text-center ${currentWorkflow.step1Completed && !currentWorkflow.step2Completed ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
              {uploading?.step === 2 ? `Завантаження... (${uploading.count})` : currentWorkflow.step2Completed ? `✅ Завантажено (${currentWorkflow.step2Photos.length}/3)` : `Завантажити Фото ДО (${currentWorkflow.step2Photos.length}/3)`}
            </label>
          </div>
        </div>

        {/* Step 3: Cleaning Checklist */}
        <div className={`bg-white dark:bg-gray-800 p-4 rounded-xl border-l-4 ${currentWorkflow.step3Completed ? 'border-green-500' : currentWorkflow.step2Completed ? 'border-orange-500' : 'border-gray-400 opacity-50'}`}>
          <h2 className="flex justify-between items-center text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">
            <span>3. Прибирання завершити</span>
            <span className={`text-sm font-bold ${currentWorkflow.step3Completed ? 'text-green-500' : currentWorkflow.step2Completed ? 'text-orange-600' : 'text-gray-400'}`}>
              {currentWorkflow.step3Completed ? 'ЗАВЕРШЕНО' : currentWorkflow.step2Completed ? 'АКТИВНО' : 'ЗАКРИТО'}
            </span>
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mb-3 text-sm">Вимога: Повністю виконайте чекліст</p>
          <div className="space-y-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700">
            {currentWorkflow.step3Checklist.map((item, index) => (
              <label key={index} className="flex items-center text-gray-700 dark:text-gray-200 select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) => handleChecklistChange(index, e.target.checked)}
                  disabled={!currentWorkflow.step2Completed || currentWorkflow.step3Completed}
                  className="h-5 w-5 text-green-500 rounded border-gray-300 focus:ring-green-500 dark:bg-gray-600 dark:border-gray-500"
                />
                <span className="ml-3">{item.item}</span>
              </label>
            ))}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-3">
            Виконано: {currentWorkflow.step3Checklist.filter(item => item.checked).length}/{currentWorkflow.step3Checklist.length} пунктів
          </div>
        </div>

        {/* Step 4: Photos AFTER */}
        <div className={`bg-white dark:bg-gray-800 p-4 rounded-xl border-l-4 ${currentWorkflow.step4Completed ? 'border-green-500' : currentWorkflow.step3Completed ? 'border-orange-500' : 'border-gray-400 opacity-50'}`}>
          <h2 className="flex justify-between items-center text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">
            <span>4. Фото ПІСЛЯ прибирання</span>
            <span className={`text-sm font-bold ${currentWorkflow.step4Completed ? 'text-green-500' : currentWorkflow.step3Completed ? 'text-orange-600' : 'text-gray-400'}`}>
              {currentWorkflow.step4Completed ? 'ЗАВЕРШЕНО' : currentWorkflow.step3Completed ? 'АКТИВНО' : 'ЗАКРИТО'}
            </span>
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mb-3 text-sm">Вимога: Завантажте мінімум 3 фото ПІСЛЯ прибирання</p>
          <div className={`file-upload-btn flex items-center justify-center p-3 rounded-lg font-medium transition duration-150 shadow-md ${currentWorkflow.step4Completed ? 'bg-green-500 text-white cursor-default' : currentWorkflow.step3Completed ? 'bg-indigo-500 text-white hover:bg-indigo-600 cursor-pointer' : 'bg-gray-300 text-gray-700 cursor-not-allowed'}`}>
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => handleFileUpload(4, 3, e.target.files)}
              className="hidden"
              id="file-4"
              disabled={!currentWorkflow.step3Completed || currentWorkflow.step4Completed}
            />
            <label htmlFor="file-4" className={`w-full text-center ${currentWorkflow.step3Completed && !currentWorkflow.step4Completed ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
              {uploading?.step === 4 ? `Завантаження... (${uploading.count})` : currentWorkflow.step4Completed ? `✅ Завантажено (${currentWorkflow.step4Photos.length}/3)` : `Завантажити Фото ПІСЛЯ (${currentWorkflow.step4Photos.length}/3)`}
            </label>
          </div>
        </div>

        {/* Step 5: Final Submit */}
        <div className={`bg-white dark:bg-gray-800 p-4 rounded-xl border-l-4 ${currentWorkflow.step5Completed ? 'border-green-500' : currentWorkflow.step4Completed ? 'border-orange-500' : 'border-gray-400 opacity-50'}`}>
          <h2 className="flex justify-between items-center text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">
            <span>5. Завершити / Здати об'єкт</span>
            <span className={`text-sm font-bold ${currentWorkflow.step5Completed ? 'text-green-500' : currentWorkflow.step4Completed ? 'text-orange-600' : 'text-gray-400'}`}>
              {currentWorkflow.step5Completed ? 'ЗДАНО' : currentWorkflow.step4Completed ? 'АКТИВНО' : 'ЗАКРИТО'}
            </span>
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mb-3 text-sm">Фінальний крок. Об'єкт готовий до перевірки менеджером</p>
          <button
            onClick={handleFinalSubmit}
            disabled={!currentWorkflow.step4Completed || currentWorkflow.step5Completed}
            className={`w-full p-3 rounded-lg font-medium transition duration-150 shadow-md ${
              currentWorkflow.step5Completed
                ? 'bg-green-500 text-white cursor-default'
                : currentWorkflow.step4Completed
                ? 'bg-green-500 text-white hover:bg-green-600 cursor-pointer'
                : 'bg-gray-300 text-gray-700 cursor-not-allowed'
            }`}
          >
            {currentWorkflow.step5Completed ? '✅ Об\'єкт Здано' : 'Здати Об\'єкт Менеджеру'}
          </button>
        </div>
      </div>

      {/* Chat Toggle Button */}
      <button
        onClick={() => setIsChatOpen(true)}
        className="fixed bottom-20 right-4 bg-indigo-500 hover:bg-indigo-600 text-white rounded-full w-14 h-14 shadow-lg transition-transform transform hover:scale-105 active:scale-95 flex items-center justify-center"
      >
        💬
      </button>

      {/* Chat Modal */}
      {isChatOpen && (
        <TaskChatModal
          eventId={event.id}
          onClose={() => setIsChatOpen(false)}
        />
      )}
    </div>
  );
}

