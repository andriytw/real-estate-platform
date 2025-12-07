import React, { useEffect } from 'react';
import { useWorker } from '../contexts/WorkerContext';
import WorkerTaskListView from './mobile/WorkerTaskListView';

const WorkerMobileApp: React.FC = () => {
  const { worker, isWorker, loading } = useWorker();

  // Auth protection
  useEffect(() => {
    if (!loading && worker) {
      // Ensure only workers access this, or anyone if we want mobile view for managers too
      // For now, stick to logic: /worker route is for mobile app view
    }
  }, [worker, loading]);

  if (loading) {
    return <div className="min-h-screen bg-[#0D0F11] flex items-center justify-center text-gray-500">Loading app...</div>;
  }

  if (!worker) {
    return <div className="min-h-screen bg-[#0D0F11] flex items-center justify-center text-white">Please log in</div>;
  }

  return <WorkerTaskListView />;
};

export default WorkerMobileApp;
