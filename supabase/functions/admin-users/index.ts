import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Créer un client Supabase avec la clé service_role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    // Vérifier l'authentification de l'utilisateur
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Token invalide' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Vérifier si l'utilisateur est admin
    const adminEmails = ['alexishidalgo34000@gmail.com'];
    const isEmailAdmin = adminEmails.includes(user.email || '');

    let isDbAdmin = false;
    try {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      isDbAdmin = profile?.role === 'admin';
    } catch (err) {
      console.log('Erreur vérification profil:', err);
    }

    if (!isEmailAdmin && !isDbAdmin) {
      return new Response(
        JSON.stringify({ error: 'Accès refusé - Admin requis' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (req.method === 'GET') {
      // Lister tous les utilisateurs
      const {
        data: { users },
        error: usersError,
      } = await supabaseAdmin.auth.admin.listUsers();

      if (usersError) {
        console.error('Erreur listing users:', usersError);
        return new Response(
          JSON.stringify({
            error: 'Erreur lors du chargement des utilisateurs',
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Récupérer les profils correspondants
      const userIds = users.map(u => u.id);
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .in('id', userIds);

      // Combiner les données
      const usersWithProfiles = users.map(user => {
        const profile = profiles?.find(p => p.id === user.id);

        // Récupérer le display name depuis les métadonnées utilisateur
        const displayName =
          user.user_metadata?.full_name ||
          user.user_metadata?.display_name ||
          user.user_metadata?.first_name ||
          (profile?.first_name && profile?.last_name
            ? `${profile.first_name} ${profile.last_name}`
            : profile?.first_name) ||
          user.email?.split('@')[0] ||
          'Utilisateur';

        return {
          id: user.id,
          email: user.email,
          display_name: displayName,
          full_name: displayName, // Alias pour compatibilité
          created_at: user.created_at,
          email_confirmed_at: user.email_confirmed_at,
          last_sign_in_at: user.last_sign_in_at,
          profile: profile || null,
          user_metadata: user.user_metadata || {},
          role: profile?.role || 'customer',
        };
      });

      return new Response(JSON.stringify({ users: usersWithProfiles }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (req.method === 'POST') {
      // Mettre à jour le rôle d'un utilisateur
      const { userId, role } = await req.json();

      if (!userId || !role) {
        return new Response(
          JSON.stringify({ error: 'userId et role requis' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Mettre à jour le profil
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id: userId,
          role: role,
          updated_at: new Date().toISOString(),
        });

      if (updateError) {
        console.error('Erreur mise à jour rôle:', updateError);
        return new Response(
          JSON.stringify({ error: 'Erreur lors de la mise à jour du rôle' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Méthode non supportée' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Erreur inattendue:', error);
    return new Response(
      JSON.stringify({ error: 'Erreur serveur inattendue' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
