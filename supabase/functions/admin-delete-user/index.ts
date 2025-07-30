import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async req => {
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

    const { userId } = await req.json();

    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId requis' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Empêcher l'auto-suppression
    if (userId === user.id) {
      return new Response(
        JSON.stringify({
          error: 'Impossible de supprimer votre propre compte',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`Début suppression utilisateur: ${userId}`);

    // Étape 1: Supprimer les éléments du panier
    try {
      const { error: cartError } = await supabaseAdmin
        .from('cart_items')
        .delete()
        .eq('user_id', userId);

      if (cartError) {
        console.error('Erreur suppression cart_items:', cartError);
      } else {
        console.log('✓ cart_items supprimés');
      }
    } catch (err) {
      console.error('Erreur cart_items:', err);
    }

    // Étape 2: Supprimer les éléments de commande
    try {
      // D'abord récupérer les IDs des commandes
      const { data: userOrders } = await supabaseAdmin
        .from('orders')
        .select('id')
        .eq('user_id', userId);

      if (userOrders && userOrders.length > 0) {
        const orderIds = userOrders.map(order => order.id);

        const { error: orderItemsError } = await supabaseAdmin
          .from('order_items')
          .delete()
          .in('order_id', orderIds);

        if (orderItemsError) {
          console.error('Erreur suppression order_items:', orderItemsError);
        } else {
          console.log('✓ order_items supprimés');
        }
      }
    } catch (err) {
      console.error('Erreur order_items:', err);
    }

    // Étape 3: Mettre à jour les références dans orders (last_updated_by)
    try {
      const { error: updateOrdersError } = await supabaseAdmin
        .from('orders')
        .update({ last_updated_by: null })
        .eq('last_updated_by', userId);

      if (updateOrdersError) {
        console.error(
          'Erreur mise à jour orders.last_updated_by:',
          updateOrdersError
        );
      } else {
        console.log('✓ Références orders.last_updated_by mises à jour');
      }
    } catch (err) {
      console.error('Erreur update orders:', err);
    }

    // Étape 4: Supprimer les commandes
    try {
      const { error: ordersError } = await supabaseAdmin
        .from('orders')
        .delete()
        .eq('user_id', userId);

      if (ordersError) {
        console.error('Erreur suppression orders:', ordersError);
      } else {
        console.log('✓ orders supprimées');
      }
    } catch (err) {
      console.error('Erreur orders:', err);
    }

    // Étape 5: Supprimer les adresses de livraison
    try {
      const { error: addressError } = await supabaseAdmin
        .from('shipping_addresses')
        .delete()
        .eq('user_id', userId);

      if (addressError) {
        console.error('Erreur suppression shipping_addresses:', addressError);
      } else {
        console.log('✓ shipping_addresses supprimées');
      }
    } catch (err) {
      console.error('Erreur shipping_addresses:', err);
    }

    // Étape 6: Mettre à jour les références dans contact_requests (assigned_to)
    try {
      const { error: updateContactError } = await supabaseAdmin
        .from('contact_requests')
        .update({ assigned_to: null })
        .eq('assigned_to', userId);

      if (updateContactError) {
        console.error(
          'Erreur mise à jour contact_requests.assigned_to:',
          updateContactError
        );
      } else {
        console.log('✓ Références contact_requests.assigned_to mises à jour');
      }
    } catch (err) {
      console.error('Erreur update contact_requests:', err);
    }

    // Étape 7: Supprimer les demandes de contact
    try {
      const { error: contactError } = await supabaseAdmin
        .from('contact_requests')
        .delete()
        .eq('user_id', userId);

      if (contactError) {
        console.error('Erreur suppression contact_requests:', contactError);
      } else {
        console.log('✓ contact_requests supprimées');
      }
    } catch (err) {
      console.error('Erreur contact_requests:', err);
    }

    // Étape 8: Mettre à jour les références dans admin_logs
    try {
      const { error: updateLogsError } = await supabaseAdmin
        .from('admin_logs')
        .update({ admin_id: null })
        .eq('admin_id', userId);

      if (updateLogsError) {
        console.error(
          'Erreur mise à jour admin_logs.admin_id:',
          updateLogsError
        );
      } else {
        console.log('✓ Références admin_logs.admin_id mises à jour');
      }
    } catch (err) {
      console.error('Erreur update admin_logs:', err);
    }

    // Étape 9: Supprimer les notes utilisateur
    try {
      const { error: notesError } = await supabaseAdmin
        .from('user_notes')
        .delete()
        .eq('user_id', userId);

      if (notesError) {
        console.error('Erreur suppression user_notes (user_id):', notesError);
      } else {
        console.log('✓ user_notes (user_id) supprimées');
      }

      // Mettre à jour les références admin_id
      const { error: notesAdminError } = await supabaseAdmin
        .from('user_notes')
        .update({ admin_id: null })
        .eq('admin_id', userId);

      if (notesAdminError) {
        console.error(
          'Erreur mise à jour user_notes.admin_id:',
          notesAdminError
        );
      } else {
        console.log('✓ Références user_notes.admin_id mises à jour');
      }
    } catch (err) {
      console.error('Erreur user_notes:', err);
    }

    // Étape 10: Supprimer les vérifications téléphone
    try {
      const { error: phoneError } = await supabaseAdmin
        .from('phone_verifications')
        .delete()
        .eq('user_id', userId);

      if (phoneError) {
        console.error('Erreur suppression phone_verifications:', phoneError);
      } else {
        console.log('✓ phone_verifications supprimées');
      }
    } catch (err) {
      console.error('Erreur phone_verifications:', err);
    }

    // Étape 11: Supprimer les vérifications email
    try {
      const { error: emailError } = await supabaseAdmin
        .from('email_verifications')
        .delete()
        .eq('user_id', userId);

      if (emailError) {
        console.error('Erreur suppression email_verifications:', emailError);
      } else {
        console.log('✓ email_verifications supprimées');
      }
    } catch (err) {
      console.error('Erreur email_verifications:', err);
    }

    // Étape 12: Mettre à jour les références dans system_settings
    try {
      const { error: updateSettingsError } = await supabaseAdmin
        .from('system_settings')
        .update({ updated_by: null })
        .eq('updated_by', userId);

      if (updateSettingsError) {
        console.error(
          'Erreur mise à jour system_settings.updated_by:',
          updateSettingsError
        );
      } else {
        console.log('✓ Références system_settings.updated_by mises à jour');
      }
    } catch (err) {
      console.error('Erreur update system_settings:', err);
    }

    // Étape 13: Supprimer l'utilisateur de auth.users (le profil sera supprimé automatiquement via CASCADE)
    try {
      console.log("Suppression de l'utilisateur auth...");
      const { error: deleteError } =
        await supabaseAdmin.auth.admin.deleteUser(userId);

      if (deleteError) {
        console.error('Erreur suppression utilisateur auth:', deleteError);
        return new Response(
          JSON.stringify({
            error: "Erreur lors de la suppression de l'utilisateur",
            details: deleteError.message,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      console.log('✓ Utilisateur supprimé avec succès');

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Utilisateur supprimé avec succès',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (deleteErr) {
      console.error('Erreur inattendue lors de la suppression:', deleteErr);
      return new Response(
        JSON.stringify({
          error: 'Erreur inattendue lors de la suppression',
          details: deleteErr.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (error) {
    console.error('Erreur inattendue:', error);
    return new Response(
      JSON.stringify({
        error: 'Erreur serveur inattendue',
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
