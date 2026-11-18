import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { ArrowRight, Clock, ShieldCheck, Sparkles, Star } from "lucide-react";
import { BrandFrame } from "@/components/BrandFrame";

const DEFAULT_HERO_IMG = ""; // No default hero asset — empty string renders a solid brand-color hero. Upload one in Branding.

// Convert a 0-100 opacity to a 2-digit hex alpha suffix for hex colors.
function alphaHex(pct: number) {
  const clamped = Math.max(0, Math.min(100, pct));
  return Math.round((clamped / 100) * 255)
    .toString(16)
    .padStart(2, "0");
}

export default function Home() {
  const [, setLocation] = useLocation();
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

  // Hero background: use configured image if set, otherwise the default photo.
  // An empty string ("") explicitly means "no image — solid color background".
  const heroImage =
    settings?.heroImageUrl === undefined || settings?.heroImageUrl === null
      ? DEFAULT_HERO_IMG
      : settings.heroImageUrl;
  const overlayColor = settings?.heroOverlayColor ?? brand.primaryColor;
  const overlayOpacity = settings?.heroOverlayOpacity ?? 55;
  const tagline = settings?.heroTagline ?? "Instant, transparent pricing";
  const cardBg = brand.cardColor;

  // Build the overlay. With an image we use a directional gradient for depth;
  // without an image the overlay color itself becomes the hero background.
  const overlayStyle = heroImage
    ? {
        background: `linear-gradient(100deg, ${overlayColor}${alphaHex(
          Math.min(100, overlayOpacity + 35),
        )} 0%, ${overlayColor}${alphaHex(overlayOpacity)} 50%, ${overlayColor}${alphaHex(
          Math.max(0, overlayOpacity - 25),
        )} 100%)`,
      }
    : { background: overlayColor };

  return (
    <BrandFrame brand={brand}>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          {heroImage ? (
            <img src={heroImage} alt="" className="h-full w-full object-cover" />
          ) : null}
          <div className="absolute inset-0" style={overlayStyle} />
        </div>
        {/* gradient scrim for legibility */}
        {heroImage ? <div className="absolute inset-0 hero-scrim" /> : null}
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-24 sm:py-32">
          <div className="max-w-2xl">
            {brand.logoUrl ? (
              <img
                src={brand.logoUrl}
                alt={brand.companyName}
                className="mb-7 h-20 w-auto rounded-xl bg-white/90 p-2.5 shadow-lg ring-1 ring-white/40 backdrop-blur"
              />
            ) : null}
            {tagline ? (
              <span className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-white/90 ring-1 ring-white/30 backdrop-blur">
                <Sparkles className="h-3 w-3" /> {tagline}
              </span>
            ) : null}
            <h1 className="mt-6 display-xl text-5xl sm:text-6xl lg:text-7xl text-white drop-shadow-sm">
              {settings?.formHeadline ?? "Get Your Instant Quote"}
            </h1>
            <p className="mt-5 text-lg sm:text-xl text-white/85 leading-relaxed max-w-xl">
              {settings?.formSubheadline ??
                "Answer a few quick questions about your property and instantly compare our service packages. No waiting, no pressure."}
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <button
                onClick={() => setLocation("/quote")}
                className="pressable inline-flex items-center gap-2 rounded-2xl px-7 py-4 text-base font-semibold text-white shadow-xl"
                style={{ background: brand.primaryColor }}
              >
                Start my free quote <ArrowRight className="h-4 w-4" />
              </button>
              <span className="text-sm text-white/80">Takes under 60 seconds</span>
            </div>
            {/* trust chips */}
            <div className="mt-8 flex flex-wrap items-center gap-2.5">
              {["Licensed & Insured", "Upfront Pricing", "No Obligation"].map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-white/90 ring-1 ring-white/25 backdrop-blur"
                >
                  <ShieldCheck className="h-3.5 w-3.5" /> {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 -mt-12 relative z-10">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: Clock, title: "Instant estimate", text: "See pricing immediately — no callbacks required." },
            { icon: ShieldCheck, title: "Clear packages", text: "Compare every service option side by side with transparent pricing." },
            { icon: Sparkles, title: "Tailored to your property", text: "Pricing reflects the details of your specific job." },
          ].map((f, i) => (
            <div
              key={i}
              className="card-elevated lift p-6"
              style={{ backgroundColor: cardBg }}
            >
              <span
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl"
                style={{ background: `color-mix(in oklab, ${brand.primaryColor} 12%, transparent)` }}
              >
                <f.icon className="h-5 w-5 brand-primary-text" />
              </span>
              <h3 className="mt-4 font-semibold text-lg">{f.title}</h3>
              <p className="mt-1 text-sm opacity-60 leading-relaxed">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-20">
        <div className="brand-glow card-elevated px-6 py-14 sm:px-12 text-center" style={{ backgroundColor: cardBg }}>
          <div className="flex items-center justify-center gap-1 mb-4 brand-accent-text">
            {[0, 1, 2, 3, 4].map((i) => (
              <Star key={i} className="h-5 w-5 fill-current" />
            ))}
          </div>
          <h2 className="display-xl text-3xl sm:text-4xl">Ready to see your price?</h2>
          <p className="mt-3 opacity-60 max-w-md mx-auto">
            Build your custom quote in just a few steps — instant, accurate, and pressure-free.
          </p>
          <button
            onClick={() => setLocation("/quote")}
            className="pressable mt-7 inline-flex items-center gap-2 rounded-2xl px-7 py-4 text-base font-semibold text-white shadow-xl"
            style={{ background: brand.primaryColor }}
          >
            Get started <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>
    </BrandFrame>
  );
}
