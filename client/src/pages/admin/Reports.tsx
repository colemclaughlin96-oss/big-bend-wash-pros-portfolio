import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatCurrency } from "@/lib/format";
import { quoteStatusLabel } from "../../../../shared/const";
import {
  Loader2,
  FileText,
  CheckCircle2,
  Percent,
  DollarSign,
  Receipt,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const WINDOWS = [
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 365 },
];

export default function Reports() {
  const [days, setDays] = useState(90);
  const { data, isLoading } = trpc.quotes.reports.useQuery({ days });

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Reports</h1>
          <p className="text-muted-foreground">Bid performance and revenue trends.</p>
        </div>
        <div className="inline-flex rounded-xl border bg-card p-1">
          {WINDOWS.map((w) => (
            <button
              key={w.days}
              onClick={() => setDays(w.days)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                days === w.days
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading || !data ? (
        <div className="flex justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-6">
            <Kpi label="Quotes created" value={String(data.total)} icon={<FileText className="h-5 w-5" />} />
            <Kpi
              label="Accepted"
              value={String(data.accepted)}
              icon={<CheckCircle2 className="h-5 w-5" />}
              tone="accepted"
            />
            <Kpi label="Close rate" value={`${data.closeRate}%`} icon={<Percent className="h-5 w-5" />} />
            <Kpi
              label="Accepted revenue"
              value={formatCurrency(data.acceptedRevenue)}
              icon={<DollarSign className="h-5 w-5" />}
              tone="accepted"
            />
            <Kpi
              label="Avg. accepted value"
              value={formatCurrency(data.avgAccepted)}
              icon={<Receipt className="h-5 w-5" />}
            />
            <Kpi
              label="Avg. quoted value"
              value={formatCurrency(data.avgQuoted)}
              icon={<TrendingUp className="h-5 w-5" />}
            />
          </div>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-2 mb-6">
            <div className="rounded-xl border bg-card p-5">
              <h2 className="font-display text-base font-semibold mb-1">Quotes over time</h2>
              <p className="text-xs text-muted-foreground mb-4">Created vs. accepted, weekly</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.series} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gCreated" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gAccepted" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#059669" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#059669" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
                    <Area
                      type="monotone"
                      dataKey="created"
                      name="Created"
                      stroke="var(--color-primary)"
                      fill="url(#gCreated)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="accepted"
                      name="Accepted"
                      stroke="#059669"
                      fill="url(#gAccepted)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-5">
              <h2 className="font-display text-base font-semibold mb-1">Revenue by week</h2>
              <p className="text-xs text-muted-foreground mb-4">Accepted quote value</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.series} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      cursor={{ fill: "rgba(0,0,0,0.04)" }}
                      formatter={(v: number) => formatCurrency(v)}
                      contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
                    />
                    <Bar dataKey="revenue" name="Revenue" fill="#059669" radius={[6, 6, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* By status */}
          <div className="grid gap-4 sm:grid-cols-3 mb-6">
            {data.byStatus.map((s) => {
              const tone =
                s.status === "accepted"
                  ? "text-emerald-600"
                  : s.status === "pending"
                    ? "text-blue-600"
                    : "text-amber-600";
              const dot =
                s.status === "accepted"
                  ? "bg-emerald-500"
                  : s.status === "pending"
                    ? "bg-blue-500"
                    : "bg-amber-500";
              const valueLabel =
                s.status === "accepted"
                  ? "Won revenue"
                  : s.status === "pending"
                    ? "Open pipeline"
                    : "Lapsed value";
              return (
                <div key={s.status} className="rounded-xl border bg-card p-5">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                    <span className="text-sm font-medium">{quoteStatusLabel(s.status)}</span>
                    <span className="ml-auto text-sm text-muted-foreground">{s.count}</span>
                  </div>
                  <div className="mt-3 font-display text-xl font-semibold">
                    {formatCurrency(s.value)}
                  </div>
                  <div className={`text-xs ${tone}`}>{valueLabel}</div>
                </div>
              );
            })}
          </div>

          {/* By package */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="border-b px-5 py-4">
              <h2 className="font-display text-base font-semibold">Performance by package</h2>
              <p className="text-xs text-muted-foreground">
                How each frequency package contributes to quotes and accepted revenue.
              </p>
            </div>
            {data.packages.length === 0 ? (
              <div className="py-14 text-center text-muted-foreground text-sm">
                No quotes in this period yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-5 py-3 font-semibold">Package</th>
                      <th className="px-5 py-3 font-semibold text-right">Quotes</th>
                      <th className="px-5 py-3 font-semibold text-right">Accepted</th>
                      <th className="px-5 py-3 font-semibold text-right">Close rate</th>
                      <th className="px-5 py-3 font-semibold text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.packages.map((s) => {
                      const rate = s.quotes > 0 ? Math.round((s.accepted / s.quotes) * 100) : 0;
                      return (
                        <tr key={s.key} className="hover:bg-secondary/30 transition-colors">
                          <td className="px-5 py-3 font-medium">{s.name}</td>
                          <td className="px-5 py-3 text-right tabular-nums">{s.quotes}</td>
                          <td className="px-5 py-3 text-right tabular-nums">{s.accepted}</td>
                          <td className="px-5 py-3 text-right tabular-nums">{rate}%</td>
                          <td className="px-5 py-3 text-right tabular-nums font-semibold">
                            {formatCurrency(s.revenue)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "accepted";
}) {
  return (
    <div className="rounded-xl border bg-card p-5 transition-shadow hover:shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span
          className={`grid h-9 w-9 place-items-center rounded-lg ${
            tone === "accepted" ? "bg-emerald-50 text-emerald-600" : "bg-secondary text-muted-foreground"
          }`}
        >
          {icon}
        </span>
      </div>
      <div className="mt-3 font-display text-2xl font-semibold">{value}</div>
    </div>
  );
}
