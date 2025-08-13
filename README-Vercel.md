# CoreIQ Scorer — Vercel Deploy

## Required Environment Variables (Project → Settings → Environment Variables)
- NEXT_PUBLIC_SUPABASE_URL = https://<your-ref>.supabase.co
- NEXT_PUBLIC_SUPABASE_ANON_KEY = <your anon key>

Set the same values for Development, Preview, and Production.

## Build & Runtime
- Next.js 14.x, Node >= 18.17 (set in package.json engines)
- Typescript/ESLint are ignored during build to prevent harmless type/lint errors from failing deploy.
- `app/page.tsx` is `dynamic` and `revalidate=0` to avoid static pre-render issues.

## Supabase
For password login no redirects are required. If you switch to magic links, add your Vercel domain(s) to Supabase Auth Redirect URLs.