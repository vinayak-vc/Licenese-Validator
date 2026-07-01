// Minimal SVG bar chart. Inline, no chart lib.
// buckets: [{ label, day (YYYY-MM-DD), value }]
export function TimeSeriesBars({ buckets, height = 200, accent = '#06b6d4' }) {
  if (!buckets || buckets.length === 0) {
    return (
      <p className="text-xs text-slate-600 italic py-4 text-center">
        No activity yet in the last 30 days.
      </p>
    );
  }

  const maxValue = Math.max(1, ...buckets.map((b) => b.value));
  const barGap = 2;
  const chartHeight = height - 24;

  return (
    <div className="w-full">
      <div
        className="flex items-end w-full"
        style={{ height: chartHeight, gap: barGap }}
      >
        {buckets.map((bucket) => {
          const pct = bucket.value === 0 ? 0 : Math.max(2, (bucket.value / maxValue) * 100);
          const isPeak = bucket.value === maxValue && maxValue > 0;
          return (
            <div
              key={bucket.day}
              className="group relative flex-1 flex flex-col justify-end min-w-0"
              style={{ height: chartHeight }}
              title={`${bucket.label}: ${bucket.value.toLocaleString()} events`}
            >
              <div
                className="w-full rounded-t transition-all duration-500"
                style={{
                  height: `${pct}%`,
                  backgroundColor: isPeak ? accent : `${accent}80`,
                  boxShadow: isPeak ? `0 0 12px ${accent}80` : 'none',
                }}
              />
              <span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold text-slate-100 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
                {bucket.value.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-3 text-[10px] text-slate-500 font-mono">
        <span>{buckets[0]?.label || ''}</span>
        {buckets.length > 14 && <span>{buckets[Math.floor(buckets.length / 2)]?.label || ''}</span>}
        <span>{buckets[buckets.length - 1]?.label || ''}</span>
      </div>
    </div>
  );
}
