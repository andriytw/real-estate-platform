import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Property } from '../types';

interface PropertyAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (property: Property) => void;
}

const defaultDetails = {
  area: 0,
  rooms: 0,
  floor: 0,
  year: 0,
  beds: 0,
  baths: 0,
  balconies: 0,
  buildingFloors: 0
};

const defaultBuilding = {
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
};

const PropertyAddModal: React.FC<PropertyAddModalProps> = ({ isOpen, onClose, onSave }) => {
  const [country, setCountry] = useState('Ukraine');
  const [zip, setZip] = useState('');
  const [city, setCity] = useState('');
  const [street, setStreet] = useState('');
  const [houseNumber, setHouseNumber] = useState('');
  const [title, setTitle] = useState('');
  const [area, setArea] = useState('');
  const [rooms, setRooms] = useState<number>(0);

  useEffect(() => {
    if (isOpen) {
      setCountry('Ukraine');
      setZip('');
      setCity('');
      setStreet('');
      setHouseNumber('');
      setTitle('');
      setArea('');
      setRooms(0);
    }
  }, [isOpen]);

  const areaNumber = Number(area);
  const isAreaValid = !Number.isNaN(areaNumber) && areaNumber > 0;

  const isAllValid =
    country.trim() !== '' &&
    zip.trim() !== '' &&
    city.trim() !== '' &&
    street.trim() !== '' &&
    houseNumber.trim() !== '' &&
    title.trim() !== '' &&
    isAreaValid &&
    rooms >= 1;

  const handleSubmit = () => {
    if (!isAllValid) return;
    const c = country.trim();
    const z = zip.trim();
    const ci = city.trim();
    const st = street.trim();
    const hn = houseNumber.trim();
    const t = title.trim();
    if (c === '' || z === '' || ci === '' || st === '' || hn === '' || t === '' || !isAreaValid || rooms < 1) return;

    const address = `${st} ${hn}`;
    const fullAddress = [st, hn, z, ci, c].join(', ');

    const property: Property = {
      id: '',
      title: t,
      address,
      city: ci,
      zip: z,
      district: '',
      country: c,
      fullAddress,
      price: 0,
      pricePerSqm: 0,
      rooms,
      area: areaNumber,
      image: '',
      images: [],
      status: 'Available',
      details: { ...defaultDetails, area: areaNumber, rooms },
      building: defaultBuilding,
      inventory: [],
      meterReadings: [],
    };

    onSave(property);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      <div className="bg-[#0D1117] w-full max-w-lg rounded-xl border border-gray-700 shadow-2xl flex flex-col animate-in zoom-in duration-200">
        <div className="p-5 border-b border-gray-800 bg-[#161B22] flex justify-between items-center">
          <div>
            <h3 className="text-xl font-bold text-white">Створення квартири</h3>
            <p className="text-sm text-gray-400 mt-0.5">Основні дані квартири. Деталі заповнюються пізніше в картці обʼєкта.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white bg-gray-800 p-2 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Section A — Address */}
          <div>
            <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Адреса</h4>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Країна</label>
                <input
                  className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  placeholder="Ukraine"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Поштовий код</label>
                <input
                  className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  placeholder="79000"
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Місто</label>
                <input
                  className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  placeholder="Львів"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Вулиця</label>
                <input
                  className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  placeholder="вулиця Хрещатик"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Номер будинку</label>
                <input
                  className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  placeholder="1"
                  value={houseNumber}
                  onChange={(e) => setHouseNumber(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Section B — Title */}
          <div>
            <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Назва</h4>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Назва</label>
              <input
                className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm font-bold text-white focus:border-emerald-500 focus:outline-none"
                placeholder="Квартира 1, Львів"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          </div>

          {/* Section C — Basic parameters */}
          <div>
            <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Основні параметри</h4>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Площа</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    className="w-full bg-[#1C1F24] border border-gray-800 rounded px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                    placeholder="Площа"
                  />
                  <span className="text-gray-400 whitespace-nowrap">м²</span>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Кількість кімнат</label>
                <input
                  type="number"
                  min={1}
                  className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  value={rooms}
                  onChange={(e) => setRooms(parseInt(e.target.value, 10) || 0)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-gray-800 bg-[#161B22] flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-bold text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            Скасувати
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isAllValid}
            className="px-6 py-2 rounded-lg text-sm font-bold bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg transition-colors"
          >
            Створити квартиру
          </button>
        </div>
      </div>
    </div>
  );
};

export default PropertyAddModal;
