'use client'

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export interface DailySalesPoint {
  date: string
  total: number
}

export function SalesChart({ data }: { data: DailySalesPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
          axisLine={{ stroke: 'var(--border-subtle)' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
          axisLine={false}
          tickLine={false}
          width={44}
        />
        <Tooltip
          formatter={(value) => [`${Number(value).toLocaleString('en-US')} ر.س`, 'المبيعات']}
          labelStyle={{ direction: 'rtl', fontSize: 12 }}
          contentStyle={{
            direction: 'rtl',
            fontSize: 12,
            borderRadius: 8,
            border: '1px solid var(--border-subtle)',
            background: 'var(--surface-raised)',
          }}
        />
        <Bar dataKey="total" fill="var(--color-accent-500)" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  )
}
