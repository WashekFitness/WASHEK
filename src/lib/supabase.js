import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://edvvwnaxmjuvwnxineph.supabase.co';
const supabaseAnonKey = 'sb_publishable_hR5RWMT6qfPKbONf3G783A_Log5r61I';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
