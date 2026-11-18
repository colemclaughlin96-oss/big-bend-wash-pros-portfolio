import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { BrandFrame } from "@/components/BrandFrame";
import { TierCards } from "@/components/TierCards";
import { formatCurrency } from "@/lib/format";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { computeTiers } from "@shared/pricing";
import {
  DEFAULT_FORM_FIELDS,
  type FormFieldConfig,
  type FormFieldKey,
} from "../../../drizzle/schema";

const STEPS = ["Your details", "Home size", "Your quote"];

const toNum = (v: string) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export default function QuoteForm() {
  const [, setLocation] = useLocation();
  const isEmbed =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("embed") === "1";
  const { data: settings } = trpc.settings.getPublic.useQuery();

  const brand = {
    companyName: settings?.companyName ?? "Example Home Services",
    logoUrl: settings?.logoUrl,
    primaryColor: settings?.primaryColor ?? "#0f4c5c",
    accentColor: settings?.accentColor ?? "#e9b949",
    backgroundColor: settings?.backgroundColor ?? "#f7f5f0",
    textColor: settings?.textColor ?? "#1c1917",
    cardColor: settings?.cardColor ?? "#ffffff",
    companyEmail: settings?.companyEmail,
    companyPhone: settings?.companyPhone,
  };
  const tiers = settings?.tiers ?? [];

  // Field configuration from Form Builder (fallback to defaults).
  const fieldConfig: FormFieldConfig[] =
    (settings?.formFields as FormFieldConfig[] | undefined)?.length
      ? (settings!.formFields as FormFieldConfig[])
      : DEFAULT_FORM_FIELDS;
  const fieldByKey = (key: FormFieldKey) => fieldConfig.find((f) => f.key === key);
  const isShown = (key: FormFieldKey) => fieldByKey(key)?.enabled ?? true;
  const isRequired = (key: FormFieldKey) => fieldByKey(key)?.required ?? false;
  const labelFor = (key: FormFieldKey, fallback: string) => {
    const f = fieldByKey(key);
    const base = f?.label || fallback;
    return f?.required ? `${base} *` : base;
  };

  const [step, setStep] = useState(0);
  const [customer, setCustomer] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    propertyAddress: "",
    propertyCity: "",
    propertyState: "",
    propertyZip: "",
  });
  const [bedrooms, setBedrooms] = useState("3");
  const [bathrooms, setBathrooms] = useState("2");

  // Live preview of the four packages from the additive engine.
  const previewTiers = useMemo(
    () => computeTiers(tiers, { bedrooms: toNum(bedrooms), bathrooms: toNum(bathrooms) }),
    [tiers, bedrooms, bathrooms],
  );

  const createQuote = trpc.quotes.create.useMutation();
  const [resultTiers, setResultTiers] = useState<typeof previewTiers | null>(null);

  // Step 0 is valid when every shown+required field has a value.
  const canProceedStep0 = (
    [
      "customerName",
      "customerEmail",
      "customerPhone",
      "propertyAddress",
      "propertyCity",
      "propertyState",
      "propertyZip",
    ] as FormFieldKey[]
  ).every((key) => {
    if (!isShown(key) || !isRequired(key)) return true;
    return (customer[key] ?? "").trim().length > 0;
  });
  const handleSubmit = async () => {
    try {
      const payload = {
        ...customer,
        customerEmail: customer.customerEmail || undefined,
        customerPhone: customer.customerPhone || undefined,
        bedrooms: toNum(bedrooms),
        bathrooms: toNum(bathrooms),
        origin: window.location.origin,
      };
      const res = await createQuote.mutateAsync(payload);
      setResultTiers(previewTiers);
      setStep(2);
      // Navigate to the shareable quote page
      setTimeout(() => setLocation(`/quote/${res.token}`), 900);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not generate quote");
    }
  };

  const stepPct = (step / (STEPS.length - 1)) * 100;

  return (
    <BrandFrame brand={brand} showFooter={false} hideHeader={isEmbed}>
      <div className={`max-w-3xl mx-auto px-4 sm:px-6 ${isEmbed ? "py-6" : "py-10"}`}>
        {isEmbed ? null : <button
          onClick={() => setLocation("/")}
          className="mb-6 inline-flex items-center gap-1.5 text-sm opacity-60 hover:opacity-100 transition-opacity"
        >
          <ArrowLeft className="h-4 w-4" /> Back to home
        </button>}

        {/* Glowing form shell */}
        <div className="brand-glow">
          <div className="card-elevated overflow-hidden" style={{ backgroundColor: brand.cardColor }}>
            {/* CTA pill header */}
            <div
              className="px-6 sm:px-10 pt-9 pb-7 text-center"
              style={{ background: `color-mix(in oklab, ${brand.primaryColor} 6%, transparent)` }}
            >
              <span
                className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-base font-semibold text-white shadow-lg"
                style={{ background: brand.primaryColor }}
              >
                Get Your Instant Quote
              </span>
              <p className="mt-3 text-sm opacity-60">
                Takes less than 60 seconds · 100% free · No obligation
              </p>

              {/* Stepper with connecting progress line */}
              <div className="relative mt-7 mx-auto max-w-md">
                <div className="absolute left-0 right-0 top-3.5 h-0.5" style={{ background: "#e7e5e0" }} />
                <div
                  className="absolute left-0 top-3.5 h-0.5 transition-all duration-300"
                  style={{ width: `${stepPct}%`, background: brand.primaryColor }}
                />
                <div className="relative flex items-start justify-between">
                  {STEPS.map((label, i) => (
                    <div key={label} className="flex flex-col items-center gap-1.5" style={{ width: "33%" }}>
                      <div
                        className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors ring-4"
                        style={
                          i <= step
                            ? { background: brand.primaryColor, color: "#fff", ['--tw-ring-color' as any]: brand.cardColor }
                            : { background: "#e7e5e0", color: "#8a8a82", ['--tw-ring-color' as any]: brand.cardColor }
                        }
                      >
                        {i < step ? <Check className="h-4 w-4" /> : i + 1}
                      </div>
                      <span className={`text-xs font-medium ${i <= step ? "" : "opacity-50"}`}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 sm:px-10 py-8">

        {/* Step 0: customer details */}
        {step === 0 && (
          <Section title="Tell us about you" subtitle="We'll use this to prepare and send your quote.">
            <div className="grid gap-4">
              {isShown("customerName") && (
                <Input
                  label={labelFor("customerName", "Full name")}
                  value={customer.customerName}
                  onChange={(v) => setCustomer({ ...customer, customerName: v })}
                  placeholder="Jane Doe"
                />
              )}
              {(isShown("customerEmail") || isShown("customerPhone")) && (
                <div className="grid sm:grid-cols-2 gap-4">
                  {isShown("customerEmail") && (
                    <Input
                      label={labelFor("customerEmail", "Email")}
                      type="email"
                      value={customer.customerEmail}
                      onChange={(v) => setCustomer({ ...customer, customerEmail: v })}
                      placeholder="jane@example.com"
                    />
                  )}
                  {isShown("customerPhone") && (
                    <Input
                      label={labelFor("customerPhone", "Phone")}
                      value={customer.customerPhone}
                      onChange={(v) => setCustomer({ ...customer, customerPhone: v })}
                      placeholder="(202) 555-0100"
                    />
                  )}
                </div>
              )}
              {isShown("propertyAddress") && (
                <Input
                  label={labelFor("propertyAddress", "Property address")}
                  value={customer.propertyAddress}
                  onChange={(v) => setCustomer({ ...customer, propertyAddress: v })}
                  placeholder="123 Main St"
                />
              )}
              {(isShown("propertyCity") || isShown("propertyState") || isShown("propertyZip")) && (
                <div className="grid sm:grid-cols-3 gap-4">
                  {isShown("propertyCity") && (
                    <Input
                      label={labelFor("propertyCity", "City")}
                      value={customer.propertyCity}
                      onChange={(v) => setCustomer({ ...customer, propertyCity: v })}
                    />
                  )}
                  {isShown("propertyState") && (
                    <Input
                      label={labelFor("propertyState", "State")}
                      value={customer.propertyState}
                      onChange={(v) => setCustomer({ ...customer, propertyState: v })}
                    />
                  )}
                  {isShown("propertyZip") && (
                    <Input
                      label={labelFor("propertyZip", "ZIP")}
                      value={customer.propertyZip}
                      onChange={(v) => setCustomer({ ...customer, propertyZip: v })}
                    />
                  )}
                </div>
              )}
            </div>
            <StepNav
              brand={brand}
              onNext={() => setStep(1)}
              nextDisabled={!canProceedStep0}
            />
          </Section>
        )}

        {/* Step 1: home size (bedrooms + bathrooms drive pricing) */}
        {step === 1 && (
          <Section title="Tell us about your home" subtitle="Your bedroom and bathroom count sets your pricing.">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Bedrooms</label>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={bedrooms}
                  onChange={(e) => setBedrooms(e.target.value)}
                  className="mt-1 w-full rounded-lg border bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                  style={{ ["--tw-ring-color" as any]: brand.primaryColor }}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Bathrooms</label>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={bathrooms}
                  onChange={(e) => setBathrooms(e.target.value)}
                  className="mt-1 w-full rounded-lg border bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                  style={{ ["--tw-ring-color" as any]: brand.primaryColor }}
                />
              </div>
            </div>

            {previewTiers.length > 0 && (
              <div className="mt-5 rounded-xl bg-secondary/60 p-4 flex items-center justify-between">
                <span className="text-sm font-medium">Plans starting at</span>
                <span className="font-display text-xl font-semibold" style={{ color: brand.primaryColor }}>
                  {formatCurrency(Math.min(...previewTiers.map((t) => t.total)))}
                </span>
              </div>
            )}

            <StepNav
              brand={brand}
              onBack={() => setStep(0)}
              onNext={handleSubmit}
              nextLabel={createQuote.isPending ? "Generating…" : "See my pricing"}
              nextDisabled={createQuote.isPending}
              loading={createQuote.isPending}
            />
          </Section>
        )}

        {/* Step 2: result preview (then redirect to share page) */}
        {step === 2 && resultTiers && (
          <div>
            <div className="text-center mb-6">
              <h2 className="font-display text-2xl font-semibold">Your personalized quote</h2>
              <p className="text-muted-foreground mt-1">
                Redirecting you to your shareable quote…
              </p>
            </div>
            <TierCards
              tiers={resultTiers}
              primaryColor={brand.primaryColor}
              accentColor={brand.accentColor}
            />
          </div>
        )}
            </div>
          </div>
        </div>

        {/* mini trust row */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs opacity-55">
          {["Fast response", "No spam", "Free quote"].map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5" /> {t}
            </span>
          ))}
        </div>
      </div>
    </BrandFrame>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-center">
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        {subtitle && <p className="text-sm opacity-55 mt-1">{subtitle}</p>}
      </div>
      <div className="mt-6 text-left">{children}</div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
      />
    </div>
  );
}

function StepNav({
  brand,
  onBack,
  onNext,
  nextLabel = "Continue",
  nextDisabled,
  loading,
}: {
  brand: { primaryColor: string };
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="mt-8 flex items-center justify-between gap-3">
      {onBack ? (
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-medium hover:bg-secondary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      ) : (
        <span />
      )}
      <button
        onClick={onNext}
        disabled={nextDisabled}
        className="pressable inline-flex items-center gap-1.5 rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-md disabled:opacity-50"
        style={{ background: brand.primaryColor }}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {nextLabel} {!loading && <ArrowRight className="h-4 w-4" />}
      </button>
    </div>
  );
}
