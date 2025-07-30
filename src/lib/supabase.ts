import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Validation des variables d'environnement
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Variables d'environnement Supabase manquantes:");
  console.error(
    'VITE_SUPABASE_URL:',
    supabaseUrl ? '✓ Définie' : '✗ Manquante'
  );
  console.error(
    'VITE_SUPABASE_ANON_KEY:',
    supabaseAnonKey ? '✓ Définie' : '✗ Manquante'
  );
  throw new Error(
    "Variables d'environnement Supabase manquantes. Vérifiez votre fichier .env"
  );
}

// Validation du format URL
try {
  new URL(supabaseUrl);
} catch (error) {
  console.error('URL Supabase invalide:', supabaseUrl);
  throw new Error(
    `URL Supabase invalide: ${supabaseUrl}. Vérifiez le format dans votre fichier .env`
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Auth helpers
export const signUp = async (
  email: string,
  password: string,
  fullName: string
) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  });
  return { data, error };
};

export const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  return { error };
};

export const getCurrentUser = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
};
