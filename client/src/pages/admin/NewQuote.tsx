import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatCurrency } from "@/lib/format";
import { useLocation } from "wouter";
import { computeTiers } from "@shared/pricing";
import type { ComputedTier } from "@shared/types";
import {
  Loader2,
  FilePlus2,
  Check,
  Copy,
  ExternalLink,
  Send,
  Pencil,
  Star,
} from "lucide-react";
import { toast } from "sonner";

type DraftQuote = {
  id: number;
  publicToken: string;
  status: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  propertyAddress: string | null;
  propertyCity: string | null;
  propertyState: string | null;
  propertyZip: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  computedTiers: ComputedTier[];
};

const toNum = (v: string | undefined) => {
  const n = parseInt(v ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const LEAD_SOURCES = [
  "Google Search",
  "Google Ads",
  "Facebook / Instagram",
  "Referral",
  "Repeat Customer",
  "Nextdoor",
  "Yard Sign / Vehicle",
  "Other",
];

const DISCOUNT_GROUPS = [
  "None",
  "Veteran",
  "First Responder",
  "Teacher",
  "Senior",
];

const FLOOR_OPTIONS = ["1 Story", "2 Story", "3 Story", "4+ Story"];

export default function NewQuote() {
  const [, navigate] = useLocation();
  const { data: settings } = trpc.settings.getPublic.useQuery();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    customerCompany: "",
    customerPhone: "",
    customerAltPhone: "",
    customerEmail: "",
    propertyAddress: "",
    propertyCity: "",
    propertyState: "",
    propertyZip: "",
    leadSource: "",
    floors: "1 Story",
    discountGroup: "None",
    squareFeetActual: "",
    squareFeetEstimate: "",
  });
  const [okToText, setOkToText] = useState<boolean | null>(null);
  const [basement, setBasement] = useState<boolean | null>(null);
  const [projectType, setProjectType] = useState<"residential" | "commercial">("residential");
  const [bedrooms, setBedrooms] = useState("3");
  const [bathrooms, setBathrooms] = useState("2");
  // After Generate, the draft + its public URL. `sent` flips true once pushed to CRM.
  const [draft, setDraft] = useState<{ url: string; quote: DraftQuote } | null>(null);
  const [sent, setSent] = useState(false);
  // Whether the CRM push actually succeeded on send (vs. GHL not connected).
  const [ghlPushed, setGhlPushed] = useState(false);
  // When true, the form is shown again to edit an existing draft (vs. creating new).
  const [editing, setEditing] = useState(false);

  const tiers = settings?.tiers ?? [];

  // Live preview of tiers from the additive model
  const preview = useMemo(() => {
    if (tiers.length === 0) return [];
    return computeTiers(tiers, { bedrooms: toNum(bedrooms), bathrooms: toNum(bathrooms) });
  }, [tiers, bedrooms, bathrooms]);

  const create = trpc.quotes.createInternal.useMutation({
    onSuccess: (res) => {
      setDraft({ url: res.url, quote: res.quote as DraftQuote });
      setSent(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateDraft = trpc.quotes.updateDraft.useMutation({
    onSuccess: (res) => {
      setDraft((d) => (d ? { ...d, quote: res.quote as DraftQuote } : d));
      setEditing(false);
      toast.success("Draft updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const sendQuote = trpc.quotes.sendQuote.useMutation({
    onSuccess: (res) => {
      setDraft((d) => (d ? { ...d, quote: res.quote as DraftQuote } : d));
      setSent(true);
      setGhlPushed(Boolean(res.ghlOk));
      toast.success(
        res.ghlOk
          ? "Quote sent — contact pushed into your GoHighLevel pipeline."
          : "Quote marked sent. (GoHighLevel not connected — nothing was pushed.)",
      );
    },
    onError: (e) => toast.error(e.message),
  });

  const resetAll = () => {
    setDraft(null);
    setSent(false);
    setGhlPushed(false);
    setEditing(false);
    setBedrooms("3");
    setBathrooms("2");
    setOkToText(null);
    setBasement(null);
    setProjectType("residential");
    setForm({
      firstName: "",
      lastName: "",
      customerCompany: "",
      customerPhone: "",
      customerAltPhone: "",
      customerEmail: "",
      propertyAddress: "",
      propertyCity: "",
      propertyState: "",
      propertyZip: "",
      leadSource: "",
      floors: "1 Story",
      discountGroup: "None",
      squareFeetActual: "",
      squareFeetEstimate: "",
    });
  };

  // Common payload from the form (used for both create and updateDraft).
  const formPayload = () => ({
    customerName: fullName,
    customerCompany: form.customerCompany || undefined,
    customerEmail: form.customerEmail || "",
    customerPhone: form.customerPhone || undefined,
    customerAltPhone: form.customerAltPhone || undefined,
    okToText: okToText ?? undefined,
    propertyAddress: form.propertyAddress || undefined,
    propertyCity: form.propertyCity || undefined,
    propertyState: form.propertyState || undefined,
    propertyZip: form.propertyZip || undefined,
    leadSource: form.leadSource || undefined,
    projectType,
    floors: form.floors || undefined,
    discountGroup:
      form.discountGroup && form.discountGroup !== "None" ? form.discountGroup : undefined,
    squareFeetActual: form.squareFeetActual || undefined,
    squareFeetEstimate: form.squareFeetEstimate || undefined,
    basement: basement ?? undefined,
    bedrooms: toNum(bedrooms),
    bathrooms: toNum(bathrooms),
  });

  const fullName = `${form.firstName} ${form.lastName}`.trim();
  const canSubmit = form.firstName.trim().length > 0;

  // Generate (no draft yet) creates a draft; Save (draft exists, editing) updates it.
  const submit = () => {
    if (draft) {
      updateDraft.mutate({ id: draft.quote.id, ...formPayload() });
    } else {
      create.mutate({ ...formPayload(), origin: window.location.origin });
    }
  };

  const busy = create.isPending || updateDraft.isPending;
  // Show the inline review screen once a draft exists and we're not editing it.
  const showReview = draft && !editing;

  if (showReview && draft) {
    const q = draft.quote;
    const addr = [q.propertyAddress, q.propertyCity, q.propertyState, q.propertyZip]
      .filter(Boolean)
      .join(", ");
    return (
      <div className="max-w-3xl mx-auto">
        {/* Header / status */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl font-semibold">
                {sent ? "Quote sent" : "Review quote"}
              </h1>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  sent
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {sent ? <Check className="h-3 w-3" /> : null}
                {sent ? "Sent" : "Draft"}
              </span>
            </div>
            <p className="mt-1 text-muted-foreground">
              {sent
                ? ghlPushed
                  ? "This quote is live and the contact was pushed into your GoHighLevel pipeline."
                  : "This quote is live. GoHighLevel isn't connected yet, so nothing was pushed — connect it in Settings → Connections to auto-deliver next time."
                : "Verify the details below, then send it. Nothing reaches GoHighLevel until you click Send."}
            </p>
          </div>
        </div>

        {/* Customer + property summary */}
        <div className="rounded-xl border bg-card p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Customer
              </h2>
              <p className="mt-1 font-medium">{q.customerName}</p>
              {q.customerPhone && (
                <p className="text-sm text-muted-foreground">{q.customerPhone}</p>
              )}
              {q.customerEmail && (
                <p className="text-sm text-muted-foreground">{q.customerEmail}</p>
              )}
            </div>
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Property
              </h2>
              <p className="mt-1 text-sm">{addr || "—"}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {q.bedrooms ?? 0} bed · {q.bathrooms ?? 0} bath
              </p>
            </div>
          </div>
        </div>

        {/* Package cards */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {q.computedTiers.map((t) => (
            <div
              key={t.key}
              className={`rounded-xl border p-4 ${
                t.highlighted ? "border-primary bg-primary/5" : "bg-card"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-display font-semibold">{t.name}</span>
                {t.highlighted && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    <Star className="h-3 w-3 fill-current" /> Popular
                  </span>
                )}
              </div>
              <p className="mt-1 font-display text-2xl font-bold">
                {formatCurrency(t.total)}
              </p>
              {t.description && (
                <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
              )}
            </div>
          ))}
        </div>

        {/* Public link */}
        <div className="mt-4 flex items-center gap-2 rounded-lg border bg-secondary/40 p-2">
          <input
            readOnly
            value={draft.url}
            className="flex-1 bg-transparent px-2 text-sm focus:outline-none"
          />
          <button
            onClick={() => {
              navigator.clipboard.writeText(draft.url);
              toast.success("Link copied");
            }}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-secondary transition-colors"
          >
            <Copy className="h-4 w-4" /> Copy
          </button>
          <a
            href={draft.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-secondary transition-colors"
          >
            <ExternalLink className="h-4 w-4" /> Open
          </a>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          {!sent ? (
            <>
              <button
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-secondary transition-colors active:scale-[0.98]"
              >
                <Pencil className="h-4 w-4" /> Edit quote
              </button>
              <button
                onClick={() =>
                  sendQuote.mutate({ id: draft.quote.id, origin: window.location.origin })
                }
                disabled={sendQuote.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:shadow transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {sendQuote.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send quote
              </button>
            </>
          ) : (
            <>
              <button
                onClick={resetAll}
                className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-secondary transition-colors active:scale-[0.98]"
              >
                <FilePlus2 className="h-4 w-4" /> New quote
              </button>
              <button
                onClick={() => navigate("/admin/quotes")}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground active:scale-[0.98]"
              >
                View all quotes
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold">
          {editing ? "Edit quote" : "New quote"}
        </h1>
        <p className="text-muted-foreground">
          {editing
            ? "Adjust the details, then save to update the draft. It won't be sent until you click Send on the review screen."
            : "Take the customer's details, build their quote, and review it before sending. Nothing reaches GoHighLevel until you click Send."}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Form */}
        <div className="lg:col-span-3 space-y-6">
          {/* Contact */}
          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-display text-base font-semibold mb-4">
              Contact information
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First name *">
                <input
                  className="field-input"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                />
              </Field>
              <Field label="Last name">
                <input
                  className="field-input"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                />
              </Field>
              <Field label="Company name">
                <input
                  className="field-input"
                  value={form.customerCompany}
                  onChange={(e) => setForm({ ...form, customerCompany: e.target.value })}
                />
              </Field>
              <Field label="Primary phone">
                <input
                  className="field-input"
                  value={form.customerPhone}
                  onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
                />
              </Field>
              <div className="sm:col-span-2">
                <span className="text-xs font-medium text-muted-foreground">
                  OK to contact via text / SMS?
                </span>
                <div className="mt-1.5 inline-flex overflow-hidden rounded-lg border">
                  <button
                    type="button"
                    onClick={() => setOkToText(true)}
                    className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                      okToText === true
                        ? "bg-primary text-primary-foreground"
                        : "bg-transparent hover:bg-secondary/50"
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setOkToText(false)}
                    className={`px-4 py-1.5 text-sm font-medium border-l transition-colors ${
                      okToText === false
                        ? "bg-primary text-primary-foreground"
                        : "bg-transparent hover:bg-secondary/50"
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>
              <Field label="Alternate phone">
                <input
                  className="field-input"
                  value={form.customerAltPhone}
                  onChange={(e) => setForm({ ...form, customerAltPhone: e.target.value })}
                />
              </Field>
              <Field label="Email address">
                <input
                  className="field-input"
                  type="email"
                  value={form.customerEmail}
                  onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
                />
              </Field>
              <Field label="Street address">
                <input
                  className="field-input"
                  value={form.propertyAddress}
                  onChange={(e) => setForm({ ...form, propertyAddress: e.target.value })}
                />
              </Field>
              <Field label="City">
                <input
                  className="field-input"
                  value={form.propertyCity}
                  onChange={(e) => setForm({ ...form, propertyCity: e.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="State">
                  <input
                    className="field-input"
                    value={form.propertyState}
                    onChange={(e) => setForm({ ...form, propertyState: e.target.value })}
                  />
                </Field>
                <Field label="Zip">
                  <input
                    className="field-input"
                    value={form.propertyZip}
                    onChange={(e) => setForm({ ...form, propertyZip: e.target.value })}
                  />
                </Field>
              </div>
            </div>
          </section>

          {/* Home size — drives pricing */}
          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-display text-base font-semibold mb-1">Home size</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Bedrooms and bathrooms determine the price of every package.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Bedrooms">
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  className="field-input"
                  value={bedrooms}
                  onChange={(e) => setBedrooms(e.target.value)}
                />
              </Field>
              <Field label="Bathrooms">
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  className="field-input"
                  value={bathrooms}
                  onChange={(e) => setBathrooms(e.target.value)}
                />
              </Field>
            </div>
          </section>

          {/* Property information */}
          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-display text-base font-semibold mb-4">
              Property information
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Where did you hear about us?">
                <select
                  className="field-input"
                  value={form.leadSource}
                  onChange={(e) => setForm({ ...form, leadSource: e.target.value })}
                >
                  <option value="">Please select</option>
                  {LEAD_SOURCES.map((src) => (
                    <option key={src} value={src}>
                      {src}
                    </option>
                  ))}
                </select>
              </Field>
              <div>
                <span className="text-xs font-medium text-muted-foreground">
                  Project type
                </span>
                <div className="mt-1.5 inline-flex overflow-hidden rounded-lg border">
                  <button
                    type="button"
                    onClick={() => setProjectType("residential")}
                    className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                      projectType === "residential"
                        ? "bg-primary text-primary-foreground"
                        : "bg-transparent hover:bg-secondary/50"
                    }`}
                  >
                    Residential
                  </button>
                  <button
                    type="button"
                    onClick={() => setProjectType("commercial")}
                    className={`px-4 py-1.5 text-sm font-medium border-l transition-colors ${
                      projectType === "commercial"
                        ? "bg-primary text-primary-foreground"
                        : "bg-transparent hover:bg-secondary/50"
                    }`}
                  >
                    Commercial
                  </button>
                </div>
              </div>
              <Field label="Number of floors (above ground)">
                <select
                  className="field-input"
                  value={form.floors}
                  onChange={(e) => setForm({ ...form, floors: e.target.value })}
                >
                  {FLOOR_OPTIONS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Veteran, First Responder, Teacher or Senior?">
                <select
                  className="field-input"
                  value={form.discountGroup}
                  onChange={(e) => setForm({ ...form, discountGroup: e.target.value })}
                >
                  {DISCOUNT_GROUPS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Building size (actual sq. ft.)">
                <input
                  className="field-input"
                  placeholder="e.g. 2800"
                  value={form.squareFeetActual}
                  onChange={(e) => setForm({ ...form, squareFeetActual: e.target.value })}
                />
              </Field>
              <Field label="Building size (estimated range)">
                <input
                  className="field-input"
                  placeholder="e.g. 2501 - 3000 sq ft"
                  value={form.squareFeetEstimate}
                  onChange={(e) =>
                    setForm({ ...form, squareFeetEstimate: e.target.value })
                  }
                />
              </Field>
              <Field label="Basement?">
                <div className="inline-flex overflow-hidden rounded-lg border">
                  <button
                    type="button"
                    onClick={() => setBasement(true)}
                    className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                      basement === true
                        ? "bg-primary text-primary-foreground"
                        : "bg-transparent hover:bg-secondary/50"
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setBasement(false)}
                    className={`px-4 py-1.5 text-sm font-medium border-l transition-colors ${
                      basement === false
                        ? "bg-primary text-primary-foreground"
                        : "bg-transparent hover:bg-secondary/50"
                    }`}
                  >
                    No
                  </button>
                </div>
              </Field>
            </div>
          </section>
        </div>

        {/* Preview */}
        <div className="lg:col-span-2">
          <div className="sticky top-4 rounded-xl border bg-card p-5">
            <h2 className="font-display text-base font-semibold mb-4">Live pricing</h2>
            {preview.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Configure packages in Settings → Pricing to see pricing.
              </p>
            ) : (
              <div className="space-y-2">
                {preview.map((t) => (
                  <div
                    key={t.key}
                    className={`flex items-center justify-between rounded-lg border p-3 ${
                      t.highlighted ? "border-primary bg-primary/5" : ""
                    }`}
                  >
                    <span className="font-medium">{t.name}</span>
                    <span className="font-display text-lg font-semibold">
                      {formatCurrency(t.total)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={submit}
              disabled={!canSubmit || busy}
              className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:shadow transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : editing ? (
                <Check className="h-4 w-4" />
              ) : (
                <FilePlus2 className="h-4 w-4" />
              )}
              {editing ? "Save changes" : "Generate quote"}
            </button>
            {editing && (
              <button
                onClick={() => setEditing(false)}
                className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-secondary transition-colors active:scale-[0.98]"
              >
                Cancel
              </button>
            )}
            {!canSubmit && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Enter a first name to continue.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
