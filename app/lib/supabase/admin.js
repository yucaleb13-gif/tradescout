import { createClient } from '@supabase/supabase-js'

// Service-role client: cookie-free, bypasses RLS. Server-only.
export const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  }
)
