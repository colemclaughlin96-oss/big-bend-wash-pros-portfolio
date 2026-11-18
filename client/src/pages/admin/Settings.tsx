import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Plug,
  Link2,
  Search,
  XCircle,
  CalendarClock,
} from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Stage = { id: string; name: string };
type Pipeline = { id: string; name: string; stages: Stage[] };
type MatchedField = { id: string; name?: string | null; fieldKey?: string | null };
type FieldMatchState = {
  status: string;
  estimate: MatchedField | null;
  price: MatchedField | null;
  estimateCreated: boolean;
  totalContactFields: number | null;
  detail: string | null;
};

const NONE = "__none__";

export default function Settings() {
  const { data: settings, isLoading } = trpc.settings.get.useQuery();
  const utils = trpc.useUtils();

  // ----- GoHighLevel v2 guided integration -----
  const [ghl, setGhl] = useState({
    token: "",
    locationId: "",
    pipelineId: "",
    pipelineName: "",
    stageSentId: "",
    stageAcceptedId: "",
    stageDeclinedId: "",
    enabled: false,
  });
  const [hasToken, setHasToken] = useState(false);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [testResult, setTestResult] = useState<{ ok: boolean; label: string } | null>(null);
  const [fieldMatch, setFieldMatch] = useState<FieldMatchState | null>(null);

  useEffect(() => {
    if (settings) {
      setGhl({
        token: "",
        locationId: settings.ghlLocationId ?? "",
        pipelineId: settings.ghlPipelineId ?? "",
        pipelineName: settings.ghlPipelineName ?? "",
        stageSentId: settings.ghlStageSentId ?? "",
        stageAcceptedId: settings.ghlStageAcceptedId ?? "",
        stageDeclinedId: settings.ghlStageDeclinedId ?? "",
        enabled: settings.ghlV2Enabled ?? false,
      });
      setHasToken(Boolean((settings as { ghlHasToken?: boolean }).ghlHasToken));
    }
  }, [settings]);

  const testGhl = trpc.settings.testGhl.useMutation({
    onSuccess: (res) => {
      setTestResult({ ok: res.ok, label: res.ok ? res.detail || "Connected" : res.status });
      if (res.ok) toast.success(`Connected to ${res.detail || "GoHighLevel"}`);
      else toast.error(`Connection failed: ${res.status}`);
    },
    onError: (e) => {
      setTestResult({ ok: false, label: e.message });
      toast.error(e.message);
    },
  });

  const loadPipelines = trpc.settings.listGhlPipelines.useMutation({
    onSuccess: (res) => {
      if (res.ok) {
        setPipelines(res.pipelines);
        if (res.pipelines.length === 0) toast.info("No pipelines found for this location");
        else toast.success(`Loaded ${res.pipelines.length} pipeline(s)`);
      } else {
        toast.error(`Could not load pipelines: ${res.status}`);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const saveGhl = trpc.settings.saveGhl.useMutation({
    onSuccess: (res) => {
      utils.settings.get.invalidate();
      setFieldMatch(res.fieldMatch ?? null);
      toast.success(
        res.fieldMatch?.estimateCreated
          ? 'Saved. Created the "Estimate Link URL" contact field in GHL.'
          : "GoHighLevel integration saved",
      );
    },
    onError: (e) => toast.error(e.message),
  });

  const checkFields = trpc.settings.ghlFieldDiagnostics.useMutation({
    onSuccess: (res) => {
      if (res.status === "not_connected") {
        toast.error("Save the GoHighLevel connection first.");
        return;
      }
      setFieldMatch({
        status: res.status,
        estimate: res.estimate ?? null,
        price: res.price ?? null,
        estimateCreated: res.estimateCreated ?? false,
        totalContactFields: res.totalContactFields ?? null,
        detail: res.detail ?? null,
      });
      utils.settings.get.invalidate();
      if (res.estimate) toast.success("Field check complete");
      else toast.error("Could not resolve the Estimate Link URL field");
    },
    onError: (e) => toast.error(e.message),
  });

  const disconnectGhl = trpc.settings.disconnectGhl.useMutation({
    onSuccess: () => {
      utils.settings.get.invalidate();
      setHasToken(false);
      setGhl((p) => ({ ...p, token: "", enabled: false }));
      setPipelines([]);
      setTestResult(null);
      toast.success("GoHighLevel disconnected");
    },
    onError: (e) => toast.error(e.message),
  });

  // ----- Housecall Pro v2 API integration -----
  const [hcpEnabled, setHcpEnabled] = useState(false);
  const [hcpTest, setHcpTest] = useState<{ ok: boolean; label: string } | null>(null);
  useEffect(() => {
    if (settings) setHcpEnabled(Boolean(settings.hcpV2Enabled));
  }, [settings]);

  const testHcp = trpc.settings.testHcp.useMutation({
    onSuccess: (res) => {
      setHcpTest({ ok: res.ok, label: res.ok ? res.detail || "Connected" : res.status });
      if (res.ok) toast.success(res.detail || "Connected to Housecall Pro");
      else toast.error(`Connection failed: ${res.detail || res.status}`);
      utils.settings.get.invalidate();
    },
    onError: (e) => {
      setHcpTest({ ok: false, label: e.message });
      toast.error(e.message);
    },
  });
  const saveHcp = trpc.settings.saveHcp.useMutation({
    onSuccess: (res) => {
      setHcpEnabled(Boolean(res.hcpV2Enabled));
      toast.success(res.hcpV2Enabled ? "Housecall Pro enabled" : "Housecall Pro disabled");
      utils.settings.get.invalidate();
    },
    onError: (e) => {
      // revert the optimistic toggle
      setHcpEnabled(Boolean(settings?.hcpV2Enabled));
      toast.error(e.message);
    },
  });
  const toggleHcp = (next: boolean) => {
    setHcpEnabled(next);
    saveHcp.mutate({ enabled: next });
  };
  const hcpHasKey = Boolean((settings as { hcpHasKey?: boolean })?.hcpHasKey);

  const setG = (patch: Partial<typeof ghl>) => setGhl((p) => ({ ...p, ...patch }));

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const canTest = Boolean(ghl.locationId && (ghl.token || hasToken));
  const selectedPipeline = pipelines.find((p) => p.id === ghl.pipelineId);
  const stagesForMapping: Stage[] = selectedPipeline?.stages ?? [];

  const onSaveGhl = () => {
    if (!ghl.locationId) return toast.error("Location ID is required");
    if (!ghl.pipelineId) return toast.error("Choose a pipeline first");
    saveGhl.mutate({
      token: ghl.token || undefined,
      locationId: ghl.locationId,
      pipelineId: ghl.pipelineId,
      pipelineName: selectedPipeline?.name ?? ghl.pipelineName ?? undefined,
      stageSentId: ghl.stageSentId || null,
      stageAcceptedId: ghl.stageAcceptedId || null,
      stageDeclinedId: ghl.stageDeclinedId || null,
      enabled: ghl.enabled,
    });
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold">Connections</h1>
        <p className="text-muted-foreground">
          Connect QuoteBid to GoHighLevel for automations and Housecall Pro for scheduling.
        </p>
      </div>

      <div className="space-y-5">
        {/* GoHighLevel guided integration */}
        <div className="rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-2 mb-1">
            <Plug className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">GoHighLevel</h2>
            {settings?.ghlV2Enabled && (
              <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="h-3 w-3" /> Connected
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Connect your GoHighLevel sub-account, then map each quote status to a pipeline stage.
            When a quote moves, QuoteBid creates/updates the contact and drops the opportunity into
            the mapped stage — your GHL automation handles delivery from there.
          </p>

          {/* Step 1: credentials */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Private Integration token
              </label>
              <input
                type="password"
                value={ghl.token}
                onChange={(e) => setG({ token: e.target.value })}
                placeholder={hasToken ? "•••••••• (stored — leave blank to keep)" : "pit-xxxxxxxx..."}
                className="field-input mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                GHL → Settings → Private Integrations. Scopes: contacts, opportunities, and custom
                fields (read/write).
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Location ID</label>
              <input
                value={ghl.locationId}
                onChange={(e) => setG({ locationId: e.target.value })}
                placeholder="e.g. abcdEFGH1234..."
                className="field-input mt-1"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => testGhl.mutate({ token: ghl.token || undefined, locationId: ghl.locationId })}
                disabled={!canTest || testGhl.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {testGhl.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plug className="h-4 w-4" />
                )}
                Test connection
              </button>
              <button
                onClick={() =>
                  loadPipelines.mutate({ token: ghl.token || undefined, locationId: ghl.locationId })
                }
                disabled={!canTest || loadPipelines.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {loadPipelines.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                Load pipelines
              </button>
              {testResult && (
                <span
                  className={`inline-flex items-center gap-1 text-sm ${
                    testResult.ok ? "text-emerald-700" : "text-amber-700"
                  }`}
                >
                  {testResult.ok ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                  {testResult.label}
                </span>
              )}
            </div>
          </div>

          {/* Step 2: pipeline + stage mapping */}
          {pipelines.length > 0 && (
            <div className="mt-5 space-y-3 rounded-xl border bg-secondary/30 p-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Pipeline</label>
                <Select
                  value={ghl.pipelineId || undefined}
                  onValueChange={(v) =>
                    setG({
                      pipelineId: v,
                      pipelineName: pipelines.find((p) => p.id === v)?.name ?? "",
                      // reset stage selections when pipeline changes
                      stageSentId: "",
                      stageAcceptedId: "",
                      stageDeclinedId: "",
                    })
                  }
                >
                  <SelectTrigger className="mt-1 bg-card">
                    <SelectValue placeholder="Choose a pipeline" />
                  </SelectTrigger>
                  <SelectContent>
                    {pipelines.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedPipeline && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <StageMap
                    label="Quote Sent →"
                    value={ghl.stageSentId}
                    stages={stagesForMapping}
                    onChange={(v) => setG({ stageSentId: v })}
                  />
                  <StageMap
                    label="Approved →"
                    value={ghl.stageAcceptedId}
                    stages={stagesForMapping}
                    onChange={(v) => setG({ stageAcceptedId: v })}
                  />
                  <StageMap
                    label="Declined →"
                    value={ghl.stageDeclinedId}
                    stages={stagesForMapping}
                    onChange={(v) => setG({ stageDeclinedId: v })}
                  />
                </div>
              )}

              <div className="flex items-center justify-between rounded-lg border bg-card px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">Enable sync</p>
                  <p className="text-xs text-muted-foreground">
                    Push contacts + opportunities to GoHighLevel on status changes
                  </p>
                </div>
                <Switch checked={ghl.enabled} onCheckedChange={(v) => setG({ enabled: v })} />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={onSaveGhl}
                  disabled={saveGhl.isPending || !ghl.pipelineId}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {saveGhl.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save GoHighLevel integration
                </button>
                <button
                  onClick={() => checkFields.mutate()}
                  disabled={checkFields.isPending || !hasToken}
                  title="Re-check which GoHighLevel contact fields will receive the link and price"
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {checkFields.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  Check field mapping
                </button>
                {hasToken && (
                  <button
                    onClick={() => disconnectGhl.mutate()}
                    disabled={disconnectGhl.isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-destructive transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    Disconnect
                  </button>
                )}
              </div>

              {fieldMatch && (
                <div className="mt-1 rounded-lg border bg-card p-3 text-xs">
                  <p className="mb-2 font-semibold text-foreground">
                    Contact field mapping
                    {typeof fieldMatch.totalContactFields === "number" && (
                      <span className="ml-1 font-normal text-muted-foreground">
                        ({fieldMatch.totalContactFields} contact fields scanned)
                      </span>
                    )}
                  </p>
                  <FieldRow
                    label="Estimate Link URL"
                    field={fieldMatch.estimate}
                    created={fieldMatch.estimateCreated}
                  />
                  <FieldRow label="Price" field={fieldMatch.price} optional />
                  {fieldMatch.detail && (
                    <p className="mt-2 text-muted-foreground">{fieldMatch.detail}</p>
                  )}
                  {!fieldMatch.price && (
                    <p className="mt-2 text-muted-foreground">
                      No <strong>Price</strong> contact field found. If your Price field uses a
                      different name, rename it to “Price” in GoHighLevel (or tell us the exact
                      field key) and re-check.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mt-4 rounded-lg bg-secondary/40 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">What gets sent to GoHighLevel</p>
            <p className="mt-1">
              Use <strong>Check field mapping</strong> after saving to confirm the link and price
              will land in the right contact fields.
            </p>
            <p className="mt-1">
              Contact: name, email, phone, address, city, state, zip, the quote price in the{" "}
              <strong>“Price”</strong> field, and the public quote link in the{" "}
              <strong>“Estimate Link URL”</strong> field (auto-created on the contact if missing).
              Opportunity: created in the mapped pipeline stage with the quote price as its monetary
              value.
            </p>
          </div>
        </div>

        {/* Housecall Pro v2 API integration */}
        <div className="rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-2 mb-1">
            <CalendarClock className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Housecall Pro</h2>
            {settings?.hcpV2Enabled && (
              <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="h-3 w-3" /> Enabled
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Runs in parallel with GoHighLevel. When a quote is sent, QuoteBid matches or creates the
            customer in Housecall Pro and builds an estimate. When a quote is{" "}
            <strong>approved</strong>, QuoteBid creates an{" "}
            <strong>unscheduled job</strong> (work status “needs scheduling”) with the selected
            package as a line item — your team just drags it onto the calendar.
          </p>

          {/* API key status */}
          <div className="flex items-center gap-2 rounded-lg border bg-secondary/30 p-3 text-sm">
            {hcpHasKey ? (
              <>
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span className="text-foreground">
                  API key configured securely on the server.
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
                <span className="text-foreground">
                  No API key set. Add <span className="font-mono">HOUSECALL_PRO_API_KEY</span> in
                  Settings → Secrets to connect.
                </span>
              </>
            )}
          </div>

          {/* Test + enable */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => testHcp.mutate()}
              disabled={!hcpHasKey || testHcp.isPending}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              {testHcp.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              Test connection
            </button>
            {hcpTest && (
              <span
                className={`inline-flex items-center gap-1 text-sm ${
                  hcpTest.ok ? "text-emerald-600" : "text-destructive"
                }`}
              >
                {hcpTest.ok ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                {hcpTest.label}
              </span>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Enable Housecall Pro sync</p>
              <p className="text-xs text-muted-foreground">
                Sync customers + estimates on send, and create unscheduled jobs on approval.
              </p>
            </div>
            <Switch
              checked={hcpEnabled}
              onCheckedChange={toggleHcp}
              disabled={!hcpHasKey || saveHcp.isPending}
            />
          </div>

          {settings?.hcpLastTestAt && (
            <p className="mt-2 text-xs text-muted-foreground">
              Last tested {new Date(settings.hcpLastTestAt).toLocaleString()} —{" "}
              {settings.hcpLastTestStatus || "unknown"}
            </p>
          )}

          <div className="mt-4 rounded-lg bg-secondary/40 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">What gets sent to Housecall Pro</p>
            <p className="mt-1">
              Customer: name, email, phone, company, and service address. Estimate: one option per
              package with totals. On approval: an unscheduled job with the selected package as a
              line item plus a dated note on the customer. Housecall Pro’s API can’t flip an estimate
              to “approved,” so the unscheduled job is the signal your team schedules from.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldRow({
  label,
  field,
  created,
  optional,
}: {
  label: string;
  field: MatchedField | null;
  created?: boolean;
  optional?: boolean;
}) {
  const matched = Boolean(field);
  return (
    <div className="flex items-start gap-2 py-1">
      {matched ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      ) : optional ? (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      ) : (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      )}
      <div className="min-w-0">
        <span className="font-medium text-foreground">{label}</span>{" "}
        {matched ? (
          <span className="text-muted-foreground">
            → matched{" "}
            <span className="font-mono">{field?.fieldKey || field?.name || field?.id}</span>
            {created && <span className="ml-1 text-emerald-600">(created)</span>}
          </span>
        ) : (
          <span className="text-muted-foreground">
            → {optional ? "not found (will be skipped)" : "not resolved"}
          </span>
        )}
      </div>
    </div>
  );
}

function StageMap({
  label,
  value,
  stages,
  onChange,
}: {
  label: string;
  value: string;
  stages: Stage[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
        <SelectTrigger className="mt-1 bg-card">
          <SelectValue placeholder="No stage" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>No stage</SelectItem>
          {stages.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
