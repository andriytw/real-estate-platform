import React from 'react';
import { Building2, Home, Globe, Sun, ChevronLeft, ShoppingBag, LogOut } from 'lucide-react';
import { useWorker } from '../contexts/WorkerContext';

// #region agent log
const __PROOF_ENDPOINT_978438 =
  'http://127.0.0.1:7242/ingest/1aed333d-0076-47f3-8bf4-1ca5f822ecdd' as const;
function __getProofRunId978438(): string {
  try {
    const k = '__proofRunId978438';
    const existing = sessionStorage.getItem(k);
    if (existing) return existing;
    const id = `pr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(k, id);
    return id;
  } catch {
    return `pr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
const __proofRunId978438 = __getProofRunId978438();
function __proofMark978438(location: string, marker: string, data?: Record<string, unknown>) {
  try {
    fetch(__PROOF_ENDPOINT_978438, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '978438' },
      body: JSON.stringify({
        sessionId: '978438',
        runId: __proofRunId978438,
        hypothesisId: 'proof',
        location,
        message: marker,
        data: { proofRunId: __proofRunId978438, ...(data ?? {}) },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  } catch {}
}
// #endregion

interface NavbarProps {
  showBackButton?: boolean;
  onBack?: () => void;
  onBecomePartner?: () => void;
  onNavigate?: (view: 'dashboard' | 'market' | 'account' | 'tasks') => void;
  /** When provided, "My Account" uses this instead of onNavigate('account') (e.g. to open login modal when no session). */
  onMyAccountClick?: () => void;
  currentView?: 'dashboard' | 'booking' | 'market' | 'account' | 'test-db' | 'worker' | 'admin-tasks' | 'register' | 'tasks';
}

const Navbar: React.FC<NavbarProps> = ({ showBackButton, onBack, onBecomePartner, onNavigate, onMyAccountClick, currentView }) => {
  const { worker, logout } = useWorker();
  
  const handleLogout = async () => {
    // #region agent log
    __proofMark978438('Navbar.tsx:logout:uiClick', 'logout:ui:click', { source: 'Navbar' });
    // #endregion
    try {
      await logout();
      window.location.href = '/';
    } catch (error) {
      console.error('Logout error:', error);
    }
  };
  
  const isManagerOrAdmin = worker && (worker.role === 'manager' || worker.role === 'super_manager');

  return (
    <nav className="h-16 bg-[#111315] border-b border-gray-800 flex items-center justify-between px-6 sticky top-0 z-50">
      {/* Left Section */}
      <div className="flex items-center gap-8">
        <div 
          onClick={() => onNavigate?.('dashboard')}
          className="flex items-center gap-2 text-emerald-500 cursor-pointer hover:opacity-90 transition-opacity"
        >
          <Building2 className="w-8 h-8" />
          <span className="text-xl font-bold text-white tracking-wide">HeroRooms</span>
        </div>

        {/* Navigation or Back Button */}
        {showBackButton && currentView !== 'market' && currentView !== 'account' && currentView !== 'tasks' ? (
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm font-medium pl-4 border-l border-gray-700"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
        ) : (
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-300">
            <button 
              onClick={() => onNavigate?.('dashboard')}
              className={`${currentView === 'dashboard' ? 'text-white' : 'hover:text-emerald-400'} transition-colors`}
            >
              Home
            </button>
            <button 
              onClick={() => onNavigate?.('market')}
              className={`flex items-center gap-2 ${currentView === 'market' ? 'text-emerald-500 font-bold' : 'hover:text-emerald-400'} transition-colors`}
            >
              <ShoppingBag className="w-4 h-4" />
              Market
            </button>
          </div>
        )}
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-4">
        <button 
          onClick={() => onNavigate?.('dashboard')}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
        >
          <Home className="w-4 h-4" />
          <span className="hidden lg:inline">Home</span>
        </button>
        
        {worker && (
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-gray-400 hover:text-red-400 transition-colors text-xs px-2 py-1 rounded hover:bg-red-500/10"
            title="Вийти"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden lg:inline text-xs">Вийти</span>
          </button>
        )}
        
        <div className="h-4 w-[1px] bg-gray-700"></div>
        
        <button className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm border border-gray-700 rounded-full px-3 py-1.5 bg-gray-800/50">
          <Globe className="w-3 h-3" />
          <span>EN</span>
        </button>
        
        <button className="text-gray-400 hover:text-white transition-colors">
          <Sun className="w-5 h-5" />
        </button>

        <button 
          onClick={onBecomePartner}
          className="hidden md:block bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold py-2 px-4 rounded transition-colors"
        >
          Become Partner
        </button>

        <button 
          onClick={() => (onMyAccountClick ? onMyAccountClick() : onNavigate?.('account'))}
          className={`
            text-xs font-bold py-2 px-4 rounded transition-colors
            ${currentView === 'account' 
              ? 'bg-white text-[#111315]' 
              : 'bg-[#1E9E83] hover:bg-emerald-700 text-white'}
          `}
        >
          My Account
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
