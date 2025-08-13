# CoreIQ Scorer v1.5.1

Next.js 14 + Tailwind. Supabase for auth/storage.
- Login: email + password only
- CSV / JSONL export from **Scoring**
- Local report compiler in **Report**

## Setup (Local)
1. Copy `.env.example` → `.env.local` and fill your Supabase vars.
2. `npm i`
3. `npm run dev`

## Deploy (Vercel)
Set these in **Project → Settings → Environment Variables** (Production/Preview/Development):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Then deploy.
