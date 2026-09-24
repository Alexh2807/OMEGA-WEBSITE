// Remplace npm:@supabase/supabase-js : le client est la fausse base du banc.
export const createClient = () =>
  new Proxy({}, { get: (_, k) => globalThis.__fakeSupabase[k] });
