import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import { ApartmentGroup, Property } from '../types';
import { fetchSuggestions, type GeocodeSuggestion } from '../utils/mapboxGeocode';
import { apartmentGroupsService } from '../services/supabaseService';

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

const COUNTRY_OPTIONS = [
  'Ukraine',
  'Germany',
  'Austria',
  'Poland',
  'Czech Republic',
  'France',
  'Italy',
  'Spain',
  'Netherlands',
  'Belgium',
  'Switzerland',
  'United Kingdom',
  'Romania',
  'Hungary',
  'Slovakia',
  'Slovenia',
  'Croatia',
  'Bulgaria',
  'Moldova',
  'Turkey',
  'Greece',
  'Portugal',
  'Sweden',
  'Norway',
  'Denmark',
  'Finland',
  'Estonia',
  'Latvia',
  'Lithuania',
  'Other',
] as const;

function normalizeCountryKey(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** Map Mapbox country text to a value in COUNTRY_OPTIONS. */
function matchCountryOption(suggested: string | undefined): string {
  if (!suggested?.trim()) return 'Ukraine';
  const t = suggested.trim();
  const nt = normalizeCountryKey(t);
  const exact = COUNTRY_OPTIONS.find((c) => normalizeCountryKey(c) === nt);
  if (exact) return exact;
  const partial = COUNTRY_OPTIONS.find(
    (c) => nt.includes(normalizeCountryKey(c)) || normalizeCountryKey(c).includes(nt)
  );
  if (partial) return partial;
  return 'Other';
}

function buildTitleSuggestion(s: GeocodeSuggestion): string {
  const ci = s.city?.trim() || '';
  const st = s.street?.trim() || '';
  const hn = s.houseNumber?.trim() || '';
  if (st && hn && ci) return `${st} ${hn}, ${ci}`;
  if (st && ci) return `${st}, ${ci}`;
  if (ci) return `Квартира, ${ci}`;
  const first = s.label.split(',')[0]?.trim();
  if (first) return first.slice(0, 200);
  return '';
}

const PropertyAddModal: React.FC<PropertyAddModalProps> = ({ isOpen, onClose, onSave }) => {
  const [country, setCountry] = useState('Ukraine');
  const [zip, setZip] = useState('');
  const [city, setCity] = useState('');
  const [street, setStreet] = useState('');
  const [houseNumber, setHouseNumber] = useState('');
  const [title, setTitle] = useState('');
  /** Once user edits the title field, never auto-overwrite from address picks. */
  const [titleUserEdited, setTitleUserEdited] = useState(false);

  // Core apartment fields (canonical fields used elsewhere in the app)
  const [apartmentGroups, setApartmentGroups] = useState<ApartmentGroup[]>([]);
  const [apartmentGroupId, setApartmentGroupId] = useState<string | null>(null);
  const [areaInput, setAreaInput] = useState('');
  const [bedsInput, setBedsInput] = useState('');
  const [roomsInput, setRoomsInput] = useState('');

  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [coordsFromGeocodePick, setCoordsFromGeocodePick] = useState(false);

  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [streetSearchLoading, setStreetSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** After picking a suggestion, skip one debounced fetch so the list does not reopen from the new street value. */
  const suppressNextStreetFetchRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setCountry('Ukraine');
      setZip('');
      setCity('');
      setStreet('');
      setHouseNumber('');
      setTitle('');
      setTitleUserEdited(false);
      setApartmentGroupId(null);
      setAreaInput('');
      setBedsInput('');
      setRoomsInput('');
      setLat(null);
      setLng(null);
      setCoordsFromGeocodePick(false);
      setSuggestions([]);
      setSuggestionsOpen(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    (async () => {
      try {
        const list = await apartmentGroupsService.getAll();
        if (!alive) return;
        setApartmentGroups(list);
      } catch (e) {
        // Keep modal usable even if groups fail to load
        console.error('Failed to load apartment groups:', e);
        if (!alive) return;
        setApartmentGroups([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (suppressNextStreetFetchRef.current) {
      suppressNextStreetFetchRef.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = street.trim();
    if (q.length < 3) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setStreetSearchLoading(true);
      const res = await fetchSuggestions(q, 5);
      setSuggestions(res);
      setSuggestionsOpen(true);
      setStreetSearchLoading(false);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [street]);

  const applySuggestion = useCallback((s: GeocodeSuggestion) => {
    suppressNextStreetFetchRef.current = true;
    setSuggestionsOpen(false);
    setSuggestions([]);

    if (s.street?.trim()) {
      setStreet(s.street.trim());
    } else {
      const part = s.label.split(',')[0]?.trim() || '';
      setStreet(part);
    }

    if (s.houseNumber?.trim()) {
      setHouseNumber(s.houseNumber.trim());
    } else {
      setHouseNumber('');
    }

    if (s.postcode?.trim()) setZip(s.postcode.trim());
    if (s.city?.trim()) setCity(s.city.trim());
    if (s.country?.trim()) setCountry(matchCountryOption(s.country));

    const validCoords =
      Number.isFinite(s.lat) &&
      Number.isFinite(s.lng) &&
      !(s.lat === 0 && s.lng === 0) &&
      s.lat >= -90 &&
      s.lat <= 90 &&
      s.lng >= -180 &&
      s.lng <= 180;
    if (validCoords) {
      setLat(s.lat);
      setLng(s.lng);
      setCoordsFromGeocodePick(true);
    } else {
      setLat(null);
      setLng(null);
      setCoordsFromGeocodePick(false);
    }

    if (!titleUserEdited) {
      const next = buildTitleSuggestion(s);
      if (next) setTitle(next);
    }
  }, [titleUserEdited]);

  const isAllValid =
    country.trim() !== '' &&
    zip.trim() !== '' &&
    city.trim() !== '' &&
    street.trim() !== '' &&
    houseNumber.trim() !== '' &&
    title.trim() !== '';

  const handleSubmit = () => {
    if (!isAllValid) return;
    const c = country.trim();
    const z = zip.trim();
    const ci = city.trim();
    const st = street.trim();
    const hn = houseNumber.trim();
    const t = title.trim();
    if (c === '' || z === '' || ci === '' || st === '' || hn === '' || t === '') return;

    const parsedArea = (() => {
      const raw = areaInput.trim();
      if (raw === '') return 0;
      const n = Number(raw);
      if (!Number.isFinite(n)) return 0;
      return Math.max(0, n);
    })();
    const parsedBeds = (() => {
      const raw = bedsInput.trim();
      if (raw === '') return 0;
      const n = Number(raw);
      if (!Number.isFinite(n)) return 0;
      return Math.max(0, Math.floor(n));
    })();
    const parsedRooms = (() => {
      const raw = roomsInput.trim();
      if (raw === '') return 0;
      const n = Number(raw);
      if (!Number.isFinite(n)) return 0;
      return Math.max(0, Math.floor(n));
    })();

    const address = `${st} ${hn}`;
    const fullAddress = [st, hn, z, ci, c].join(', ');

    const hasValidCoords =
      coordsFromGeocodePick &&
      lat != null &&
      lng != null &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      !(lat === 0 && lng === 0);

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
      rooms: parsedRooms,
      area: parsedArea,
      image: '',
      images: [],
      status: 'Available',
      details: { ...defaultDetails, area: parsedArea, rooms: parsedRooms, beds: parsedBeds },
      building: defaultBuilding,
      inventory: [],
      meterReadings: [],
      apartmentGroupId,
      ...(hasValidCoords
        ? {
            lat,
            lng,
            geocoded_at: new Date().toISOString(),
            geocode_provider: 'mapbox',
            geocode_confidence: 'modal_pick',
            geocode_failed_reason: null,
          }
        : {}),
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
                <select
                  className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  aria-label="Country"
                >
                  {COUNTRY_OPTIONS.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
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
                <div className="relative">
                  <input
                    className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 pr-8 text-sm text-white focus:border-emerald-500 focus:outline-none"
                    placeholder="вулиця Хрещатик"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    onFocus={() => suggestions.length > 0 && setSuggestionsOpen(true)}
                    onBlur={() => setTimeout(() => setSuggestionsOpen(false), 200)}
                    autoComplete="off"
                    aria-autocomplete="list"
                    aria-expanded={suggestionsOpen}
                  />
                  {streetSearchLoading && (
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">…</span>
                  )}
                  {suggestionsOpen && suggestions.length > 0 && (
                    <ul className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-gray-700 bg-[#1C1F24] shadow-xl">
                      {suggestions.map((sug, i) => (
                        <li
                          key={`${sug.label}-${i}`}
                          onMouseDown={() => applySuggestion(sug)}
                          className="cursor-pointer border-b border-gray-800 px-3 py-2 text-sm text-white last:border-0 hover:bg-[#23262b]"
                        >
                          {sug.label}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 sm:gap-4 items-start">
              <div className="sm:col-span-7">
                <label className="text-xs text-gray-500 block mb-1">Назва</label>
                <input
                  className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm font-bold text-white focus:border-emerald-500 focus:outline-none"
                  placeholder="Квартира 1, Львів"
                  value={title}
                  onChange={(e) => {
                    setTitleUserEdited(true);
                    setTitle(e.target.value);
                  }}
                />
              </div>
              <div className="sm:col-span-5 space-y-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Група квартири</label>
                  <select
                    className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                    value={apartmentGroupId ?? ''}
                    onChange={(e) => setApartmentGroupId(e.target.value === '' ? null : e.target.value)}
                  >
                    <option value="">—</option>
                    {apartmentGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 xs:grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Площа, м²</label>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      inputMode="decimal"
                      className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                      placeholder="0"
                      value={areaInput}
                      onChange={(e) => setAreaInput(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Ліжка</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                      placeholder="0"
                      value={bedsInput}
                      onChange={(e) => setBedsInput(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Кімнати</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                      placeholder="0"
                      value={roomsInput}
                      onChange={(e) => setRoomsInput(e.target.value)}
                    />
                  </div>
                </div>
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
