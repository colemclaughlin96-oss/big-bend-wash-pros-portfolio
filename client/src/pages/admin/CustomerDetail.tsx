import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { Link, useRoute, useLocation } from "wouter";
import {
  buildCustomerTimeline,
  type TimelineEventType,
} from "../../../../shared/timeline";
import {
  Loader2,
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  ExternalLink,
  Save,
  Pencil,
  Copy,
  DoorOpen,
  Building2,
  StickyNote,
  Trash2,
  Send,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type CustomerForm = {
  name: string;
  company: string;
  email: string;
  phone: string;
  altPhone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  hcpCustomerUrl: string;
};

const STATUS_OPTIONS = [
  { value: "pending", label: "Quote Sent" },
  { value: "accepted", label: "Approved" },
  { value: "declined", label: "Declined" },
] as const;

export default function CustomerDetail() {
  const [, params] = useRoute("/admin/customers/:id");
  const id = params ? Number(params.id) : 0;
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.quotes.customerDetail.useQuery(
    { id },
    { enabled: id > 0 },
  );

  const [, navigate] = useLocation();
  const [notes, setNotes] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  useEffect(() => {
    if (data?.customer) setNotes(data.customer.notes ?? "");
  }, [data?.customer]);

  const deleteCustomer = trpc.quotes.deleteCustomer.useMutation({
    onSuccess: () => {
      utils.quotes.customers.invalidate();
      utils.quotes.list.invalidate();
      toast.success("Contact deleted");
      navigate("/admin/customers");
    },
    onError: (e) => toast.error(e.message),
  });

  const saveNotes = trpc.quotes.updateCustomer.useMutation({
    onSuccess: () => {
      utils.quotes.customerDetail.invalidate({ id });
      toast.success("Notes saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const setStatus = trpc.quotes.setStatus.useMutation({
    onSuccess: (_res, vars) => {
      utils.quotes.customerDetail.invalidate({ id });
      utils.quotes.list.invalidate();
      toast.success(
        vars.status === "accepted"
          ? "Quote approved"
          : vars.status === "declined"
            ? "Quote declined"
            : "Status updated",
      );
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { customer, quotes } = data;
  const addressLine = [customer.address, customer.city, customer.state, customer.zip]
    .filter(Boolean)
    .join(", ");
  const mapsHref = addressLine
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressLine)}`
    : null;

  // Pull supplemental property/intake facts from the most recent quote, if present.
  const latestQuote = quotes[0];
  const propertyFacts: { label: string; value: string }[] = [];
  if (latestQuote) {
    if (latestQuote.squareFeetActual)
      propertyFacts.push({
        label: "Building size (actual)",
        value: `${latestQuote.squareFeetActual} sq. ft.`,
      });
    if (latestQuote.squareFeetEstimate)
      propertyFacts.push({
        label: "Building size (est.)",
        value: latestQuote.squareFeetEstimate,
      });
    if (latestQuote.projectType)
      propertyFacts.push({
        label: "Type",
        value:
          latestQuote.projectType.charAt(0).toUpperCase() +
          latestQuote.projectType.slice(1),
      });
    if (latestQuote.floors)
      propertyFacts.push({ label: "Stories / floors", value: latestQuote.floors });
    if (latestQuote.basement !== null && latestQuote.basement !== undefined)
      propertyFacts.push({
        label: "Basement",
        value: latestQuote.basement ? "Yes" : "No",
      });
    if (customer.leadSource)
      propertyFacts.push({ label: "Lead source", value: customer.leadSource });
  }

  // Build the merged activity timeline across all of this customer's quotes.
  const timeline = buildCustomerTimeline(
    quotes.map((q) => ({
      id: q.id,
      selectedTierKey: q.selectedTierKey,
      computedTiers: q.computedTiers,
      createdAt: q.createdAt,
      viewedAt: q.viewedAt,
      acceptedAt: q.acceptedAt,
      declinedAt: q.declinedAt,
      expiresAt: q.expiresAt,
      status: q.status,
    })),
  );

  return (
    <div className="max-w-4xl mx-auto">
      <Link
        href="/admin/customers"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to customers
      </Link>

      {/* Premium Customer Information card */}
      <div className="rounded-xl border bg-card overflow-hidden shadow-sm mb-6">
        {/* Header bar */}
        <div className="flex items-center justify-between bg-primary px-5 py-3.5 text-primary-foreground">
          <h1 className="font-display text-base font-bold tracking-wide uppercase">
            Customer Information
          </h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setEditOpen(true)}
              title="Edit customer"
              className="rounded-md p-1.5 hover:bg-white/15 transition-colors active:scale-95"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => setDeleteOpen(true)}
              title="Delete contact"
              className="rounded-md p-1.5 hover:bg-white/15 transition-colors active:scale-95"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {/* Contact section */}
          <SectionLabel>Contact</SectionLabel>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground">
                  <span className="text-sm font-semibold">
                    {customer.name.charAt(0).toUpperCase()}
                  </span>
                </span>
                <span className="font-display text-lg font-semibold">
                  {customer.name}
                </span>
              </div>
              {customer.company && (
                <div className="pl-9 text-sm text-muted-foreground">
                  {customer.company}
                </div>
              )}
              {customer.email && (
                <a
                  href={`mailto:${customer.email}`}
                  className="flex items-center gap-2 pl-9 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Mail className="h-4 w-4 text-emerald-600" /> {customer.email}
                </a>
              )}
              {customer.phone && (
                <a
                  href={`tel:${customer.phone}`}
                  className="flex items-center gap-2 pl-9 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Phone className="h-4 w-4 text-emerald-600" /> {customer.phone}
                </a>
              )}
              {customer.altPhone && (
                <a
                  href={`tel:${customer.altPhone}`}
                  className="flex items-center gap-2 pl-9 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Phone className="h-3.5 w-3.5 text-emerald-600/70" /> {customer.altPhone}{" "}
                  <span className="text-muted-foreground/60">(alt)</span>
                </a>
              )}
            </div>

            {/* HouseCall Pro button */}
            <div className="shrink-0">
              {customer.hcpCustomerUrl ? (
                <a
                  href={customer.hcpCustomerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border-2 border-primary px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5 transition-colors active:scale-[0.98]"
                >
                  Open in HouseCall Pro <DoorOpen className="h-4 w-4" />
                </a>
              ) : (
                <button
                  onClick={() =>
                    toast.info(
                      "Connect HouseCall Pro in Connections, then add this customer's HCP link via Edit.",
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                >
                  Open in HouseCall Pro <DoorOpen className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Property section */}
          {(addressLine || propertyFacts.length > 0) && (
            <>
              <div className="my-5 border-t" />
              <SectionLabel>Property</SectionLabel>
              {addressLine && (
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-emerald-50 text-emerald-600">
                    <MapPin className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    {mapsHref ? (
                      <a
                        href={mapsHref}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 font-medium hover:text-primary hover:underline transition-colors"
                      >
                        {addressLine}
                        <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                      </a>
                    ) : (
                      <span className="font-medium">{addressLine}</span>
                    )}
                    {mapsHref && (
                      <div className="text-xs text-muted-foreground">
                        Opens in Google Maps
                      </div>
                    )}
                  </div>
                </div>
              )}
              {propertyFacts.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 pl-9 sm:grid-cols-3">
                  {propertyFacts.map((f) => (
                    <div key={f.label}>
                      <div className="text-xs font-semibold text-muted-foreground">
                        {f.label}
                      </div>
                      <div className="text-sm">{f.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Internal notes */}
          <div className="my-5 border-t" />
          <SectionLabel>
            <span className="inline-flex items-center gap-1.5">
              <StickyNote className="h-3.5 w-3.5" /> Internal notes
            </span>
          </SectionLabel>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Add private notes about this customer…"
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={() => saveNotes.mutate({ id, notes })}
            disabled={saveNotes.isPending}
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-secondary px-3 py-1.5 text-sm font-medium hover:bg-secondary/70 transition-colors disabled:opacity-50 active:scale-[0.98]"
          >
            {saveNotes.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save notes
          </button>
        </div>
      </div>

      {/* Activity timeline */}
      <div className="rounded-xl border bg-card overflow-hidden shadow-sm mb-6">
        <div className="flex items-center gap-2 border-b px-5 py-3.5">
          <Activity className="h-4 w-4 text-primary" />
          <h2 className="font-display text-base font-semibold">Activity timeline</h2>
        </div>
        <div className="p-5">
          {timeline.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No activity yet. Events appear here when a quote is sent, viewed, or
              approved/declined.
            </div>
          ) : (
            <ol className="relative space-y-5">
              {timeline.map((ev, i) => {
                const style = TIMELINE_STYLE[ev.type];
                const Icon = style.icon;
                return (
                  <li key={`${ev.quoteId}-${ev.type}-${i}`} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${style.badge}`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      {i < timeline.length - 1 && (
                        <span className="mt-1 w-px flex-1 bg-border" aria-hidden />
                      )}
                    </div>
                    <div className="min-w-0 pb-1">
                      <div className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                        {style.label(ev.label)}
                        {ev.detail && (
                          <span className="text-xs font-normal text-muted-foreground">
                            {ev.detail}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDateTime(ev.at)} · Quote #{ev.quoteId}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>

      <h2 className="font-display text-lg font-semibold mb-3">
        Quotes ({quotes.length})
      </h2>
      <div className="rounded-xl border bg-card overflow-hidden">
        {quotes.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            No quotes for this customer yet.
          </div>
        ) : (
          <div className="divide-y">
            {quotes.map((q) => {
              const tier = q.computedTiers.find((t) => t.key === q.selectedTierKey);
              const display =
                tier ?? q.computedTiers[Math.floor(q.computedTiers.length / 2)];
              const copyLink = () => {
                navigator.clipboard.writeText(
                  `${window.location.origin}/quote/${q.publicToken}`,
                );
                toast.success("Quote link copied");
              };
              // 'expired' is auto-computed; map it to pending for the manual control.
              const dropdownValue = q.status === "expired" ? "pending" : q.status;
              const isUpdating =
                setStatus.isPending && setStatus.variables?.id === q.id;
              return (
                <div
                  key={q.id}
                  className="flex flex-col gap-3 px-5 py-3.5 hover:bg-secondary/30 transition-colors sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {formatDate(q.createdAt)}
                      {q.status === "expired" && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          expired
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm">
                      {q.serviceSelections.map((s) => s.name).join(", ")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <div className="text-right text-sm">
                      <div className="font-semibold">
                        {display ? formatCurrency(display.total) : "—"}
                      </div>
                      {tier && (
                        <div className="text-xs text-muted-foreground">{tier.name}</div>
                      )}
                    </div>
                    <Select
                      value={dropdownValue}
                      onValueChange={(value) =>
                        setStatus.mutate({
                          id: q.id,
                          status: value as "pending" | "accepted" | "declined",
                        })
                      }
                      disabled={isUpdating}
                    >
                      <SelectTrigger
                        className={`h-8 w-[124px] text-xs font-semibold ${statusTriggerCls(dropdownValue)}`}
                      >
                        {isUpdating ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <SelectValue />
                        )}
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <button
                      onClick={copyLink}
                      title="Copy quote link"
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors active:scale-95"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <a
                      href={`/quote/${q.publicToken}`}
                      target="_blank"
                      rel="noreferrer"
                      title="Open quote"
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors active:scale-95"
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

      <EditCustomerDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        id={id}
        initial={{
          name: customer.name ?? "",
          company: customer.company ?? "",
          email: customer.email ?? "",
          phone: customer.phone ?? "",
          altPhone: customer.altPhone ?? "",
          address: customer.address ?? "",
          city: customer.city ?? "",
          state: customer.state ?? "",
          zip: customer.zip ?? "",
          hcpCustomerUrl: customer.hcpCustomerUrl ?? "",
        }}
        onSaved={() => {
          utils.quotes.customerDetail.invalidate({ id });
          utils.quotes.customers.invalidate();
        }}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this contact?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes <strong>{customer.name}</strong> and all{" "}
              {quotes.length} of their quote{quotes.length === 1 ? "" : "s"}. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteCustomer.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                deleteCustomer.mutate({ id });
              }}
              disabled={deleteCustomer.isPending}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deleteCustomer.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1.5" />
              )}
              Delete contact
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const TIMELINE_STYLE: Record<
  TimelineEventType,
  {
    icon: typeof Send;
    badge: string;
    label: (text: string) => React.ReactNode;
  }
> = {
  sent: {
    icon: Send,
    badge: "bg-blue-50 text-blue-600",
    label: (t) => <span>{t}</span>,
  },
  viewed: {
    icon: Eye,
    badge: "bg-violet-50 text-violet-600",
    label: (t) => <span>{t}</span>,
  },
  approved: {
    icon: CheckCircle2,
    badge: "bg-emerald-50 text-emerald-600",
    label: (t) => <span className="text-emerald-700">{t}</span>,
  },
  declined: {
    icon: XCircle,
    badge: "bg-red-50 text-red-600",
    label: (t) => <span className="text-red-700">{t}</span>,
  },
  expired: {
    icon: Clock,
    badge: "bg-amber-50 text-amber-600",
    label: (t) => <span className="text-amber-700">{t}</span>,
  },
};

function statusTriggerCls(status: string): string {
  switch (status) {
    case "accepted":
      return "border-emerald-300 bg-emerald-50 text-emerald-700";
    case "declined":
      return "border-red-300 bg-red-50 text-red-700";
    default:
      return "border-blue-300 bg-blue-50 text-blue-700";
  }
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

function EditCustomerDialog({
  open,
  onClose,
  id,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  id: number;
  initial: CustomerForm;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<CustomerForm>(initial);
  useEffect(() => {
    if (open) setForm(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const update = trpc.quotes.updateCustomer.useMutation({
    onSuccess: () => {
      onSaved();
      toast.success("Customer updated");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const set = (key: keyof CustomerForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    update.mutate({ id, ...form });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">Edit customer</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2">
            <input className={inputCls} value={form.name} onChange={set("name")} />
          </Field>
          <Field label="Company" className="sm:col-span-2">
            <input className={inputCls} value={form.company} onChange={set("company")} />
          </Field>
          <Field label="Email">
            <input className={inputCls} value={form.email} onChange={set("email")} />
          </Field>
          <Field label="Phone">
            <input className={inputCls} value={form.phone} onChange={set("phone")} />
          </Field>
          <Field label="Alt phone">
            <input className={inputCls} value={form.altPhone} onChange={set("altPhone")} />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <input className={inputCls} value={form.address} onChange={set("address")} />
          </Field>
          <Field label="City">
            <input className={inputCls} value={form.city} onChange={set("city")} />
          </Field>
          <Field label="State">
            <input className={inputCls} value={form.state} onChange={set("state")} />
          </Field>
          <Field label="ZIP">
            <input className={inputCls} value={form.zip} onChange={set("zip")} />
          </Field>
          <Field label="HouseCall Pro customer link" className="sm:col-span-2">
            <input
              className={inputCls}
              placeholder="https://pro.housecallpro.com/app/customers/…"
              value={form.hcpCustomerUrl}
              onChange={set("hcpCustomerUrl")}
            />
            <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Building2 className="h-3 w-3" /> Paste this customer's HCP profile URL to
              enable the "Open in HouseCall Pro" button.
            </p>
          </Field>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            className="bg-card"
            onClick={onClose}
            disabled={update.isPending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={update.isPending}>
            {update.isPending ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1.5" />
            )}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const inputCls =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
