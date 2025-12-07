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
  const [currentView, setCurrentView] = useState<'dashboard' | 'booking' | 'market' | 'account' | 'test-db' | 'worker' | 'admin-tasks' | 'register' | 'tasks' | 'property-details'>('market');
  const [pendingPropertyView, setPendingPropertyView] = useState<Property | null>(null);
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
      // Use lightweight mode for faster initial load (especially for Marketplace)
      const data = await propertiesService.getAll(true);
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
    } else if (path === '/' || path === '/market') {
      setCurrentView('market');
    }
  }, []);

  // Check authentication and redirect
  useEffect(() => {
    if (!authLoading) {
      if (worker) {
        console.log('✅ App: Worker loaded, checking permissions:', worker.name, worker.role);
        
        // IMPORTANT: If there's a pending property view, don't redirect - let the pendingPropertyView useEffect handle it
        if (pendingPropertyView) {
          console.log('🔄 App: Pending property view exists, skipping role-based redirect');
          return;
        }
        
        const path = window.location.pathname;
        
        // Handle specific routes first
        if (path === '/worker' && worker.role === 'worker') {
          setCurrentView('worker');
          return;
        } else if (path === '/worker' && worker.role !== 'worker') {
          // Non-worker trying to access worker view -> redirect to account
          setCurrentView('account');
          window.history.pushState({}, '', '/account');
          return;
        } else if (path === '/tasks' && worker.role === 'worker') {
          // Workers shouldn't see full board, redirect to account
          setCurrentView('account');
          window.history.pushState({}, '', '/account');
          return;
        } else if (path === '/tasks') {
          // Allow access to tasks if explicitly on /tasks route
          setCurrentView('tasks');
          return;
        } else if (path === '/account') {
          // Already on account page - stay here (will show Properties by default)
          setCurrentView('account');
          return;
        } else if (path === '/dashboard') {
          // Dashboard route -> redirect to account (Properties)
          setCurrentView('account');
          window.history.pushState({}, '', '/account');
          return;
        } else if (path === '/' || path === '/market') {
          // Root or market - stay on market (public)
          if (currentView !== 'market') {
            setCurrentView('market');
          }
          return;
        } else {
          // Default: All users go to account (Properties category) after login
          setCurrentView('account');
          window.history.pushState({}, '', '/account');
        }
      } else {
        console.log('⚠️ App: No worker, showing login if needed');
        const path = window.location.pathname;
        const protectedPaths = ['/account', '/worker', '/admin/tasks', '/tasks'];
        
        // Redirect to login for protected paths
        if (protectedPaths.includes(path)) {
          setCurrentView('account'); // This will render LoginPage
          window.history.pushState({}, '', '/account');
        } 
        // For dashboard/market, let renderContent handle showing login
        // Don't change currentView here to allow renderContent to intercept
      }
    }
  }, [worker, authLoading, pendingPropertyView]);

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

  // Handle post-login redirect to PropertyDetails (HIGHEST PRIORITY)
  useEffect(() => {
    if (worker && pendingPropertyView) {
      // After successful login, show PropertyDetails immediately
      console.log('🔄 Post-login: Showing PropertyDetails for pending property:', pendingPropertyView.title);
      const property = pendingPropertyView;
      setSelectedProperty(property);
      setCurrentView('property-details');
      window.history.pushState({}, '', `/property/${property.id}`);
      // Clear pending property after setting it
      setPendingPropertyView(null);
    }
  }, [worker, pendingPropertyView]);

  // Handle redirect after login on account page (only if no pending property)
  // Note: Now all users stay on account page (Properties category by default)
  // This useEffect is kept for potential future customizations but doesn't redirect anymore
  useEffect(() => {
    if (worker && currentView === 'account' && !pendingPropertyView) {
      console.log('🔄 Post-login: User logged in, staying on account page (Properties category)');
      // All users stay on account page - AccountDashboard defaults to Properties category
    }
  }, [worker, currentView, pendingPropertyView]);

  const handleMarketListingClick = React.useCallback((listing: any) => {
    console.log('🔵 Marketplace click:', listing);
    
    const handlePropertyClick = (prop: Property) => {
      console.log('🔵 Showing property details (public access)');
      // Always show PropertyDetails - no login required for viewing
      setSelectedProperty(prop);
      setCurrentView('property-details');
      window.history.pushState({}, '', `/property/${prop.id}`);
    };
    
    // First try to find in existing properties
    const property = properties.find(p => p.id === listing.id);
    
    if (property) {
      handlePropertyClick(property);
      return;
    }
    
    // Try to load from database
    propertiesService.getById(listing.id).then(loadedProperty => {
      if (loadedProperty) {
        handlePropertyClick(loadedProperty);
        setProperties(prev => {
          if (prev.find(p => p.id === loadedProperty.id)) {
            return prev;
          }
          return [...prev, loadedProperty];
        });
      } else {
        // If not found in DB, create a temporary Property object from listing data
        // This handles MOCK_MARKET_LISTINGS or listings that don't exist in DB yet
        const tempProperty: Property = {
          id: listing.id,
          title: listing.title,
          address: listing.location || listing.title,
          city: listing.location?.split(',')[1]?.trim() || 'Berlin',
          country: 'Germany',
          price: listing.price,
          rooms: listing.rooms || 1,
          area: listing.area || 0,
          image: listing.image || '',
          images: listing.image ? [listing.image] : [],
          status: 'Available',
          fullAddress: listing.location || listing.title,
          description: listing.description || '',
          details: {},
          building: {},
          inventory: [],
          meterReadings: [],
          meterLog: [],
          rentalHistory: [],
          rentPayments: [],
          futurePayments: [],
          repairRequests: [],
          events: []
        };
        handlePropertyClick(tempProperty);
      }
    }).catch(err => {
      console.error('Error loading property:', err);
      // Even if error, create temp property and proceed
      const tempProperty: Property = {
        id: listing.id,
        title: listing.title,
        address: listing.location || listing.title,
        city: listing.location?.split(',')[1]?.trim() || 'Berlin',
        country: 'Germany',
        price: listing.price,
        rooms: listing.rooms || 1,
        area: listing.area || 0,
        image: listing.image || '',
        images: listing.image ? [listing.image] : [],
        status: 'Available',
        fullAddress: listing.location || listing.title,
        description: listing.description || '',
        details: {},
        building: {},
        inventory: [],
        meterReadings: [],
        meterLog: [],
        rentalHistory: [],
        rentPayments: [],
        futurePayments: [],
        repairRequests: [],
        events: []
      };
      handlePropertyClick(tempProperty);
    });
  }, [properties, worker]);

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

    // Dashboard View - For logged in users, show AccountDashboard
    if (currentView === 'dashboard') {
      if (worker) {
        // Logged in: show AccountDashboard (same as account view)
        return (
          <div className="animate-fadeIn">
            <AccountDashboard />
          </div>
        );
      } else if (!authLoading) {
        // Not logged in: show login
        return (
          <div className="animate-fadeIn">
            <LoginPage onLoginSuccess={() => {
              setCurrentView('account'); // Redirect to account after login
              window.history.pushState({}, '', '/account');
            }} />
          </div>
        );
      }
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
            <LoginPage onLoginSuccess={async () => {
              // Wait for worker to be loaded and state to update
              console.log('🔄 Login success callback called');
              // Give time for worker state to update
              await new Promise(resolve => setTimeout(resolve, 500));
              // Force re-check by reading current worker from context
              // The useEffect will handle the redirect based on role
              console.log('🔄 Waiting for useEffect to handle redirect...');
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

    // Market View (Public)
    if (currentView === 'market') {
      return (
        <div className="animate-fadeIn">
          <Marketplace 
            onListingClick={handleMarketListingClick} 
            properties={properties}
            loading={loading}
          />
        </div>
      );
    }

    // PropertyDetails View (PUBLIC - доступна для перегляду без логіну)
    if (currentView === 'property-details') {
      if (selectedProperty) {
        return (
          <div className="min-h-screen bg-[#0D0F11]">
            <div className="container mx-auto px-4 py-8">
              <button 
                onClick={() => {
                  setSelectedProperty(null);
                  setCurrentView('market');
                }}
                className="mb-6 text-emerald-500 hover:text-emerald-400 font-medium flex items-center gap-2 transition-colors"
              >
                ← Back to Marketplace
              </button>
              <PropertyDetails 
                property={selectedProperty} 
                worker={worker}
                onBook={() => setCurrentView('booking')}
                onClose={() => {
                  setSelectedProperty(null);
                  setCurrentView('market');
                }}
                onRequireLogin={() => {
                  // Save property and redirect to login
                  setPendingPropertyView(selectedProperty);
                  setCurrentView('account');
                  window.history.pushState({}, '', '/account');
                }}
              />
            </div>
          </div>
        );
      } else {
        // If no property selected, redirect to Marketplace
        setCurrentView('market');
        return null;
      }
    }

    // Fallback: If no view matches, redirect to market (public landing page)
    console.warn('⚠️ No view handler for currentView:', currentView);
    setCurrentView('market');
    window.history.pushState({}, '', '/market');
    return null;
  };

  return (
    <div className="min-h-screen bg-[#0D0F11] text-gray-100 font-sans selection:bg-emerald-500/30">
      <Navbar 
        showBackButton={currentView !== 'dashboard' && currentView !== 'market'}
        onBack={() => {
          if (currentView === 'property-details') {
            setCurrentView('market');
          } else {
            setCurrentView('dashboard');
          }
        }}
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
