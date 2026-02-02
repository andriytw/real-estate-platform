import React, { useState, useEffect, useMemo } from 'react';
import Navbar from './components/Navbar';
import FilterBar from './components/FilterBar';
import PropertyCard from './components/PropertyCard';
import PropertyDetails from './components/PropertyDetails';
import BookingForm from './components/BookingForm';
import PartnerModal from './components/PartnerModal';
import Marketplace from './components/Marketplace';
import AccountDashboard from './components/AccountDashboard';
import ErrorBoundary from './components/ErrorBoundary';
import TestDB from './components/TestDB';
import WorkerMobileApp from './components/WorkerMobileApp';
import AdminTasksBoard from './components/AdminTasksBoard';
import AuthGate from './components/AuthGate';
import { WorkerProvider, useWorker } from './contexts/WorkerContext';
import { propertiesService } from './services/supabaseService';
import { Property, FilterState, RequestData } from './types';

// Lazy-load KanbanBoard so @hello-pangea/dnd is only loaded when user opens Tasks view.
const KanbanBoard = React.lazy(() => import('./components/kanban/KanbanBoard'));

// Internal AppContent: only rendered when session exists (inside AuthGate)
const AppContent: React.FC = () => {
  const { session, worker, loading: authLoading, workerError, retryWorker, logout } = useWorker();
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

  // Load properties from Supabase
  const loadProperties = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('🔄 Loading properties from Supabase...');
      console.log('🔄 Current worker state:', worker?.id || 'not logged in');
      
      // Use lightweight mode for faster initial load (especially for Marketplace)
      const startTime = Date.now();
      const data = await propertiesService.getAll(true);
      const loadTime = Date.now() - startTime;
      
      console.log(`✅ Properties loaded: ${data.length} items in ${loadTime}ms`);
      console.log('📊 Properties data:', data.length > 0 ? data.slice(0, 3).map(p => ({ id: p.id, title: p.title })) : 'empty');
      
      setProperties(data);
      
      if (data.length > 0 && !selectedProperty) {
        setSelectedProperty(data[0]);
      } else if (data.length === 0) {
        console.warn('⚠️ No properties found in database');
        setError('Немає доступних об\'єктів нерухомості');
      }
    } catch (err: any) {
      console.error('❌ Error loading properties:', err);
      const errorMessage = err.message || 'Failed to load properties';
      console.error('Error details:', {
        message: errorMessage,
        code: err.code,
        details: err.details,
        hint: err.hint,
        stack: err.stack
      });
      
      // Always set error, but don't show "Unregistered" errors to user
      if (!errorMessage.includes('Unregistered') && !errorMessage.includes('does not exist')) {
        setError(errorMessage);
      } else {
        // For unregistered errors, just log and set empty array
        console.warn('⚠️ Supabase key issue - properties will be empty');
        setError('Помилка підключення до бази даних. Перевірте налаштування.');
      }
      setProperties([]);
    } finally {
      setLoading(false);
      console.log('🏁 Properties loading finished, loading state:', false);
    }
  };

  // Sync view with URL path - helper function
  const syncViewWithPath = () => {
    const path = window.location.pathname;
    if (path === '/worker') {
      setCurrentView('worker');
    } else if (path === '/admin/tasks') {
      setCurrentView('admin-tasks');
    } else if (path === '/register') {
      setCurrentView('register');
    } else if (path === '/tasks') {
      setCurrentView('tasks');
    } else if (path === '/account' || path === '/dashboard') {
      setCurrentView('account');
    } else if (path === '/' || path === '/market') {
      setCurrentView('market');
    } else if (path.startsWith('/property/')) {
      // Property route - handled by property-details logic
      // Don't change view here to avoid conflicts
    }
  };

  // Check URL path for routing (early initialization)
  useEffect(() => {
    syncViewWithPath();
  }, []);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      console.log('🔄 App: Browser navigation detected, syncing view with path');
      syncViewWithPath();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Handle page visibility changes (when returning to tab)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('🔄 App: Tab became visible, syncing view with path');
        syncViewWithPath();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Handle bfcache (back/forward cache) restoration
  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        // Page was restored from bfcache
        console.log('🔄 App: Page restored from bfcache, syncing view with path');
        syncViewWithPath();
      }
    };

    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  // Check authentication and redirect (session is source of truth; we only redirect when worker is known)
  useEffect(() => {
    if (worker) {
        console.log('✅ App: Worker loaded, checking permissions:', worker.name, worker.role);
        
        // IMPORTANT: If there's a pending property view, don't redirect - let the pendingPropertyView useEffect handle it
        if (pendingPropertyView) {
          console.log('🔄 App: Pending property view exists, skipping role-based redirect');
          return;
        }
        
        // IMPORTANT: If already on property-details view, don't redirect
        if (currentView === 'property-details' && selectedProperty) {
          console.log('🔄 App: Already on PropertyDetails, staying here');
          return;
        }
        
        const path = window.location.pathname;
        
        // Handle property details route - stay on it if already there
        if (path.startsWith('/property/')) {
          const propertyId = path.split('/property/')[1];
          // If we have selectedProperty matching this ID, stay on property-details
          if (selectedProperty && selectedProperty.id === propertyId) {
            console.log('🔄 App: On property route with matching property, staying on PropertyDetails');
            setCurrentView('property-details');
            return;
          }
        }
        
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
        } else if (path.startsWith('/property/')) {
          // Property route - don't redirect, let property-details view handle it
          return;
        } else {
          // Default: All users go to account (Properties category) after login
          setCurrentView('account');
          window.history.pushState({}, '', '/account');
        }
      }
      if (!worker && !authLoading) {
        console.log('⚠️ App: No worker (profile loading failed or pending)');
        const path = window.location.pathname;
        const protectedPaths = ['/account', '/worker', '/admin/tasks', '/tasks'];
        
        // Redirect to account for protected paths (AuthGate shows Login when session is null)
        if (protectedPaths.includes(path)) {
          setCurrentView('account');
          window.history.pushState({}, '', '/account');
        }
        // For dashboard/market, let renderContent handle showing login
      }
    // Use only primitive values in dependencies to avoid React error #310
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worker?.id, pendingPropertyView?.id, currentView, selectedProperty?.id]);

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
    // Use only primitive values in dependencies to avoid React error #310
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties.length, selectedProperty?.id]);

  // Handle post-login redirect to PropertyDetails (HIGHEST PRIORITY)
  // This must run BEFORE the main auth redirect useEffect
  // Using setTimeout to ensure this runs after state updates
  useEffect(() => {
    if (worker && pendingPropertyView) {
      // After successful login, show PropertyDetails immediately
      console.log('🔄 Post-login: Showing PropertyDetails for pending property:', pendingPropertyView.title);
      const property = pendingPropertyView;
      
      // Use setTimeout to ensure this runs after other state updates
      setTimeout(() => {
        // Clear pending property FIRST to prevent conflicts
        setPendingPropertyView(null);
        // Then set property and view
        setSelectedProperty(property);
        setCurrentView('property-details');
        window.history.pushState({}, '', `/property/${property.id}`);
        console.log('✅ Post-login: PropertyDetails view set, property:', property.id);
      }, 0);
    }
  }, [worker, pendingPropertyView]);

  // Handle redirect after login on account page (only if no pending property)
  // Note: Now all users stay on account page (Properties category by default)
  // This useEffect is kept for potential future customizations but doesn't redirect anymore
  useEffect(() => {
    if (worker?.id && currentView === 'account' && !pendingPropertyView?.id) {
      console.log('🔄 Post-login: User logged in, staying on account page (Properties category)');
      // All users stay on account page - AccountDashboard defaults to Properties category
    }
    // Use only primitive values in dependencies to avoid React error #310
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worker?.id, currentView, pendingPropertyView?.id]);

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
          zip: '',
          city: listing.location?.split(',')[1]?.trim() || 'Berlin',
          district: '',
          price: listing.price,
          pricePerSqm: 0,
          rooms: listing.rooms || 1,
          area: listing.area || 0,
          image: listing.image || '',
          images: listing.image ? [listing.image] : [],
          status: 'Available',
          fullAddress: listing.location || listing.title,
          description: listing.description || '',
          details: {} as Property['details'],
          building: {} as Property['building'],
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
        zip: '',
        city: listing.location?.split(',')[1]?.trim() || 'Berlin',
        district: '',
        price: listing.price,
        pricePerSqm: 0,
        rooms: listing.rooms || 1,
        area: listing.area || 0,
        image: listing.image || '',
        images: listing.image ? [listing.image] : [],
        status: 'Available',
        fullAddress: listing.location || listing.title,
        description: listing.description || '',
        details: {} as Property['details'],
        building: {} as Property['building'],
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
    // Session is source of truth; we're only here when session exists (AuthGate passed).
    // Never show Login due to timeout — only Reconnecting… while worker loads.
    const protectedViews = ['account', 'dashboard', 'worker', 'tasks'];
    const isProtected = protectedViews.includes(currentView);

    if (isProtected && authLoading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-white mb-2">Reconnecting…</div>
          <div className="text-sm text-gray-400">Loading profile…</div>
        </div>
      );
    }

    // Only show profile error when definitely logged in, worker still null, and workerError set. Don't block before WorkerContext init.
    if (isProtected && session !== null && worker === null && !!workerError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen text-gray-400">
          <div className="text-white mb-2">Could not load your profile</div>
          <div className="text-sm mb-2">{workerError}</div>
          <div className="flex gap-3 mt-4">
            <button
              type="button"
              onClick={() => retryWorker()}
              className="px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-500"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => logout()}
              className="px-4 py-2 rounded bg-gray-600 text-white hover:bg-gray-500"
            >
              Logout
            </button>
          </div>
        </div>
      );
    }

    // Register: when session exists, user is logged in — show account content
    if (currentView === 'register') {
      return (
        <div className="animate-fadeIn">
          <React.Suspense fallback={<div className="flex items-center justify-center min-h-[50vh] text-gray-400">Loading…</div>}>
            <AccountDashboard />
          </React.Suspense>
        </div>
      );
    }

    // Register: when session exists, show account content
    if (currentView === 'register') {
      return (
        <div className="animate-fadeIn">
          <ErrorBoundary>
            <AccountDashboard />
          </ErrorBoundary>
        </div>
      );
    }

    // Dashboard / Account — we only reach here when session exists (AuthGate); worker handled above
    if (currentView === 'dashboard' || currentView === 'account') {
      return (
        <div className="animate-fadeIn">
          <ErrorBoundary>
            <AccountDashboard />
          </ErrorBoundary>
        </div>
      );
    }

    // Worker Mobile View
    if (currentView === 'worker') {
      if (worker?.role === 'worker') {
        return <WorkerMobileApp />;
      }
      return (
        <div className="flex items-center justify-center min-h-screen text-white">
          Redirecting to dashboard...
        </div>
      );
    }

    // Kanban Board View (Tasks)
    if (currentView === 'tasks') {
      return (
        <React.Suspense fallback={<div className="flex items-center justify-center min-h-screen text-white">Loading tasks…</div>}>
          <KanbanBoard />
        </React.Suspense>
      );
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
            error={error}
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
                onBookViewing={() => setCurrentView('booking')}
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
      <AuthGate>
        <AppContent />
      </AuthGate>
    </WorkerProvider>
  );
};

export default App;
