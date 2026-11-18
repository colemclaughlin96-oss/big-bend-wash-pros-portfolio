import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatCurrency } from "@/lib/format";
import { computeTiers } from "@shared/pricing";
import { Loader2, Star, X, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

type Tier = {
  key: string;
  name: string;
  description: string;
  basePrice: number;
  perBedroom: number;
  perBathroom: number;
  features: string[];
  highlighted?: boolean;
};

// Coerce any legacy/partial tier into the additive shape so old rows edit cleanly.
function normalize(t: any): Tier {
  return {
    key: t.key ?? `pkg_${Date.now()}`,
    name: t.name ?? "",
    description: t.description ?? "",
    basePrice: Number(t.basePrice ?? 0),
    perBedroom: Number(t.perBedroom ?? 0),
    perBathroom: Number(t.perBathroom ?? 0),
    features: Array.isArray(t.features) ? t.features : [],
    highlighted: Boolean(t.highlighted),
  };
}

export default function Pricing() {
  const { data: settings, isLoading } = trpc.settings.get.useQuery();
  const utils = trpc.useUtils();
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  // Live preview inputs (operator can sanity-check the math).
  const [beds, setBeds] = useState("3");
  const [baths, setBaths] = useState("2");

  useEffect(() => {
    if (settings?.tiers) setTiers((settings.tiers as any[]).map(normalize));
  }, [settings?.tiers]);

  const update = trpc.settings.update.useMutation({
    onSuccess: () => {
      utils.settings.get.invalidate();
      utils.settings.getPublic.invalidate();
      setDirty(false);
      toast.success("Pricing saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const setTier = (i: number, patch: Partial<Tier>) => {
    setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
    setDirty(true);
  };

  const setHighlighted = (i: number) => {
    setTiers((prev) =>
      prev.map((t, idx) => ({ ...t, highlighted: idx === i ? !t.highlighted : false })),
    );
    setDirty(true);
  };

  const num = (v: string) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const preview = useMemo(
    () => computeTiers(tiers, { bedrooms: num(beds), bathrooms: num(baths) }),
    [tiers, beds, baths],
  );
  const previewByKey = useMemo(
    () => Object.fromEntries(preview.map((p) => [p.key, p.total])),
    [preview],
  );

  const save = () => {
    for (const t of tiers) {
      if (!t.name.trim()) {
        toast.error("Every package needs a name");
        return;
      }
    }
    update.mutate({ tiers });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const moneyField = (
    value: number,
    onChange: (n: number) => void,
    prefix = "$",
  ) => (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        {prefix}
      </span>
      <input
        type="number"
        min={0}
        step={1}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="field-input w-full pl-6 text-right tabular-nums"
      />
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">Pricing</h1>
          <p className="text-muted-foreground">
            Each package is priced in real dollars:{" "}
            <span className="font-medium text-foreground">
              Base + (bedrooms × per bedroom) + (bathrooms × per bathroom)
            </span>
            . No multipliers, no hidden math.
          </p>
        </div>
        <button
          onClick={save}
          disabled={!dirty || update.isPending}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save changes
        </button>
      </div>

      {/* The core 4x3 table */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-secondary/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 font-semibold">Package</th>
                <th className="px-4 py-3 font-semibold text-right w-32">Base price</th>
                <th className="px-4 py-3 font-semibold text-right w-32">Per bedroom</th>
                <th className="px-4 py-3 font-semibold text-right w-32">Per bathroom</th>
                <th className="px-4 py-3 font-semibold text-right w-28">Preview</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tiers.map((tier, i) => {
                const isOpen = open[tier.key] ?? false;
                return (
                  <>
                    <tr key={tier.key} className="align-top">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              setOpen((o) => ({ ...o, [tier.key]: !isOpen }))
                            }
                            className="text-muted-foreground hover:text-foreground"
                            title="Edit name, description & checklist"
                          >
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                          <input
                            value={tier.name}
                            onChange={(e) => setTier(i, { name: e.target.value })}
                            className="field-input font-medium"
                          />
                          <button
                            onClick={() => setHighlighted(i)}
                            title="Mark as most popular"
                            className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-colors ${
                              tier.highlighted
                                ? "bg-primary text-primary-foreground"
                                : "bg-secondary text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <Star className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {moneyField(tier.basePrice, (n) => setTier(i, { basePrice: n }))}
                      </td>
                      <td className="px-4 py-3">
                        {moneyField(tier.perBedroom, (n) => setTier(i, { perBedroom: n }))}
                      </td>
                      <td className="px-4 py-3">
                        {moneyField(tier.perBathroom, (n) => setTier(i, { perBathroom: n }))}
                      </td>
                      <td className="px-4 py-3 text-right font-display text-base font-semibold tabular-nums">
                        {formatCurrency(previewByKey[tier.key] ?? 0)}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${tier.key}-details`} className="bg-secondary/20">
                        <td colSpan={5} className="px-5 py-4">
                          <div className="grid gap-4 lg:grid-cols-2">
                            <div>
                              <label className="text-xs font-medium text-muted-foreground">
                                Description
                              </label>
                              <textarea
                                value={tier.description}
                                onChange={(e) =>
                                  setTier(i, { description: e.target.value })
                                }
                                rows={3}
                                className="field-input mt-1 resize-none"
                              />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground">
                                What's included
                              </label>
                              <FeatureEditor
                                features={tier.features}
                                onChange={(features) => setTier(i, { features })}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live preview controls */}
      <div className="mt-5 flex flex-wrap items-center gap-4 rounded-xl border bg-card px-5 py-4">
        <span className="text-sm font-medium">Preview a home:</span>
        <label className="flex items-center gap-2 text-sm">
          Bedrooms
          <input
            type="number"
            min={0}
            value={beds}
            onChange={(e) => setBeds(e.target.value)}
            className="field-input w-20"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          Bathrooms
          <input
            type="number"
            min={0}
            value={baths}
            onChange={(e) => setBaths(e.target.value)}
            className="field-input w-20"
          />
        </label>
        <span className="text-xs text-muted-foreground">
          The Preview column updates live as you type.
        </span>
      </div>

      {dirty && (
        <div className="mt-6 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          You have unsaved changes.
        </div>
      )}
    </div>
  );
}

function FeatureEditor({
  features,
  onChange,
}: {
  features: string[];
  onChange: (f: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim();
    if (!v) return;
    onChange([...features, v]);
    setInput("");
  };
  return (
    <div className="mt-1">
      <div className="space-y-1.5 mb-2 max-h-48 overflow-y-auto pr-1">
        {features.map((f, i) => (
          <div
            key={i}
            className="flex items-center gap-2 rounded-lg bg-secondary/60 px-2.5 py-1.5 text-sm"
          >
            <span className="flex-1 min-w-0">{f}</span>
            <button
              onClick={() => onChange(features.filter((_, idx) => idx !== i))}
              className="text-muted-foreground hover:text-destructive transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add an included task…"
          className="field-input flex-1"
        />
        <button
          onClick={add}
          className="rounded-lg border px-3 text-sm font-medium hover:bg-secondary transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}
