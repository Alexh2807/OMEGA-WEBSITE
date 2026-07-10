-- Table de suivi des factures électroniques (Factur-X)
-- Stocke le XML CII généré, le mode (test/live), le statut et la référence PA.

create table if not exists public.einvoices (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references public.invoices(id) on delete set null,
  order_id uuid,
  invoice_number text not null,
  -- Garde-fou : un paiement de test ne produit jamais de facture "live".
  mode text not null default 'test' check (mode in ('test','live')),
  format text not null default 'facturx-basic',
  status text not null default 'generated'
    check (status in ('generated','sandbox','to_transmit','transmitted','rejected','error')),
  currency text not null default 'EUR',
  total_ht numeric(12,2),
  total_tva numeric(12,2),
  total_ttc numeric(12,2),
  xml text,
  pdf_base64 text,
  pa_provider text,
  pa_reference text,
  transmitted_at timestamptz,
  error_message text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists einvoices_invoice_id_idx on public.einvoices(invoice_id);
create index if not exists einvoices_created_at_idx on public.einvoices(created_at desc);

alter table public.einvoices enable row level security;

-- Accès réservé aux administrateurs (profiles.role = 'admin').
-- (Le service_role des Edge Functions contourne la RLS.)
drop policy if exists "einvoices_admin_all" on public.einvoices;
create policy "einvoices_admin_all" on public.einvoices
  for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
