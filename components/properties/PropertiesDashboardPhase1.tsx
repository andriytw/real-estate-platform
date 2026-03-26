import React, { useEffect, useMemo, useState } from 'react';
import { Bed, LayoutGrid, Ruler } from 'lucide-react';
import { bookingsService, invoicesService, offersService, propertiesService, reservationsService } from '../../services/supabaseService';
import type { Booking, InvoiceData, OfferData, Property, Reservation } from '../../types';
import { buildDashboardMonthData } from '../../lib/propertiesDashboard/selectors';
import type { DailyDashboardMetrics } from '../../lib/propertiesDashboard/types';

function formatPct(value: number): string {
  return `${(Math.max(0, value) * 100).toFixed(2)}%`;
}

function formatPctCompact(value: number | null | undefined): string {
  const safe = Number.isFinite(value) ? Number(value) : 0;
  return String(Math.round(Math.max(0, safe) * 100));
}

function formatCurrency(value: number): string {
  return `${value.toFixed(2).replace('.', ',')} €`;
}

function formatCompactNumber(value: number | null | undefined): string {
  const safe = Number.isFinite(value) ? Number(value) : 0;
  return safe.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
}

function formatCellCurrency(value: number): string {
  return value > 0 ? String(Math.round(value)) : '-';
}

function statusClass(kind: 'ooo' | 'zero' | 'value'): string {
  if (kind === 'ooo') return 'bg-gray-700/50 text-gray-200';
  if (kind === 'zero') return 'bg-red-700/35 text-red-100';
  return 'bg-emerald-700/35 text-emerald-100';
}

