import React, { useState } from 'react';
import { CalendarEvent } from '../../types';
import { ChevronLeft, Camera, CheckSquare, Send, Check, Play, Upload } from 'lucide-react';
import { tasksService } from '../../services/supabaseService';

interface TaskWorkflowViewProps {
  task: CalendarEvent;
  onBack: () => void;
}

const TaskWorkflowView: React.FC<TaskWorkflowViewProps> = ({ task, onBack }) => {
  // Simplified workflow for demo
  // In real app, this would sync with task_workflows table
  const [status, setStatus] = useState(task.status);
  const [step, setStep] = useState(1); // 1: Start, 2: Photos Before, 3: Checklist, 4: Photos After, 5: Finish
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
      await tasksService.update(task.id, { status: 'review' }); // Or completed
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
      {/* Header */}
      <div className="p-4 bg-[#111315] border-b border-gray-800 flex items-center gap-4 sticky top-0 z-10">
        <button onClick={onBack} className="text-gray-400 hover:text-white p-1">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-white line-clamp-1">{task.title}</h1>
          <p className="text-xs text-gray-400 capitalize">{status.replace('_', ' ')}</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-24">
        
        {/* Progress Steps */}
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

        {/* Step Content */}
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
              <div className="grid grid-cols-2 gap-3 mb-6">
                <button className="aspect-square rounded-lg border-2 border-dashed border-gray-700 flex flex-col items-center justify-center text-gray-500 hover:border-gray-500 hover:text-gray-300">
                  <Camera className="w-6 h-6 mb-1" />
                  <span className="text-xs">Add Photo</span>
                </button>
                {/* Placeholder for uploaded photo */}
                <div className="aspect-square rounded-lg bg-gray-800 border border-gray-700"></div>
              </div>
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
              
              <div className="space-y-3 mb-8">
                {['Check windows', 'Clean floor', 'Remove trash', 'Check lights'].map((item, i) => (
                  <label key={i} className="flex items-center gap-3 p-3 bg-[#0D0F11] rounded-lg border border-gray-800">
                    <input type="checkbox" className="w-5 h-5 rounded border-gray-600 text-emerald-500 focus:ring-emerald-500" />
                    <span className="text-gray-300">{item}</span>
                  </label>
                ))}
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
              <div className="grid grid-cols-2 gap-3 mb-6">
                <button className="aspect-square rounded-lg border-2 border-dashed border-gray-700 flex flex-col items-center justify-center text-gray-500 hover:border-gray-500 hover:text-gray-300">
                  <Camera className="w-6 h-6 mb-1" />
                  <span className="text-xs">Add Photo</span>
                </button>
              </div>
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
                <CheckCircle2 className="w-10 h-10 text-green-500" />
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

