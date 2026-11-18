import { trpc } from "@/lib/trpc";
import { formatCurrency, formatDate } from "@/lib/format";
import { Link } from "wouter";
import { quoteStatusLabel } from "../../../../shared/const";
import {
  Loader2,
  FileText,
  Clock,
  CheckCircle2,
  TrendingUp,
  DollarSign,
  ExternalLink,
  FilePlus2,
  Percent,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function Dashboard() {
  const { data, isLoading } = trpc.quotes.dashboard.useQuery();

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const statusData = [
    { name: "Pending", value: data.pending, color: "#2563eb" },
    { name: "Accepted", value: data.accepted, color: "#059669" },
    { name: "Expired", value: data.expired, color: "#d97706" },
  ].filter((d) => d.value > 0);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground">
            Your quoting performance at a glance.
          </p>
        </div>
        <Link
          href="/admin/new-quote"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:shadow transition-all active:scale-[0.98]"
        >
          <FilePlus2 className="h-4 w-4" /> New quote
        </Link>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-6">
        <KpiCard
          label="Total quotes"
          value={String(data.total)}
          icon={<FileText className="h-5 w-5" />}
        />
        <KpiCard
          label="Quote Sent"
          value={String(data.pending)}
          icon={<Clock className="h-5 w-5" />}
          tone="pending"
        />
        <KpiCard
          label="Accepted"
          value={String(data.accepted)}
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="accepted"
        />
        <KpiCard
          label="Accepted revenue"
          value={formatCurrency(data.acceptedRevenue)}
          icon={<DollarSign className="h-5 w-5" />}
          tone="accepted"
        />
        <KpiCard
          label="Open pipeline"
          value={formatCurrency(data.pipelineValue)}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <KpiCard
          label="Conversion rate"
          value={`${data.conversionRate}%`}
          icon={<Percent className="h-5 w-5" />}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3 mb-6">
        <div className="lg:col-span-2 rounded-xl border bg-card p-5">
          <h2 className="font-display text-base font-semibold mb-1">
            Quotes by week
          </h2>
          <p className="text-xs text-muted-foreground mb-4">Last 12 weeks</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.weeks} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: "rgba(0,0,0,0.04)" }}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
                />
                <Bar dataKey="count" fill="var(--color-primary)" radius={[6, 6, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h2 className="font-display text-base font-semibold mb-1">
            Quotes by status
          </h2>
          <p className="text-xs text-muted-foreground mb-4">Current breakdown</p>
          <div className="h-64">
            {statusData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No quotes yet
              </div>
            ) : (
              <div className="relative h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={58}
                      outerRadius={92}
                      paddingAngle={statusData.length > 1 ? 2 : 0}
                      stroke="#ffffff"
                      strokeWidth={2}
                    >
                      {statusData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-display text-3xl font-semibold leading-none">
                    {data.total}
                  </span>
                  <span className="mt-1 text-[11px] text-muted-foreground">
                    total quotes
                  </span>
                </div>
              </div>
            )}
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs">
            {statusData.map((s) => (
              <span key={s.name} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                {s.name} ({s.value})
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-display text-base font-semibold">Recent activity</h2>
          <Link
            href="/admin/quotes"
            className="text-sm font-medium text-primary hover:underline"
          >
            View all quotes
          </Link>
        </div>
        {data.recent.length === 0 ? (
          <div className="py-14 text-center text-muted-foreground text-sm">
            No quotes yet. Share your quote form or create one manually to get started.
          </div>
        ) : (
          <div className="divide-y">
            {data.recent.map((q) => {
              const tier = q.computedTiers.find((t) => t.key === q.selectedTierKey);
              const display =
                tier ?? q.computedTiers[Math.floor(q.computedTiers.length / 2)];
              return (
                <div
                  key={q.id}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-secondary/30 transition-colors"
                >
                  <Link
                    href={q.customerId ? `/admin/customers/${q.customerId}` : "/admin/quotes"}
                    className="min-w-0 group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate group-hover:text-primary group-hover:underline transition-colors">
                        {q.customerName}
                      </span>
                      <StatusPill status={q.status} />
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {[q.propertyAddress, q.propertyCity].filter(Boolean).join(", ") ||
                        q.customerEmail ||
                        q.customerPhone ||
                        "—"}
                    </div>
                  </Link>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <div className="text-sm font-semibold">
                        {display ? formatCurrency(display.total) : "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(q.createdAt)}
                      </div>
                    </div>
                    <a
                      href={`/quote/${q.publicToken}`}
                      target="_blank"
                      rel="noreferrer"
                      title="Open quote"
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "pending" | "accepted";
}) {
  return (
    <div className="rounded-xl border bg-card p-5 transition-shadow hover:shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span
          className={`grid h-9 w-9 place-items-center rounded-lg ${
            tone === "accepted"
              ? "bg-emerald-50 text-emerald-600"
              : tone === "pending"
                ? "bg-blue-50 text-blue-600"
                : "bg-secondary text-muted-foreground"
          }`}
        >
          {icon}
        </span>
      </div>
      <div className="mt-3 font-display text-2xl font-semibold">{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-blue-100 text-blue-700",
    accepted: "bg-emerald-100 text-emerald-700",
    expired: "bg-amber-100 text-amber-700",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        map[status] ?? map.pending
      }`}
    >
      {quoteStatusLabel(status)}
    </span>
  );
}
