import { useEffect, useRef, useState } from "react";
import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { BrandFrame } from "@/components/BrandFrame";
import { ProposalPackages, IncludedBlock } from "@/components/ProposalPackages";
import { formatCurrency, formatDate, formatDateTime, contrastText } from "@/lib/format";
import {
  CheckCircle2,
  ChevronUp,
  Clock,
  Copy,
  Loader2,
  PenLine,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

export default function QuoteView() {
  const [, params] = useRoute("/quote/:token");
  const token = params?.token ?? "";
  const utils = trpc.useUtils();
  const { data: quote, isLoading } = trpc.quotes.getByToken.useQuery(
    { token },
    { enabled: !!token },
  );
  const accept = trpc.quotes.accept.useMutation({
    onSuccess: () => utils.quotes.getByToken.invalidate({ token }),
  });

  // Customer's working selection + typed signature (pre-filled below once loaded).
  const [chosenTier, setChosenTier] = useState<string | null>(null);
  const [signature, setSignature] = useState("");
  const signRef = useRef<HTMLDivElement>(null);
  // Hide the sticky bar once the Sign & Approve section is on screen so it
  // never overlaps the real approve button.
  const [signVisible, setSignVisible] = useState(false);

  // Track when the Sign & Approve section enters the viewport.
  useEffect(() => {
    const el = signRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setSignVisible(entry.isIntersecting),
      { rootMargin: "-80px 0px 0px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [quote]);

  // Pre-fill the chosen tier (from any saved selection) and the signature name
  // once the quote loads.
  useEffect(() => {
    if (!quote) return;
    setChosenTier((prev) => prev ?? quote.selectedTierKey ?? null);
    setSignature((prev) => (prev.length ? prev : quote.customerName ?? ""));
  }, [quote]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#eceff1]">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#eceff1] px-4">
        <div className="text-center">
          <XCircle className="h-10 w-10 text-muted-foreground mx-auto" />
          <h1 className="mt-4 font-display text-2xl font-semibold">Quote not found</h1>
          <p className="mt-2 text-muted-foreground">
            This quote link is invalid or may have been removed.
          </p>
        </div>
      </div>
    );
  }

  const brand = {
    companyName: quote.brandSnapshot.companyName,
    logoUrl: quote.brandSnapshot.logoUrl,
    primaryColor: quote.brandSnapshot.primaryColor,
    accentColor: quote.brandSnapshot.accentColor,
    backgroundColor: quote.brandSnapshot.backgroundColor,
    textColor: quote.brandSnapshot.textColor,
    cardColor: quote.brandSnapshot.cardColor,
    companyEmail: quote.brandSnapshot.companyEmail,
    companyPhone: quote.brandSnapshot.companyPhone,
  };

  const status = quote.status;
  const isExpired = status === "expired";
  const isAccepted = status === "accepted";
  const interactive = !isAccepted && !isExpired;

  const acceptedTier =
    quote.computedTiers.find((t) => t.key === quote.selectedTierKey) ?? null;
  const chosen =
    quote.computedTiers.find((t) => t.key === chosenTier) ?? null;

  const addressLine = [
    quote.propertyAddress,
    [quote.propertyCity, quote.propertyState].filter(Boolean).join(", "),
    quote.propertyZip,
  ]
    .filter(Boolean)
    .join(" · ");

  const canApprove = !!chosen && signature.trim().length > 1 && !accept.isPending;

  const handleApprove = async () => {
    if (!chosen) {
      toast.error("Please pick a plan first");
      return;
    }
    if (signature.trim().length < 2) {
      toast.error("Please type your name to sign");
      return;
    }
    try {
      await accept.mutateAsync({
        token,
        tierKey: chosen.key,
        signature: signature.trim(),
      });
      toast.success("Approved! We'll be in touch to schedule.");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not approve the quote");
    }
  };

  const scrollToSign = () => {
    signRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // Observe whether the sign section is in view (declared after early returns
  // would break hook order, so the effect lives here guarded by the ref).


  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Quote link copied");
  };

  return (
    <BrandFrame brand={brand}>
      <div className="min-h-screen pb-28">
        {/* Share button */}
        <div className="max-w-3xl mx-auto px-4 pt-6 flex justify-end">
          <button
            onClick={copyLink}
            className="inline-flex items-center gap-1.5 rounded-xl border bg-white px-3 py-2 text-sm font-medium hover:bg-black/5 transition-colors"
          >
            <Copy className="h-4 w-4" /> Share
          </button>
        </div>

        {/* PREPARED FOR card */}
        <div className="max-w-3xl mx-auto px-4 pt-4">
          <div className="rounded-xl bg-white shadow-sm px-6 py-10 text-center">
            {brand.logoUrl ? (
              <img
                src={brand.logoUrl}
                alt={brand.companyName}
                className="mx-auto h-20 w-auto object-contain"
              />
            ) : (
              <div
                className="mx-auto h-16 w-16 rounded-xl flex items-center justify-center text-2xl font-semibold text-white"
                style={{ background: brand.primaryColor }}
              >
                {brand.companyName.charAt(0)}
              </div>
            )}

            <div className="mt-8 text-[15px] leading-relaxed text-foreground/80">
              <p className="font-semibold tracking-wide text-foreground">PREPARED FOR:</p>
              <p className="mt-1">{quote.customerName}</p>
              {addressLine ? <p>{addressLine}</p> : null}
            </div>

            <h1 className="mt-8 font-display text-2xl font-semibold">
              Which of These Services Would You Like?
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The prices shown are quotes based on the info you gave us, but will
              need to be confirmed.
            </p>
          </div>
        </div>

        {/* Status banners */}
        <div className="max-w-3xl mx-auto px-4">
          {isAccepted && acceptedTier ? (
            <div
              className="mt-5 rounded-xl p-5 text-white shadow-sm"
              style={{ background: brand.primaryColor }}
            >
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-7 w-7" style={{ color: brand.accentColor }} />
                <div>
                  <p className="font-display text-lg font-semibold">
                    You approved the {acceptedTier.name} package
                  </p>
                  <p className="text-white/80 text-sm">
                    {formatCurrency(acceptedTier.total)} · We'll reach out to schedule. Thank you!
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {isExpired ? (
            <div className="mt-5 rounded-xl border bg-amber-50 p-5 text-amber-900">
              <div className="flex items-center gap-3">
                <Clock className="h-6 w-6" />
                <div>
                  <p className="font-semibold">This quote has expired</p>
                  <p className="text-sm text-amber-800">
                    Please contact {brand.companyName} for an updated quote.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Service group + packages */}
        <div className="max-w-5xl mx-auto px-4 mt-6">
          <div className="rounded-xl bg-white shadow-sm px-4 sm:px-8 py-9">
            <div className="text-center">
              <span
                className="proposal-display inline-block rounded-full px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]"
                style={{ background: `${brand.primaryColor}14`, color: brand.primaryColor }}
              >
                Your Custom Proposal
              </span>
              <h2 className="proposal-display mx-auto mt-4 max-w-2xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                Choose the cleaning{" "}
                <span style={{ color: brand.primaryColor }}>rhythm</span> that fits
                your home
              </h2>
              <p className="proposal-body mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-foreground/65">
                Every plan includes the same thorough top-to-bottom clean &mdash; the
                only difference is how often we come. Pick the cadence below; pricing
                is all-in with no surprises.
              </p>
            </div>

            <div className="mt-8">
              <ProposalPackages
                tiers={quote.computedTiers}
                primaryColor={brand.primaryColor}
                accentColor={brand.accentColor}
                selectedKey={isAccepted ? quote.selectedTierKey : chosenTier}
                onSelect={interactive ? (key) => setChosenTier(key) : undefined}
                disabled={accept.isPending}
              />
            </div>

            {/* Shared inclusions checklist — shown ONCE, not per card */}
            <div className="mt-10 border-t pt-9" style={{ borderColor: "rgba(0,0,0,0.07)" }}>
              <IncludedBlock
                features={quote.computedTiers[0]?.features ?? []}
                primaryColor={brand.primaryColor}
                accentColor={brand.accentColor}
              />
              <p className="proposal-body mx-auto mt-7 max-w-2xl text-center text-xs leading-relaxed text-muted-foreground">
                Prices are based on the information provided and may adjust for special
                considerations that vary job to job. If you feel your home may fall under
                a special consideration, just reach out.
              </p>
            </div>

            {interactive ? (
              <p className="proposal-body mt-6 text-center text-xs text-muted-foreground">
                This quote is valid until {formatDate(quote.expiresAt)}.
              </p>
            ) : null}
          </div>
        </div>

        {/* Sign & Approve section */}
        {interactive ? (
          <div ref={signRef} className="max-w-3xl mx-auto px-4 mt-6">
            <div className="rounded-xl bg-white shadow-sm px-5 sm:px-8 py-8">
              <div className="flex items-center justify-center gap-2 text-center">
                <PenLine className="h-5 w-5" style={{ color: brand.primaryColor }} />
                <h2 className="font-display text-xl font-semibold">Sign &amp; Approve</h2>
              </div>
              <p className="mt-2 text-center text-sm text-muted-foreground">
                {chosen
                  ? "Type your name below to approve this quote and get on our schedule."
                  : "Pick a plan above, then sign here to approve."}
              </p>

              {/* Selected plan summary */}
              <div
                className="mt-6 flex items-center justify-between rounded-xl border px-4 py-3"
                style={{ borderColor: chosen ? brand.primaryColor : "rgba(0,0,0,0.1)" }}
              >
                <div className="text-sm">
                  <span className="text-muted-foreground">Your plan: </span>
                  <span className="font-semibold">
                    {chosen ? chosen.name : "None selected"}
                  </span>
                </div>
                <span className="font-display text-lg font-bold">
                  {formatCurrency(chosen?.total ?? 0)}
                </span>
              </div>

              {/* Signature input */}
              <div className="mt-5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Your signature
                </label>
                <input
                  type="text"
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  placeholder="Type your full name"
                  autoComplete="name"
                  className="mt-2 w-full rounded-xl border bg-white px-4 py-3 font-signature text-2xl outline-none transition-shadow focus:ring-2"
                  style={{ ["--tw-ring-color" as any]: brand.primaryColor }}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  By signing, you authorize {brand.companyName} to perform the
                  selected service. A timestamp is recorded with your signature.
                </p>
              </div>

              {/* Approve button */}
              <button
                onClick={handleApprove}
                disabled={!canApprove}
                className="pressable mt-5 w-full rounded-xl px-5 py-4 text-base font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background: brand.primaryColor,
                  color: contrastText(brand.primaryColor),
                }}
              >
                {accept.isPending ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" /> Approving…
                  </span>
                ) : (
                  "Sign & Approve"
                )}
              </button>
            </div>
          </div>
        ) : null}

        {/* Signed confirmation (after acceptance) */}
        {isAccepted && quote.signature ? (
          <div className="max-w-3xl mx-auto px-4 mt-6">
            <div className="rounded-xl bg-white shadow-sm px-5 sm:px-8 py-7 text-center">
              <CheckCircle2
                className="mx-auto h-8 w-8"
                style={{ color: brand.primaryColor }}
              />
              <p className="mt-3 text-sm text-muted-foreground">Signed by</p>
              <p className="font-signature text-3xl">{quote.signature}</p>
              {quote.signedAt ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDateTime(quote.signedAt)}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* About / note */}
        <div className="max-w-3xl mx-auto px-4 mt-6">
          <div className="rounded-xl bg-white shadow-sm px-6 sm:px-8 py-8">
            <h2 className="text-center font-display text-xl font-semibold">
              Learn more about us!
            </h2>
            <p className="mt-4 text-sm text-foreground/80 leading-relaxed">
              Thanks for taking the time to fill out our instant online bid. We know
              your time is valuable, and our instant online bid feature is just one
              way we help accommodate your schedule. Whether it's getting your bid
              done quickly using health- and environmentally-conscious products, or
              making sure your home is cleaned to our high standards, we've built our
              business to prove that we're serious about your satisfaction in every
              way possible!
            </p>
            <p className="mt-3 text-sm font-medium">— {brand.companyName}</p>

            <details className="mt-6 group">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Disclaimer
              </summary>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                This online bid is designed to make your life easier but is unable to
                take every factor into consideration. The numbers quoted are based on
                the information provided, and if there is a deviation from those
                details we may need to adjust accordingly. Factors such as extra
                ladderwork, heavy soiling, mineral deposits, or limited access that we
                are unable to factor into this sight-unseen bid may affect the final
                price, and would be discussed with you before any service begins. Our
                mission is not to bait and switch — we just think it's only fair to let
                you know.
              </p>
            </details>
          </div>
        </div>
      </div>

      {/* Sticky selection bar (hidden once accepted/expired) */}
      {interactive && !signVisible ? (
        <div
          className="fixed bottom-0 inset-x-0 z-40 text-white shadow-[0_-2px_12px_rgba(0,0,0,0.15)] transition-transform duration-200"
          style={{ background: brand.primaryColor, color: contrastText(brand.primaryColor) }}
        >
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="opacity-90 hidden sm:inline">Your selection:</span>
              <span className="font-semibold truncate">
                {chosen ? chosen.name : "None yet"}
              </span>
              <span className="font-display text-lg font-bold ml-1">
                {formatCurrency(chosen?.total ?? 0)}
              </span>
            </div>
            <button
              onClick={scrollToSign}
              className="pressable inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white/95 px-4 py-2 text-sm font-semibold"
              style={{ color: brand.primaryColor }}
            >
              {chosen ? "Sign & Approve" : "Choose a plan"}
              <ChevronUp className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </BrandFrame>
  );
}
