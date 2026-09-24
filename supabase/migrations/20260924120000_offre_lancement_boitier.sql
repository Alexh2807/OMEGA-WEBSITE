-- ════════════════════════════════════════════════════════════════════════════
-- OFFRE DE LANCEMENT — Boîtier OMEGA DMX (SKU OMGA-DMX-ITF)
-- 479 € TTC jusqu'au 31 décembre 2026, puis 599 € TTC à partir du 1er janvier 2027.
--
-- ⚖ Présentée comme un PRIX DE LANCEMENT avec annonce du prix futur, et NON comme
-- un prix barré : le boîtier était vendu 469 € dans les 30 jours précédents, or un
-- prix barré doit être le prix le plus bas des 30 derniers jours (art. L112-1-1 du
-- Code de la consommation, directive Omnibus). `original_price` reste donc NULL.
--
-- Le prix encaissé vient de `products.price_ht` (recalcul serveur dans devis-commande,
-- TTC = HT × 1,2) : les deux colonnes sont tenues cohérentes.
--   479 € TTC → 399,17 € HT (399,17 × 1,2 = 479,004 → 479,00)
--   599 € TTC → 499,17 € HT (499,17 × 1,2 = 599,004 → 599,00)
-- ════════════════════════════════════════════════════════════════════════════

update public.products
   set price = 479.00, price_ht = 399.17, original_price = null, updated_at = now()
 where sku = 'OMGA-DMX-ITF';

-- Réglage lu par le site (bandeau, fiche produit, pages boîtier/logiciel).
-- Le site masque aussi l'offre de lui-même passé `fin`, même si la tâche ci-dessous
-- n'avait pas encore tourné.
insert into public.site_settings (key, value)
values ('offre_lancement', jsonb_build_object(
  'actif', true,
  'sku', 'OMGA-DMX-ITF',
  'prix_lancement_ttc', 479,
  'prix_apres_ttc', 599,
  'fin', '2026-12-31T23:59:59+01:00',
  'lien', '/omega-dmx-interface'
))
on conflict (key) do update set value = excluded.value;

-- Fin automatique : le 1er janvier à 00:00 (Paris) = 31 décembre 23:00 UTC.
create extension if not exists pg_cron;

create or replace function public.appliquer_fin_offre_lancement()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o jsonb;
begin
  select value into o from site_settings where key = 'offre_lancement';
  if o is null or coalesce((o->>'actif')::boolean, false) = false then
    return;
  end if;
  if now() < (o->>'fin')::timestamptz then
    return; -- pas encore : la tâche annuelle ne fait rien avant l'échéance
  end if;
  update products
     set price = (o->>'prix_apres_ttc')::numeric,
         price_ht = round((o->>'prix_apres_ttc')::numeric / 1.2, 2),
         original_price = null,
         updated_at = now()
   where sku = o->>'sku';
  update site_settings set value = o || jsonb_build_object('actif', false, 'terminee_le', now())
   where key = 'offre_lancement';
  perform cron.unschedule('fin-offre-lancement');
end;
$$;

revoke all on function public.appliquer_fin_offre_lancement() from public, anon, authenticated;

select cron.schedule('fin-offre-lancement', '0 23 31 12 *', $$select public.appliquer_fin_offre_lancement()$$);
