import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import { DEFAULT_FORM_FIELDS } from "../../drizzle/schema";
import {
  createService,
  deleteService,
  getOrCreateSettings,
  listServices,
  updateService,
  updateSettings,
} from "../db";
import { storagePut } from "../storage";
import {
  testConnection as ghlTestConnection,
  listPipelines as ghlListPipelines,
  ensureContactFields as ghlEnsureContactFields,
} from "../ghl";
import { testConnection as hcpTestConnection } from "../hcp";
import { ENV } from "../_core/env";

const tierSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  // Additive per-package dollar rates
  basePrice: z.number().min(0),
  perBedroom: z.number().min(0),
  perBathroom: z.number().min(0),
  features: z.array(z.string()),
  highlighted: z.boolean().optional(),
  // tolerate legacy multiplier coming from older clients (ignored)
  multiplier: z.number().min(0).optional(),
});

const serviceInput = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  baseRate: z.number().min(0),
  variableKey: z.string().min(1),
  variableLabel: z.string().min(1),
  perUnitRate: z.number().min(0),
  minPrice: z.number().min(0),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const settingsRouter = router({
  // Public read of branding + tiers so the customer form can render correctly.
  getPublic: publicProcedure.query(async () => {
    const s = await getOrCreateSettings();
    return {
      companyName: s.companyName,
      companyEmail: s.companyEmail,
      companyPhone: s.companyPhone,
      logoUrl: s.logoUrl,
      primaryColor: s.primaryColor,
      accentColor: s.accentColor,
      backgroundColor: s.backgroundColor,
      textColor: s.textColor,
      cardColor: s.cardColor,
      heroImageUrl: s.heroImageUrl,
      heroOverlayColor: s.heroOverlayColor,
      heroOverlayOpacity: s.heroOverlayOpacity,
      heroTagline: s.heroTagline,
      formHeadline: s.formHeadline,
      formSubheadline: s.formSubheadline,
      formFields:
        Array.isArray(s.formFields) && s.formFields.length > 0
          ? s.formFields
          : DEFAULT_FORM_FIELDS,
      tiers: s.tiers,
    };
  }),

  // Full settings for admin. The GHL API token is redacted (never sent to the
  // client); a boolean flag indicates whether one is stored.
  get: adminProcedure.query(async () => {
    const s = await getOrCreateSettings();
    const { ghlApiToken, ...rest } = s;
    return {
      ...rest,
      ghlApiToken: null,
      ghlHasToken: Boolean(ghlApiToken),
      // HCP key lives in env (never exposed); flag whether one is present.
      hcpHasKey: Boolean(ENV.housecallProApiKey),
    };
  }),

  // ---- GHL v2: test the token + location id. ----
  testGhl: adminProcedure
    .input(z.object({ token: z.string().optional(), locationId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const s = await getOrCreateSettings();
      const token = input.token && input.token.length > 0 ? input.token : s.ghlApiToken || "";
      return ghlTestConnection({ token, locationId: input.locationId });
    }),

  // ---- GHL v2: list pipelines + stages for the mapping UI. ----
  listGhlPipelines: adminProcedure
    .input(z.object({ token: z.string().optional(), locationId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const s = await getOrCreateSettings();
      const token = input.token && input.token.length > 0 ? input.token : s.ghlApiToken || "";
      return ghlListPipelines({ token, locationId: input.locationId });
    }),

  // ---- GHL v2: persist config, ensure the Estimate Link URL custom field. ----
  saveGhl: adminProcedure
    .input(
      z.object({
        token: z.string().optional(), // omit/blank to keep the stored token
        locationId: z.string().min(1),
        pipelineId: z.string().min(1),
        pipelineName: z.string().optional(),
        stageSentId: z.string().nullable().optional(),
        stageAcceptedId: z.string().nullable().optional(),
        stageDeclinedId: z.string().nullable().optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const s = await getOrCreateSettings();
      const token = input.token && input.token.length > 0 ? input.token : s.ghlApiToken || "";
      if (!token) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A GHL API token is required" });
      }
      // Discover the contact custom fields (Estimate Link URL + Price). The
      // estimate field is created on the contact model if missing; Price is
      // matched only (often a native field). Best-effort: never blocks saving.
      const fields = await ghlEnsureContactFields({ token, locationId: input.locationId });
      const updated = await updateSettings({
        ghlApiToken: token,
        ghlLocationId: input.locationId,
        ghlPipelineId: input.pipelineId,
        ghlPipelineName: input.pipelineName ?? null,
        ghlStageSentId: input.stageSentId ?? null,
        ghlStageAcceptedId: input.stageAcceptedId ?? null,
        ghlStageDeclinedId: input.stageDeclinedId ?? null,
        ghlEstimateFieldId: fields.estimateFieldId ?? null,
        ghlPriceFieldId: fields.priceFieldId ?? null,
        ghlV2Enabled: input.enabled ?? true,
      });
      return {
        ok: true,
        estimateField: { ok: fields.ok, status: fields.status, fieldId: fields.estimateFieldId },
        priceFieldId: fields.priceFieldId,
        // Full diagnostics so the UI can show exactly which fields matched.
        fieldMatch: {
          status: fields.status,
          estimate: fields.estimateField ?? null,
          price: fields.priceField ?? null,
          estimateCreated: fields.estimateCreated ?? false,
          totalContactFields: fields.totalContactFields ?? null,
          detail: fields.detail ?? null,
        },
        ghlV2Enabled: updated.ghlV2Enabled,
      };
    }),

  // ---- GHL v2: re-run contact field discovery against the saved connection
  //      without changing the mapping. Surfaces exactly which fields matched. ----
  ghlFieldDiagnostics: adminProcedure.mutation(async () => {
    const s = await getOrCreateSettings();
    const token = s.ghlApiToken || "";
    const locationId = s.ghlLocationId || "";
    if (!token || !locationId) {
      return { ok: false, status: "not_connected" as const };
    }
    const fields = await ghlEnsureContactFields({ token, locationId });
    // Persist any newly resolved/created ids so a future send uses them.
    if (fields.estimateFieldId || fields.priceFieldId) {
      await updateSettings({
        ghlEstimateFieldId: fields.estimateFieldId ?? s.ghlEstimateFieldId ?? null,
        ghlPriceFieldId: fields.priceFieldId ?? s.ghlPriceFieldId ?? null,
      });
    }
    return {
      ok: fields.ok,
      status: fields.status,
      estimate: fields.estimateField ?? null,
      price: fields.priceField ?? null,
      estimateCreated: fields.estimateCreated ?? false,
      totalContactFields: fields.totalContactFields ?? null,
      detail: fields.detail ?? null,
    };
  }),

  // ---- GHL v2: disconnect (clear token + disable). ----
  disconnectGhl: adminProcedure.mutation(async () => {
    await updateSettings({
      ghlApiToken: null,
      ghlV2Enabled: false,
    });
    return { ok: true };
  }),

  // ---- Housecall Pro v2 API: test connectivity using the env key. ----
  testHcp: adminProcedure.mutation(async () => {
    if (!ENV.housecallProApiKey) {
      const res = { ok: false, status: "not_configured", detail: "No Housecall Pro API key is set" };
      await updateSettings({ hcpLastTestAt: new Date(), hcpLastTestStatus: res.status });
      return res;
    }
    const res = await hcpTestConnection();
    await updateSettings({
      hcpLastTestAt: new Date(),
      hcpLastTestStatus: res.ok ? "synced" : res.status,
    });
    return res;
  }),

  // ---- Housecall Pro v2 API: enable/disable the integration. ----
  saveHcp: adminProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      if (input.enabled && !ENV.housecallProApiKey) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Add a Housecall Pro API key before enabling the integration.",
        });
      }
      const updated = await updateSettings({ hcpV2Enabled: input.enabled });
      return { ok: true, hcpV2Enabled: updated.hcpV2Enabled };
    }),

  // ---- Housecall Pro v2 API: disable the integration. ----
  disconnectHcp: adminProcedure.mutation(async () => {
    await updateSettings({ hcpV2Enabled: false });
    return { ok: true };
  }),

  update: adminProcedure
    .input(
      z.object({
        companyName: z.string().min(1).optional(),
        companyEmail: z.string().email().or(z.literal("")).nullable().optional(),
        companyPhone: z.string().nullable().optional(),
        primaryColor: z.string().optional(),
        accentColor: z.string().optional(),
        backgroundColor: z.string().optional(),
        textColor: z.string().optional(),
        cardColor: z.string().optional(),
        heroImageUrl: z.string().nullable().optional(),
        heroOverlayColor: z.string().optional(),
        heroOverlayOpacity: z.number().int().min(0).max(100).optional(),
        heroTagline: z.string().optional(),
        formHeadline: z.string().optional(),
        formSubheadline: z.string().nullable().optional(),
        formFields: z
          .array(
            z.object({
              key: z.enum([
                "customerName",
                "customerEmail",
                "customerPhone",
                "propertyAddress",
                "propertyCity",
                "propertyState",
                "propertyZip",
              ]),
              label: z.string().min(1),
              enabled: z.boolean(),
              required: z.boolean(),
            }),
          )
          .optional(),
        quoteExpiryDays: z.number().int().min(1).max(365).optional(),
        tiers: z.array(tierSchema).optional(),
        ghlWebhookUrl: z.string().nullable().optional(),
        ghlEnabled: z.boolean().optional(),
        hcpWebhookUrl: z.string().nullable().optional(),
        hcpEnabled: z.boolean().optional(),
        hcpOnCreate: z.boolean().optional(),
        hcpOnAccept: z.boolean().optional(),
        autoDeliverEmail: z.boolean().optional(),
        autoDeliverSms: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return updateSettings(input as any);
    }),

  // Upload a logo (base64 data URL) and store it, persisting the public URL.
  uploadLogo: adminProcedure
    .input(z.object({ dataUrl: z.string(), fileName: z.string() }))
    .mutation(async ({ input }) => {
      const match = input.dataUrl.match(/^data:(.+);base64,(.*)$/);
      if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid image data" });
      const mime = match[1];
      const buffer = Buffer.from(match[2], "base64");
      const ext = mime.split("/")[1] || "png";
      const { url } = await storagePut(`branding/logo.${ext}`, buffer, mime);
      await updateSettings({ logoUrl: url });
      return { url };
    }),
});

