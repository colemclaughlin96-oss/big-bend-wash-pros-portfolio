import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  Copy,
  Mail,
  MessageSquare,
  ExternalLink,
  Loader2,
  Search,
  TrendingUp,
  FilePlus2,
  Check,
  X,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TierCards } from "@/components/TierCards";
import { quoteStatusLabel } from "../../../../shared/const";

type StatusFilter = "all" | "pending" | "accepted" | "declined" | "expired";

export default function Quotes() {
  const { data: quotes, isLoading } = trpc.quotes.list.useQuery();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  const stats = useMemo(() => {
    const list = quotes ?? [];
    const accepted = list.filter((q) => q.status === "accepted");
    const acceptedValue = accepted.reduce((sum, q) => {
      const t = q.computedTiers.find((t) => t.key === q.selectedTierKey);
      return sum + (t?.total ?? 0);
    }, 0);
    return {
      total: list.length,
      pending: list.filter((q) => q.status === "pending").length,
      accepted: accepted.length,
      expired: list.filter((q) => q.status === "expired").length,
      acceptedValue,
    };
  }, [quotes]);

  const filtered = useMemo(() => {
    let list = quotes ?? [];
    if (filter !== "all") list = list.filter((q) => q.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (item) =>
          item.customerName.toLowerCase().includes(q) ||
          item.customerEmail?.toLowerCase().includes(q) ||
          item.customerPhone?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [quotes, filter, search]);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Quotes</h1>
          <p className="text-muted-foreground">Track every quote and its status.</p>
        </div>
        <Link
          href="/admin/new-quote"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:shadow transition-all active:scale-[0.98]"
        >
          <FilePlus2 className="h-4 w-4" /> New quote
        </Link>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard label="Total quotes" value={String(stats.total)} />
        <StatCard label="Pending" value={String(stats.pending)} tone="pending" />
        <StatCard label="Accepted" value={String(stats.accepted)} tone="accepted" />
        <StatCard
          label="Accepted value"
          value={formatCurrency(stats.acceptedValue)}
          icon={<TrendingUp className="h-4 w-4" />}
        />
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or phone…"
            className="w-full rounded-lg border bg-card pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex gap-1 rounded-lg border bg-card p-1">
          {(["all", "pending", "accepted", "declined", "expired"] as StatusFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                filter === f ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
              }`}
            >
              {quoteStatusLabel(f)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            No quotes yet. Share your quote form to start collecting leads.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Selected tier</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((q) => {
                  const tier = q.computedTiers.find((t) => t.key === q.selectedTierKey);
                  return (
                    <tr
                      key={q.id}
                      className="border-b last:border-0 hover:bg-secondary/30 transition-colors cursor-pointer"
                      onClick={() => setOpenId(q.id)}
                    >
                      <td className="px-4 py-3 font-medium">{q.customerName}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {q.customerEmail || q.customerPhone || "—"}
                      </td>
                      <td className="px-4 py-3">
                        {tier ? (
                          <span>
                            {tier.name}{" "}
                            <span className="text-muted-foreground">
                              {formatCurrency(tier.total)}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={q.status} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(q.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <RowActions quoteId={q.id} token={q.publicToken} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <QuoteDetailDialog id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone?: "pending" | "accepted";
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      </div>
      <div
        className={`mt-2 font-display text-2xl font-semibold ${
          tone === "accepted" ? "text-emerald-600" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-blue-100 text-blue-700",
    accepted: "bg-emerald-100 text-emerald-700",
    declined: "bg-red-100 text-red-700",
    expired: "bg-amber-100 text-amber-700",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        map[status] ?? map.pending
      }`}
    >
      {quoteStatusLabel(status)}
    </span>
  );
}

function RowActions({ quoteId, token }: { quoteId: number; token: string }) {
  const utils = trpc.useUtils();
  const deliver = trpc.quotes.deliver.useMutation({
    onSuccess: (res) => {
      utils.quotes.list.invalidate();
      toast.success(res.viaGhl ? "Sent via GoHighLevel workflow" : "Delivery recorded");
    },
    onError: (e) => toast.error(e.message),
  });

  const copyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/quote/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Quote link copied");
  };

  return (
    <>
      <IconBtn title="Copy link" onClick={copyLink}>
        <Copy className="h-4 w-4" />
      </IconBtn>
      <IconBtn
        title="Send email"
        onClick={(e) => {
          e.stopPropagation();
          deliver.mutate({ id: quoteId, channel: "email" });
        }}
      >
        <Mail className="h-4 w-4" />
      </IconBtn>
      <IconBtn
        title="Send SMS"
        onClick={(e) => {
          e.stopPropagation();
          deliver.mutate({ id: quoteId, channel: "sms" });
        }}
      >
        <MessageSquare className="h-4 w-4" />
      </IconBtn>
      <IconBtn
        title="Open quote"
        onClick={(e) => {
          e.stopPropagation();
          window.open(`/quote/${token}`, "_blank");
        }}
      >
        <ExternalLink className="h-4 w-4" />
      </IconBtn>
    </>
  );
}

function IconBtn({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
    >
      {children}
    </button>
  );
}

function QuoteDetailDialog({ id, onClose }: { id: number | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data: quote } = trpc.quotes.getById.useQuery(
    { id: id ?? 0 },
    { enabled: id !== null },
  );
  const approve = trpc.quotes.approve.useMutation({
    onSuccess: () => {
      utils.quotes.getById.invalidate();
      utils.quotes.list.invalidate();
      utils.quotes.dashboard.invalidate();
      toast.success("Quote approved");
    },
    onError: (e) => toast.error(e.message),
  });
  const decline = trpc.quotes.decline.useMutation({
    onSuccess: () => {
      utils.quotes.getById.invalidate();
      utils.quotes.list.invalidate();
      utils.quotes.dashboard.invalidate();
      toast.success("Quote declined");
    },
    onError: (e) => toast.error(e.message),
  });
  const retryHcp = trpc.quotes.retryHcpSync.useMutation({
    onSuccess: () => {
      utils.quotes.getById.invalidate();
      utils.quotes.list.invalidate();
      toast.success("Housecall Pro sync retried");
    },
    onError: (e) => toast.error(e.message),
  });
  const copyLink = () => {
    if (!quote) return;
    navigator.clipboard.writeText(`${window.location.origin}/quote/${quote.publicToken}`);
    toast.success("Quote link copied");
  };
  const busy = approve.isPending || decline.isPending;
  return (
    <Dialog open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            {quote ? `Quote for ${quote.customerName}` : "Quote"}
          </DialogTitle>
        </DialogHeader>
        {quote ? (
          <div className="space-y-5">
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <Detail label="Company" value={quote.customerCompany || "—"} />
              <Detail label="Email" value={quote.customerEmail || "—"} />
              <Detail label="Phone" value={quote.customerPhone || "—"} />
              <Detail label="Alt phone" value={quote.customerAltPhone || "—"} />
              <Detail
                label="OK to text"
                value={quote.okToText === null || quote.okToText === undefined ? "—" : quote.okToText ? "Yes" : "No"}
              />
              <Detail
                label="Address"
                value={
                  [quote.propertyAddress, quote.propertyCity, quote.propertyState, quote.propertyZip]
                    .filter(Boolean)
                    .join(", ") || "—"
                }
              />
              <Detail label="Lead source" value={quote.leadSource || "—"} />
              <Detail label="Project type" value={quote.projectType || "—"} />
              <Detail label="Floors" value={quote.floors || "—"} />
              <Detail label="Discount group" value={quote.discountGroup || "—"} />
              <Detail label="Status" value={quoteStatusLabel(quote.status)} />
              <Detail label="Created" value={formatDate(quote.createdAt)} />
              <Detail label="Expires" value={formatDate(quote.expiresAt)} />
              <Detail label="GHL sync" value={quote.ghlStatus || "not sent"} />
              <Detail label="Housecall Pro" value={quote.hcpSyncStatus || "not synced"} />
            </div>

            {/* Housecall Pro sync detail + manual retry */}
            <div className="rounded-lg border bg-secondary/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-muted-foreground mb-1">
                    Housecall Pro sync
                  </div>
                  <div className="text-sm text-foreground">
                    {quote.hcpSyncStatus === "synced" ? (
                      <span className="text-emerald-600">Synced</span>
                    ) : quote.hcpSyncStatus === "error" ? (
                      <span className="text-destructive">Error</span>
                    ) : quote.hcpSyncStatus === "disabled" || !quote.hcpSyncStatus ? (
                      <span className="text-muted-foreground">Not synced</span>
                    ) : (
                      <span className="text-muted-foreground">{quote.hcpSyncStatus}</span>
                    )}
                    {quote.hcpLastSyncedAt && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {new Date(quote.hcpLastSyncedAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                  {quote.hcpSyncError && (
                    <p className="mt-1 text-xs text-destructive break-words">{quote.hcpSyncError}</p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground font-mono">
                    {quote.hcpCustomerId && <span>cust: {quote.hcpCustomerId}</span>}
                    {quote.hcpEstimateId && <span>est: {quote.hcpEstimateId}</span>}
                    {quote.hcpJobId && <span>job: {quote.hcpJobId}</span>}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="bg-card shrink-0"
                  disabled={retryHcp.isPending}
                  onClick={() => retryHcp.mutate({ id: quote.id })}
                >
                  {retryHcp.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Retry sync
                </Button>
              </div>
            </div>

            {/* Shareable quote link */}
            <div className="rounded-lg border bg-secondary/30 p-3">
              <div className="text-xs font-semibold text-muted-foreground mb-1.5">Quote link</div>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={`${window.location.origin}/quote/${quote.publicToken}`}
                  className="flex-1 rounded-md border bg-card px-2.5 py-1.5 text-xs font-mono text-muted-foreground focus:outline-none"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button type="button" variant="outline" size="sm" className="bg-card shrink-0" onClick={copyLink}>
                  <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="bg-card shrink-0"
                  onClick={() => window.open(`/quote/${quote.publicToken}`, "_blank")}
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open
                </Button>
              </div>
            </div>

            {/* Approve / Decline */}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                disabled={busy || quote.status === "accepted"}
                onClick={() => approve.mutate({ id: quote.id })}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Check className="h-4 w-4 mr-1.5" />
                {quote.status === "accepted" ? "Approved" : "Approve quote"}
              </Button>
              <Button
                type="button"
                disabled={busy || quote.status === "declined"}
                onClick={() => decline.mutate({ id: quote.id })}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                <X className="h-4 w-4 mr-1.5" />
                {quote.status === "declined" ? "Declined" : "Decline quote"}
              </Button>
              {busy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-3">Pricing tiers</h3>
              <TierCards
                tiers={quote.computedTiers}
                primaryColor={quote.brandSnapshot.primaryColor}
                accentColor={quote.brandSnapshot.accentColor}
                selectedKey={quote.selectedTierKey}
              />
            </div>
          </div>
        ) : (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary/40 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium capitalize-first">{value}</div>
    </div>
  );
}
