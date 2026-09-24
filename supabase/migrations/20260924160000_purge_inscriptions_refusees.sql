-- Durée de conservation annoncée dans la politique de confidentialité : les inscriptions
-- refusées par le contrôle anti-robot sont effacées au bout de 12 mois (chaque nuit, 3 h UTC).
select cron.schedule(
  'purge-inscriptions-refusees',
  '0 3 * * *',
  $$delete from public.inscriptions_refusees where cree_le < now() - interval '12 months'$$
);
