const isNode = typeof window === 'undefined';

const getAppParams = () => ({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  fromUrl: isNode ? '' : window.location.href,
});

export const appParams = getAppParams();
