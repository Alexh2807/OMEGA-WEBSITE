import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  userType: 'pro' | 'particulier';
  setUserType: (type: 'pro' | 'particulier') => void;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    phone?: string
  ) => Promise<any>;
  signIn: (email: string, password: string) => Promise<any>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userType, setUserType] = useState<'pro' | 'particulier'>(
    'particulier'
  );
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // SÉCURITÉ (audit) : le statut admin vient UNIQUEMENT de profiles.role
    // (protégé par RLS) — plus aucun email codé en dur dans le bundle public.
    // ANTI-RACE (audit) : `loading` ne repasse à false qu'une fois le rôle
    // résolu, sinon AdminPage voyait un instant isAdmin=false et éjectait
    // un vrai admin vers l'accueil.
    const resolveAdmin = async (u: User | null) => {
      if (!u) {
        setIsAdmin(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', u.id)
          .single();
        setIsAdmin(!error && data?.role === 'admin');
      } catch (err) {
        console.error('Error checking user role:', err);
        setIsAdmin(false);
      }
    };

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      resolveAdmin(session?.user ?? null).finally(() => setLoading(false));
    });

    // Listen for auth changes — les appels Supabase sont déférés hors du
    // callback (recommandation supabase-js : éviter les requêtes await
    // directement dans onAuthStateChange).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setTimeout(() => {
        resolveAdmin(session?.user ?? null).finally(() => setLoading(false));
      }, 0);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    phone?: string
  ) => {
    const [firstName, ...lastNameParts] = fullName.trim().split(' ');
    const lastName = lastNameParts.join(' ');

    if (!firstName || !lastName) {
      return {
        data: null,
        error: { message: 'Veuillez saisir votre prénom et nom complets' },
      };
    }

    // Déterminer l'URL de base selon l'environnement
    const getBaseUrl = () => {
      // L'origine réelle du site (localhost en dev, omegasud.netlify.app ou
      // www.omegasud.fr en prod) ; VITE_SITE_URL en secours hors navigateur.
      if (typeof window !== 'undefined' && window.location?.origin) {
        return window.location.origin;
      }
      return import.meta.env.VITE_SITE_URL;
    };

    // Configuration avec email de confirmation Supabase et données utilisateur
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          first_name: firstName,
          last_name: lastName,
          phone: phone || null,
        },
        emailRedirectTo: `${getBaseUrl()}/email-confirmation`,
      },
    });

    // Le profil sera créé automatiquement par le trigger handle_new_user
    // avec les données du user_metadata incluant le téléphone

    return { data, error };
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setIsAdmin(false);
  };

  const value = {
    user,
    loading,
    isAdmin,
    userType,
    setUserType,
    signUp,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
