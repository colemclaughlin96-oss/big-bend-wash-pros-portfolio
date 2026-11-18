import { boolean, decimal, int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Team members who log into the admin dashboard with email + password.
 * Invite-only: an admin creates a row (status "invited") with an invite token;
 * the invitee opens the link and sets a password, flipping status to "active".
 * This is independent of the Manus OAuth `users` table.
 */
export const teamUsers = mysqlTable("teamUsers", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: varchar("name", { length: 200 }),
  passwordHash: text("passwordHash"),
  role: mysqlEnum("role", ["admin", "member"]).default("member").notNull(),
  status: mysqlEnum("status", ["invited", "active"]).default("invited").notNull(),
  inviteToken: varchar("inviteToken", { length: 64 }),
  inviteExpiresAt: timestamp("inviteExpiresAt"),
  lastLoginAt: timestamp("lastLoginAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TeamUser = typeof teamUsers.$inferSelect;
export type InsertTeamUser = typeof teamUsers.$inferInsert;

/**
 * Singleton-style settings row (one per workspace). Holds branding config,
 * GHL webhook URL, quote expiry, and tier template configuration.
 */
export const settings = mysqlTable("settings", {
  id: int("id").autoincrement().primaryKey(),
  // Branding
  companyName: varchar("companyName", { length: 200 }).notNull().default("Big Bend Wash Pros"),
  companyEmail: varchar("companyEmail", { length: 320 }),
  companyPhone: varchar("companyPhone", { length: 40 }),
  logoUrl: text("logoUrl"),
  primaryColor: varchar("primaryColor", { length: 20 }).notNull().default("#3FA34D"),
  accentColor: varchar("accentColor", { length: 20 }).notNull().default("#5E8DB7"),
  // Extended theme colors
  backgroundColor: varchar("backgroundColor", { length: 20 }).notNull().default("#f4faf3"),
  textColor: varchar("textColor", { length: 20 }).notNull().default("#14241a"),
  cardColor: varchar("cardColor", { length: 20 }).notNull().default("#ffffff"),
  // Landing hero background
  heroImageUrl: text("heroImageUrl"),
  heroOverlayColor: varchar("heroOverlayColor", { length: 20 }).notNull().default("#14503a"),
  heroOverlayOpacity: int("heroOverlayOpacity").notNull().default(55),
  // Customer form copy
  formHeadline: varchar("formHeadline", { length: 200 }).notNull().default("Get Your Instant Wash Quote"),
  formSubheadline: text("formSubheadline"),
  heroTagline: varchar("heroTagline", { length: 120 }).notNull().default("Professional exterior washing, instant pricing"),
  // Form Builder: which customer fields are collected on the public form
  formFields: json("formFields").$type<FormFieldConfig[]>(),
  // Quote behavior
  quoteExpiryDays: int("quoteExpiryDays").notNull().default(30),
  // Tier configuration: array of { key, name, description, multiplier, features[] }
  tiers: json("tiers").$type<TierConfig[]>().notNull(),
  // GHL integration (legacy raw webhook, kept for back-compat)
  ghlWebhookUrl: text("ghlWebhookUrl"),
  ghlEnabled: boolean("ghlEnabled").notNull().default(false),
  // GHL v2 guided integration (Private Integration token + Location + pipeline stage mapping)
  ghlApiToken: text("ghlApiToken"),
  ghlLocationId: varchar("ghlLocationId", { length: 80 }),
  ghlPipelineId: varchar("ghlPipelineId", { length: 80 }),
  ghlPipelineName: varchar("ghlPipelineName", { length: 200 }),
  ghlStageNewLeadId: varchar("ghlStageNewLeadId", { length: 80 }),
  ghlStageSentId: varchar("ghlStageSentId", { length: 80 }),
  ghlStageAcceptedId: varchar("ghlStageAcceptedId", { length: 80 }),
  ghlStageDeclinedId: varchar("ghlStageDeclinedId", { length: 80 }),
  ghlEstimateFieldId: varchar("ghlEstimateFieldId", { length: 80 }),
  ghlPriceFieldId: varchar("ghlPriceFieldId", { length: 80 }),
  ghlV2Enabled: boolean("ghlV2Enabled").notNull().default(false),
  // Canonical public app base URL (auto-captured from the first public quote send)
  // used to build absolute quote links for CRM custom fields.
  appBaseUrl: text("appBaseUrl"),
  // Housecall Pro integration (webhook)
  hcpWebhookUrl: text("hcpWebhookUrl"),
  hcpEnabled: boolean("hcpEnabled").notNull().default(false),
  hcpOnCreate: boolean("hcpOnCreate").notNull().default(true),
  hcpOnAccept: boolean("hcpOnAccept").notNull().default(true),
  // Housecall Pro v2 API integration (uses HOUSECALL_PRO_API_KEY env, never stored in DB).
  // This is the real API sync (search/create customer, create/update estimate,
  // approve/decline), running in parallel with the GHL automation sync.
  hcpV2Enabled: boolean("hcpV2Enabled").notNull().default(false),
  hcpLastTestAt: timestamp("hcpLastTestAt"),
  hcpLastTestStatus: varchar("hcpLastTestStatus", { length: 80 }),
  // Auto delivery on form submission
  autoDeliverEmail: boolean("autoDeliverEmail").notNull().default(true),
  autoDeliverSms: boolean("autoDeliverSms").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TierConfig = {
  key: string; // stable id e.g. "biweekly"
  name: string; // custom label e.g. "Bi-Weekly"
  description: string;
  // Additive per-package dollar rates:
  //   price = basePrice + bedrooms*perBedroom + bathrooms*perBathroom
  basePrice: number;
  perBedroom: number;
  perBathroom: number;
  features: string[]; // bullet list of what's included
  highlighted?: boolean; // mark the "recommended" package
  multiplier?: number; // deprecated; tolerated on legacy rows
};

export type FormFieldKey =
  | "customerName"
  | "customerEmail"
  | "customerPhone"
  | "propertyAddress"
  | "propertyCity"
  | "propertyState"
  | "propertyZip";

export type FormFieldConfig = {
  key: FormFieldKey;
  label: string; // display label shown on the form
  enabled: boolean; // whether the field is shown at all
  required: boolean; // whether it must be filled to proceed
};

// Default field configuration used when settings.formFields is null.
export const DEFAULT_FORM_FIELDS: FormFieldConfig[] = [
  { key: "customerName", label: "Full name", enabled: true, required: true },
  { key: "customerEmail", label: "Email", enabled: true, required: false },
  { key: "customerPhone", label: "Phone", enabled: true, required: false },
  { key: "propertyAddress", label: "Street address", enabled: true, required: false },
  { key: "propertyCity", label: "City", enabled: true, required: false },
  { key: "propertyState", label: "State", enabled: true, required: false },
  { key: "propertyZip", label: "Zip", enabled: true, required: false },
];

export type Settings = typeof settings.$inferSelect;
export type InsertSettings = typeof settings.$inferInsert;

/**
 * A service offered by the business (e.g. Window Cleaning).
 * Pricing model: total = baseRate + (variableValue * perUnitRate)
 * Each service references one pricing variable type.
 */
export const services = mysqlTable("services", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  // Pricing inputs
  baseRate: decimal("baseRate", { precision: 10, scale: 2 }).notNull().default("0"),
  // The variable that drives pricing (e.g. "square_footage", "windows", "linear_feet", "flat")
  variableKey: varchar("variableKey", { length: 64 }).notNull().default("flat"),
  variableLabel: varchar("variableLabel", { length: 120 }).notNull().default("Quantity"),
  // Per-unit rate multiplied by the variable value
  perUnitRate: decimal("perUnitRate", { precision: 10, scale: 4 }).notNull().default("0"),
  // Minimum charge floor for this service
  minPrice: decimal("minPrice", { precision: 10, scale: 2 }).notNull().default("0"),
  // Whether this service is shown on the customer form
  active: boolean("active").notNull().default(true),
  // Display ordering
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Service = typeof services.$inferSelect;
export type InsertService = typeof services.$inferInsert;

/**
 * A customer/contact record (simple CRM). Auto-created/linked on every quote.
 */
export const customers = mysqlTable("customers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  company: varchar("company", { length: 200 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 40 }),
  altPhone: varchar("altPhone", { length: 40 }),
  okToText: boolean("okToText"),
  address: text("address"),
  city: varchar("city", { length: 120 }),
  state: varchar("state", { length: 60 }),
  zip: varchar("zip", { length: 20 }),
  leadSource: varchar("leadSource", { length: 120 }),
  hcpCustomerUrl: text("hcpCustomerUrl"),
  // Housecall Pro v2 API linkage
  hcpCustomerId: varchar("hcpCustomerId", { length: 80 }),
  hcpLastSyncedAt: timestamp("hcpLastSyncedAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = typeof customers.$inferInsert;

/**
 * A generated quote with customer info, the computed tiers snapshot,
 * a public share token, and status.
 */
export const quotes = mysqlTable("quotes", {
  id: int("id").autoincrement().primaryKey(),
  publicToken: varchar("publicToken", { length: 32 }).notNull().unique(),
  // Link to CRM customer (nullable for legacy rows)
  customerId: int("customerId"),
  // Source of the quote: public form vs internal builder
  source: mysqlEnum("source", ["public", "internal"]).notNull().default("public"),
  // Customer info
  customerName: varchar("customerName", { length: 200 }).notNull(),
  customerCompany: varchar("customerCompany", { length: 200 }),
  customerEmail: varchar("customerEmail", { length: 320 }),
  customerPhone: varchar("customerPhone", { length: 40 }),
  customerAltPhone: varchar("customerAltPhone", { length: 40 }),
  okToText: boolean("okToText"),
  propertyAddress: text("propertyAddress"),
  propertyCity: varchar("propertyCity", { length: 120 }),
  propertyState: varchar("propertyState", { length: 60 }),
  propertyZip: varchar("propertyZip", { length: 20 }),
  // Informational intake fields (not used in pricing math)
  leadSource: varchar("leadSource", { length: 120 }),
  projectType: mysqlEnum("projectType", ["residential", "commercial"]),
  floors: varchar("floors", { length: 40 }),
  discountGroup: varchar("discountGroup", { length: 80 }),
  // Building size info (informational; not used in pricing math)
  squareFeetActual: varchar("squareFeetActual", { length: 40 }),
  squareFeetEstimate: varchar("squareFeetEstimate", { length: 60 }),
  basement: boolean("basement"),
  // Pricing inputs (additive model): drive every package price
  bedrooms: int("bedrooms").notNull().default(0),
  bathrooms: int("bathrooms").notNull().default(0),
  // Snapshot of selected services + input values: [{ serviceId, name, variableValue, base }]
  serviceSelections: json("serviceSelections").$type<ServiceSelection[]>().notNull(),
  // Snapshot of computed tiers: [{ key, name, description, features, total }]
  computedTiers: json("computedTiers").$type<ComputedTier[]>().notNull(),
  // Branding snapshot (so the quote page renders consistently even if settings change)
  brandSnapshot: json("brandSnapshot").$type<BrandSnapshot>().notNull(),
  // Lifecycle
  status: mysqlEnum("status", ["draft", "pending", "accepted", "declined", "expired"]).notNull().default("pending"),
  selectedTierKey: varchar("selectedTierKey", { length: 64 }),
  expiresAt: timestamp("expiresAt").notNull(),
  acceptedAt: timestamp("acceptedAt"),
  declinedAt: timestamp("declinedAt"),
  // Customer e-signature captured at approval
  signature: varchar("signature", { length: 200 }),
  signedAt: timestamp("signedAt"),
  // First time the public proposal page was opened by the customer
  viewedAt: timestamp("viewedAt"),
  // Delivery tracking
  emailSentAt: timestamp("emailSentAt"),
  smsSentAt: timestamp("smsSentAt"),
  ghlSyncedAt: timestamp("ghlSyncedAt"),
  ghlStatus: varchar("ghlStatus", { length: 40 }),
  // Housecall Pro v2 API sync linkage + status
  hcpCustomerId: varchar("hcpCustomerId", { length: 80 }),
  hcpEstimateId: varchar("hcpEstimateId", { length: 80 }),
  // Unscheduled HCP job created on approval (work_status "needs scheduling")
  hcpJobId: varchar("hcpJobId", { length: 80 }),
  // synced | error | skipped | null(not attempted)
  hcpSyncStatus: varchar("hcpSyncStatus", { length: 40 }),
  hcpSyncError: text("hcpSyncError"),
  hcpLastSyncedAt: timestamp("hcpLastSyncedAt"),
  // When the draft was sent (pushed to the CRM pipeline / made live)
  sentAt: timestamp("sentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Snapshot of the pricing inputs captured at quote time. The additive model
// only needs bedrooms + bathrooms; the legacy fields remain optional so old
// rows still type-check.
export type ServiceSelection = {
  bedrooms?: number;
  bathrooms?: number;
  // ---- legacy (pre-additive) fields, tolerated on old rows ----
  serviceId?: number;
  name?: string;
  variableLabel?: string;
  variableValue?: number;
  base?: number;
};

export type ComputedTier = {
  key: string;
  name: string;
  description: string;
  features: string[];
  total: number;
  highlighted?: boolean;
};

export type BrandSnapshot = {
  companyName: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  cardColor: string;
  companyEmail: string | null;
  companyPhone: string | null;
};

export type Quote = typeof quotes.$inferSelect;
export type InsertQuote = typeof quotes.$inferInsert;
