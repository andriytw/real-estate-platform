import React from 'react';
import type { LucideIcon } from 'lucide-react';

type Row = {
  label: string;
  value: string;
};

type Props = {
  title: string;
  icon: LucideIcon;
  color: string; // MUST match slice color
  total: string; // already formatted (e.g. "1.810,00 €")
  rows: Row[];
  warning?: string;
  emptyText?: string;

  // positioning
  style?: React.CSSProperties;
  className?: string;

  // hover keep-open
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
};

export function CostSliceDetailsCard({
  title,
  icon: Icon,
  color,
  total,
  rows,
  warning,
  emptyText = '— No details available yet',
  style,
  className,
  onMouseEnter,
  onMouseLeave,
}: Props) {
  const hasRows = rows && rows.length > 0;

  return (
    <div
      className={[
        'absolute z-50',
        'min-w-[360px] max-w-[520px]',
        'rounded-2xl',
        'border border-white/10',
        'bg-[#121826]/95',
        'shadow-[0_20px_60px_rgba(0,0,0,0.55)]',
        'backdrop-blur-md',
        'overflow-hidden',
        className ?? '',
      ].join(' ')}
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* top accent */}
      <div className="h-[3px] w-full" style={{ backgroundColor: color }} />

      {/* header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5"
            style={{ color }}
          >
            <Icon size={18} />
          </div>
          <div className="text-[15px] font-semibold text-white">{title}</div>
        </div>

        <div className="text-[15px] font-semibold tabular-nums text-white">{total}</div>
      </div>

      <div className="h-px w-full bg-white/10" />

      {/* warning */}
      {warning ? (
        <>
          <div className="px-4 py-2 text-[12px] text-amber-300">{warning}</div>
          <div className="h-px w-full bg-white/10" />
        </>
      ) : null}

      {/* body */}
      {!hasRows ? (
        <div className="px-4 py-3 text-[13px] text-white/60">{emptyText}</div>
      ) : (
        <div>
          {rows.map((r, idx) => (
            <React.Fragment key={`${r.label}-${idx}`}>
              <div className="flex items-center justify-between px-4 py-2">
                <div className="text-[13px] text-white/70">{r.label}</div>
                <div className="text-[13px] font-medium tabular-nums text-white/90">{r.value}</div>
              </div>
              {idx !== rows.length - 1 ? <div className="h-px w-full bg-white/5" /> : null}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* footer total */}
      <div className="h-px w-full bg-white/10" />
      <div className="flex items-center justify-between px-4 py-3">
        <div className="text-[13px] text-white/60">Total</div>
        <div className="text-[13px] font-semibold tabular-nums text-white">{total}</div>
      </div>
    </div>
  );
}
