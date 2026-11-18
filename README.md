# Big Bend Wash Pros — quoting and CRM integration portfolio

A TypeScript web app for collecting service requests, generating package quotes, and moving accepted work into CRM and field-service systems. This portfolio snapshot uses synthetic contact details and contains no original Git history.

## What is implemented

- Public request form and shareable proposal pages with package selection and an approval/signature flow.
- Admin quote pipeline, customer records, reports, pricing and branding settings.
- Invite-only team login with bcrypt password hashing, signed session cookies, and admin/member authorization.
- GoHighLevel integration for contact upserts, opportunity stages, custom fields, and webhook payloads.
- Housecall Pro integration for customer matching/reconciliation, estimates, and creating unscheduled jobs after acceptance.
- Pure pricing, reporting, integration-payload, and authorization helpers covered by Vitest test files.

## Stack

React 19, TypeScript, Tailwind CSS, Vite, Express, tRPC, Drizzle ORM/MySQL, and Vitest. The application originated from a Manus web-app template; Manus OAuth, storage, and platform helpers remain in the code.

## Run and review

Use Node.js and pnpm 10. The package scripts use POSIX environment-variable syntax, so run them from Bash/WSL on Windows.

```bash
pnpm install --frozen-lockfile
pnpm check
export JWT_SECRET="$(node -p "require('node:crypto').randomBytes(32).toString('hex')")"
pnpm test
```

For a running app, configure a development MySQL database via `DATABASE_URL`, a fresh `JWT_SECRET`, and the Manus application/OAuth environment described in [SETUP.md](SETUP.md). Database-backed routes need the schema applied:

```bash
pnpm db:push
pnpm dev
```

The development server normally starts at port 3000. Build with `pnpm build` and start the built server with `pnpm start`. Keep tokens in untracked environment files or your deployment's secret store. GHL credentials are configured through the app's connection settings; Housecall Pro uses `HOUSECALL_PRO_API_KEY`.

See [TEMPLATE_GUIDE.md](TEMPLATE_GUIDE.md) for inherited framework documentation.

## Current limits

This is an adaptation template, not a completed production washing calculator. The pricing engine still uses additive bedroom/bathroom inputs inherited from a cleaning workflow; a real washing deployment needs its service units and rates adapted. Email/SMS delivery is delegated to configured external workflows. Full local operation needs database and Manus configuration, plus an initial admin user; the repository does not ship a live tenant or credentials.

The source includes integration logic and tests, but this snapshot does not establish live API compatibility, deployment readiness, or business results.
