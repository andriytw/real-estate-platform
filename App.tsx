
import React, { useState } from 'react';
import Navbar from './components/Navbar';
import FilterBar from './components/FilterBar';
import PropertyCard from './components/PropertyCard';
import PropertyDetails from './components/PropertyDetails';
import BookingForm from './components/BookingForm';
import PartnerModal from './components/PartnerModal';
import Marketplace from './components/Marketplace';
import AccountDashboard from './components/AccountDashboard';
import { MOCK_PROPERTIES } from './constants';
import { Property } from './types';

const App: React.FC = () => {
  const [selectedProperty, setSelectedProperty] = useState<Property>(MOCK_PROPERTIES[0]);
  const [currentView, setCurrentView] = useState<'dashboard' | 'booking' | 'market' | 'account'>('dashboard');
  const [isPartnerModalOpen, setIsPartnerModalOpen] = useState(false);
  
  const handleMarketListingClick = (listing: any) => {
    // Convert Market Listing to Property Interface
    const mappedProperty: Property = {
      id: listing.id,
      title: listing.title,
      address: listing.location, // Map location to address
      zip: '', 
      city: listing.location.split(',')[1]?.trim() || 'Berlin',
      district: listing.location.split(',')[0]?.trim() || 'City Center',
      price: listing.price,
      pricePerSqm: listing.area > 0 ? Math.round(listing.price / listing.area) : 0,
      rooms: listing.rooms,
      area: listing.area,
      image: listing.image,
      images: [listing.image, listing.image], // Fallback gallery
      status: 'Available',
      
      // Required complex fields
      details: {
        area: `${listing.area} m²`,
        rooms: listing.rooms,
        floor: 1,
        year: 2000, // Placeholder
        beds: listing.rooms, // Estimate
        baths: 1,
        balconies: 0,
        buildingFloors: 4
      },
      building: {
        type: 'Market Ad',
        repairYear: 2020,
        heating: 'Central',
        energyClass: 'C',
        parking: 'Street',
        pets: 'Unknown',
        elevator: 'Unknown',
        kitchen: 'Yes',
        access: 'Unknown',
        certificate: 'N/A',
        energyDemand: 'N/A'
      },
      inventory: [],

      // Backward compatibility fields
      floor: 1,
      totalFloors: 4,
      bathrooms: 1,
      balcony: false,
      builtYear: 2000, // Placeholder
      netRent: listing.price,
      ancillaryCosts: 0,
      heatingCosts: 0,
      heatingIncluded: true,
      deposit: '2 months',
      buildingType: 'Market Ad',
      heatingType: 'Central',
      energyCertificate: 'N/A',
      endEnergyDemand: 'N/A',
      energyEfficiencyClass: 'C',
      parking: 'Street',
      description: listing.description + `\n\n--\nPosted by: ${listing.postedBy}\nContact: ${listing.contactEmail} | ${listing.contactPhone}`
    };

    setSelectedProperty(mappedProperty);
    setCurrentView('dashboard');
  };

  const renderContent = () => {
    switch (currentView) {
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
              <BookingForm />
            </div>
          </div>
        );
      case 'dashboard':
      default:
        return (
          <>
            <FilterBar />
            <div className="flex flex-1 overflow-hidden">
              {/* Left Sidebar - Property List */}
              <div className="w-full lg:w-[420px] flex-shrink-0 border-r border-gray-800 overflow-y-auto p-4 space-y-4 bg-[#111315]">
                 {MOCK_PROPERTIES.map((property) => (
                   <PropertyCard 
                     key={property.id} 
                     property={property} 
                     isSelected={selectedProperty.id === property.id}
                     onClick={() => setSelectedProperty(property)}
                   />
                 ))}
              </div>
              {/* Right Main Content - Property Details */}
              <div className="flex-1 overflow-y-auto bg-[#0D0F11] p-6 lg:p-8">
                <PropertyDetails 
                  property={selectedProperty} 
                  onBookViewing={() => setCurrentView('booking')}
                />
              </div>
            </div>
          </>
        );
    }
  };
  
  return (
    <div className="flex flex-col h-screen bg-[#111315] overflow-hidden font-sans text-white">
      <Navbar 
        showBackButton={currentView === 'booking' || currentView === 'account'} 
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