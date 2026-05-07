import { useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import domainTrends from '../../data/trends-domains.json';

type DomainData = Record<
  string,
  { color: string; keywords: Record<string, Record<string, number>> }
>;

const domains = domainTrends as DomainData;
const domainNames = Object.keys(domains);

// Generate color shades from a base color
function shades(base: string, count: number): string[] {
  const r = parseInt(base.slice(1, 3), 16);
  const g = parseInt(base.slice(3, 5), 16);
  const b = parseInt(base.slice(5, 7), 16);
  return Array.from({ length: count }, (_, i) => {
    const factor = 0.4 + (0.6 * i) / Math.max(count - 1, 1);
    return `rgb(${Math.round(r * factor)},${Math.round(g * factor)},${Math.round(b * factor)})`;
  });
}

export default function DomainStream() {
  const [selected, setSelected] = useState(domainNames[0] || '');

  const { data, keywords, colors } = useMemo(() => {
    const domain = domains[selected];
    if (!domain) return { data: [], keywords: [], colors: [] };

    const kws = Object.keys(domain.keywords);
    const yearSet = new Set<string>();
    for (const kw of kws) {
      Object.keys(domain.keywords[kw]).forEach((y) => yearSet.add(y));
    }
    const years = [...yearSet].sort();

    const chartData = years.map((year) => {
      const point: Record<string, string | number> = { year };
      for (const kw of kws) {
        point[kw] = domain.keywords[kw][year] || 0;
      }
      return point;
    });

    return {
      data: chartData,
      keywords: kws,
      colors: shades(domain.color, kws.length),
    };
  }, [selected]);

  return (
    <div>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="bg-[#1a1a3a] border border-[#333366] rounded-lg px-3 py-1.5 text-xs text-gray-200 outline-none mb-4"
      >
        {domainNames.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>

      <div className="h-[360px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a3a" />
            <XAxis
              dataKey="year"
              tick={{ fill: '#666', fontSize: 11 }}
              axisLine={{ stroke: '#1a1a3a' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#666', fontSize: 11 }}
              axisLine={{ stroke: '#1a1a3a' }}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1a1a3a',
                border: '1px solid #333366',
                borderRadius: 8,
                fontSize: 11,
                maxHeight: 300,
                overflowY: 'auto',
              }}
              labelStyle={{ color: '#fff' }}
              itemStyle={{ color: '#aaa' }}
            />
            {keywords.map((kw, i) => (
              <Area
                key={kw}
                type="monotone"
                dataKey={kw}
                stackId="1"
                stroke={colors[i]}
                fill={colors[i]}
                fillOpacity={0.7}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
