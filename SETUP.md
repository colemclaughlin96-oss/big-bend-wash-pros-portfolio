# Big Bend Wash Pros — Setup & Redeploy Guide

This repo is a cleaned, white-label copy of the QuoteBid / ProposalPro instant-quoting
app, re-themed for a **pressure / exterior-washing** business. It contains the full
application code with demo data, dead code, and the previous tenant's secrets removed.

It is **not** a running Manus project yet. Follow the steps below to stand it up as a
fresh Manus webdev project with its own database and its own API tokens.

---

## What this app does

A public instant-quote tool plus an admin dashboard:

- **Public:** landing page → quote form → branded proposal page with selectable
  service packages and a Sign & Approve e-signature block.
- **Admin:** dashboard, quotes pipeline, customer CRM, pricing/package editor,
  branding editor, team management (invite-only email+password login), reports,
  and integration settings (GoHighLevel + Housecall Pro).

---

## How to redeploy as "Big Bend Wash Pros"

1. **Create a new Manus webdev project** and import this repo (or start a new task and
   point it at this GitHub repo). The new project gets its **own** database and its
   **own** secrets — nothing carries over from the original.
2. **Apply the database schema.** Run the Drizzle migrations / `pnpm db:push` against
   the new project's database so all tables are created.
3. **Set the secrets** (see below) using the new tokens you provide.
4. **Create the first admin** by promoting your team user row to `role = "admin"`
   (the first login is via `/admin/login` after an invite, or set the role in the DB).
5. **Open the Branding screen** and upload a logo + hero image, set the brand colors,
   company name, phone, and email.
6. **Open the Pricing screen** and replace the placeholder packages/prices with the
   real Big Bend services and rates.

---

## Required secrets / environment variables

These are **not** in the repo (by design). Provide them in the new project's Secrets:

| Key | Purpose | Notes |
|-----|---------|-------|
| `HOUSECALL_PRO_API_KEY` | Housecall Pro v2 API sync (customers, estimates, jobs) | New token for Big Bend's HCP account. Server-side only. |
| `HOUSECALL_PRO_API_URL` | HCP API base URL | Optional; defaults to `https://api.housecallpro.com`. |
| `JWT_SECRET` | Signs the team-login session cookie | Use a fresh random string. |

System-managed (auto-injected by Manus — you do **not** set these by hand):
`DATABASE_URL`, `VITE_APP_ID`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`,
`OWNER_OPEN_ID`, `OWNER_NAME`, `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY`,
`VITE_FRONTEND_FORGE_API_KEY`, `VITE_FRONTEND_FORGE_API_URL`, analytics keys.

**GoHighLevel** is configured at runtime in the admin **Settings → Connections**
screen (Private Integration token + Location + pipeline stage mapping), not via env.
Enter Big Bend's GHL token there after launch.

---

## What was changed from the original (so you can audit)

- **Removed dead code:** `ComponentShowcase`, `FormBuilder`, `Installation` pages
  (unrouted), and unused template components `AIChatBox` and `Map`.
- **Removed dev clutter:** the `scripts/` concept folder, `vite.config.ts.bak`, old
  design/dashboard notes, the previous tenant's reference doc, the 28KB `todo.md`,
  and the `.project-config.json`.
- **Re-themed content:** landing copy, default tier packages, and the inclusions
  checklist were swapped from interior house-cleaning to neutral pressure-washing
  placeholders. Default company name is now "Big Bend Wash Pros".
- **Default hero image** set to empty (renders a solid brand-color hero) so there is
  no broken image reference to the old project's storage. Upload one in Branding.
- **No demo data:** the app seeds only a single settings row on first boot. The CRM,
  quotes, and team tables start empty.
- **No secrets:** all tokens were stripped; provide new ones as above.

---

## Known limitations / honest caveats (read before the real build)

1. **Pricing model is additive, not square-footage.** The engine is
   `price = basePrice + inputA * rateA + inputB * rateB`. The two numeric inputs are
   generic placeholders (currently rendered as bedrooms/bathrooms in the form). For a
   real pressure-washing calculator (square footage, linear feet, per-surface, or flat
   per-service), the form inputs and pricing engine need to be reworked. This template
   is a starting point, not a finished washing calculator.
2. **The public quote form still asks for bedrooms/bathrooms.** Relabel or replace
   those inputs during the real build to match how Big Bend prices jobs.
3. **Recurring-cadence features are dormant.** The proposal supports cadence badges
   ("Every 2 weeks") and a savings strike-through, but those only fire for the old
   cleaning tier keys. With washing tiers they stay hidden (safe). If Big Bend wants a
   "bundle and save" framing, it's a clean add.
4. **Integration label strings still say "Proposal Pro" / "QuoteBid"** inside the
   Housecall Pro and GoHighLevel sync code (e.g. the HCP customer tag `"Proposal Pro"`,
   note prefixes `[QuoteBid]`, and the GHL payload `source: "ProposalPro"`). These are
   functional identifiers asserted by tests — left as-is to avoid breaking a tag the
   client may already segment on. Flip them with a find/replace during the real build
   once you know Big Bend's HCP/GHL setup, and update the matching tests.

---

## Local sanity check (optional)

```bash
pnpm install
pnpm check     # TypeScript check
pnpm test      # Run unit tests
```
