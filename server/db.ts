import { and, desc, eq, like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  Customer,
  InsertCustomer,
  InsertQuote,
  InsertService,
  InsertTeamUser,
  InsertUser,
  Quote,
  Service,
  Settings,
  TeamUser,
  customers,
  quotes,
  services,
  settings,
  teamUsers,
  users,
} from "../drizzle/schema";
import { DEFAULT_TIERS } from "../shared/pricing";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

function requireDb() {
  return getDb().then((db) => {
    if (!db) throw new Error("Database not available");
    return db;
  });
}

/* ----------------------------- Users ----------------------------- */

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];
  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/* --------------------------- Team Users (dashboard auth) --------------------------- */

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function listTeamUsers(): Promise<TeamUser[]> {
  const db = await requireDb();
  return db.select().from(teamUsers).orderBy(desc(teamUsers.createdAt));
}

export async function getTeamUserById(id: number): Promise<TeamUser | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(teamUsers).where(eq(teamUsers.id, id)).limit(1);
  return rows[0];
}

export async function getTeamUserByEmail(email: string): Promise<TeamUser | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(teamUsers)
    .where(eq(teamUsers.email, normalizeEmail(email)))
    .limit(1);
  return rows[0];
}

export async function getTeamUserByInviteToken(token: string): Promise<TeamUser | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(teamUsers)
    .where(eq(teamUsers.inviteToken, token))
    .limit(1);
  return rows[0];
}

export async function createTeamUser(data: InsertTeamUser): Promise<TeamUser> {
  const db = await requireDb();
  const values: InsertTeamUser = { ...data, email: normalizeEmail(data.email) };
  await db.insert(teamUsers).values(values);
  const created = await getTeamUserByEmail(values.email);
  if (!created) throw new Error("Failed to create team user");
  return created;
}

export async function updateTeamUser(
  id: number,
  data: Partial<InsertTeamUser>
): Promise<void> {
  const db = await requireDb();
  await db.update(teamUsers).set(data).where(eq(teamUsers.id, id));
}

export async function deleteTeamUser(id: number): Promise<void> {
  const db = await requireDb();
  await db.delete(teamUsers).where(eq(teamUsers.id, id));
}

export async function countTeamAdmins(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select()
    .from(teamUsers)
    .where(and(eq(teamUsers.role, "admin"), eq(teamUsers.status, "active")));
  return rows.length;
}

/* ----------------------------- Settings ----------------------------- */

// Returns the single settings row, creating it (with defaults + seed services) if missing.
export async function getOrCreateSettings(): Promise<Settings> {
  const db = await requireDb();
  const existing = await db.select().from(settings).limit(1);
  if (existing.length > 0) return existing[0];

  await db.insert(settings).values({ tiers: DEFAULT_TIERS });
  const created = await db.select().from(settings).limit(1);
  return created[0];
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const db = await requireDb();
  const current = await getOrCreateSettings();
  await db.update(settings).set(patch).where(eq(settings.id, current.id));
  const updated = await db.select().from(settings).where(eq(settings.id, current.id)).limit(1);
  return updated[0];
}

/* ----------------------------- Services ----------------------------- */

export async function listServices(activeOnly = false): Promise<Service[]> {
  const db = await requireDb();
  const rows = await db.select().from(services).orderBy(services.sortOrder, services.id);
  return activeOnly ? rows.filter((r) => r.active) : rows;
}

export async function createService(data: InsertService): Promise<Service> {
  const db = await requireDb();
  const res = await db.insert(services).values(data).$returningId();
  const id = (res as { id: number }[])[0].id;
  const row = await db.select().from(services).where(eq(services.id, id)).limit(1);
  return row[0];
}

export async function updateService(id: number, patch: Partial<InsertService>): Promise<Service> {
  const db = await requireDb();
  await db.update(services).set(patch).where(eq(services.id, id));
  const row = await db.select().from(services).where(eq(services.id, id)).limit(1);
  return row[0];
}

export async function deleteService(id: number): Promise<void> {
  const db = await requireDb();
  await db.delete(services).where(eq(services.id, id));
}

/* ----------------------------- Quotes ----------------------------- */

