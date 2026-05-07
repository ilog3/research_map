import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const COLORS = ['#8888ff', '#ff6b6b', '#4ecdc4', '#f7dc6f', '#bb8fce'];

interface Props {
  data: Record<string, string | number>[];
  keywords: string[];
}

export default function TrendLineChart({ data, keywords }: Props) {
  if (keywords.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-600 text-sm">
        选择关键词以查看趋势
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
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
            fontSize: 12,
          }}
          labelStyle={{ color: '#fff' }}
          itemStyle={{ color: '#aaa' }}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, color: '#aaa' }}
        />
        {keywords.map((kw, i) => (
          <Line
            key={kw}
            type="monotone"
            dataKey={kw}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={{ r: 2, fill: COLORS[i % COLORS.length] }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
