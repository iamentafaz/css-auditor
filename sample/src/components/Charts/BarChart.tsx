import React from 'react';

interface BarChartProps {
  data: { label: string; value: number }[];
  maxValue?: number;
  color?: string;
}

export const BarChart = ({ data, maxValue, color = '#3B82F6' }: BarChartProps) => {
  const max = maxValue || Math.max(...data.map((d) => d.value));
  return (
    <div className="flex flex-col gap-2">
      {data.map((item) => {
        const pct = Math.round((item.value / max) * 100);
        return (
          <div key={item.label} className="flex items-center gap-3">
            <span className="text-sm text-gray-500 w-24 truncate">{item.label}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-2">
              <div
                className="h-2 rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  backgroundColor: color,
                  color: '#6B7280',
                }}
              />
            </div>
            <span className="text-sm tabular-nums w-8">{item.value}</span>
          </div>
        );
      })}
    </div>
  );
};
