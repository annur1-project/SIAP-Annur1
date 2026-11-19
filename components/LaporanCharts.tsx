'use client';

import React from 'react';
import type { ComparisonBarItem, TrendBucketPoint } from '@/lib/laporan';

interface ComparisonPairedBarChartProps {
  title: string;
  subtitle?: string;
  items: ComparisonBarItem[];
  currentLabel: string;
  previousLabel: string;
  formatValue?: (val: number, unit: string) => string;
}

export function ComparisonPairedBarChart({
  title,
  subtitle,
  items,
  currentLabel,
  previousLabel,
  formatValue,
}: ComparisonPairedBarChartProps) {
  const maxVal = Math.max(
    1,
    ...items.flatMap((it) => [Math.abs(it.current), Math.abs(it.previous)])
  );
  const svgWidth = Math.max(480, items.length * 106 + 44);
  const svgHeight = 220;
  const chartTop = 28;
  const chartBottom = 166;
  const chartHeight = chartBottom - chartTop;

  const fmt = (val: number, unit: string) => {
    if (formatValue) return formatValue(val, unit);
    if (unit === 'Rp') {
      if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}jt`;
      if (val >= 1_000) return `${Math.round(val / 1_000)}rb`;
      return String(val);
    }
    if (unit === '%') return `${val}%`;
    return String(val);
  };

  return (
    <div className="border border-slate-200 rounded-xl bg-white p-4 break-inside-avoid">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <h4 className="text-sm font-bold text-slate-900">{title}</h4>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-4 text-[11px] font-medium text-slate-700">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-xs bg-emerald-700" aria-hidden="true" />
            {currentLabel}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-xs bg-slate-300" aria-hidden="true" />
            {previousLabel}
          </span>
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto"
          role="img"
          aria-label={title}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = chartBottom - ratio * chartHeight;
            return (
              <line
                key={ratio}
                x1={22}
                y1={y}
                x2={svgWidth - 14}
                y2={y}
                stroke={ratio === 0 ? '#94a3b8' : '#e2e8f0'}
                strokeWidth={ratio === 0 ? 1.2 : 1}
              />
            );
          })}

          {items.map((item, idx) => {
            const slotW = (svgWidth - 36) / Math.max(1, items.length);
            const centerX = 22 + slotW * idx + slotW / 2;
            const barW = Math.min(24, slotW * 0.28);
            const gap = 4;

            const prevH = item.previous > 0 ? Math.max(4, (item.previous / maxVal) * chartHeight) : 0;
            const currH = item.current > 0 ? Math.max(4, (item.current / maxVal) * chartHeight) : 0;

            const prevX = centerX - barW - gap / 2;
            const currX = centerX + gap / 2;
            const prevY = chartBottom - prevH;
            const currY = chartBottom - currH;

            const diff = item.current - item.previous;
            const diffStr =
              diff === 0 ? 'Tetap (0)' : diff > 0 ? `+${fmt(diff, item.unit)}` : fmt(diff, item.unit);

            return (
              <g key={item.label}>
                {/* Periode Lalu */}
                {prevH > 0 ? (
                  <rect x={prevX} y={prevY} width={barW} height={prevH} rx={3} fill="#cbd5e1" />
                ) : (
                  <line x1={prevX} y1={chartBottom} x2={prevX + barW} y2={chartBottom} stroke="#94a3b8" strokeWidth={2} />
                )}
                <text
                  x={prevX + barW / 2}
                  y={prevY - 5}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#64748b"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {fmt(item.previous, item.unit)}
                </text>

                {/* Periode Ini */}
                {currH > 0 ? (
                  <rect x={currX} y={currY} width={barW} height={currH} rx={3} fill="#047857" />
                ) : (
                  <line x1={currX} y1={chartBottom} x2={currX + barW} y2={chartBottom} stroke="#047857" strokeWidth={2} />
                )}
                <text
                  x={currX + barW / 2}
                  y={currY - 5}
                  textAnchor="middle"
                  fontSize="10.5"
                  fontWeight="700"
                  fill="#064e3b"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {fmt(item.current, item.unit)}
                </text>

                {/* Label & Delta */}
                <text
                  x={centerX}
                  y={chartBottom + 16}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="600"
                  fill="#1e293b"
                >
                  {item.label}
                </text>
                <text
                  x={centerX}
                  y={chartBottom + 31}
                  textAnchor="middle"
                  fontSize="9.5"
                  fontWeight="600"
                  fill={diff > 0 ? '#047857' : diff < 0 ? '#b45309' : '#64748b'}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {diffStr}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

interface SixPeriodTrendChartProps {
  title: string;
  subtitle?: string;
  points: TrendBucketPoint[];
  metricKey: keyof Pick<
    TrendBucketPoint,
    | 'keuanganMasukJuta'
    | 'izinPulang'
    | 'pelanggaran'
    | 'jamaahPersen'
    | 'santriSakit'
    | 'laundryPotong'
  >;
  unitLabel: string;
  accentColor?: string;
}

export function SixPeriodTrendChart({
  title,
  subtitle,
  points,
  metricKey,
  unitLabel,
  accentColor = '#047857',
}: SixPeriodTrendChartProps) {
  const vals = points.map((p) => Number(p[metricKey] || 0));
  const maxVal = Math.max(1, ...vals);
  const svgWidth = 480;
  const svgHeight = 190;
  const chartTop = 26;
  const chartBottom = 148;
  const chartHeight = chartBottom - chartTop;

  return (
    <div className="border border-slate-200 rounded-xl bg-white p-4 break-inside-avoid">
      <div className="mb-2">
        <h4 className="text-sm font-bold text-slate-900">{title}</h4>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full h-auto"
        role="img"
        aria-label={title}
      >
        {[0, 0.5, 1].map((r) => {
          const y = chartBottom - r * chartHeight;
          return (
            <line
              key={r}
              x1={20}
              y1={y}
              x2={svgWidth - 16}
              y2={y}
              stroke={r === 0 ? '#94a3b8' : '#e2e8f0'}
              strokeWidth={1}
            />
          );
        })}

        {points.map((pt, idx) => {
          const val = Number(pt[metricKey] || 0);
          const slotW = (svgWidth - 36) / Math.max(1, points.length);
          const centerX = 20 + slotW * idx + slotW / 2;
          const barW = Math.min(34, slotW * 0.52);
          const barH = val > 0 ? Math.max(4, (val / maxVal) * chartHeight) : 0;
          const barY = chartBottom - barH;
          const isLast = idx === points.length - 1;

          return (
            <g key={`${pt.startDate}-${idx}`}>
              {barH > 0 ? (
                <rect
                  x={centerX - barW / 2}
                  y={barY}
                  width={barW}
                  height={barH}
                  rx={3}
                  fill={isLast ? accentColor : '#cbd5e1'}
                />
              ) : (
                <line
                  x1={centerX - barW / 2}
                  y1={chartBottom}
                  x2={centerX + barW / 2}
                  y2={chartBottom}
                  stroke={isLast ? accentColor : '#94a3b8'}
                  strokeWidth={2}
                />
              )}
              <text
                x={centerX}
                y={barY - 5}
                textAnchor="middle"
                fontSize="10"
                fontWeight={isLast ? '700' : '500'}
                fill={isLast ? '#0f172a' : '#475569'}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {val}
                {unitLabel ? ` ${unitLabel}` : ''}
              </text>
              <text
                x={centerX}
                y={chartBottom + 15}
                textAnchor="middle"
                fontSize="9.5"
                fontWeight={isLast ? '700' : '500'}
                fill={isLast ? '#047857' : '#64748b'}
              >
                {pt.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
