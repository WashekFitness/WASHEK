# WASHEK — Supabase + OpenRouter

This is the clean Supabase version of WASHEK. Runtime application code is disconnected from Base44.

## What this package contains

- React + Vite frontend
- Supabase Auth
- Supabase Postgres data layer with RLS
- Supabase Storage for user media
- Supabase Edge Functions
- OpenRouter for all server-side AI generation
- OpenRouter Auto Router (`openrouter/auto`) as the AI selector for every AI workflow
- Structured JSON generation for workout-program creation
- Multimodal image/video inputs for AI workflows where the selected OpenRouter model supports them
- Contact-message persistence and optional Resend email delivery
- Dark theme as the default, with the existing in-app light/dark preference retained

## Important: this is not a Base44 app

There are no Base44 runtime dependencies in this project. Do not add `@base44/sdk` or the Base44 Vite plugin back.

## 1. Install

Requirements:

- Node.js 20+
- npm
- A Supabase project
- An OpenRouter API key

```bash
npm install
```

## 2. Configure the browser

Copy `.env.example` to `.env` and fill in:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

The browser only receives the Supabase URL and publishable/anon key. Never put `OPENROUTER_API_KEY`, a Supabase service-role key, or another secret in a `VITE_` variable.

## 3. Create the Supabase schema

Link the local project to your Supabase project, then apply the migration:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

The migration creates the application tables, user-owned RLS policies, the `user-media` storage bucket, and storage policies.

## 4. Configure server secrets

Copy `.env.supabase.example` to `.env.supabase`, then set your real values.

```bash
supabase secrets set --env-file .env.supabase
```

The most important secret is:

```env
OPENROUTER_API_KEY=YOUR_OPENROUTER_KEY
OPENROUTER_MODEL=openrouter/auto
OPENROUTER_COST_TIER=high
```

`openrouter/auto` lets OpenRouter choose the model for the request instead of hard-coding WASHEK to one model. The Edge Function keeps the OpenRouter key server-side.

## 5. Deploy the Edge Functions

```bash
supabase functions deploy ai-generate
supabase functions deploy send-contact-email
```

The functions require a signed-in Supabase user. The browser invokes them with the user's Supabase session.

## 6. Run the app

```bash
npm run dev
```

Then open the local Vite URL shown in the terminal.

For production:

```bash
npm run build
npm run preview
```

## AI generation architecture

The browser does **not** call OpenRouter directly.

```text
React app
   |
   | Supabase Auth JWT
   v
Supabase Edge Function: ai-generate
   |
   | OPENROUTER_API_KEY (server-side secret)
   v
OpenRouter
   |
   | openrouter/auto
   v
OpenRouter-selected model/provider
```

Structured workout generation uses OpenRouter's JSON Schema response format. The Edge Function parses the JSON and returns a stable `{ success, result }` response to the app.

## Build My Program flow

The onboarding flow now:

1. Authenticates the user through Supabase Auth.
2. Saves the onboarding profile into `profiles`.
3. Generates the program structure through `ai-generate`.
4. Generates each training phase through `ai-generate`.
5. Generates phases concurrently instead of waiting for every phase sequentially.
6. Validates every AI result before continuing.
7. Saves the finished program to `workout_programs`.
8. Invalidates the React Query cache.
9. Shows the 100% completion state and routes to the dashboard.

The onboarding retry lock prevents duplicate clicks from creating duplicate programs while a request is running. All onboarding AI calls use the same `ai-generate` Supabase Edge Function.

## Metric/imperial storage

The database stores body weight in pounds (`weight_lbs`) and height in inches/centimeters as appropriate. The onboarding page now converts metric weight input to pounds before saving, while preserving the user's selected display unit.

## Dark theme

Dark mode is applied before the React tree renders and is the default. A stored explicit light preference still wins if the user chooses it in app settings.

## Notes

The source is packaged so the app is ready to install/build/deploy, but your actual Supabase project credentials and OpenRouter secret must be supplied by you. Those cannot safely be bundled into a downloadable source archive.
