import React, { useState, useMemo, useEffect } from 'react';
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
  const [currentView, setCurrentView] = useState<'dashboard' | 'booking' | 'market' | 'account' | 'test-db' | 'worker' | 'admin-tasks' | 'register'>('dashboard');
  const [isPartnerModalOpen, setIsPartnerModalOpen] = useState(false);
  const [prefilledRequestData, setPrefilledRequestData] = useState<Partial<RequestData> | undefined>(undefined);
  const [filters, setFilters] = useState<FilterState>({
    city: 'Any',
    district: 'Any',
    rooms: 'Any',
    floor: 'Any',
    elevator: 'Any',
    pets: 'Any',
    status: 'Any'
  });
  const [authTimeoutReached, setAuthTimeoutReached] = useState(false);

  // Timeout for auth loading
  useEffect(() => {
    if (authLoading && !authTimeoutReached) {
      const timer = setTimeout(() => {
        setAuthTimeoutReached(true);
      }, 6000);
      return () => clearTimeout(timer);
    } else if (!authLoading) {
      setAuthTimeoutReached(false);
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
    }
  }, []);

  // Check authentication and redirect
  useEffect(() => {
    if (!authLoading) {
      if (worker) {
        console.log('✅ App: Worker loaded, checking permissions:', worker.name, worker.role);
        const path = window.location.pathname;
        if (path === '/worker' && worker.role !== 'worker') {
          console.log('⚠️ App: Redirecting worker view - wrong role');
          setCurrentView('dashboard');
          window.history.pushState({}, '', '/dashboard');
        } else if (path === '/admin/tasks' && worker.role !== 'super_manager') {
          console.log('⚠️ App: Redirecting admin-tasks view - wrong role');
          setCurrentView('dashboard');
          window.history.pushState({}, '', '/dashboard');
        } else if (path === '/account' || path === '/worker' || path === '/admin/tasks') {
          // Ensure we're on the right view after login
          if (path === '/worker') {
            setCurrentView('worker');
          } else if (path === '/admin/tasks') {
            setCurrentView('admin-tasks');
          } else {
            setCurrentView('account');
          }
        }
      } else {
        console.log('⚠️ App: No worker, showing login if needed');
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
      if (filters.city !== 'Any' && property.city !== filters.city) return false;
      if (filters.district !== 'Any' && property.district !== filters.district) return false;
      if (filters.rooms !== 'Any') {
        const minRooms = parseInt(filters.rooms.replace('+', ''));
        if (property.rooms < minRooms) return false;
      }
      if (filters.floor !== 'Any') {
        const propertyFloor = property.details?.floor || property.floor || 0;
        if (filters.floor === 'Ground' && propertyFloor !== 0) return false;
        else if (filters.floor === '4+' && propertyFloor < 4) return false;
        else if (filters.floor !== 'Ground' && filters.floor !== '4+') {
          const filterFloor = parseInt(filters.floor);
          if (propertyFloor !== filterFloor) return false;
        }
      }
      if (filters.elevator !== 'Any') {
        const hasElevator = property.building?.elevator === 'Yes' || property.building?.elevator === 'Unknown';
        if (filters.elevator === 'Yes' && !hasElevator) return false;
        else if (filters.elevator === 'No' && hasElevator && property.building?.elevator !== 'No') return false;
      }
      if (filters.pets !== 'Any') {
        const allowsPets = property.building?.pets === 'Allowed' || property.building?.pets === 'Yes';
        if (filters.pets === 'Allowed' && !allowsPets) return false;
        else if (filters.pets === 'Not Allowed' && allowsPets) return false;
      }
      if (filters.status !== 'Any' && property.status !== filters.status) return false;
      return true;
    });
  }, [filters, properties]);

  React.useEffect(() => {
    if (!selectedProperty) return;
    if (filteredProperties.length > 0 && !filteredProperties.find(p => p.id === selectedProperty.id)) {
      setSelectedProperty(filteredProperties[0]);
    } else if (filteredProperties.length === 0 && properties.length > 0) {
      setSelectedProperty(properties[0]);
    }
  }, [filteredProperties, selectedProperty?.id, properties]);

  // Listen for openRequestForm event
  useEffect(() => {
    const handleOpenRequestForm = (event: CustomEvent) => {
      const { propertyId } = event.detail;
      if (propertyId) {
        const property = properties.find(p => p.id === propertyId);
        if (property) {
          setSelectedProperty(property);
          setPrefilledRequestData(undefined);
          setCurrentView('booking');
        }
      } else {
        setCurrentView('booking');
      }
    };
    window.addEventListener('openRequestForm', handleOpenRequestForm as EventListener);
    return () => {
      window.removeEventListener('openRequestForm', handleOpenRequestForm as EventListener);
    };
  }, [properties]);

  const renderContent = () => {
    // Register page is public
    if (currentView === 'register') {
      return <RegisterPage />;
    }

    const protectedViews = ['account', 'worker', 'admin-tasks'];
    
    if (protectedViews.includes(currentView)) {
      if (authLoading && !authTimeoutReached) {
        return (
          <div className="flex items-center justify-center h-screen">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-400">Loading...</p>
            </div>
          </div>
        );
      }
      
      if (authTimeoutReached || (authLoading && authTimeoutReached)) {
        return <LoginPage onLoginSuccess={() => {
          console.log('✅ Login success callback called (timeout)');
          setAuthTimeoutReached(false);
          // The worker will be loaded by WorkerContext, 
          // useEffect will handle the view change when worker is available
          const path = window.location.pathname;
          if (path === '/worker') {
            setCurrentView('worker');
          } else if (path === '/admin/tasks') {
            setCurrentView('admin-tasks');
          } else {
            setCurrentView('account');
          }
        }} />;
      }
      
      if (!worker) {
        return <LoginPage onLoginSuccess={() => {
          console.log('✅ Login success callback called');
          // The worker will be loaded by WorkerContext, 
          // useEffect will handle the view change when worker is available
          const path = window.location.pathname;
          if (path === '/worker') {
            setCurrentView('worker');
          } else if (path === '/admin/tasks') {
            setCurrentView('admin-tasks');
          } else {
            setCurrentView('account');
          }
        }} />;
      }
      
      if (worker) {
        if (currentView === 'worker' && worker.role !== 'worker') {
          setCurrentView('dashboard');
          return null;
        }
        if (currentView === 'admin-tasks' && worker.role !== 'super_manager') {
          setCurrentView('dashboard');
          return null;
        }
      }
    }

    switch (currentView) {
      case 'worker':
        return <WorkerMobileApp />;
      case 'admin-tasks':
        return <AdminTasksBoard />;
      case 'test-db':
        return <TestDB />;
      case 'account':
        return <AccountDashboard />;
      case 'market':
        return <Marketplace onListingClick={handleMarketListingClick} properties={properties} />;
      case 'booking':
        return (
          <div className="flex flex-1 overflow-hidden">
            <div className="hidden lg:block w-1/2 overflow-y-auto border-r border-gray-800 bg-[#0D0F11] p-8">
              {selectedProperty && (
                <PropertyDetails 
                  property={selectedProperty} 
                  hideActions={true} 
                />
              )}
            </div>
            <div className="w-full lg:w-1/2 overflow-y-auto bg-[#111315]">
              <BookingForm 
                prefilledData={prefilledRequestData}
                propertyId={selectedProperty?.id || ''}
                onAddRequest={(request) => {
                  const existingRequests = JSON.parse(localStorage.getItem('requests') || '[]');
                  existingRequests.push(request);
                  localStorage.setItem('requests', JSON.stringify(existingRequests));
                  window.dispatchEvent(new CustomEvent('requestAdded', { detail: request }));
                  alert('Request sent successfully! Our team will contact you soon.');
                  setCurrentView('dashboard');
                  setPrefilledRequestData(undefined);
                }}
              />
            </div>
          </div>
        );
      case 'dashboard':
      default:
        return (
          <>
            <FilterBar filters={filters} onFilterChange={setFilters} />
            <div className="flex flex-1 overflow-hidden">
              <div className="w-full lg:w-[420px] flex-shrink-0 border-r border-gray-800 overflow-y-auto p-4 space-y-4 bg-[#111315]">
                {loading ? (
                  <div className="text-center text-gray-400 py-8">
                    <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    <p>Loading...</p>
                  </div>
                ) : filteredProperties.length > 0 ? (
                  filteredProperties.map((property) => (
                    <PropertyCard 
                      key={property.id} 
                      property={property} 
                      isSelected={selectedProperty?.id === property.id}
                      onClick={() => setSelectedProperty(property)}
                    />
                  ))
                ) : (
                  <div className="text-center text-gray-400 py-8">
                    <p>No properties match the selected filters</p>
                    <button 
                      onClick={() => setFilters({
                        city: 'Any',
                        district: 'Any',
                        rooms: 'Any',
                        floor: 'Any',
                        elevator: 'Any',
                        pets: 'Any',
                        status: 'Any'
                      })}
                      className="mt-4 text-emerald-500 hover:text-emerald-400"
                    >
                      Reset filters
                    </button>
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto bg-[#0D0F11] p-6 lg:p-8">
                {loading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                      <p className="text-gray-400">Loading properties...</p>
                    </div>
                  </div>
                ) : selectedProperty ? (
                  <PropertyDetails 
                    property={selectedProperty} 
                    onBookViewing={() => setCurrentView('booking')}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-gray-400">No property selected</p>
                  </div>
                )}
              </div>
            </div>
          </>
        );
    }
  };
  
  return (
    <div className="flex flex-col h-screen bg-[#111315] overflow-hidden font-sans text-white">
      <Navbar 
        showBackButton={currentView === 'booking' || currentView === 'account' || currentView === 'test-db'} 
        onBack={() => setCurrentView('dashboard')}
        onBecomePartner={() => setIsPartnerModalOpen(true)}
        onNavigate={(view) => setCurrentView(view)}
        currentView={currentView}
      />

      <PartnerModal 
        isOpen={isPartnerModalOpen}
        onClose={() => setIsPartnerModalOpen(false)}
      />
      
      {renderContent()}
    </div>
  );
};

// Main App component with WorkerProvider
const App: React.FC = () => {
  return (
    <WorkerProvider>
      <AppContent />
    </WorkerProvider>
  );
};

export default App;
