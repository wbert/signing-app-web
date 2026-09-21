# SigningApp web

The Next.js frontend for Northpoint Manpower Solutions' electronic document
approval, signing, archiving, and audit system.

The backend contract and product documentation live in the sibling
`signingapp-api` repository. The reviewed frontend delivery plan is in
[`docs/frontend-implementation-phases.md`](./docs/frontend-implementation-phases.md).

## Local setup

```bash
cp .env.example .env.local
npm install
npm run dev:https
```

Set `SIGNINGAPP_API_URL` to the deployed Lambda Function URL. It is a server-only
value used by Next.js rewrites; browser code calls relative `/api`,
`/audit-events`, and `/health` paths.

The API must use the exact local origin in its configuration:

```dotenv
APP_ORIGIN=https://localhost:3000
PASSWORD_SETUP_REDIRECT_URL=https://localhost:3000/set-password
BETTER_AUTH_URL=https://YOUR-API-LAMBDA-URL
```

The Lambda Function URL CORS configuration must also allow the exact HTTPS
frontend origin and credentials. Production-mode Better Auth cookies are secure,
so use the HTTPS development command for integration.

## Verification

```bash
npm run typecheck
npm run lint
npm run build
```

Before real-user testing, complete the credential rotation and environment
preflight in the API's `docs/frontend-handoff.md`.

## Local administrator bootstrap with a Lambda API

The bootstrap command runs locally; it does not need to execute in Lambda. It
must use the same Supabase database and authentication settings as the deployed
API. In `../signingapp-api/.env`, configure:

```dotenv
BETTER_AUTH_URL=https://YOUR-API-LAMBDA-URL
APP_ORIGIN=https://localhost:3000
PASSWORD_SETUP_REDIRECT_URL=https://localhost:3000/set-password
```

`DATABASE_URL`, `BETTER_AUTH_SECRET`, and the other backend credentials must
match the intended deployment. Do not copy those values into this frontend's
environment file.

Then run the idempotent bootstrap locally from the API repository:

```bash
bun run admin:bootstrap
```

The emailed link first visits Lambda to validate the single-use token, then
redirects to `/set-password?token=...`. The frontend removes that token from the
address bar and submits the password to Lambda through the same-origin proxy.
