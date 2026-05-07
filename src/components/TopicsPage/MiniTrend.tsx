interface Props {
  trend: Record<string, number>;
  color: string;
}

export default function MiniTrend({ trend, color }: Props) {
  const years = Object.keys(trend).sort();
  const values = years.map((y) => trend[y] || 0);
  const max = Math.max(...values, 1);

  const width = 96;
  const height = 40;
  const padding = 2;

  const points = values.map((v, i) => {
    const x = padding + (i / Math.max(values.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - (v / max) * (height - padding * 2);
    return `${x},${y}`;
  });

  const areaPoints = [
    `${padding},${height - padding}`,
    ...points,
    `${width - padding},${height - padding}`,
  ];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
      <polygon
        points={areaPoints.join(' ')}
        fill={color}
        fillOpacity={0.15}
      />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
