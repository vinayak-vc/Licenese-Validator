// Minimal SVG donut. No external chart lib to keep the bundle lean.
// segments: [{ label, value, color }]
export function Donut({ segments, size = 180, thickness = 24, centerLabel, centerValue }) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  let cumulative = 0;
  const arcs = segments.map((segment) => {
    const value = Math.max(0, segment.value);
    const fraction = total === 0 ? 0 : value / total;
    const dash = fraction * circumference;
    const arc = {
      color: segment.color,
      dashArray: `${dash} ${circumference - dash}`,
      dashOffset: -cumulative,
      fraction,
    };
    cumulative += dash;
    return arc;
  });

  return (
    <div className="flex items-center justify-center relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(15, 23, 42, 0.8)"
          strokeWidth={thickness}
        />
        {total > 0 &&
          arcs.map((arc, index) => (
            <circle
              key={index}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={arc.color}
              strokeWidth={thickness}
              strokeDasharray={arc.dashArray}
              strokeDashoffset={arc.dashOffset}
              strokeLinecap="butt"
              style={{ transition: 'stroke-dasharray 800ms ease, stroke-dashoffset 800ms ease' }}
            />
          ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black text-slate-100 leading-none">{centerValue}</span>
        {centerLabel && (
          <span className="text-[9px] font-black tracking-widest uppercase text-slate-500 mt-1">
            {centerLabel}
          </span>
        )}
      </div>
    </div>
  );
}
