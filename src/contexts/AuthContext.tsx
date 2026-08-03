import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  /* Lecture seule : « pro » se règle dans le compte (profiles.is_company),
     pas par un bouton d'interface — voir le commentaire dans resolveAdmin. */
  userType: 'pro' | 'particulier';
  /* Relit le statut EN BASE. À appeler après une déclaration d'entreprise, sinon
     l'en-tête continue d'afficher « Particulier · Prix TTC » alors que le client
     vient de se déclarer société — incohérence relevée à l'usage.
     ⚠ Ne prend AUCUN paramètre : on ne choisit pas son statut, on le relit. */
  rafraichirStatut: () => Promise<void>;
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
  /* Le résolveur est défini dans l'effet ; on le garde sous la main pour pouvoir le
     rejouer à la demande sans dupliquer la requête. */
  const resolveRef = useRef<((u: User | null) => Promise<void>) | null>(null);

  useEffect(() => {
    // SÉCURITÉ (audit) : le statut admin vient UNIQUEMENT de profiles.role
    // (protégé par RLS) — plus aucun email codé en dur dans le bundle public.
    // ANTI-RACE (audit) : `loading` ne repasse à false qu'une fois le rôle
    // résolu, sinon AdminPage voyait un instant isAdmin=false et éjectait
    // un vrai admin vers l'accueil.
    /* ⚠ Le statut « pro » vient DU PROFIL, plus d'un bouton d'interface.
       Avant, « Pro / Particulier » était une bascule libre dans l'en-tête : n'importe
       qui cliquait « Pro » et voyait les prix HT, soit 20 % de moins. Ça n'a plus
       d'effet sur le montant débité (le serveur seul l'arrête depuis le 3 août), mais
       l'affichage mentait — le client découvrait le vrai prix au moment de payer.
       Désormais : est « pro » celui qui s'est déclaré entreprise dans son compte. */
    const resolveAdmin = async (u: User | null) => {
      if (!u) {
        setIsAdmin(false);
        setUserType('particulier');
        return;
      }
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('role, is_company')
          .eq('id', u.id)
          .single();
        setIsAdmin(!error && data?.role === 'admin');
        setUserType(!error && data?.is_company ? 'pro' : 'particulier');
      } catch (err) {
        console.error('Error checking user role:', err);
        setIsAdmin(false);
        setUserType('particulier');
      }
    };

    resolveRef.current = resolveAdmin;

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

  /* Relit le statut en base. Utilisé après une déclaration d'entreprise faite depuis
     le panier : sans cela l'en-tête affichait encore « Particulier · Prix TTC » alors
     que le client venait de se déclarer société et voyait sa TVA passer à 0 %. */
  const rafraichirStatut = async () => {
    if (resolveRef.current) await resolveRef.current(user);
  };

  const value = {
    user,
    loading,
    isAdmin,
    userType,
    rafraichirStatut,
    signUp,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
