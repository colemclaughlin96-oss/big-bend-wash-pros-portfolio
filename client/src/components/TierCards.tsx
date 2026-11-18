import { Check, Sparkles } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { contrastText } from "@/lib/format";

export type DisplayTier = {
  key: string;
  name: string;
  description: string;
  features: string[];
  total: number;
  highlighted?: boolean;
};

export function TierCards({
  tiers,
  primaryColor,
  accentColor,
  selectedKey,
  onSelect,
  ctaLabel = "Select",
  disabled = false,
}: {
  tiers: DisplayTier[];
  primaryColor: string;
  accentColor: string;
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
  ctaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-5 md:grid-cols-3 items-stretch">
      {tiers.map((tier) => {
        const isHighlighted = tier.highlighted;
        const isSelected = selectedKey === tier.key;
        return (
          <div
            key={tier.key}
            className={`relative flex flex-col rounded-2xl p-6 transition-all duration-300 lift ${
              isHighlighted ? "card-elevated md:-translate-y-2 ring-2" : "shadow-sm border"
            } ${isSelected ? "ring-2" : ""}`}
            style={{
              background: "var(--brand-card, #ffffff)",
              borderColor: isHighlighted || isSelected ? primaryColor : undefined,
              // @ts-expect-error css var
              "--tw-ring-color": isHighlighted || isSelected ? primaryColor : "transparent",
            }}
          >
            {isHighlighted ? (
              <div
                className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold shadow-sm"
                style={{ background: accentColor, color: contrastText(accentColor) }}
              >
                <Sparkles className="h-3 w-3" /> Most Popular
              </div>
            ) : null}

            <div className="mb-4">
              <h3 className="font-display text-xl font-semibold" style={{ color: primaryColor }}>
                {tier.name}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground min-h-[40px]">
                {tier.description}
              </p>
            </div>

            <div className="mb-5">
              <div className="flex items-baseline gap-1">
                <span className="font-display text-4xl font-bold tracking-tight">
                  {formatCurrency(tier.total)}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">one-time estimate</span>
            </div>

            <ul className="space-y-2.5 mb-6 flex-1">
              {tier.features.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span
                    className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                    style={{ background: `${primaryColor}1a` }}
                  >
                    <Check className="h-3 w-3" style={{ color: primaryColor }} />
                  </span>
                  <span className="text-foreground/80">{f}</span>
                </li>
              ))}
            </ul>

            {onSelect ? (
              <button
                disabled={disabled}
                onClick={() => onSelect(tier.key)}
                className="pressable w-full rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50"
                style={
                  isHighlighted
                    ? { background: primaryColor, color: contrastText(primaryColor) }
                    : {
                        background: "transparent",
                        color: primaryColor,
                        border: `1.5px solid ${primaryColor}`,
                      }
                }
              >
                {isSelected ? "Selected ✓" : ctaLabel}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
