import React, { useEffect, useMemo, useState } from 'react';
import { bookingsService, invoicesService, offersService, propertiesService, reservationsService } from '../../services/supabaseService';
import type { Booking, InvoiceData, OfferData, Property, Reservation } from '../../types';
import { buildDashboardMonthData } from '../../lib/propertiesDashboard/selectors';
import type { DailyDashboardMetrics } from '../../lib/propertiesDashboard/types';

function formatPct(value: number): string {
  return `${(Math.max(0, value) * 100).toFixed(2)}%`;
}

function formatCurrency(value: number): string {
  return `${value.toFixed(2).replace('.', ',')} €`;
}

function formatCellCurrency(value: number): string {
  return value > 0 ? formatCurrency(value) : '- €';
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

  return (
    <div className="p-6 space-y-4 text-white">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Properties Dashboard</h2>
        <input
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="bg-[#1C1F24] border border-gray-700 text-white rounded-md px-3 py-2"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
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
      </div>

      <section className="bg-[#1C1F24] border border-gray-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Daily KPI Rows</h3>
        <div className="overflow-x-auto">
          {(() => {
            const dailyRows: Array<{ label: string; format: (d: DailyDashboardMetrics) => string }> = [
              { label: 'Rented % of Available Apartments', format: (d) => formatPct(d.rentedPctAvailableApartments) },
              { label: 'Rented % of Available Rooms', format: (d) => formatPct(d.rentedPctAvailableRooms) },
              { label: 'Average Price Per Rooms', format: (d) => formatCurrency(d.averagePricePerRoom) },
              { label: 'Occupied Room-Nights', format: (d) => String(d.occupiedRoomNights) },
              { label: 'Not occupied Room-Nights', format: (d) => String(d.notOccupiedRoomNights) },
              { label: 'Not occupied Room-Nights because of OOO', format: (d) => String(d.oooRoomNights) },
              { label: 'Total Room-Nights', format: (d) => String(d.totalRoomNights) },
            ];
            return (
          <table className="min-w-[1200px] text-xs border-collapse">
            <thead>
              <tr className="text-gray-400">
                <th className="text-left p-2 border-b border-gray-700">Metric \\ Day</th>
                {monthData.days.map((_, i) => (
                  <th key={`kpi-day-${i}`} className="p-2 border-b border-gray-700">{i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dailyRows.map(({ label, format }) => (
                <tr key={label}>
                  <td className="p-2 border-b border-gray-800 text-gray-300 sticky left-0 bg-[#1C1F24]">{label}</td>
                  {monthData.dailyMetrics.map((day) => (
                    <td key={`${label}-${day.dayOfMonth}`} className="p-2 border-b border-gray-800 text-center">
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
          <table className="min-w-[2000px] text-xs border-collapse">
            <thead>
              <tr className="text-gray-400">
                <th className="p-2 border-b border-gray-700 text-left sticky bg-[#1C1F24] z-20 w-[90px]" style={{ left: 0 }}>ID</th>
                <th className="p-2 border-b border-gray-700 text-left sticky bg-[#1C1F24] z-20 w-[130px]" style={{ left: 90 }}>Abteilung</th>
                <th className="p-2 border-b border-gray-700 text-left sticky bg-[#1C1F24] z-20 w-[120px]" style={{ left: 220 }}>Status</th>
                <th className="p-2 border-b border-gray-700 text-left sticky bg-[#1C1F24] z-20 w-[240px]" style={{ left: 340 }}>Adresse</th>
                <th className="p-2 border-b border-gray-700 text-left sticky bg-[#1C1F24] z-20 w-[140px]" style={{ left: 580 }}>Wohnung</th>
                <th className="p-2 border-b border-gray-700 text-right sticky bg-[#1C1F24] z-20 w-[70px]" style={{ left: 720 }}>QM</th>
                <th className="p-2 border-b border-gray-700 text-right sticky bg-[#1C1F24] z-20 w-[80px]" style={{ left: 790 }}>Betten</th>
                <th className="p-2 border-b border-gray-700 text-right sticky bg-[#1C1F24] z-20 w-[80px]" style={{ left: 870 }}>Rooms</th>
                {monthData.days.map((_, i) => (
                  <th key={`matrix-day-${i}`} className="p-2 border-b border-gray-700">{i + 1}</th>
                ))}
                <th className="p-2 border-b border-gray-700 sticky right-0 bg-[#1C1F24]">Occupancy % of Operational Days</th>
              </tr>
            </thead>
            <tbody>
              {monthData.rows.map((row) => (
                <tr key={row.apartmentId}>
                  <td className="p-2 border-b border-gray-800 sticky bg-[#1C1F24] z-10 w-[90px]" style={{ left: 0 }}>{row.apartmentId.slice(0, 8)}</td>
                  <td className="p-2 border-b border-gray-800 sticky bg-[#1C1F24] z-10 w-[130px]" style={{ left: 90 }}>{row.abteilung || '—'}</td>
                  <td className="p-2 border-b border-gray-800 sticky bg-[#1C1F24] z-10 w-[120px]" style={{ left: 220 }}>{row.statusLabel}</td>
                  <td className="p-2 border-b border-gray-800 sticky bg-[#1C1F24] z-10 w-[240px]" style={{ left: 340 }}>{row.adresse}</td>
                  <td className="p-2 border-b border-gray-800 sticky bg-[#1C1F24] z-10 w-[140px]" style={{ left: 580 }}>{row.wohnung}</td>
                  <td className="p-2 border-b border-gray-800 text-right sticky bg-[#1C1F24] z-10 w-[70px]" style={{ left: 720 }}>{row.qm}</td>
                  <td className="p-2 border-b border-gray-800 text-right sticky bg-[#1C1F24] z-10 w-[80px]" style={{ left: 790 }}>{row.betten}</td>
                  <td className="p-2 border-b border-gray-800 text-right sticky bg-[#1C1F24] z-10 w-[80px]" style={{ left: 870 }}>{row.rooms}</td>
                  {row.dayCells.map((cell, idx) => (
                    <td key={`${row.apartmentId}-${idx}`} className={`p-2 border-b border-gray-800 text-center ${statusClass(cell.kind)}`}>
                      {cell.kind === 'ooo' ? 'OOO' : formatCellCurrency(cell.amountNet)}
                    </td>
                  ))}
                  <td className="p-2 border-b border-gray-800 text-right sticky right-0 bg-[#1C1F24]">
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
