import React, { useState, useEffect, useMemo } from 'react';
import Navbar from './components/Navbar';
import FilterBar from './components/FilterBar';
import PropertyCard from './components/PropertyCard';
import PropertyDetails from './components/PropertyDetails';
import BookingForm from './components/BookingForm';
import PartnerModal from './components/PartnerModal';
import Marketplace from './components/Marketplace';
import AccountDashboard from './components/AccountDashboard';
import TestDB from './components/TestDB';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import WorkerMobileApp from './components/WorkerMobileApp';
import AdminTasksBoard from './components/AdminTasksBoard';
import KanbanBoard from './components/kanban/KanbanBoard';
import { WorkerProvider, useWorker } from './contexts/WorkerContext';
import { propertiesService } from './services/supabaseService';
import { Property, FilterState, RequestData } from './types';

// Internal AppContent component that uses Worker context
const AppContent: React.FC = () => {
  const { worker, loading: authLoading } = useWorker();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [currentView, setCurrentView] = useState<'dashboard' | 'booking' | 'market' | 'account' | 'test-db' | 'worker' | 'admin-tasks' | 'register' | 'tasks'>('dashboard');
  const [isPartnerModalOpen, setIsPartnerModalOpen] = useState(false);
  const [prefilledRequestData, setPrefilledRequestData] = useState<Partial<RequestData> | undefined>(undefined);
  const [filters, setFilters] = useState<FilterState>({
    city: '',
    district: '',
    rooms: '',
    floor: '',
    elevator: '',
    pets: '',
    status: ''
  });
  const [authTimeoutReached, setAuthTimeoutReached] = useState(false);

  // Force show login if loading takes too long (fallback)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (authLoading) {
        console.warn('⚠️ App: Auth loading timed out (6s), forcing login check');
        setAuthTimeoutReached(true);
      }
    }, 6000);
    return () => clearTimeout(timer);
  }, [authLoading]);

  // Clear Supabase cache if loading fails aggressively
  useEffect(() => {
    if (authTimeoutReached && authLoading) {
      console.log('🧹 Clearing Supabase cache due to timeout');
      try {
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('sb-')) localStorage.removeItem(key);
        });
        Object.keys(sessionStorage).forEach(key => {
          if (key.startsWith('sb-')) sessionStorage.removeItem(key);
        });
      } catch (e) {
        console.error('Error clearing cache', e);
      }
    }
  }, [authLoading, authTimeoutReached]);

  // Load properties from Supabase
  const loadProperties = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await propertiesService.getAll();
      setProperties(data);
      
      if (data.length > 0 && !selectedProperty) {
        setSelectedProperty(data[0]);
      }
    } catch (err: any) {
      console.error('Error loading properties:', err);
      const errorMessage = err.message || 'Failed to load properties';
      if (!errorMessage.includes('Unregistered') && !errorMessage.includes('does not exist')) {
        setError(errorMessage);
      }
      setProperties([]);
    } finally {
      setLoading(false);
    }
  };

  // Check URL path for routing
  useEffect(() => {
    const path = window.location.pathname;
    if (path === '/worker') {
      setCurrentView('worker');
    } else if (path === '/admin/tasks') {
      setCurrentView('admin-tasks');
    } else if (path === '/register') {
      setCurrentView('register');
    } else if (path === '/tasks') {
      setCurrentView('tasks');
    }
  }, []);

  // Check authentication and redirect
  useEffect(() => {
    if (!authLoading) {
      if (worker) {
        console.log('✅ App: Worker loaded, checking permissions:', worker.name, worker.role);
        const path = window.location.pathname;
        if (path === '/worker' && worker.role !== 'worker') {
          setCurrentView('dashboard');
          window.history.pushState({}, '', '/dashboard');
        } else if (path === '/tasks' && worker.role === 'worker') {
           // Workers shouldn't see full board, redirect to mobile app
           setCurrentView('worker');
           window.history.pushState({}, '', '/worker');
        } else if (path === '/worker' && worker.role === 'worker') {
          setCurrentView('worker');
        } else if (path === '/tasks') {
          setCurrentView('tasks');
        } else if (path === '/account' || path === '/dashboard') {
          // Stay on current view
        } else {
          // Default
          setCurrentView('dashboard');
          window.history.pushState({}, '', '/dashboard');
        }
      } else {
        console.log('⚠️ App: No worker, showing login if needed');
        const protectedPaths = ['/account', '/worker', '/admin/tasks', '/tasks'];
        if (protectedPaths.includes(window.location.pathname)) {
          setCurrentView('account'); // This will render LoginPage
        }
      }
    }
  }, [worker, authLoading]);

  useEffect(() => {
    loadProperties();
  }, []);

  // Listen for propertiesUpdated event
  useEffect(() => {
    const handlePropertiesUpdated = () => {
      loadProperties();
    };
    window.addEventListener('propertiesUpdated', handlePropertiesUpdated);
    return () => {
      window.removeEventListener('propertiesUpdated', handlePropertiesUpdated);
    };
  }, []);

  // Update selected property when properties change
  useEffect(() => {
    if (properties.length > 0 && !selectedProperty) {
      setSelectedProperty(properties[0]);
    }
  }, [properties, selectedProperty]);

  const handleMarketListingClick = React.useCallback((listing: any) => {
    const property = properties.find(p => p.id === listing.id);
    
    if (property) {
      setSelectedProperty(property);
      setCurrentView('dashboard');
    } else {
      propertiesService.getById(listing.id).then(loadedProperty => {
        if (loadedProperty) {
          setSelectedProperty(loadedProperty);
          setCurrentView('dashboard');
          setProperties(prev => {
            if (prev.find(p => p.id === loadedProperty.id)) {
              return prev;
            }
            return [...prev, loadedProperty];
          });
        }
      }).catch(err => {
        console.error('Error loading property:', err);
      });
    }
  }, [properties]);

  // Filter properties
  const filteredProperties = useMemo(() => {
    return properties.filter(property => {
      if (filters.city && property.city !== filters.city) return false;
      if (filters.district && property.district !== filters.district) return false;
      if (filters.rooms && property.rooms.toString() !== filters.rooms) return false;
      if (filters.floor && property.floor?.toString() !== filters.floor) return false;
      // if (filters.elevator && property.building.elevator !== filters.elevator) return false;
      // if (filters.pets && property.building.pets !== filters.pets) return false;
      if (filters.status && property.status !== filters.status) return false;
      return true;
    });
  }, [properties, filters]);

  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters);
  };

  const renderContent = () => {
    console.log('Rendering content, currentView:', currentView, 'Auth loading:', authLoading);
    
    if (authLoading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-white">Loading...</div>
        </div>
      );
    }

    // Register Page (Public)
    if (currentView === 'register') {
      return <RegisterPage onRegisterSuccess={() => {
        setCurrentView('account');
        window.history.pushState({}, '', '/account');
      }} />;
    }

    // Account / Login View
    if (currentView === 'account') {
      if (worker) {
        return (
          <div className="animate-fadeIn">
            <AccountDashboard />
          </div>
        );
      } else {
        return (
          <div className="animate-fadeIn">
            <LoginPage onLoginSuccess={() => {
              // Role based redirect
              // We rely on useEffect to redirect, but trigger state update
              // App will check role and set view
            }} />
          </div>
        );
      }
    }

    // Worker Mobile View
    if (currentView === 'worker') {
      if (worker && worker.role === 'worker') {
        return <WorkerMobileApp />;
      } else if (worker) {
        // Manager trying to access worker view -> redirect to dashboard
        return (
          <div className="flex items-center justify-center min-h-screen text-white">
            Redirecting to dashboard...
          </div>
        );
      } else {
        return <LoginPage onLoginSuccess={() => setCurrentView('worker')} />;
      }
    }

    // Kanban Board View (Tasks)
    if (currentView === 'tasks') {
      if (worker) {
        return <KanbanBoard />;
      } else {
        return <LoginPage onLoginSuccess={() => setCurrentView('tasks')} />;
      }
    }

    // Admin Tasks Board (Legacy? Or remove if replaced)
    if (currentView === 'admin-tasks') {
      return <AdminTasksBoard />;
    }

    // Test DB View
    if (currentView === 'test-db') {
      return <TestDB />;
    }

    // Booking View
    if (currentView === 'booking') {
      return (
        <div className="container mx-auto px-4 py-8 animate-fadeIn">
          <button 
            onClick={() => setCurrentView('dashboard')}
            className="mb-6 text-emerald-500 hover:text-emerald-400 font-medium flex items-center gap-2 transition-colors"
          >
            ← Back to Dashboard
          </button>
          {selectedProperty ? (
            <BookingForm 
              property={selectedProperty} 
              onSuccess={() => setCurrentView('dashboard')}
            />
          ) : (
            <div className="text-center text-white py-12">Please select a property first</div>
          )}
        </div>
      );
    }

    // Market View
    if (currentView === 'market') {
      return (
        <div className="animate-fadeIn">
          <Marketplace onItemClick={handleMarketListingClick} />
        </div>
      );
    }

    // Default: Dashboard (Properties List)
    return (
      <main className="container mx-auto px-4 py-8 animate-fadeIn">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
            Find Your Perfect <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-500">Home</span>
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Discover a wide range of properties in your favorite cities. 
            From cozy apartments to spacious houses, we have it all.
          </p>
        </div>

        {/* Filters */}
        <div className="sticky top-20 z-40 mb-8 backdrop-blur-md bg-[#0D0F11]/80 p-2 rounded-2xl border border-gray-800/50 shadow-xl">
          <FilterBar onFiltersChange={handleFilterChange} />
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-8 text-center">
            <p className="text-red-400 mb-2">{error}</p>
            <button 
              onClick={loadProperties}
              className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg text-sm transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Property Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-[#1C1F24] rounded-2xl h-[400px] animate-pulse border border-gray-800" />
            ))}
          </div>
        ) : filteredProperties.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredProperties.map((property) => (
              <PropertyCard 
                key={property.id} 
                property={property} 
                onClick={() => {
                  setSelectedProperty(property);
                  // Show details modal or separate page? 
                  // For now let's assume it opens details below or we scroll to it
                  // Ideally open a modal
                }}
                onBook={() => {
                  setSelectedProperty(property);
                  setCurrentView('booking');
                }}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">No properties found matching your criteria.</p>
            <button 
              onClick={() => setFilters({ city: '', district: '', rooms: '', floor: '', elevator: '', pets: '', status: '' })}
              className="mt-4 text-emerald-500 hover:text-emerald-400 font-medium"
            >
              Clear all filters
            </button>
          </div>
        )}

        {/* Property Details Modal (if selected and not booking) */}
        {selectedProperty && currentView === 'dashboard' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
            <div className="bg-[#1C1F24] w-full max-w-6xl rounded-2xl overflow-hidden shadow-2xl my-8 border border-gray-800 relative">
              <button 
                onClick={() => setSelectedProperty(null)}
                className="absolute top-4 right-4 z-10 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors"
              >
                ✕
              </button>
              <PropertyDetails 
                property={selectedProperty} 
                onBook={() => setCurrentView('booking')}
                onClose={() => setSelectedProperty(null)}
              />
            </div>
          </div>
        )}
      </main>
    );
  };

  return (
    <div className="min-h-screen bg-[#0D0F11] text-gray-100 font-sans selection:bg-emerald-500/30">
      <Navbar 
        showBackButton={currentView !== 'dashboard'}
        onBack={() => setCurrentView('dashboard')}
        onBecomePartner={() => setIsPartnerModalOpen(true)}
        currentView={currentView}
        onNavigate={(view) => {
          console.log('Navigating to:', view);
          if (view === 'tasks') {
             // Check permissions? Handled in render
             setCurrentView('tasks');
             window.history.pushState({}, '', '/tasks');
          } else if (view === 'account') {
             setCurrentView('account');
             window.history.pushState({}, '', '/account');
          } else if (view === 'dashboard') {
             setCurrentView('dashboard');
             window.history.pushState({}, '', '/dashboard');
          } else if (view === 'market') {
             setCurrentView('market');
             window.history.pushState({}, '', '/market');
          }
        }}
      />
      
      {renderContent()}

      <PartnerModal 
        isOpen={isPartnerModalOpen} 
        onClose={() => setIsPartnerModalOpen(false)} 
      />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <WorkerProvider>
      <AppContent />
    </WorkerProvider>
  );
};

export default App;