export const servicesRouter = router({
  list: adminProcedure.query(async () => listServices(false)),

  // Public: active services for the customer quote form (no sensitive fields beyond pricing inputs).
  listPublic: publicProcedure.query(async () => {
    const rows = await listServices(true);
    return rows.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      variableKey: s.variableKey,
      variableLabel: s.variableLabel,
      baseRate: s.baseRate,
      perUnitRate: s.perUnitRate,
      minPrice: s.minPrice,
    }));
  }),

  create: adminProcedure.input(serviceInput).mutation(async ({ input }) => {
    return createService({
      name: input.name,
      description: input.description ?? null,
      baseRate: String(input.baseRate),
      variableKey: input.variableKey,
      variableLabel: input.variableLabel,
      perUnitRate: String(input.perUnitRate),
      minPrice: String(input.minPrice),
      active: input.active ?? true,
      sortOrder: input.sortOrder ?? 0,
    });
  }),

  update: adminProcedure
    .input(serviceInput.partial().extend({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      const patch: Record<string, unknown> = {};
      if (rest.name !== undefined) patch.name = rest.name;
      if (rest.description !== undefined) patch.description = rest.description ?? null;
      if (rest.baseRate !== undefined) patch.baseRate = String(rest.baseRate);
      if (rest.variableKey !== undefined) patch.variableKey = rest.variableKey;
      if (rest.variableLabel !== undefined) patch.variableLabel = rest.variableLabel;
      if (rest.perUnitRate !== undefined) patch.perUnitRate = String(rest.perUnitRate);
      if (rest.minPrice !== undefined) patch.minPrice = String(rest.minPrice);
      if (rest.active !== undefined) patch.active = rest.active;
      if (rest.sortOrder !== undefined) patch.sortOrder = rest.sortOrder;
      return updateService(id, patch);
    }),

  remove: adminProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input }) => {
    await deleteService(input.id);
    return { success: true };
  }),
});
