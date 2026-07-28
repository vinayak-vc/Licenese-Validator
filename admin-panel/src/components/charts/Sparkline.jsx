// Tiny inline SVG sparkline. No axes, no labels, just a shape.
export function Sparkline({ values, width = 80, height = 22, color = '#06b6d4', filled = true }) {
  if (!values || values.length === 0) {
    return (
      <svg width={width} height={height}>
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="#334155" strokeWidth={1} strokeDasharray="2 2" />
      </svg>
    );
  }

  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((value, index) => {
    const x = index * step;
    const y = height - (value / max) * (height - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const linePath = 'M ' + points.join(' L ');
  const areaPath = values.length > 1
    ? `M 0,${height} L ${points.join(' L ')} L ${width},${height} Z`
    : '';

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {filled && areaPath && (
        <path d={areaPath} fill={color} fillOpacity={0.15} />
      )}
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
