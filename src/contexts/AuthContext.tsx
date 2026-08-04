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
  /* PRÉFÉRENCE D'AFFICHAGE, à ne pas confondre avec le statut fiscal.
     Le pictogramme « Pro (HT) » de l'en-tête ressemblait à un interrupteur mais se
     contentait de renvoyer vers la page Compte : on cliquait, il ne se passait rien.
     Il bascule maintenant réellement l'affichage HT/TTC — et RIEN D'AUTRE : le taux
     réellement facturé reste décidé par le serveur d'après l'adresse de livraison. */
  affichagePrix: 'ht' | 'ttc';
  setAffichagePrix: (v: 'ht' | 'ttc') => void;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    phone?: string
  ) => Promise<any>;
  signIn: (email: string, password: string) => Promise<any>;
  signOut: () => Promise<void>;
  /* MOT DE PASSE OUBLIÉ — il n'existait AUCUN chemin de récupération : un client qui
     perdait son mot de passe perdait son compte, ses commandes et ses factures.
     `demanderReinitialisation` envoie le lien, `changerMotDePasse` l'applique une fois
     que Supabase a ouvert la session de récupération depuis ce lien. */
  demanderReinitialisation: (email: string) => Promise<{ error: string | null }>;
  changerMotDePasse: (motDePasse: string) => Promise<{ error: string | null }>;
}

/**
 * Origine réelle du site.
 *
 * ⚠ On NE se sert PAS de `VITE_SITE_URL` en premier : elle vaut
 * `https://www.omegasud.fr` alors que le domaine principal est `https://omegasud.fr`.
 * Un lien de confirmation ou de réinitialisation renvoyant sur l'autre hôte n'y
 * retrouve pas la session (le stockage local est cloisonné par origine), et le client
 * atterrit sur un formulaire qui ne sait plus qui il est. `window.location.origin`
 * renvoie TOUJOURS l'hôte d'où le client est parti : localhost en développement,
 * l'aperçu Netlify sur une branche, le domaine réel en production.
 * La variable d'environnement ne sert que de repli hors navigateur (rendu serveur,
 * tests) où `window` n'existe pas.
 */
export function origineSite(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return import.meta.env.VITE_SITE_URL || '';
}

/**
 * Traduit les messages d'erreur de Supabase, qui arrivent EN ANGLAIS.
 *
 * « Invalid login credentials » affiché tel quel à un client francophone ne lui dit
 * ni ce qui s'est passé, ni quoi faire. On reconnaît les cas courants et on répond en
 * français, en indiquant l'action suivante. Un message inconnu est repris tel quel :
 * mieux vaut une phrase en anglais qu'un « Une erreur est survenue » qui n'aide
 * personne à comprendre.
 */
export function traduireErreurAuth(message?: string | null): string {
  const m = (message || '').toLowerCase();

  if (m.includes('invalid login credentials') || m.includes('invalid credentials')) {
    return 'Adresse e-mail ou mot de passe incorrect. Vérifiez votre saisie, ou utilisez « Mot de passe oublié ? ».';
  }
  if (m.includes('email not confirmed')) {
    return "Votre adresse e-mail n'est pas encore confirmée. Ouvrez le message que nous vous avons envoyé et cliquez sur le lien de confirmation (pensez à regarder dans vos indésirables).";
  }
  if (m.includes('user already registered') || m.includes('already been registered')) {
    return 'Un compte existe déjà avec cette adresse e-mail. Connectez-vous, ou utilisez « Mot de passe oublié ? ».';
  }
  if (m.includes('password should be at least')) {
    return 'Mot de passe trop court : 6 caractères au minimum.';
  }
  if (m.includes('new password should be different')) {
    return "Le nouveau mot de passe doit être différent de l'ancien.";
  }
  if (m.includes('unable to validate email address') || m.includes('invalid email')) {
    return "Cette adresse e-mail n'est pas valide.";
  }
  if (m.includes('email rate limit') || m.includes('over_email_send_rate_limit')) {
    return 'Trop de messages demandés coup sur coup. Patientez quelques minutes avant de réessayer.';
  }
  if (m.includes('for security purposes') || m.includes('rate limit')) {
    return 'Trop de tentatives rapprochées. Patientez une minute avant de réessayer.';
  }
  if (m.includes('token has expired') || m.includes('expired')) {
    return 'Ce lien a expiré ou a déjà été utilisé. Demandez-en un nouveau.';
  }
  if (m.includes('auth session missing') || m.includes('session_not_found')) {
    return 'Votre session a expiré. Reconnectez-vous.';
  }
  if (m.includes('failed to fetch') || m.includes('network')) {
    return 'Connexion au serveur impossible. Vérifiez votre accès à Internet et réessayez.';
  }
  return message || 'Une erreur est survenue.';
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
  /* Par défaut TTC : c'est ce qu'impose l'affichage aux consommateurs. Un compte
     déclaré entreprise passe en HT, et le choix manuel du visiteur prime ensuite. */
  const [affichagePrix, setAffichageBrut] = useState<'ht' | 'ttc'>(() => {
    try {
      const v = localStorage.getItem('omega:affichage_prix');
      return v === 'ht' || v === 'ttc' ? v : 'ttc';
    } catch { return 'ttc'; }
  });
  const setAffichagePrix = (v: 'ht' | 'ttc') => {
    setAffichageBrut(v);
    try { localStorage.setItem('omega:affichage_prix', v); } catch { /* navigation privée */ }
  };
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
        const pro = !error && data?.is_company;
        setUserType(pro ? 'pro' : 'particulier');
        // Un compte entreprise voit le HT par défaut — sauf s'il a déjà choisi.
        try {
          if (!localStorage.getItem('omega:affichage_prix')) {
            setAffichageBrut(pro ? 'ht' : 'ttc');
          }
        } catch { /* ignoré */ }
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
        emailRedirectTo: `${origineSite()}/email-confirmation`,
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

  /* Envoie le lien de réinitialisation.
     ⚠ L'appelant ne doit PAS révéler si l'adresse existe : répondre « compte inconnu »
     transformerait ce formulaire en annuaire des clients d'OMEGA. Supabase renvoie
     d'ailleurs le même succès dans les deux cas — on garde ce comportement. */
  const demanderReinitialisation = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${origineSite()}/nouveau-mot-de-passe`,
    });
    return { error: error ? traduireErreurAuth(error.message) : null };
  };

  /* Applique le nouveau mot de passe.
     Fonctionne parce que le lien reçu par e-mail a DÉJÀ ouvert une session de
     récupération (`detectSessionInUrl` du client Supabase) : `updateUser` s'applique
     donc au bon compte, sans jamais avoir à transmettre l'ancien mot de passe. */
  const changerMotDePasse = async (motDePasse: string) => {
    const { error } = await supabase.auth.updateUser({ password: motDePasse });
    return { error: error ? traduireErreurAuth(error.message) : null };
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
    affichagePrix,
    setAffichagePrix,
    signUp,
    signIn,
    signOut,
    demanderReinitialisation,
    changerMotDePasse,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
