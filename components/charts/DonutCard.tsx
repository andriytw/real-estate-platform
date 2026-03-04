/**
 * Reusable donut chart cards for Apartment Statistics.
 * DonutCompositionCard: multi-segment donut (e.g. Rented vs Empty).
 * DonutGaugeCard: value vs remainder (radial gauge).
 * 4-zone layout: Title → Chart zone → Legend zone (optional) → Subtext.
 */

import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

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

const CHART_SIZE = 132;
const OUTER_RADIUS = 58;
const INNER_RADIUS = 44;

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
  /** Format segment value for custom legend (e.g. formatCurrency). Only used when showLegend. */
  formatValue?: (value: number) => string;
  /** Optional: called when pointer enters a segment (segment name as key). */
  onSegmentEnter?: (segmentKey: string) => void;
  /** Optional: called when pointer leaves a segment. */
  onSegmentLeave?: () => void;
  /** When true, do not render Recharts Tooltip (e.g. for Total Costs with custom card). */
  hideDefaultTooltip?: boolean;
  /** Optional: segment hover with key + client coords for custom card placement. */
  onSliceHoverKeyChange?: (key: string | null, clientXY?: { x: number; y: number }) => void;
}

export function DonutCompositionCard({
  title,
  segments: rawSegments,
  centerLabel,
  subtext,
  forceTwoSegments = false,
  neutralRemainderColor = '#374151',
  formatValue = (n) => String(n),
  onSegmentEnter,
  onSegmentLeave,
  hideDefaultTooltip = false,
  onSliceHoverKeyChange,
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

  const showLegend = segments.length >= 3;
  const legendItems = showLegend
    ? segments
        .slice(0, 3)
        .map((s, i) => ({
          key: s.name,
          label: s.name,
          value: s.value,
          color: data[i]?.color ?? neutralRemainderColor,
        }))
    : [];

  return (
    <div className="rounded-xl border border-gray-700 bg-[#1C1F24] p-2.5 flex flex-col items-center min-w-0 min-h-[180px] transition-transform transition-shadow duration-150 ease-out hover:-translate-y-[2px] hover:shadow-lg motion-reduce:transform-none motion-reduce:transition-none cursor-default focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20">
      {/* A) Title */}
      <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 truncate w-full text-center whitespace-nowrap overflow-hidden">
        {title}
      </div>
      {/* B) Chart zone — fixed size, normal flow; ResponsiveContainer directly inside */}
      <div className="w-[132px] h-[132px] flex items-center justify-center relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={INNER_RADIUS}
              outerRadius={OUTER_RADIUS}
              paddingAngle={0}
              dataKey="value"
              stroke="none"
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color}
                  fillOpacity={entry.name === '—' || entry.color === neutralRemainderColor ? 0.85 : 1}
                  onMouseEnter={(e: React.MouseEvent) => {
                    onSegmentEnter?.(entry.name);
                    onSliceHoverKeyChange?.(entry.name, { x: e.clientX, y: e.clientY });
                  }}
                  onMouseLeave={() => {
                    onSegmentLeave?.();
                    onSliceHoverKeyChange?.(null);
                  }}
                />
              ))}
            </Pie>
            {!hideDefaultTooltip && (
              <Tooltip formatter={(value: number) => [Number(value).toFixed(2), '']} />
            )}
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="max-w-[96px] w-full text-center truncate text-[9.6px] font-medium text-white tabular-nums whitespace-nowrap overflow-hidden text-ellipsis">
            {centerLabel}
          </span>
        </div>
      </div>
      {/* C) Legend zone — only for 3+ segments; single row (e.g. Rented · Empty · OOO or Owner Due · Invoices · Utilities) */}
      {showLegend && legendItems.length > 0 && (
        <div className="mt-0.5 w-full flex flex-row flex-nowrap items-center justify-center gap-x-1.5 min-w-0 overflow-x-auto">
          {legendItems.map((item) => (
            <div
              key={item.key}
              className="flex items-center gap-0.5 text-[10px] text-gray-400 min-w-0 flex-1 whitespace-nowrap overflow-hidden"
            >
              <span
                className="flex-shrink-0 w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="truncate text-gray-400">{item.label}</span>
              <span className="flex-shrink-0 tabular-nums text-gray-300">
                {formatValue(item.value)}
              </span>
            </div>
          ))}
        </div>
      )}
      {/* D) Subtext — single line, truncate if needed */}
      <div className="mt-0.5 text-xs text-gray-500 text-center truncate w-full whitespace-nowrap overflow-hidden text-ellipsis">
        {subtext}
      </div>
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
    <div className="rounded-xl border border-gray-700 bg-[#1C1F24] p-2.5 flex flex-col items-center min-w-0 min-h-[180px] transition-transform transition-shadow duration-150 ease-out hover:-translate-y-[2px] hover:shadow-lg motion-reduce:transform-none motion-reduce:transition-none cursor-default focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20">
      {/* A) Title */}
      <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 truncate w-full text-center whitespace-nowrap overflow-hidden">
        {title}
      </div>
      {/* B) Chart zone */}
      <div className="w-[132px] h-[132px] flex items-center justify-center relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={displayData}
              cx="50%"
              cy="50%"
              innerRadius={INNER_RADIUS}
              outerRadius={OUTER_RADIUS}
              paddingAngle={0}
              dataKey="value"
              stroke="none"
              startAngle={90}
              endAngle={-270}
            >
              {displayData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color}
                  fillOpacity={entry.name === 'Remainder' ? 0.85 : 1}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="max-w-[96px] w-full text-center truncate text-[9.6px] font-medium text-white tabular-nums whitespace-nowrap overflow-hidden text-ellipsis">
            {centerLabel}
          </span>
        </div>
      </div>
      {/* C) No legend for gauges */}
      {/* D) Subtext — single line, truncate if needed */}
      <div className="mt-0.5 text-xs text-gray-500 text-center truncate w-full whitespace-nowrap overflow-hidden text-ellipsis">
        {subtext}
      </div>
    </div>
  );
}