export async function createQuote(data: InsertQuote): Promise<Quote> {
  const db = await requireDb();
  const res = await db.insert(quotes).values(data).$returningId();
  const id = (res as { id: number }[])[0].id;
  const row = await db.select().from(quotes).where(eq(quotes.id, id)).limit(1);
  return row[0];
}

export async function getQuoteByToken(token: string): Promise<Quote | undefined> {
  const db = await requireDb();
  const row = await db.select().from(quotes).where(eq(quotes.publicToken, token)).limit(1);
  return row.length > 0 ? row[0] : undefined;
}

export async function getQuoteById(id: number): Promise<Quote | undefined> {
  const db = await requireDb();
  const row = await db.select().from(quotes).where(eq(quotes.id, id)).limit(1);
  return row.length > 0 ? row[0] : undefined;
}

export async function listQuotes(): Promise<Quote[]> {
  const db = await requireDb();
  return db.select().from(quotes).orderBy(desc(quotes.createdAt));
}

export async function updateQuote(id: number, patch: Partial<InsertQuote>): Promise<Quote> {
  const db = await requireDb();
  await db.update(quotes).set(patch).where(eq(quotes.id, id));
  const row = await db.select().from(quotes).where(eq(quotes.id, id)).limit(1);
  return row[0];
}

export async function listQuotesByCustomer(customerId: number): Promise<Quote[]> {
  const db = await requireDb();
  return db
    .select()
    .from(quotes)
    .where(eq(quotes.customerId, customerId))
    .orderBy(desc(quotes.createdAt));
}

/* ----------------------------- Customers ----------------------------- */

export async function listCustomers(search?: string): Promise<Customer[]> {
  const db = await requireDb();
  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    return db
      .select()
      .from(customers)
      .where(or(like(customers.name, q), like(customers.email, q), like(customers.phone, q)))
      .orderBy(desc(customers.updatedAt));
  }
  return db.select().from(customers).orderBy(desc(customers.updatedAt));
}

export async function getCustomerById(id: number): Promise<Customer | undefined> {
  const db = await requireDb();
  const row = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  return row.length > 0 ? row[0] : undefined;
}

export async function createCustomer(data: InsertCustomer): Promise<Customer> {
  const db = await requireDb();
  const res = await db.insert(customers).values(data).$returningId();
  const id = (res as { id: number }[])[0].id;
  const row = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  return row[0];
}

export async function updateCustomer(id: number, patch: Partial<InsertCustomer>): Promise<Customer> {
  const db = await requireDb();
  await db.update(customers).set(patch).where(eq(customers.id, id));
  const row = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  return row[0];
}

// Permanently delete a customer and all of their quotes.
export async function deleteCustomer(id: number): Promise<void> {
  const db = await requireDb();
  await db.delete(quotes).where(eq(quotes.customerId, id));
  await db.delete(customers).where(eq(customers.id, id));
}

// Find an existing customer by email or phone, otherwise create a new one.
export async function upsertCustomerFromQuote(input: {
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  altPhone?: string | null;
  okToText?: boolean | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  leadSource?: string | null;
}): Promise<Customer> {
  const db = await requireDb();
  let match: Customer | undefined;
  if (input.email) {
    const rows = await db.select().from(customers).where(eq(customers.email, input.email)).limit(1);
    match = rows[0];
  }
  if (!match && input.phone) {
    const rows = await db.select().from(customers).where(eq(customers.phone, input.phone)).limit(1);
    match = rows[0];
  }
  if (match) {
    return updateCustomer(match.id, {
      name: input.name || match.name,
      company: input.company ?? match.company,
      email: input.email ?? match.email,
      phone: input.phone ?? match.phone,
      altPhone: input.altPhone ?? match.altPhone,
      okToText: input.okToText ?? match.okToText,
      address: input.address ?? match.address,
      city: input.city ?? match.city,
      state: input.state ?? match.state,
      zip: input.zip ?? match.zip,
      leadSource: input.leadSource ?? match.leadSource,
    });
  }
  return createCustomer({
    name: input.name,
    company: input.company ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    altPhone: input.altPhone ?? null,
    okToText: input.okToText ?? null,
    address: input.address ?? null,
    city: input.city ?? null,
    state: input.state ?? null,
    zip: input.zip ?? null,
    leadSource: input.leadSource ?? null,
  });
}
