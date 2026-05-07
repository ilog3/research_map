import { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import keywordTrends from '../../data/trends-keywords.json';

const trends = keywordTrends as Record<string, Record<string, number>>;

const COLORS = [
  '#8888ff', '#ff6b6b', '#4ecdc4', '#f7dc6f', '#bb8fce',
  '#f0b27a', '#82e0aa', '#f1948a', '#85c1e9', '#d7bde2',
];

export default function TopKeywordsBar() {
  const [startYear, setStartYear] = useState(2020);
  const [endYear, setEndYear] = useState(2025);

  const data = useMemo(() => {
    const totals: { name: string; value: number }[] = [];

    for (const [kw, yearMap] of Object.entries(trends)) {
      let sum = 0;
      for (const [y, count] of Object.entries(yearMap)) {
        const yr = parseInt(y);
        if (yr >= startYear && yr <= endYear) {
          sum += count;
        }
      }
      if (sum > 0) {
        totals.push({ name: kw, value: sum });
      }
    }

    return totals.sort((a, b) => b.value - a.value).slice(0, 10).reverse();
  }, [startYear, endYear]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs text-gray-500">时间段</span>
        <input
          type="number"
          min={1977}
          max={endYear}
          value={startYear}
          onChange={(e) => setStartYear(Number(e.target.value))}
          className="w-20 bg-[#1a1a3a] border border-[#333366] text-center text-xs text-gray-300 rounded px-2 py-1.5 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="text-gray-600">—</span>
        <input
          type="number"
          min={startYear}
          max={2025}
          value={endYear}
          onChange={(e) => setEndYear(Number(e.target.value))}
          className="w-20 bg-[#1a1a3a] border border-[#333366] text-center text-xs text-gray-300 rounded px-2 py-1.5 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>

      <div className="h-[360px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 5, right: 40, bottom: 5, left: 80 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a3a" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fill: '#666', fontSize: 11 }}
              axisLine={{ stroke: '#1a1a3a' }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fill: '#ccc', fontSize: 12 }}
              axisLine={{ stroke: '#1a1a3a' }}
              tickLine={false}
              width={80}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1a1a3a',
                border: '1px solid #333366',
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: '#fff' }}
              formatter={(value) => [Number(value).toLocaleString() + ' 篇', '论文数']}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