const PropertiesDashboardPhase1: React.FC = () => {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [properties, setProperties] = useState<Property[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [offers, setOffers] = useState<OfferData[]>([]);
  const [proformas, setProformas] = useState<InvoiceData[]>([]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [p, b, r, o, pf] = await Promise.all([
          propertiesService.getAll(),
          bookingsService.getAll(),
          reservationsService.getAll(),
          offersService.getAll(),
          invoicesService.getProformas(),
        ]);
        if (cancelled) return;
        setProperties(p);
        setBookings(b);
        setReservations(r);
        setOffers(o);
        setProformas(pf);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load dashboard data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const monthData = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    if (!y || !m) return null;
    return buildDashboardMonthData({
      properties,
      bookings,
      reservations,
      offers,
      proformas,
      year: y,
      monthIndex0: m - 1,
    });
  }, [selectedMonth, properties, bookings, reservations, offers, proformas]);

  if (loading) {
    return <div className="p-6 text-gray-300">Loading Properties Dashboard...</div>;
  }

  if (error) {
    return <div className="p-6 text-red-300">Properties Dashboard error: {error}</div>;
  }

  if (!monthData) {
    return <div className="p-6 text-gray-300">Invalid month selected.</div>;
  }

  const frozenHeaderBase = 'px-1 py-1 border-b border-gray-700 sticky z-20 overflow-hidden';
  const frozenCellBase = 'px-1 py-1 border-b border-gray-800 sticky z-10 overflow-hidden';
  const leftZoneBoundaryClass = 'shadow-[1px_0_0_0_rgba(55,65,81,1)]';
  const wohnungWidth = (() => {
    const maxChars = monthData.rows.reduce((max, row) => Math.max(max, String(row.wohnung ?? '').length), 0);
    const estimated = maxChars * 8 + 14;
    return Math.min(160, Math.max(64, estimated));
  })();
  const frozenWidths = {
    abteilung: 66,
    status: 66,
    adresse: 196,
    wohnung: wohnungWidth,
    qm: 30,
    betten: 30,
    rooms: 30,
  };
  const frozenLeft = {
    abteilung: 0,
    status: frozenWidths.abteilung,
    adresse: frozenWidths.abteilung + frozenWidths.status,
    wohnung: frozenWidths.abteilung + frozenWidths.status + frozenWidths.adresse,
    qm: frozenWidths.abteilung + frozenWidths.status + frozenWidths.adresse + frozenWidths.wohnung,
    betten: frozenWidths.abteilung + frozenWidths.status + frozenWidths.adresse + frozenWidths.wohnung + frozenWidths.qm,
    rooms: frozenWidths.abteilung + frozenWidths.status + frozenWidths.adresse + frozenWidths.wohnung + frozenWidths.qm + frozenWidths.betten,
  };

  return (
    <div className="p-6 space-y-4 text-white pb-8">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Properties Dashboard</h2>
        <input
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="bg-[#1C1F24] border border-gray-700 text-white rounded-md px-3 py-2"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <section className="bg-[#1C1F24] border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><span className="text-gray-400">Apartments:</span> {monthData.summary.apartments}</div>
            <div><span className="text-gray-400">Rooms:</span> {monthData.summary.rooms}</div>
            <div><span className="text-gray-400">Beds:</span> {monthData.summary.beds}</div>
            <div><span className="text-gray-400">Active:</span> {monthData.summary.active}</div>
            <div><span className="text-gray-400">Employee:</span> {monthData.summary.employee}</div>
            <div><span className="text-gray-400">OOO:</span> {monthData.summary.oooRoomNights}</div>
            <div><span className="text-gray-400">In preparation:</span> {monthData.summary.inPreparation}</div>
          </div>
        </section>

        <section className="bg-[#1C1F24] border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Monthly KPI</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-gray-400">Rented % of Available Apartments</div>
              <div className="font-semibold">{formatPct(monthData.summary.rentedPctAvailableApartments)}</div>
            </div>
            <div>
              <div className="text-gray-400">Rented % of Available Rooms</div>
              <div className="font-semibold">{formatPct(monthData.summary.rentedPctAvailableRooms)}</div>
            </div>
            <div>
              <div className="text-gray-400">Average Price Per Rooms</div>
              <div className="font-semibold">{formatCurrency(monthData.summary.averagePricePerRoom)}</div>
            </div>
          </div>
        </section>

        <section className="bg-[#1C1F24] border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Monthly Totals</h3>
          <div className="grid grid-cols-1 gap-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-400">Occupied Room-Nights</span>
              <span className="font-semibold">{monthData.summary.occupiedRoomNights}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-400">Not Occupied Room-Nights</span>
              <span className="font-semibold">{monthData.summary.notOccupiedRoomNights}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-400">Not Occupied Room-Nights because of OOO</span>
              <span className="font-semibold">{monthData.summary.oooRoomNights}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-400">Total Room-Nights</span>
              <span className="font-semibold">{monthData.summary.totalRoomNights}</span>
            </div>
          </div>
        </section>
      </div>

      <section className="bg-[#1C1F24] border border-gray-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Daily KPI Rows</h3>
        <div className="overflow-x-auto">
          {(() => {
            const dailyRows: Array<{ label: string; format: (d: DailyDashboardMetrics) => string }> = [
              { label: 'Rented % of Available Apartments', format: (d) => formatPctCompact(d.rentedPctAvailableApartments) },
              { label: 'Rented % of Available Rooms', format: (d) => formatPctCompact(d.rentedPctAvailableRooms) },
              { label: 'Average Price Per Rooms', format: (d) => formatCompactNumber(d.averagePricePerRoom) },
              { label: 'Occupied Room-Nights', format: (d) => String(d.occupiedRoomNights) },
              { label: 'Not occupied Room-Nights', format: (d) => String(d.notOccupiedRoomNights) },
              { label: 'Not occupied Room-Nights because of OOO', format: (d) => String(d.oooRoomNights) },
              { label: 'Total Room-Nights', format: (d) => String(d.totalRoomNights) },
            ];
            return (
          <table className="min-w-[1200px] text-xs border-separate border-spacing-0">
            <thead>
              <tr className="text-gray-400">
                <th className="text-left p-2 border-b border-r border-gray-700 sticky left-0 bg-[#1C1F24] z-10">Metric \\ Day</th>
                {monthData.days.map((_, i) => (
                  <th key={`kpi-day-${i}`} className="p-2 border-b border-r border-gray-800 last:border-r-0 border-gray-700">{i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dailyRows.map(({ label, format }) => (
                <tr key={label}>
                  <td className="p-2 border-b border-r border-gray-800 text-gray-300 sticky left-0 bg-[#1C1F24] z-10 whitespace-nowrap">{label}</td>
                  {monthData.dailyMetrics.map((day) => (
                    <td key={`${label}-${day.dayOfMonth}`} className="p-2 border-b border-r border-gray-800 last:border-r-0 text-center whitespace-nowrap">
                      {format(day)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
            );
          })()}
        </div>
      </section>

      <section className="bg-[#1C1F24] border border-gray-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Apartment / Day Matrix</h3>
        <div className="overflow-x-auto">
          <table className="min-w-[1520px] text-xs border-separate border-spacing-0 table-fixed">
            <thead>
              <tr className="text-gray-400">
                <th className={`${frozenHeaderBase} text-left`} style={{ width: frozenWidths.abteilung, minWidth: frozenWidths.abteilung, maxWidth: frozenWidths.abteilung, left: frozenLeft.abteilung, backgroundColor: '#1C1F24' }}>Abteilung</th>
                <th className={`${frozenHeaderBase} text-left`} style={{ width: frozenWidths.status, minWidth: frozenWidths.status, maxWidth: frozenWidths.status, left: frozenLeft.status, backgroundColor: '#1C1F24' }}>Status</th>
                <th className={`${frozenHeaderBase} text-left`} style={{ width: frozenWidths.adresse, minWidth: frozenWidths.adresse, maxWidth: frozenWidths.adresse, left: frozenLeft.adresse, backgroundColor: '#1C1F24' }}>Adresse</th>
                <th className={`${frozenHeaderBase} text-left`} style={{ width: frozenWidths.wohnung, minWidth: frozenWidths.wohnung, maxWidth: frozenWidths.wohnung, left: frozenLeft.wohnung, backgroundColor: '#1C1F24' }}>Wohnung</th>
                <th
                  className={`${frozenHeaderBase} text-right`}
                  style={{ width: frozenWidths.qm, minWidth: frozenWidths.qm, maxWidth: frozenWidths.qm, left: frozenLeft.qm, backgroundColor: '#1C1F24' }}
                  title="QM"
                  aria-label="QM"
                >
                  <span className="inline-flex justify-end w-full"><Ruler className="w-3.5 h-3.5 text-gray-400" /></span>
                </th>
                <th
                  className={`${frozenHeaderBase} text-right`}
                  style={{ width: frozenWidths.betten, minWidth: frozenWidths.betten, maxWidth: frozenWidths.betten, left: frozenLeft.betten, backgroundColor: '#1C1F24' }}
                  title="Betten"
                  aria-label="Betten"
                >
                  <span className="inline-flex justify-end w-full"><Bed className="w-3.5 h-3.5 text-gray-400" /></span>
                </th>
                <th
                  className={`${frozenHeaderBase} text-right ${leftZoneBoundaryClass}`}
                  style={{ width: frozenWidths.rooms, minWidth: frozenWidths.rooms, maxWidth: frozenWidths.rooms, left: frozenLeft.rooms, backgroundColor: '#1C1F24' }}
                  title="Rooms"
                  aria-label="Rooms"
                >
                  <span className="inline-flex justify-end w-full"><LayoutGrid className="w-3.5 h-3.5 text-gray-400" /></span>
                </th>
                {monthData.days.map((_, i) => (
                  <th key={`matrix-day-${i}`} className="px-1.5 py-1 border-b border-gray-700 w-[56px] min-w-[56px] max-w-[56px] text-center whitespace-nowrap bg-[#1C1F24]">{i + 1}</th>
                ))}
                <th className="px-1.5 py-1 border-b border-gray-700 sticky right-0 bg-[#1C1F24] z-10">Occupancy % of Operational Days</th>
              </tr>
            </thead>
            <tbody>
              {monthData.rows.map((row) => (
                <tr key={row.apartmentId}>
                  <td className={`${frozenCellBase}`} style={{ width: frozenWidths.abteilung, minWidth: frozenWidths.abteilung, maxWidth: frozenWidths.abteilung, left: frozenLeft.abteilung, backgroundColor: '#1C1F24' }}>{row.abteilung || '—'}</td>
                  <td className={`${frozenCellBase}`} style={{ width: frozenWidths.status, minWidth: frozenWidths.status, maxWidth: frozenWidths.status, left: frozenLeft.status, backgroundColor: '#1C1F24' }}>{row.statusLabel}</td>
                  <td className={`${frozenCellBase}`} style={{ width: frozenWidths.adresse, minWidth: frozenWidths.adresse, maxWidth: frozenWidths.adresse, left: frozenLeft.adresse, backgroundColor: '#1C1F24' }}>
                    <span className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap">{row.adresse}</span>
                  </td>
                  <td className={`${frozenCellBase}`} style={{ width: frozenWidths.wohnung, minWidth: frozenWidths.wohnung, maxWidth: frozenWidths.wohnung, left: frozenLeft.wohnung, backgroundColor: '#1C1F24' }}>
                    <span className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap">{row.wohnung}</span>
                  </td>
                  <td className={`${frozenCellBase} text-right`} style={{ width: frozenWidths.qm, minWidth: frozenWidths.qm, maxWidth: frozenWidths.qm, left: frozenLeft.qm, backgroundColor: '#1C1F24' }}>{row.qm}</td>
                  <td className={`${frozenCellBase} text-right`} style={{ width: frozenWidths.betten, minWidth: frozenWidths.betten, maxWidth: frozenWidths.betten, left: frozenLeft.betten, backgroundColor: '#1C1F24' }}>{row.betten}</td>
                  <td className={`${frozenCellBase} text-right ${leftZoneBoundaryClass}`} style={{ width: frozenWidths.rooms, minWidth: frozenWidths.rooms, maxWidth: frozenWidths.rooms, left: frozenLeft.rooms, backgroundColor: '#1C1F24' }}>{row.rooms}</td>
                  {row.dayCells.map((cell, idx) => (
                    <td key={`${row.apartmentId}-${idx}`} className={`px-1.5 py-1 border-b border-gray-800 text-center w-[56px] min-w-[56px] max-w-[56px] whitespace-nowrap relative z-0 ${statusClass(cell.kind)}`}>
                      {cell.kind === 'ooo' ? 'OOO' : formatCellCurrency(cell.amountNet)}
                    </td>
                  ))}
                  <td className="px-1.5 py-1 border-b border-gray-800 text-right sticky right-0 bg-[#1C1F24] z-10">
                    {formatPct(row.occupancyPctOperationalDays)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default PropertiesDashboardPhase1;
