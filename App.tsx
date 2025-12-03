
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
import { MOCK_PROPERTIES } from './constants';
import { propertiesService } from './services/supabaseService';
import { Property, FilterState, RequestData } from './types';

const App: React.FC = () => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [currentView, setCurrentView] = useState<'dashboard' | 'booking' | 'market' | 'account' | 'test-db'>('dashboard');
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

  // Load properties from Supabase
  useEffect(() => {
    const loadProperties = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await propertiesService.getAll();
        setProperties(data);
        
        // Set default selected property
        if (data.length > 0 && !selectedProperty) {
          setSelectedProperty(data[0]);
        } else if (data.length === 0) {
          // Fallback to mock data if Supabase is empty
          setProperties(MOCK_PROPERTIES);
          setSelectedProperty(MOCK_PROPERTIES[0]);
        }
      } catch (err: any) {
        console.error('Error loading properties:', err);
        setError(err.message || 'Failed to load properties');
        // Fallback to mock data on error
        setProperties(MOCK_PROPERTIES);
        if (MOCK_PROPERTIES.length > 0) {
          setSelectedProperty(MOCK_PROPERTIES[0]);
        }
      } finally {
        setLoading(false);
      }
    };

    loadProperties();
  }, []);

  // Update selected property when properties change
  useEffect(() => {
    if (properties.length > 0 && !selectedProperty) {
      setSelectedProperty(properties[0]);
    }
  }, [properties, selectedProperty]);
  
  const handleMarketListingClick = (listing: any) => {
    // Parse location to extract city and district
    const locationParts = listing.location?.split(',').map((p: string) => p.trim()) || [];
    const city = locationParts[locationParts.length - 1] || 'Unknown';
    const district = locationParts.length > 1 ? locationParts[0] : 'City Center';
    
    // Estimate reasonable values based on area and rooms
    const estimatedBaths = listing.rooms >= 3 ? 2 : 1;
    const estimatedFloor = Math.floor(Math.random() * 5) + 1; // Random floor 1-5
    const estimatedBuildingFloors = Math.max(estimatedFloor + 2, 4); // At least 2 floors above
    
    // Convert Market Listing to Property Interface
    const mappedProperty: Property = {
      id: `market-${listing.id}`,
      title: listing.title,
      address: listing.location || 'Address not specified',
      zip: '', 
      city: city,
      district: district,
      price: listing.price || 0,
      pricePerSqm: listing.area > 0 ? Math.round(listing.price / listing.area) : 0,
      rooms: listing.rooms || 1,
      area: listing.area || 0,
      image: listing.image || '',
      images: listing.image ? [listing.image] : [],
      status: 'Available',
      
      // Required complex fields with better estimates
      details: {
        area: `${listing.area || 0} m²`,
        rooms: listing.rooms || 1,
        floor: estimatedFloor,
        year: new Date().getFullYear() - Math.floor(Math.random() * 30), // Random year within last 30 years
        beds: listing.rooms || 1,
        baths: estimatedBaths,
        balconies: listing.area > 50 ? 1 : 0, // Estimate balcony for larger apartments
        buildingFloors: estimatedBuildingFloors
      },
      building: {
        type: 'Market Listing',
        repairYear: new Date().getFullYear() - Math.floor(Math.random() * 10), // Recent repair
        heating: 'Central',
        energyClass: 'C',
        parking: 'Street',
        pets: 'Unknown',
        elevator: estimatedBuildingFloors >= 4 ? 'Yes' : 'Unknown',
        kitchen: 'Yes',
        access: 'Unknown',
        certificate: 'N/A',
        energyDemand: 'N/A'
      },
      inventory: [],

      // Backward compatibility fields
      floor: estimatedFloor,
      totalFloors: estimatedBuildingFloors,
      bathrooms: estimatedBaths,
      balcony: listing.area > 50,
      builtYear: new Date().getFullYear() - Math.floor(Math.random() * 30),
      netRent: listing.price || 0,
      ancillaryCosts: 0,
      heatingCosts: 0,
      heatingIncluded: true,
      deposit: '2 months',
      buildingType: 'Market Listing',
      heatingType: 'Central',
      energyCertificate: 'N/A',
      endEnergyDemand: 'N/A',
      energyEfficiencyClass: 'C',
      parking: 'Street',
      description: listing.description 
        ? `${listing.description}\n\n--\nPosted by: ${listing.postedBy || 'Community member'}\nContact: ${listing.contactEmail || 'N/A'} | ${listing.contactPhone || 'N/A'}`
        : 'No description available'
    };

    setSelectedProperty(mappedProperty);
    setCurrentView('dashboard');
  };

  // Filter properties based on filter state
  const filteredProperties = useMemo(() => {
    const propsToFilter = properties.length > 0 ? properties : MOCK_PROPERTIES;
    return propsToFilter.filter(property => {
      // City filter
      if (filters.city !== 'Any' && property.city !== filters.city) {
        return false;
      }

      // District filter
      if (filters.district !== 'Any' && property.district !== filters.district) {
        return false;
      }

      // Rooms filter (min rooms)
      if (filters.rooms !== 'Any') {
        const minRooms = parseInt(filters.rooms.replace('+', ''));
        if (property.rooms < minRooms) {
          return false;
        }
      }

      // Floor filter
      if (filters.floor !== 'Any') {
        const propertyFloor = property.details?.floor || property.floor || 0;
        if (filters.floor === 'Ground' && propertyFloor !== 0) {
          return false;
        } else if (filters.floor === '4+' && propertyFloor < 4) {
          return false;
        } else if (filters.floor !== 'Ground' && filters.floor !== '4+') {
          const filterFloor = parseInt(filters.floor);
          if (propertyFloor !== filterFloor) {
            return false;
          }
        }
      }

      // Elevator filter
      if (filters.elevator !== 'Any') {
        const hasElevator = property.building?.elevator === 'Yes' || property.building?.elevator === 'Unknown';
        if (filters.elevator === 'Yes' && !hasElevator) {
          return false;
        } else if (filters.elevator === 'No' && hasElevator && property.building?.elevator !== 'No') {
          return false;
        }
      }

      // Pets filter
      if (filters.pets !== 'Any') {
        const allowsPets = property.building?.pets === 'Allowed' || property.building?.pets === 'Yes';
        if (filters.pets === 'Allowed' && !allowsPets) {
          return false;
        } else if (filters.pets === 'Not Allowed' && allowsPets) {
          return false;
        }
      }

      // Status filter
      if (filters.status !== 'Any' && property.status !== filters.status) {
        return false;
      }

      return true;
    });
  }, [filters]);

  // Update selected property when filters change if current selection is filtered out
  React.useEffect(() => {
    if (!selectedProperty) return;
    if (filteredProperties.length > 0 && !filteredProperties.find(p => p.id === selectedProperty.id)) {
      setSelectedProperty(filteredProperties[0]);
    } else if (filteredProperties.length === 0) {
      const allProperties = properties.length > 0 ? properties : MOCK_PROPERTIES;
      if (allProperties.length > 0) {
        setSelectedProperty(allProperties[0]);
      }
    }
  }, [filteredProperties, selectedProperty?.id, properties]);

  const renderContent = () => {
    switch (currentView) {
      case 'test-db':
        return <TestDB />;
      case 'account':
        return <AccountDashboard />;
      case 'market':
        return <Marketplace onListingClick={handleMarketListingClick} />;
      case 'booking':
        return (
          <div className="flex flex-1 overflow-hidden">
            {/* Left Column - Property Context (Reusing Details without actions) */}
            <div className="hidden lg:block w-1/2 overflow-y-auto border-r border-gray-800 bg-[#0D0F11] p-8">
              <PropertyDetails 
                property={selectedProperty} 
                hideActions={true} 
              />
            </div>
            {/* Right Column - Booking Form */}
            <div className="w-full lg:w-1/2 overflow-y-auto bg-[#111315]">
              <BookingForm 
                prefilledData={prefilledRequestData}
                propertyId={selectedProperty?.id || ''}
                onAddRequest={(request) => {
                  // Зберегти request в localStorage для синхронізації з AccountDashboard
                  const existingRequests = JSON.parse(localStorage.getItem('requests') || '[]');
                  existingRequests.push(request);
                  localStorage.setItem('requests', JSON.stringify(existingRequests));
                  // Відправити event для оновлення AccountDashboard
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
              {/* Left Sidebar - Property List */}
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
              {/* Right Main Content - Property Details */}
              <div className="flex-1 overflow-y-auto bg-[#0D0F11] p-6 lg:p-8">
                {loading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                      <p className="text-gray-400">Loading properties...</p>
                    </div>
                  </div>
                ) : error ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <p className="text-red-400 mb-2">Error: {error}</p>
                      <p className="text-gray-400 text-sm">Using mock data as fallback</p>
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

export default App;