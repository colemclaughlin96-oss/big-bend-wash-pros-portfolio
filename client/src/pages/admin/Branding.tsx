import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2, Upload, ImageIcon, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { TierCards } from "@/components/TierCards";

const DEFAULT_HERO_IMG = ""; // No default hero asset — empty string renders a solid brand-color hero. Upload one in Branding.

const PALETTE_PRESETS: { name: string; primary: string; accent: string; bg: string; text: string; card: string }[] = [
  { name: "Deep Teal", primary: "#0f4c5c", accent: "#e9b949", bg: "#f7f5f0", text: "#1c1917", card: "#ffffff" },
  { name: "Midnight", primary: "#1e293b", accent: "#38bdf8", bg: "#f1f5f9", text: "#0f172a", card: "#ffffff" },
  { name: "Forest", primary: "#14532d", accent: "#facc15", bg: "#f4f7f2", text: "#1a2e22", card: "#ffffff" },
  { name: "Royal", primary: "#4338ca", accent: "#f472b6", bg: "#f5f3ff", text: "#1e1b4b", card: "#ffffff" },
  { name: "Crimson", primary: "#991b1b", accent: "#f59e0b", bg: "#fef6f3", text: "#3f1414", card: "#ffffff" },
  { name: "Slate Dark", primary: "#0ea5e9", accent: "#f59e0b", bg: "#0f172a", text: "#e2e8f0", card: "#1e293b" },
];

const EMPTY_FORM = {
  companyName: "",
  companyEmail: "",
  companyPhone: "",
  primaryColor: "#0f4c5c",
  accentColor: "#e9b949",
  backgroundColor: "#f7f5f0",
  textColor: "#1c1917",
  cardColor: "#ffffff",
  heroOverlayColor: "#0f4c5c",
  heroOverlayOpacity: 55,
  heroTagline: "Instant, transparent pricing",
  formHeadline: "",
  formSubheadline: "",
};

function alphaHex(pct: number) {
  const clamped = Math.max(0, Math.min(100, pct));
  return Math.round((clamped / 100) * 255).toString(16).padStart(2, "0");
}

