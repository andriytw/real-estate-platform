
import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Camera, AreaChart, Box, PenTool, Save, Edit } from 'lucide-react';
import { Property, InventoryItem, MeterReading } from '../types';

interface PropertyAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (property: Property) => void;
  propertyToEdit?: Property;
}

const METER_TYPES = [
  { value: 'Electricity', label: 'Electricity' },
  { value: 'Water', label: 'Water' },
  { value: 'Gas', label: 'Gas' },
  { value: 'Heating', label: 'Heating' }
];

// Get unit of measurement for meter type
const getMeterUnit = (type: string): string => {
  const nameLower = type.toLowerCase();
  if (nameLower === 'electricity' || nameLower.includes('electric') || nameLower.includes('електро') || nameLower.includes('strom')) {
    return 'kWh';
  } else if (nameLower === 'gas' || nameLower.includes('газ')) {
    return 'm³';
  } else if (nameLower === 'water' || nameLower.includes('вода') || nameLower.includes('wasser')) {
    return 'm³';
  } else if (nameLower === 'heating' || nameLower.includes('heizung') || nameLower.includes('опалення')) {
    return 'kJ';
  }
  return '';
};

const PropertyAddModal: React.FC<PropertyAddModalProps> = ({ isOpen, onClose, onSave, propertyToEdit }) => {
  // Form State
  const [formData, setFormData] = useState<Partial<Property>>({
    title: '',
    address: '',
    city: '',
    zip: '',
    country: 'Ukraine',
    description: '',
    term: '',
    termStatus: 'green',
    details: {
      area: '',
      rooms: 0,
      floor: 0,
      year: 0,
      beds: 0,
      baths: 0,
      balconies: 0,
      buildingFloors: 0
    },
    building: {
      type: 'Multi-family (MFH)',
      repairYear: 0,
      heating: 'Gas',
      energyClass: 'C',
      parking: 'Open Space',
      pets: 'Allowed',
      elevator: 'No',
      kitchen: 'Yes',
      access: 'No',
      certificate: 'Consumption-based',
      energyDemand: '120',
      centralHeating: 'No'
    },
    ownerExpense: {
      mortgage: 0,
      management: 0,
      taxIns: 0,
      reserve: 0
    },
    inventory: [],
    meterReadings: []
  });

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Inventory State
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  
  // Meter Readings State
  const [meters, setMeters] = useState<MeterReading[]>([]);

  const handleBasicChange = (field: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleDetailChange = (field: string, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      details: { ...prev.details!, [field]: value }
    }));
  };

  const handleBuildingChange = (field: string, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      building: { ...prev.building!, [field]: value }
    }));
  };

  const handleExpenseChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      ownerExpense: { ...prev.ownerExpense!, [field]: parseFloat(value) || 0 }
    }));
  };

  // Inventory Handlers
  const addInventoryItem = () => {
    setInventory([...inventory, { type: '', invNumber: '', quantity: 1, cost: 0 }]);
  };

  const updateInventory = (index: number, field: keyof InventoryItem, value: string | number) => {
    const newInv = [...inventory];
    newInv[index] = { ...newInv[index], [field]: value };
    setInventory(newInv);
  };

  const removeInventory = (index: number) => {
    setInventory(inventory.filter((_, i) => i !== index));
  };

  // Meter Handlers
  const addMeter = () => {
    setMeters([...meters, { name: '', number: '', initial: '', current: '', price: 0 }]);
  };

  const updateMeter = (index: number, field: keyof MeterReading, value: string | number) => {
    const newMeters = [...meters];
    newMeters[index] = { ...newMeters[index], [field]: value };
    setMeters(newMeters);
  };

  const removeMeter = (index: number) => {
    setMeters(meters.filter((_, i) => i !== index));
  };

  // Заповнити форму даними об'єкта при редагуванні
  useEffect(() => {
    if (propertyToEdit && isOpen) {
      console.log('📝 Loading property data for editing:', propertyToEdit);
      
      // Заповнити форму даними об'єкта
      setFormData({
        title: propertyToEdit.title || '',
        address: propertyToEdit.address || '',
        city: propertyToEdit.city || '',
        zip: propertyToEdit.zip || '',
        country: propertyToEdit.country || 'Ukraine',
        description: propertyToEdit.description || '',
        term: propertyToEdit.term || '',
        termStatus: propertyToEdit.termStatus || 'green',
        details: propertyToEdit.details ? {
          // Обрізати "м²" з area, якщо воно є
          area: String(propertyToEdit.details.area || '').replace(/\s*м²\s*/gi, '').trim(),
          rooms: propertyToEdit.details.rooms || 0,
          floor: propertyToEdit.details.floor || 0,
          year: propertyToEdit.details.year || 0,
          beds: propertyToEdit.details.beds || 0,
          baths: propertyToEdit.details.baths || 0,
          balconies: propertyToEdit.details.balconies || 0,
          buildingFloors: propertyToEdit.details.buildingFloors || 0
        } : {
          area: '',
          rooms: 0,
          floor: 0,
          year: 0,
          beds: 0,
          baths: 0,
          balconies: 0,
          buildingFloors: 0
        },
        building: propertyToEdit.building || {
          type: 'Multi-family (MFH)',
          repairYear: 0,
          heating: 'Gas',
          energyClass: 'C',
          parking: 'Open Space',
          pets: 'Allowed',
          elevator: 'No',
          kitchen: 'Yes',
          access: 'No',
          certificate: 'Consumption-based',
          energyDemand: '120',
          centralHeating: 'No'
        },
        ownerExpense: propertyToEdit.ownerExpense || {
          mortgage: 0,
          management: 0,
          taxIns: 0,
          reserve: 0
        }
      });

      // Заповнити дати з терміну оренди
      if (propertyToEdit.term) {
        const termParts = propertyToEdit.term.split(' - ');
        if (termParts.length === 2) {
          const startDateStr = termParts[0].trim();
          const endDateStr = termParts[1].trim();
          
          // Конвертувати DD.MM.YYYY в YYYY-MM-DD
          if (startDateStr !== 'N/A' && startDateStr.includes('.')) {
            const [day, month, year] = startDateStr.split('.');
            if (day && month && year) {
              setStartDate(`${year.trim()}-${month.trim().padStart(2, '0')}-${day.trim().padStart(2, '0')}`);
            }
          }
          
          if (endDateStr !== 'Indefinite' && endDateStr.includes('.')) {
            const [day, month, year] = endDateStr.split('.');
            if (day && month && year) {
              setEndDate(`${year.trim()}-${month.trim().padStart(2, '0')}-${day.trim().padStart(2, '0')}`);
            }
          }
        }
      }

      // Заповнити inventory
      setInventory(propertyToEdit.inventory || []);

      // Заповнити meterReadings
      setMeters(propertyToEdit.meterReadings || []);
    } else if (!propertyToEdit && isOpen) {
      // Скинути форму при створенні нового об'єкта
      setFormData({
        title: '',
        address: '',
        city: '',
        zip: '',
        country: 'Ukraine',
        description: '',
        term: '',
        termStatus: 'green',
        details: {
          area: '',
          rooms: 0,
          floor: 0,
          year: 0,
          beds: 0,
          baths: 0,
          balconies: 0,
          buildingFloors: 0
        },
        building: {
          type: 'Multi-family (MFH)',
          repairYear: 0,
          heating: 'Gas',
          energyClass: 'C',
          parking: 'Open Space',
          pets: 'Allowed',
          elevator: 'No',
          kitchen: 'Yes',
          access: 'No',
          certificate: 'Consumption-based',
          energyDemand: '120',
          centralHeating: 'No'
        },
        ownerExpense: {
          mortgage: 0,
          management: 0,
          taxIns: 0,
          reserve: 0
        }
      });
      setStartDate('');
      setEndDate('');
      setInventory([]);
      setMeters([]);
    }
  }, [propertyToEdit, isOpen]);

  const handleSave = () => {
    // Format Term with German locale options for DD.MM.YYYY format
    const dateOptions: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
    const formattedStart = startDate ? new Date(startDate).toLocaleDateString('de-DE', dateOptions) : 'N/A';
    const formattedEnd = endDate ? new Date(endDate).toLocaleDateString('de-DE', dateOptions) : 'Indefinite';
    const termString = `${formattedStart} - ${formattedEnd}`;

    const newProperty: Property = {
      id: propertyToEdit?.id || Date.now().toString(), // Використовувати існуючий id при редагуванні
      title: formData.title || 'New Property',
      address: formData.address || '',
      city: formData.city || '',
      zip: formData.zip || '',
      district: '', // Default empty
      country: formData.country || 'Ukraine',
      fullAddress: `${formData.address}, ${formData.zip} ${formData.city}, ${formData.country}`,
      description: formData.description || '',
      
      price: 0, // Not set in this modal
      pricePerSqm: 0,
      rooms: formData.details?.rooms || 0,
      area: parseFloat(formData.details?.area || '0'),
      
      image: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?q=80&w=2070&auto=format&fit=crop', // Placeholder
      images: [],
      status: 'Available',
      
      term: termString,
      termStatus: 'green',
      balance: 0,
      
      details: formData.details!,
      building: formData.building!,
      ownerExpense: formData.ownerExpense,
      
      inventory: inventory,
      meterReadings: meters,
      
      // Зберегти meterLog при редагуванні (якщо він вже існує)
      meterLog: propertyToEdit?.meterLog,
      
      // Initialize empty arrays for optional fields to prevent errors
      futurePayments: propertyToEdit?.futurePayments || [],
      repairRequests: propertyToEdit?.repairRequests || [],
      events: propertyToEdit?.events || []
    };
    
    onSave(newProperty);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      <div className="bg-[#0D1117] w-full max-w-6xl max-h-[95vh] overflow-y-auto rounded-xl border border-gray-700 shadow-2xl flex flex-col animate-in zoom-in duration-200">
        
        {/* Header */}
        <div className="p-5 border-b border-gray-800 bg-[#161B22] flex justify-between items-center sticky top-0 z-20">
          <h3 className="text-xl font-bold text-white">{propertyToEdit ? 'Редагувати Об\'єкт' : 'Додати Новий Об\'єкт'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white bg-gray-800 p-2 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 space-y-8 bg-[#0D1117]">
          
          {/* 1. Basic Data (Tile Split) */}
          <div>
             <h2 className="text-xl font-bold text-white mb-4">1. Основні Дані Об'єкта</h2>
             
             {/* Tile 1: Info */}
             <div className="bg-[#1C1F24] p-6 rounded-xl border border-gray-800 shadow-sm mb-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                   {/* Term */}
                   <div className="border-r border-gray-700 pr-4">
                      <label className="text-xs text-gray-500 font-medium block mb-2">Термін Оренди (Mietdauer)</label>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                           <span className="text-[10px] text-gray-400 block mb-1">Від (Start)</span>
                           <input 
                             type="date" 
                             className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                             value={startDate}
                             onChange={(e) => setStartDate(e.target.value)}
                           />
                        </div>
                        <div>
                           <span className="text-[10px] text-gray-400 block mb-1">До (End)</span>
                           <input 
                             type="date" 
                             className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                             value={endDate}
                             onChange={(e) => setEndDate(e.target.value)}
                           />
                        </div>
                      </div>
                      <p className="text-[10px] text-gray-600 mt-1">* Незаповнена дата закінчення означає безстроковий контракт.</p>
                   </div>

                   {/* Name/Desc */}
                   <div className="border-r border-gray-700 pr-4">
                      <label className="text-xs text-gray-500 font-medium block mb-2">Назва та Опис</label>
                      <input 
                        className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm font-bold text-white mb-2 focus:outline-none focus:border-emerald-500"
                        placeholder="Назва (напр. Квартира 1, Львів)"
                        value={formData.title}
                        onChange={(e) => handleBasicChange('title', e.target.value)}
                      />
                      <textarea 
                        className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-xs text-gray-400 resize-none focus:outline-none focus:border-emerald-500"
                        rows={3}
                        placeholder="Короткий опис..."
                        value={formData.description}
                        onChange={(e) => handleBasicChange('description', e.target.value)}
                      />
                   </div>

                   {/* Address */}
                   <div>
                      <label className="text-xs text-gray-500 font-medium block mb-2">Адреса (Address)</label>
                      <div className="grid grid-cols-2 gap-3">
                         <div>
                            <span className="text-[10px] text-gray-500 block mb-0.5">Країна</span>
                            <input 
                              className="bg-[#111315] border border-gray-700 rounded p-2 text-sm font-bold text-white w-full focus:border-emerald-500 outline-none" 
                              placeholder="Україна"
                              value={formData.country}
                              onChange={(e) => handleBasicChange('country', e.target.value)}
                            />
                         </div>
                         <div>
                            <span className="text-[10px] text-gray-500 block mb-0.5">Місто</span>
                            <input 
                              className="bg-[#111315] border border-gray-700 rounded p-2 text-sm font-bold text-white w-full focus:border-emerald-500 outline-none" 
                              placeholder="Львів"
                              value={formData.city}
                              onChange={(e) => handleBasicChange('city', e.target.value)}
                            />
                         </div>
                         <div>
                            <span className="text-[10px] text-gray-500 block mb-0.5">Поштовий Код</span>
                            <input 
                              className="bg-[#111315] border border-gray-700 rounded p-2 text-sm text-gray-300 w-full focus:border-emerald-500 outline-none" 
                              placeholder="79000"
                              value={formData.zip}
                              onChange={(e) => handleBasicChange('zip', e.target.value)}
                            />
                         </div>
                         <div>
                            <span className="text-[10px] text-gray-500 block mb-0.5">Вулиця</span>
                            <input 
                              className="bg-[#111315] border border-gray-700 rounded p-2 text-sm text-gray-300 w-full focus:border-emerald-500 outline-none" 
                              placeholder="Вулиця, Номер"
                              value={formData.address}
                              onChange={(e) => handleBasicChange('address', e.target.value)}
                            />
                         </div>
                      </div>
                   </div>
                </div>
             </div>

             {/* Tile 2: Characteristics (All 17 fields) */}
             <div className="bg-[#1C1F24] p-6 rounded-xl border border-gray-800 shadow-sm">
                <h3 className="text-lg font-bold text-white mb-6">Деталі Об'єкта та Характеристики</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-y-6 gap-x-4">
                   <div>
                      <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wide">Площа (м²)</label>
                      <input type="text" className="w-full bg-[#111315] border border-gray-700 rounded p-1.5 text-sm text-white font-bold" value={formData.details?.area} onChange={e => handleDetailChange('area', e.target.value)} />
                   </div>
                   <div>
                      <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wide">Кімнати / Ліжка</label>
                      <div className="flex gap-2">
                        <input type="number" placeholder="R" className="w-full bg-[#111315] border border-gray-700 rounded p-1.5 text-sm text-white font-bold" value={formData.details?.rooms} onChange={e => handleDetailChange('rooms', parseInt(e.target.value))} />
                        <input type="number" placeholder="B" className="w-full bg-[#111315] border border-gray-700 rounded p-1.5 text-sm text-white font-bold" value={formData.details?.beds} onChange={e => handleDetailChange('beds', parseInt(e.target.value))} />
                      </div>
                   </div>
                   <div>
                      <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wide">Поверх (Cur/Tot)</label>
                      <div className="flex gap-2">
                        <input type="number" className="w-full bg-[#111315] border border-gray-700 rounded p-1.5 text-sm text-white font-bold" value={formData.details?.floor} onChange={e => handleDetailChange('floor', parseInt(e.target.value))} />
                        <input type="number" className="w-full bg-[#111315] border border-gray-700 rounded p-1.5 text-sm text-white font-bold" value={formData.details?.buildingFloors} onChange={e => handleDetailChange('buildingFloors', parseInt(e.target.value))} />
                      </div>
                   </div>
                   <div>
                      <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wide">Ванні / Балкони</label>
                      <div className="flex gap-2">
                        <input type="number" className="w-full bg-[#111315] border border-gray-700 rounded p-1.5 text-sm text-white font-bold" value={formData.details?.baths} onChange={e => handleDetailChange('baths', parseInt(e.target.value))} />
                        <input type="number" className="w-full bg-[#111315] border border-gray-700 rounded p-1.5 text-sm text-white font-bold" value={formData.details?.balconies} onChange={e => handleDetailChange('balconies', parseInt(e.target.value))} />
                      </div>
                   </div>
                   <div>
                      <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wide">Тип будівлі</label>
                      <select className="w-full bg-[#111315] border border-gray-700 rounded p-1.5 text-sm text-white font-bold" value={formData.building?.type} onChange={e => handleBuildingChange('type', e.target.value)}>
                         <option>Multi-family (MFH)</option>
                         <option>Single Family (EFH)</option>
                         <option>Commercial</option>
                         <option>Old Town</option>
                      </select>
                   </div>
                   <div>
                      <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wide">Рік побудови</label>
                      <input type="number" className="w-full bg-[#111315] border border-gray-700 rounded p-1.5 text-sm text-white font-bold" value={formData.details?.year} onChange={e => handleDetailChange('year', parseInt(e.target.value))} />
                   </div>
                   
                   {/* Row 2 */}
                   <div>
                      <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wide">Рік ремонту</label>
                      <input type="number" className="w-full bg-[#111315] border border-gray-700 rounded p-1.5 text-sm text-white font-bold" value={formData.building?.repairYear} onChange={e => handleBuildingChange('repairYear', parseInt(e.target.value))} />
                   </div>
                   <div>
                      <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wide">Тип опалення</label>
                      <input className="w-full bg-[#111315] border border-gray-700 rounded p-1.5 text-sm text-white font-bold" value={formData.building?.heating} onChange={e => handleBuildingChange('heating', e.target.value)} />
                   </div>
                   <div>
                      <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wide">Паркування</label>
                      <select className="w-full bg-[#111315] border border-gray-700 rounded p-1.5 text-sm text-white font-bold" value={formData.building?.parking} onChange={e => handleBuildingChange('parking', e.target.value)}>
                         <option>Open Space</option>
                         <option>Garage</option>
                         <option>Carport</option>
                         <option>Street</option>
                         <option>None</option>
                      </select>
                   </div>
                   <div>
                      <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wide">Цeнтр. опалення</label>
                      <select className="w-full bg-[#111315] border border-gray-700 rounded p-1.5 text-sm text-white font-bold" value={formData.building?.centralHeating || 'No'} onChange={e => handleBuildingChange('centralHeating', e.target.value)}>
                         <option>Yes</option>
                         <option>No</option>
                      </select>
                   </div>
                   <div>
                      <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wide">Ліфт</label>
                      <select className="w-full bg-[#111315] border border-gray-700 rounded p-1.5 text-sm text-white font-bold" value={formData.building?.elevator} onChange={e => handleBuildingChange('elevator', e.target.value)}>
                         <option>Yes</option>
                         <option>No</option>
                      </select>
                   </div>
                   <div>
                      <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wide">Дозволено тварин</label>
                      <select className="w-full bg-[#111315] border border-gray-700 rounded p-1.5 text-sm text-white font-bold" value={formData.building?.pets} onChange={e => handleBuildingChange('pets', e.target.value)}>
                         <option>Allowed</option>
                         <option>Not Allowed</option>
                         <option>By Request</option>
                      </select>
                   </div>

                   {/* Row 3 */}
                   <div>
                      <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wide">Доступ інвалідів</label>
                      <select className="w-full bg-[#111315] border border-gray-700 rounded p-1.5 text-sm text-white font-bold" value={formData.building?.access} onChange={e => handleBuildingChange('access', e.target.value)}>
                         <option>Yes</option>
                         <option>No</option>
                      </select>
                   </div>
                   <div>
                      <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wide">Вбудована кухня</label>
                      <select className="w-full bg-[#111315] border border-gray-700 rounded p-1.5 text-sm text-white font-bold" value={formData.building?.kitchen} onChange={e => handleBuildingChange('kitchen', e.target.value)}>
                         <option>Yes</option>
                         <option>No</option>
                      </select>
                   </div>
                   <div className="col-span-2">
                      <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wide">Енергосертифікат</label>
                      <select className="w-full bg-[#111315] border border-gray-700 rounded p-1.5 text-sm text-white font-bold" value={formData.building?.certificate} onChange={e => handleBuildingChange('certificate', e.target.value)}>
                         <option>Consumption-based</option>
                         <option>Demand-based</option>
                         <option>N/A</option>
                      </select>
                   </div>
                   <div>
                      <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wide">Клас енергоефект.</label>
                      <select className="w-full bg-[#111315] border border-gray-700 rounded p-1.5 text-sm text-white font-bold" value={formData.building?.energyClass} onChange={e => handleBuildingChange('energyClass', e.target.value)}>
                         <option>A+</option>
                         <option>A</option>
                         <option>B</option>
                         <option>C</option>
                         <option>D</option>
                         <option>E</option>
                         <option>F</option>
                      </select>
                   </div>
                   <div>
                      <label className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wide">Кінц. попит</label>
                      <input className="w-full bg-[#111315] border border-gray-700 rounded p-1.5 text-sm text-white font-bold" value={formData.building?.energyDemand} onChange={e => handleBuildingChange('energyDemand', e.target.value)} placeholder="kWh/m²a" />
                   </div>
                </div>
             </div>
          </div>

          {/* Expenses */}
          <div className="bg-[#1C1F24] p-6 rounded-xl border border-gray-800 shadow-sm">
             <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Rent & Owner Expenses</h3>
             <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                   <label className="text-xs text-gray-500 block mb-1">Mortgage (KM)</label>
                   <input type="number" className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-lg font-bold text-white" value={formData.ownerExpense?.mortgage} onChange={e => handleExpenseChange('mortgage', e.target.value)} />
                </div>
                <div>
                   <label className="text-xs text-gray-500 block mb-1">Management (BK)</label>
                   <input type="number" className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-lg font-bold text-white" value={formData.ownerExpense?.management} onChange={e => handleExpenseChange('management', e.target.value)} />
                </div>
                <div>
                   <label className="text-xs text-gray-500 block mb-1">Tax/Ins (HK)</label>
                   <input type="number" className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-lg font-bold text-white" value={formData.ownerExpense?.taxIns} onChange={e => handleExpenseChange('taxIns', e.target.value)} />
                </div>
                <div>
                   <label className="text-xs text-gray-500 block mb-1">Reserve</label>
                   <input type="number" className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-lg font-bold text-white" value={formData.ownerExpense?.reserve} onChange={e => handleExpenseChange('reserve', e.target.value)} />
                </div>
             </div>
          </div>

          {/* Inventory Tile */}
          <div className="bg-[#1C1F24] p-6 rounded-xl border border-gray-800 shadow-sm">
             <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-white">Меблі (Інвентар)</h2>
                <button onClick={addInventoryItem} className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-lg shadow-emerald-900/20 transition-colors border border-emerald-400/20">
                   <Plus className="w-4 h-4"/> Додати рядок меблів
                </button>
             </div>
             <div className="overflow-hidden border border-gray-700 rounded-lg">
                <table className="w-full text-sm text-left">
                   <thead className="bg-[#23262b] text-gray-400 border-b border-gray-700">
                      <tr>
                         <th className="p-4 font-bold text-xs uppercase tracking-wider w-[30%] text-gray-500">Тип меблів</th>
                         <th className="p-4 font-bold text-xs uppercase tracking-wider w-[25%] text-gray-500">Інвентарний №</th>
                         <th className="p-4 font-bold text-xs uppercase tracking-wider w-[15%] text-gray-500">Кількість</th>
                         <th className="p-4 font-bold text-xs uppercase tracking-wider w-[20%] text-gray-500">Вартість (€)</th>
                         <th className="p-4 font-bold text-xs uppercase tracking-wider w-[10%] text-center text-gray-500">Дії</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-gray-700/50 bg-[#16181D]">
                      {inventory.map((item, i) => (
                         <tr key={i} className="hover:bg-[#1C1F24] transition-colors">
                            <td className="p-4"><input className="bg-transparent border-b border-gray-700 w-full text-white font-bold outline-none focus:border-emerald-500" value={item.type} onChange={e => updateInventory(i, 'type', e.target.value)} placeholder="Назва" /></td>
                            <td className="p-4"><input className="bg-transparent border-b border-gray-700 w-full text-gray-400 text-sm outline-none focus:border-emerald-500" value={item.invNumber} onChange={e => updateInventory(i, 'invNumber', e.target.value)} placeholder="INV-001" /></td>
                            <td className="p-4"><input type="number" className="bg-transparent border-b border-gray-700 w-full text-white outline-none focus:border-emerald-500" value={item.quantity} onChange={e => updateInventory(i, 'quantity', parseInt(e.target.value))} /></td>
                            <td className="p-4"><input type="number" className="bg-transparent border-b border-gray-700 w-full text-white font-bold outline-none focus:border-emerald-500" value={item.cost} onChange={e => updateInventory(i, 'cost', parseFloat(e.target.value))} /></td>
                            <td className="p-4 text-center">
                               <button onClick={() => removeInventory(i)} className="text-red-500 hover:text-red-400 bg-transparent p-1 rounded transition-colors">
                                  <Trash2 className="w-4 h-4"/>
                               </button>
                            </td>
                         </tr>
                      ))}
                   </tbody>
                </table>
             </div>
          </div>

          {/* Meter Readings Tile (Initial Readings) */}
          <div className="bg-[#1C1F24] p-6 rounded-xl border border-gray-800 shadow-sm">
             <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-white">Показання Лічильників</h2>
                <button onClick={addMeter} className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-lg shadow-emerald-900/20 transition-colors border border-emerald-400/20">
                   <Plus className="w-4 h-4"/> Додати лічильник
                </button>
             </div>
             <div className="overflow-hidden border border-gray-700 rounded-lg">
                <table className="w-full text-sm text-left">
                   <thead className="bg-[#23262b] text-gray-400 border-b border-gray-700">
                      <tr>
                         <th className="p-4 font-bold text-xs uppercase tracking-wider text-gray-500">Назва</th>
                         <th className="p-4 font-bold text-xs uppercase tracking-wider text-gray-500">Номер</th>
                         <th className="p-4 font-bold text-xs uppercase tracking-wider text-gray-500">Початкове</th>
                         <th className="p-4 font-bold text-xs uppercase tracking-wider text-gray-500">Кінцеве</th>
                         <th className="p-4 font-bold text-xs uppercase tracking-wider text-gray-500">Спожито</th>
                         <th className="p-4 font-bold text-xs uppercase tracking-wider text-gray-500">Ціна</th>
                         <th className="p-4 font-bold text-xs uppercase tracking-wider text-gray-500">Сума</th>
                         <th className="p-4 w-[10%] text-center">Дії</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-gray-700/50 bg-[#16181D]">
                      {meters.map((meter, i) => {
                        const initial = parseFloat(meter.initial || '0');
                        const current = parseFloat(meter.current || meter.initial || '0');
                        const consumed = current - initial;
                        const price = meter.price || 0;
                        const total = consumed * price;
                        const unit = getMeterUnit(meter.name);
                        
                        return (
                         <tr key={i} className="hover:bg-[#1C1F24] transition-colors">
                            <td className="p-4">
                              <select 
                                className="bg-transparent border-b border-gray-700 w-full text-white outline-none focus:border-emerald-500 cursor-pointer"
                                value={meter.name}
                                onChange={e => updateMeter(i, 'name', e.target.value)}
                              >
                                <option value="" className="bg-[#111315] text-gray-400">Виберіть тип</option>
                                {METER_TYPES.map(type => (
                                  <option key={type.value} value={type.value} className="bg-[#111315] text-white">
                                    {type.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="p-4">
                              <input 
                                className="bg-transparent border-b border-gray-700 w-full text-gray-400 text-sm outline-none focus:border-emerald-500" 
                                value={meter.number} 
                                onChange={e => updateMeter(i, 'number', e.target.value)} 
                                placeholder="12345" 
                              />
                            </td>
                            <td className="p-4">
                              <input 
                                className="bg-transparent border-b border-gray-700 w-full text-gray-300 text-sm outline-none focus:border-emerald-500" 
                                value={meter.initial} 
                                onChange={e => updateMeter(i, 'initial', e.target.value)} 
                                placeholder="0" 
                              />
                            </td>
                            <td className="p-4">
                              <input 
                                className="bg-transparent border-b border-gray-700 w-full text-white font-bold text-sm outline-none focus:border-emerald-500" 
                                value={meter.current} 
                                onChange={e => updateMeter(i, 'current', e.target.value)} 
                                placeholder="0" 
                              />
                            </td>
                            <td className="p-4">
                              <span className="text-gray-300 font-mono text-sm">
                                {isNaN(consumed) ? '-' : consumed.toFixed(2)}
                              </span>
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="0.01"
                                  className="bg-transparent border-b border-gray-700 w-20 text-white text-sm outline-none focus:border-emerald-500"
                                  value={price || ''}
                                  onChange={e => updateMeter(i, 'price', parseFloat(e.target.value) || 0)}
                                  placeholder="0.00"
                                />
                                <span className="text-gray-500 text-xs">{unit}</span>
                              </div>
                            </td>
                            <td className="p-4">
                              <span className="text-emerald-400 font-mono text-sm font-bold">
                                {isNaN(total) || total <= 0 ? '-' : `€${total.toFixed(2)}`}
                              </span>
                            </td>
                            <td className="p-4 text-center">
                               <button onClick={() => removeMeter(i)} className="text-red-500 hover:text-red-400 p-1">
                                  <Trash2 className="w-4 h-4"/>
                               </button>
                            </td>
                         </tr>
                        );
                      })}
                   </tbody>
                </table>
             </div>
          </div>

          {/* Media Tiles (4 specific cards) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             {/* 1. Gallery */}
             <div className="bg-[#1C1F24] p-4 rounded-xl border border-gray-800 shadow-sm hover:border-gray-700 transition-colors">
                <div className="flex justify-between items-start mb-3">
                   <h3 className="text-lg font-bold text-white flex items-center gap-3">
                      <Camera className="w-5 h-5 text-yellow-500" /> Галерея Фото
                   </h3>
                   <button className="bg-emerald-500 hover:bg-emerald-600 text-white w-8 h-8 rounded-full flex items-center justify-center shadow-lg shadow-emerald-900/20 transition-colors">
                      <Plus className="w-5 h-5" />
                   </button>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                   Поточна кількість: 0 фотографій.
                </p>
             </div>

             {/* 2. Magic Plan */}
             <div className="bg-[#1C1F24] p-4 rounded-xl border border-gray-800 shadow-sm hover:border-gray-700 transition-colors">
                <div className="flex justify-between items-start mb-3">
                   <h3 className="text-lg font-bold text-white flex items-center gap-3">
                      <AreaChart className="w-5 h-5 text-blue-500" /> Magic Plan Report
                   </h3>
                   <button className="bg-emerald-500 hover:bg-emerald-600 text-white w-8 h-8 rounded-full flex items-center justify-center shadow-lg shadow-emerald-900/20 transition-colors">
                      <Plus className="w-5 h-5" />
                   </button>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                   Звіт про обмір приміщення.
                </p>
             </div>

             {/* 3. 3D Tour */}
             <div className="bg-[#1C1F24] p-4 rounded-xl border border-gray-800 shadow-sm hover:border-gray-700 transition-colors">
                <div className="flex justify-between items-start mb-3">
                   <h3 className="text-lg font-bold text-white flex items-center gap-3">
                      <Box className="w-5 h-5 text-purple-500" /> 3D Тур
                   </h3>
                   <button className="bg-emerald-500 hover:bg-emerald-600 text-white w-8 h-8 rounded-full flex items-center justify-center shadow-lg shadow-emerald-900/20 transition-colors">
                      <Plus className="w-5 h-5" />
                   </button>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                   Посилання на віртуальний 3D тур.
                </p>
             </div>

             {/* 4. Floor Plan */}
             <div className="bg-[#1C1F24] p-4 rounded-xl border border-gray-800 shadow-sm hover:border-gray-700 transition-colors">
                <div className="flex justify-between items-start mb-3">
                   <h3 className="text-lg font-bold text-white flex items-center gap-3">
                      <PenTool className="w-5 h-5 text-emerald-500" /> План (Floor Plan)
                   </h3>
                   <button className="bg-emerald-500 hover:bg-emerald-600 text-white w-8 h-8 rounded-full flex items-center justify-center shadow-lg shadow-emerald-900/20 transition-colors">
                      <Plus className="w-5 h-5" />
                   </button>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                   Архітектурні креслення та технічні плани.
                </p>
             </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-gray-800 bg-[#161B22] flex gap-3 justify-end sticky bottom-0 z-20">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-bold text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
            Скасувати
          </button>
          <button 
            onClick={handleSave}
            className="px-6 py-2 rounded-lg text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg transition-colors flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Зберегти Об'єкт
          </button>
        </div>

      </div>
    </div>
  );
};

export default PropertyAddModal;
