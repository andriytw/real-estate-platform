/**
 * Reusable donut chart cards for Apartment Statistics.
 * DonutCompositionCard: multi-segment donut (e.g. Rented vs Empty).
 * DonutGaugeCard: value vs remainder (radial gauge).
 */

import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

const DEFAULT_COLORS = [
  '#10b981', // emerald (Income/Collected)
  '#3b82f6', // blue (Plan/Remaining)
  '#f59e0b', // amber (Missing)
  '#ef4444', // red (Costs)
  '#8b5cf6', // purple (OwnerDue)
  '#eab308', // yellow (Invoices)
  '#06b6d4', // cyan (Utilities)
  '#6b7280', // gray (Empty)
  '#374151', // dark gray (OOO)
];

export interface DonutSegment {
  name: string;
  value: number;
  color?: string;
}

interface DonutCompositionCardProps {
  title: string;
  segments: DonutSegment[];
  centerLabel: string;
  subtext: string;
  /** Optional: force 2 segments for single-value (Value + Remainder) so it looks like donut */
  forceTwoSegments?: boolean;
  neutralRemainderColor?: string;
}

export function DonutCompositionCard({
  title,
  segments: rawSegments,
  centerLabel,
  subtext,
  forceTwoSegments = false,
  neutralRemainderColor = '#374151',
}: DonutCompositionCardProps) {
  let segments = rawSegments.filter((s) => Number.isFinite(s.value) && s.value >= 0);
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  if (forceTwoSegments && segments.length === 1 && total > 0) {
    const small = Math.max(0.01 * total, 0.01);
    segments = [
      { ...segments[0], color: segments[0].color ?? DEFAULT_COLORS[0] },
      { name: '—', value: small, color: neutralRemainderColor },
    ];
  } else if (segments.length === 0) {
    segments = [{ name: '—', value: 1, color: neutralRemainderColor }];
  }

  const data = segments.map((s, i) => ({
    name: s.name,
    value: s.value,
    color: s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
  }));

  return (
    <div className="rounded-xl border border-gray-700 bg-[#1C1F24] p-3 flex flex-col items-center min-w-0">
      <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1 truncate w-full text-center">
        {title}
      </div>
      <div className="relative flex items-center justify-center" style={{ width: 150, height: 150 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={54}
              outerRadius={72}
              paddingAngle={0}
              dataKey="value"
              stroke="none"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number) => [Number(value).toFixed(2), '']} />
            <Legend layout="horizontal" align="center" wrapperStyle={{ fontSize: 10 }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-lg font-bold text-white tabular-nums leading-tight text-center">
            {centerLabel}
          </span>
        </div>
      </div>
      <div className="text-xs text-gray-500 mt-1 text-center truncate w-full">{subtext}</div>
    </div>
  );
}

interface DonutGaugeCardProps {
  title: string;
  value: number;
  max: number;
  centerLabel: string;
  subtext: string;
  valueColor?: string;
  remainderColor?: string;
}

export function DonutGaugeCard({
  title,
  value,
  max,
  centerLabel,
  subtext,
  valueColor = '#10b981',
  remainderColor = '#374151',
}: DonutGaugeCardProps) {
  const safeMax = Math.max(max, 0.01);
  const fillValue = Math.min(Math.max(value, 0), safeMax);
  const remainder = Math.max(safeMax - fillValue, 0);
  const data = [
    { name: 'Value', value: fillValue, color: valueColor },
    { name: 'Remainder', value: remainder, color: remainderColor },
  ].filter((d) => d.value > 0);

  const displayData = data.length === 0 ? [{ name: '—', value: 1, color: remainderColor }] : data;

  return (
    <div className="rounded-xl border border-gray-700 bg-[#1C1F24] p-3 flex flex-col items-center min-w-0">
      <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1 truncate w-full text-center">
        {title}
      </div>
      <div className="relative flex items-center justify-center" style={{ width: 150, height: 150 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={displayData}
              cx="50%"
              cy="50%"
              innerRadius={54}
              outerRadius={72}
              paddingAngle={0}
              dataKey="value"
              stroke="none"
              startAngle={90}
              endAngle={-270}
            >
              {displayData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-lg font-bold text-white tabular-nums leading-tight text-center">
            {centerLabel}
          </span>
        </div>
      </div>
      <div className="text-xs text-gray-500 mt-1 text-center truncate w-full">{subtext}</div>
    </div>
  );
}
