import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { formatCurrency, contrastText } from "@/lib/format";
import type { DisplayTier } from "./TierCards";
import { cadenceFor, savingsFor, deepCleanAnchor } from "../../../shared/proposalDisplay";

/**
 * Mobile-first proposal packages. On phones the tiers render as a single
 * horizontal snap-scroll row (swipe left/right) with peeking neighbours and
 * dot indicators so it's obvious there's more than one card. On desktop
 * (lg+) it falls back to a 4-up grid. The shared inclusions checklist is NOT
 * repeated per card — it lives in <IncludedBlock /> below the cards.
 *
 * Recurring plans show a struck-through "compare" price (the one-time Initial
 * Deep Clean total for this home) above their real per-visit price, with a
 * small "save $X / visit" pill. This is cosmetic framing, not pricing math.
 */
export function ProposalPackages({
  tiers,
  primaryColor,
  accentColor,
  selectedKey,
  onSelect,
  pendingKey,
  disabled = false,
}: {
  tiers: DisplayTier[];
  primaryColor: string;
  accentColor: string;
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
  pendingKey?: string | null;
  disabled?: boolean;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [active, setActive] = useState(0);

  // The one-time Deep Clean total is the "compare" anchor for recurring plans.
  const compareAnchor = useMemo(() => deepCleanAnchor(tiers), [tiers]);

  // Track which card is centered in the mobile scroller for the dot indicator.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const center = scroller.scrollLeft + scroller.clientWidth / 2;
        let best = 0;
        let bestDist = Infinity;
        cardRefs.current.forEach((el, i) => {
          if (!el) return;
          const mid = el.offsetLeft + el.offsetWidth / 2;
          const d = Math.abs(mid - center);
          if (d < bestDist) {
            bestDist = d;
            best = i;
          }
        });
        setActive(best);
      });
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [tiers.length]);

  const scrollTo = (i: number) => {
    const el = cardRefs.current[i];
    const scroller = scrollerRef.current;
    if (!el || !scroller) return;
    scroller.scrollTo({
      left: el.offsetLeft - (scroller.clientWidth - el.offsetWidth) / 2,
      behavior: "smooth",
    });
  };

  return (
    <div>
      {/* Scroller: horizontal swipe carousel on mobile, 4-up grid on desktop */}
      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 -mx-1 px-1 scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:grid lg:snap-none lg:grid-cols-4 lg:items-stretch lg:overflow-visible lg:px-0"
      >
        {tiers.map((tier, i) => {
          const isSelected = selectedKey === tier.key;
          const isPending = pendingKey === tier.key;
          const cad = cadenceFor(tier.key);
          const perVisit = cad?.perVisit ?? false;
          const { showStrike, compareAmount, save } = savingsFor(
            tier.key,
            tier.total,
            compareAnchor,
          );

          return (
            <div
              key={tier.key}
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
              className={`relative flex w-[82%] min-w-[82%] shrink-0 snap-center flex-col rounded-2xl border bg-white shadow-sm transition-all sm:w-[48%] sm:min-w-[48%] lg:w-auto lg:min-w-0 ${
                tier.highlighted ? "lg:-translate-y-1" : ""
              }`}
              style={{
                borderColor:
                  isSelected || tier.highlighted ? primaryColor : "rgba(0,0,0,0.08)",
                boxShadow: isSelected
                  ? `0 0 0 2px ${primaryColor}, 0 12px 28px rgba(20,60,35,0.12)`
                  : tier.highlighted
                    ? "0 12px 28px rgba(20,60,35,0.10)"
                    : undefined,
              }}
            >
              {tier.highlighted ? (
                <div
                  className="proposal-display absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] shadow-sm"
                  style={{ background: accentColor, color: contrastText(accentColor) }}
                >
                  Most Popular
                </div>
              ) : null}

              {/* Card body */}
              <div className="flex flex-1 flex-col px-5 pb-5 pt-7 text-center">
                <h3 className="proposal-display text-xl font-semibold leading-tight tracking-tight">
                  {tier.name}
                </h3>

                {cad ? (
                  <div
                    className="proposal-display mx-auto mt-2 inline-block rounded-full px-3 py-1 text-[10.5px] font-medium uppercase tracking-[0.07em]"
                    style={{ background: `${primaryColor}14`, color: primaryColor }}
                  >
                    {cad.badge}
                  </div>
                ) : null}

                {tier.description ? (
                  <p className="proposal-body mx-auto mt-3 max-w-[15rem] text-[13px] leading-snug text-foreground/65">
                    {tier.description}
                  </p>
                ) : null}

                {/* Price block */}
                <div className="mt-5">
                  {showStrike && compareAmount != null ? (
                    <div className="proposal-body text-sm font-medium text-foreground/40 line-through">
                      {formatCurrency(compareAmount)}
                    </div>
                  ) : (
                    <div className="h-[20px]" aria-hidden />
                  )}
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="proposal-display text-[2rem] font-bold leading-none tracking-tight">
                      {formatCurrency(tier.total)}
                    </span>
                    {perVisit ? (
                      <span className="proposal-body text-xs text-foreground/55">
                        / visit
                      </span>
                    ) : null}
                  </div>
                  {showStrike ? (
                    <div
                      className="proposal-display mx-auto mt-2 inline-block rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em]"
                      style={{ background: `${accentColor}1f`, color: primaryColor }}
                    >
                      Save {formatCurrency(save)} / visit
                    </div>
                  ) : (
                    <div className="h-[22px]" aria-hidden />
                  )}
                </div>

                {/* CTA pinned to the bottom so all cards line up */}
                <div className="mt-5 pt-1">
                  {onSelect ? (
                    <button
                      disabled={disabled}
                      onClick={() => onSelect(tier.key)}
                      className="pressable proposal-display w-full rounded-lg px-4 py-2.5 text-[13px] font-semibold uppercase tracking-[0.06em] disabled:opacity-50"
                      style={
                        isSelected
                          ? { background: primaryColor, color: contrastText(primaryColor) }
                          : {
                              background: "transparent",
                              color: primaryColor,
                              border: `1.5px solid ${primaryColor}`,
                            }
                      }
                    >
                      {isPending ? (
                        <span className="inline-flex items-center justify-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" /> Selecting…
                        </span>
                      ) : isSelected ? (
                        "Selected ✓"
                      ) : (
                        "Select"
                      )}
                    </button>
                  ) : (
                    <div
                      className="proposal-display w-full rounded-lg px-4 py-2.5 text-[13px] font-semibold uppercase tracking-[0.06em]"
                      style={{
                        background: isSelected ? primaryColor : "rgba(0,0,0,0.04)",
                        color: isSelected ? contrastText(primaryColor) : "rgba(0,0,0,0.5)",
                      }}
                    >
                      {isSelected ? "Selected ✓" : "—"}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Swipe hint + dot indicators (mobile only) */}
      {tiers.length > 1 ? (
        <div className="mt-4 flex flex-col items-center gap-2 lg:hidden">
          <div className="flex items-center gap-2">
            {tiers.map((tier, i) => (
              <button
                key={tier.key}
                aria-label={`Go to ${tier.name}`}
                onClick={() => scrollTo(i)}
                className="h-2 rounded-full transition-all"
                style={{
                  width: active === i ? 20 : 8,
                  background: active === i ? primaryColor : "rgba(0,0,0,0.18)",
                }}
              />
            ))}
          </div>
          <p className="proposal-body text-xs text-muted-foreground">
            Swipe to compare plans →
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The shared "What's included in every clean" block. Rendered ONCE below the
 * cards instead of being repeated inside each one. Features come from the first
 * tier (all tiers share the same checklist in this product).
 */
export function IncludedBlock({
  features,
  primaryColor,
  accentColor,
}: {
  features: string[];
  primaryColor: string;
  accentColor: string;
}) {
  if (!features.length) return null;
  return (
    <div>
      <div className="text-center">
        <h3 className="proposal-display text-2xl font-semibold tracking-tight">
          What&rsquo;s Included In Every Clean
        </h3>
        <p
          className="proposal-display mt-1 text-[11px] font-medium uppercase tracking-[0.08em]"
          style={{ color: primaryColor }}
        >
          Same checklist across all plans · {features.length} tasks
        </p>
      </div>

      <ul className="mx-auto mt-6 grid max-w-3xl gap-x-8 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f, idx) => (
          <li key={idx} className="flex items-start gap-2.5 text-left">
            <span
              className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
              style={{ background: `${accentColor}24` }}
            >
              <Check className="h-3 w-3" style={{ color: primaryColor }} />
            </span>
            <span className="proposal-body text-[13px] leading-snug text-foreground/75">
              {f}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
