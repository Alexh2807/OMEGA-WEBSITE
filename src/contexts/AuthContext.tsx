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
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      checkAdminStatus(session?.user);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null);
      checkAdminStatus(session?.user);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkAdminStatus = (user: User | null) => {
    if (user) {
      // Vérifier d'abord par email (pour la compatibilité)
      const adminEmails = ['alexishidalgo34000@gmail.com'];
      const isEmailAdmin = adminEmails.includes(user.email || '');

      if (isEmailAdmin) {
        setIsAdmin(true);
      } else {
        // Vérifier le rôle dans la base de données
        checkUserRole(user.id);
      }
    } else {
      setIsAdmin(false);
    }
  };

  const checkUserRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

      if (!error && data?.role === 'admin') {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
    } catch (err) {
      console.error('Error checking user role:', err);
      setIsAdmin(false);
    }
  };

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
      // TOUJOURS utiliser l'URL de production pour les emails
      // Même en développement local, on veut que l'email redirige vers le site en ligne
      return 'https://fluffy-jelly-a744a8.netlify.app';
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
