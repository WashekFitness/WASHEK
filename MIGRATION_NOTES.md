# WASHEK migration notes

## Removed

- Base44 SDK dependency
- Base44 Vite plugin dependency
- Base44 API client path
- OpenAI-specific Edge Function implementation
- Hard-coded frontend Supabase credentials

## Added / changed

- Supabase-only frontend data/auth/storage layer
- Supabase Edge Functions with JWT authentication
- OpenRouter server-side AI integration
- OpenRouter Auto Router (`openrouter/auto`) for model selection
- OpenRouter structured JSON Schema output for program generation
- OpenRouter multimodal image/video input support
- Concurrent microcycle generation during onboarding
- Duplicate-click protection for Build My Program
- Metric weight conversion before storing in `weight_lbs`
- Dark theme bootstrapped before React renders
- Vite/Tailwind/PostCSS/JSConfig project configuration
- Supabase migration + RLS + storage policies
- Environment templates for browser and server secrets

## Important security rule

Never place any of these in a `VITE_` variable:

- `OPENROUTER_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- Resend API keys
- Stripe secret keys

Those belong in Supabase Edge Function secrets or another server-side secret manager.