export default function Branding() {
  const { data: settings, isLoading } = trpc.settings.get.useQuery();
  const utils = trpc.useUtils();
  const logoRef = useRef<HTMLInputElement>(null);
  const heroRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [heroImageUrl, setHeroImageUrl] = useState<string | null | undefined>(undefined);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        companyName: settings.companyName,
        companyEmail: settings.companyEmail ?? "",
        companyPhone: settings.companyPhone ?? "",
        primaryColor: settings.primaryColor,
        accentColor: settings.accentColor,
        backgroundColor: settings.backgroundColor,
        textColor: settings.textColor,
        cardColor: settings.cardColor,
        heroOverlayColor: settings.heroOverlayColor,
        heroOverlayOpacity: settings.heroOverlayOpacity,
        heroTagline: settings.heroTagline,
        formHeadline: settings.formHeadline,
        formSubheadline: settings.formSubheadline ?? "",
      });
      setLogoUrl(settings.logoUrl);
      setHeroImageUrl(settings.heroImageUrl);
    }
  }, [settings]);

  const update = trpc.settings.update.useMutation({
    onSuccess: () => {
      utils.settings.get.invalidate();
      utils.settings.getPublic.invalidate();
      setDirty(false);
      toast.success("Branding saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const uploadLogo = trpc.settings.uploadLogo.useMutation({
    onSuccess: (res) => {
      setLogoUrl(res.url);
      utils.settings.get.invalidate();
      utils.settings.getPublic.invalidate();
      toast.success("Logo uploaded");
    },
    onError: (e) => toast.error(e.message),
  });

  // Reuse the logo upload endpoint to store the hero image, then save its URL.
  const uploadHero = trpc.settings.uploadLogo.useMutation({
    onSuccess: (res) => {
      setHeroImageUrl(res.url);
      setDirty(true);
      toast.success("Hero image uploaded — remember to Save");
    },
    onError: (e) => toast.error(e.message),
  });

  const set = (patch: Partial<typeof form>) => {
    setForm((p) => ({ ...p, ...patch }));
    setDirty(true);
  };

  const applyPreset = (p: (typeof PALETTE_PRESETS)[number]) => {
    set({
      primaryColor: p.primary,
      accentColor: p.accent,
      backgroundColor: p.bg,
      textColor: p.text,
      cardColor: p.card,
      heroOverlayColor: p.primary,
    });
  };

  const readAsDataUrl = (file: File, cb: (dataUrl: string, name: string) => void) => {
    const reader = new FileReader();
    reader.onload = () => cb(reader.result as string, file.name);
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    update.mutate({ ...form, heroImageUrl: heroImageUrl ?? null });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const previewTiers = (settings?.tiers ?? []).slice(0, 3).map((t, i) => ({
    key: t.key,
    name: t.name,
    description: t.description,
    features: t.features.slice(0, 3),
    highlighted: t.highlighted,
    total: [299, 449, 649][i] ?? 399,
  }));

  const effectiveHero = heroImageUrl === undefined ? DEFAULT_HERO_IMG : heroImageUrl;
  const heroOverlay = effectiveHero
    ? `linear-gradient(100deg, ${form.heroOverlayColor}${alphaHex(
        Math.min(100, form.heroOverlayOpacity + 35),
      )} 0%, ${form.heroOverlayColor}${alphaHex(form.heroOverlayOpacity)} 100%)`
    : form.heroOverlayColor;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">Branding</h1>
          <p className="text-muted-foreground">
            These settings apply across your customer-facing landing page, quote form, and quote pages.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={!dirty || update.isPending}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save branding
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: form */}
        <div className="space-y-5">
          <Section title="Logo">
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-xl border bg-secondary/40 overflow-hidden">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
                ) : (
                  <ImageIcon className="h-7 w-7 text-muted-foreground" />
                )}
              </div>
              <div>
                <input
                  ref={logoRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (f.size > 2 * 1024 * 1024) return toast.error("Logo must be under 2MB");
                    readAsDataUrl(f, (dataUrl, fileName) => uploadLogo.mutate({ dataUrl, fileName }));
                  }}
                />
                <button
                  onClick={() => logoRef.current?.click()}
                  disabled={uploadLogo.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-secondary transition-colors disabled:opacity-50"
                >
                  {uploadLogo.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Upload logo
                </button>
                <p className="mt-1 text-xs text-muted-foreground">PNG or SVG, under 2MB.</p>
              </div>
            </div>
          </Section>

          <Section title="Company info">
            <div className="grid gap-3">
              <Field label="Company name">
                <input
                  value={form.companyName}
                  onChange={(e) => set({ companyName: e.target.value })}
                  className="field-input"
                />
              </Field>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Email">
                  <input
                    value={form.companyEmail}
                    onChange={(e) => set({ companyEmail: e.target.value })}
                    className="field-input"
                  />
                </Field>
                <Field label="Phone">
                  <input
                    value={form.companyPhone}
                    onChange={(e) => set({ companyPhone: e.target.value })}
                    className="field-input"
                  />
                </Field>
              </div>
            </div>
          </Section>

          <Section title="Color theme">
            <div className="mb-4">
              <label className="text-xs font-medium text-muted-foreground">Quick presets</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {PALETTE_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => applyPreset(p)}
                    className="group flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-secondary transition-colors"
                    title={p.name}
                  >
                    <span className="flex">
                      <span className="h-4 w-4 rounded-l" style={{ background: p.primary }} />
                      <span className="h-4 w-4 rounded-r" style={{ background: p.accent }} />
                    </span>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <ColorField label="Primary" value={form.primaryColor} onChange={(v) => set({ primaryColor: v })} />
              <ColorField label="Accent" value={form.accentColor} onChange={(v) => set({ accentColor: v })} />
              <ColorField label="Page background" value={form.backgroundColor} onChange={(v) => set({ backgroundColor: v })} />
              <ColorField label="Text" value={form.textColor} onChange={(v) => set({ textColor: v })} />
              <ColorField label="Card background" value={form.cardColor} onChange={(v) => set({ cardColor: v })} />
            </div>
          </Section>

          <Section title="Landing page hero background">
            <div className="flex items-center gap-4">
              <div className="relative flex h-20 w-32 items-center justify-center rounded-xl border bg-secondary/40 overflow-hidden">
                {effectiveHero ? (
                  <img src={effectiveHero} alt="Hero" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs text-muted-foreground px-2 text-center">Solid color</span>
                )}
              </div>
              <div className="flex-1">
                <input
                  ref={heroRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (f.size > 5 * 1024 * 1024) return toast.error("Image must be under 5MB");
                    readAsDataUrl(f, (dataUrl, fileName) => uploadHero.mutate({ dataUrl, fileName }));
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => heroRef.current?.click()}
                    disabled={uploadHero.isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-secondary transition-colors disabled:opacity-50"
                  >
                    {uploadHero.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    Upload image
                  </button>
                  <button
                    onClick={() => {
                      setHeroImageUrl("");
                      setDirty(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-secondary transition-colors"
                  >
                    No image (solid)
                  </button>
                  <button
                    onClick={() => {
                      setHeroImageUrl(undefined);
                      setDirty(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-secondary transition-colors"
                    title="Use the built-in default image"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Default
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  JPG or PNG, under 5MB. The overlay below sits on top of this image.
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <ColorField
                label="Overlay color"
                value={form.heroOverlayColor}
                onChange={(v) => set({ heroOverlayColor: v })}
              />
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Overlay opacity ({form.heroOverlayOpacity}%)
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={form.heroOverlayOpacity}
                  onChange={(e) => set({ heroOverlayOpacity: Number(e.target.value) })}
                  className="mt-3 w-full accent-current"
                  style={{ accentColor: form.primaryColor }}
                />
              </div>
            </div>
          </Section>

          <Section title="Landing & form copy">
            <div className="grid gap-3">
              <Field label="Hero tagline (small pill)">
                <input
                  value={form.heroTagline}
                  onChange={(e) => set({ heroTagline: e.target.value })}
                  className="field-input"
                />
              </Field>
              <Field label="Headline">
                <input
                  value={form.formHeadline}
                  onChange={(e) => set({ formHeadline: e.target.value })}
                  className="field-input"
                />
              </Field>
              <Field label="Subheadline">
                <textarea
                  value={form.formSubheadline}
                  onChange={(e) => set({ formSubheadline: e.target.value })}
                  rows={2}
                  className="field-input resize-none"
                />
              </Field>
            </div>
          </Section>
        </div>

        {/* Right: live preview */}
        <div className="lg:sticky lg:top-4 self-start">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Live preview
          </p>
          <div
            className="rounded-2xl border overflow-hidden shadow-sm"
            style={{ backgroundColor: form.backgroundColor }}
          >
            {/* Hero preview */}
            <div className="relative p-6 text-white overflow-hidden">
              {effectiveHero ? (
                <img src={effectiveHero} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : null}
              <div className="absolute inset-0" style={{ background: heroOverlay }} />
              <div className="relative">
                <div className="flex items-center gap-3">
                  {logoUrl ? (
                    <img src={logoUrl} alt="" className="h-9 w-auto max-w-[160px] object-contain" />
                  ) : (
                    <span className="font-display text-lg font-semibold">{form.companyName}</span>
                  )}
                </div>
                {form.heroTagline ? (
                  <span className="mt-4 inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-white/30">
                    {form.heroTagline}
                  </span>
                ) : null}
                <h3 className="mt-2 font-display text-2xl font-semibold">
                  {form.formHeadline || "Get Your Instant Quote"}
                </h3>
                <p className="mt-1 text-white/80 text-sm">
                  {form.formSubheadline || "Answer a few questions and see your pricing instantly."}
                </p>
                <button
                  className="mt-4 rounded-xl px-4 py-2 text-sm font-semibold"
                  style={{ background: form.accentColor, color: "#1a2b2e" }}
                >
                  Start my quote
                </button>
              </div>
            </div>
            {/* Tiers preview on page background + card colors */}
            <div className="p-5" style={{ color: form.textColor }}>
              {previewTiers.length > 0 ? (
                <TierCards
                  tiers={previewTiers}
                  primaryColor={form.primaryColor}
                  accentColor={form.accentColor}
                />
              ) : (
                <p className="text-sm text-center py-6 opacity-60">
                  Add pricing tiers to preview them here.
                </p>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            The preview reflects unsaved changes. Click <span className="font-medium">Save branding</span> to publish them to your live pages.
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <h2 className="text-sm font-semibold mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="mt-1 flex items-center gap-2 rounded-lg border bg-card p-1.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 rounded cursor-pointer border-0 bg-transparent"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-transparent text-sm focus:outline-none uppercase min-w-0"
        />
      </div>
    </div>
  );
}
