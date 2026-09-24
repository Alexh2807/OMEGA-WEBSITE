-- ════════════════════════════════════════════════════════════════════════════
-- CAPTCHA MAISON (preuve de calcul) + ADRESSES JETABLES + LISTE BLANCHE
--
-- Décision du 24/09/2026 : pas de service tiers (Turnstile, hCaptcha). Le captcha est
-- une PREUVE DE CALCUL vérifiée par la base elle-même, dans le hook Auth
-- « Before User Created » — un robot qui appelle l'API d'inscription sans passer par
-- le site est donc refusé aussi.
--
--   1. Le site demande un défi : `captcha_defi()` rend { sel, expire, difficulte,
--      signature } — signature HMAC-SHA256 avec une clé que seule la base connaît.
--   2. L'appareil cherche un `nonce` tel que SHA-256(sel ':' nonce) commence par
--      `difficulte` bits à zéro (20 bits : ≈ 0,3 s sur PC, 1-3 s sur téléphone, en arrière-plan).
--   3. Le hook vérifie : signature intacte, défi non expiré (10 min), calcul exact,
--      défi jamais utilisé. Chaque inscription coûte ce calcul : l'envoi en masse
--      devient lent et cher, sans rien demander de difficile à un humain.
--
-- Liste blanche `inscriptions_autorisees` : une adresse qu'un admin y inscrit passe
-- tous les contrôles (client écarté par erreur, compte créé à la main).
-- ════════════════════════════════════════════════════════════════════════════

-- Clé HMAC : générée en base, jamais exposée (aucun droit pour anon/authenticated).
create table if not exists public.captcha_cle (
  id boolean primary key default true check (id),
  cle bytea not null default extensions.gen_random_bytes(32)
);
insert into public.captcha_cle (id) values (true) on conflict do nothing;
alter table public.captcha_cle enable row level security;
revoke all on public.captcha_cle from anon, authenticated;

-- Défis consommés (anti-rejeu). Purgés au bout d'un jour par le hook.
create table if not exists public.captcha_utilises (
  sel text primary key,
  utilise_le timestamptz not null default now()
);
alter table public.captcha_utilises enable row level security;
revoke all on public.captcha_utilises from anon, authenticated;

-- Adresses jetables : domaines refusés. Ajout d'un domaine = une ligne, sans code.
create table if not exists public.domaines_jetables (
  domaine text primary key
);
alter table public.domaines_jetables enable row level security;
revoke all on public.domaines_jetables from anon, authenticated;
create policy domaines_jetables_admin on public.domaines_jetables for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
grant select, insert, update, delete on public.domaines_jetables to authenticated;
insert into public.domaines_jetables (domaine) values
  ('yopmail.com'),('yopmail.fr'),('yopmail.net'),('cool.fr.nf'),('jetable.fr.nf'),('courriel.fr.nf'),
  ('moncourrier.fr.nf'),('monemail.fr.nf'),('monmail.fr.nf'),('jetable.org'),('jetable.com'),
  ('mailinator.com'),('mailinator.net'),('mailinator.org'),('guerrillamail.com'),('guerrillamail.net'),
  ('guerrillamail.org'),('guerrillamail.biz'),('guerrillamailblock.com'),('sharklasers.com'),('grr.la'),
  ('pokemail.net'),('spam4.me'),('10minutemail.com'),('10minutemail.net'),('10minemail.com'),
  ('20minutemail.com'),('tempmail.com'),('temp-mail.org'),('temp-mail.io'),('tempmail.net'),
  ('tempmailo.com'),('tempail.com'),('tempr.email'),('throwawaymail.com'),('trashmail.com'),
  ('trashmail.net'),('trashmail.de'),('trashmail.io'),('mytrashmail.com'),('getnada.com'),('nada.email'),
  ('maildrop.cc'),('mintemail.com'),('mohmal.com'),('dispostable.com'),('fakeinbox.com'),('fakemail.net'),
  ('mailnesia.com'),('mailcatch.com'),('emailondeck.com'),('burnermail.io'),('spamgourmet.com'),
  ('mailpoof.com'),('mail.tm'),('mail.gw'),('inboxkitten.com'),('emailfake.com'),('fexpost.com'),
  ('mailtemp.info'),('tmail.ws'),('tmpmail.org'),('tmpmail.net'),('byom.de'),('discard.email'),
  ('discardmail.com'),('spambox.us'),('33mail.com'),('anonaddy.me'),('armyspy.com'),('cuvox.de'),
  ('dayrep.com'),('einrot.com'),('fleckens.hu'),('gustr.com'),('jourrapide.com'),('rhyta.com'),
  ('superrito.com'),('teleworm.us'),('mvrht.com'),('owlymail.com'),('linshiyouxiang.net'),('yomail.info'),
  ('boximail.com'),('email-temp.com'),('crazymailing.com'),('emltmp.com'),('tempmailaddress.com')
on conflict do nothing;

-- Liste blanche administrée.
create table if not exists public.inscriptions_autorisees (
  email text primary key,
  ajoute_le timestamptz not null default now(),
  note text
);
alter table public.inscriptions_autorisees enable row level security;
revoke all on public.inscriptions_autorisees from anon, authenticated;
create policy inscriptions_autorisees_admin on public.inscriptions_autorisees for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
grant select, insert, update, delete on public.inscriptions_autorisees to authenticated;

-- Difficulté : 20 bits ≈ 1 million d'essais en moyenne (≈ 0,3 s sur PC, 1-3 s sur téléphone,
-- calculés en arrière-plan pendant la saisie du formulaire).
create or replace function public.captcha_defi()
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  k bytea;
  sel text := encode(extensions.gen_random_bytes(16), 'hex');
  expire bigint := extract(epoch from now())::bigint + 600;
  diff int := 20;
begin
  select cle into k from public.captcha_cle where id;
  return jsonb_build_object(
    'sel', sel, 'expire', expire, 'difficulte', diff,
    'signature', encode(extensions.hmac(convert_to(sel || ':' || expire || ':' || diff, 'UTF8'), k, 'sha256'), 'hex'));
end;
$$;
revoke all on function public.captcha_defi() from public;
grant execute on function public.captcha_defi() to anon, authenticated;

-- Rend NULL si la preuve est valable (et la consomme), sinon le motif du refus.
create or replace function public.captcha_verifier(p jsonb)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  k bytea;
  v_sel text := p->>'sel';
  expire bigint;
  diff int;
  nonce text := p->>'nonce';
  h bytea;
  i int;
  reste int;
begin
  if p is null or v_sel is null or nonce is null or p->>'signature' is null then
    return 'absent';
  end if;
  if v_sel !~ '^[0-9a-f]{32}$' or nonce !~ '^[0-9]{1,15}$' then
    return 'format';
  end if;
  begin
    expire := (p->>'expire')::bigint;
    diff := (p->>'difficulte')::int;
  exception when others then
    return 'format';
  end;
  select cle into k from public.captcha_cle where id;
  if encode(extensions.hmac(convert_to(v_sel || ':' || expire || ':' || diff, 'UTF8'), k, 'sha256'), 'hex') <> p->>'signature' then
    return 'signature';
  end if;
  if diff < 20 then
    return 'difficulte';
  end if;
  if expire < extract(epoch from now())::bigint then
    return 'expire';
  end if;
  h := extensions.digest(convert_to(v_sel || ':' || nonce, 'UTF8'), 'sha256');
  reste := diff;
  i := 0;
  while reste >= 8 loop
    if get_byte(h, i) <> 0 then return 'calcul'; end if;
    reste := reste - 8;
    i := i + 1;
  end loop;
  if reste > 0 and (get_byte(h, i) >> (8 - reste)) <> 0 then
    return 'calcul';
  end if;
  delete from public.captcha_utilises where utilise_le < now() - interval '1 day';
  insert into public.captcha_utilises (sel) values (v_sel) on conflict do nothing;
  if not found then
    return 'deja_utilise';
  end if;
  return null;
end;
$$;
revoke all on function public.captcha_verifier(jsonb) from public, anon, authenticated;

-- Hook complet : liste blanche > adresse jetable > captcha > noms générés au hasard.
create or replace function public.hook_filtre_inscription(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  u jsonb := event->'user';
  meta jsonb := coalesce(u->'user_metadata', '{}'::jsonb);
  v_email text := lower(coalesce(u->>'email', ''));
  v_domaine text := split_part(lower(coalesce(u->>'email', '')), '@', 2);
  prenom text := meta->>'first_name';
  nom text := meta->>'last_name';
  motif_captcha text;
  p int;
  n int;
  g int;
  total int;
begin
  if exists (select 1 from inscriptions_autorisees a where lower(a.email) = v_email) then
    return '{}'::jsonb;
  end if;

  if exists (select 1 from domaines_jetables d where d.domaine = v_domaine) then
    insert into inscriptions_refusees (email, prenom, nom, telephone, score, motif)
    values (v_email, prenom, nom, meta->>'phone', null, 'email_jetable');
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 400, 'message', 'inscription_email_jetable'));
  end if;

  motif_captcha := public.captcha_verifier(meta->'captcha');
  if motif_captcha is not null then
    insert into inscriptions_refusees (email, prenom, nom, telephone, score, motif)
    values (v_email, prenom, nom, meta->>'phone', null, 'captcha_' || motif_captcha);
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 400, 'message', 'inscription_captcha'));
  end if;

  if prenom is null and meta ? 'full_name' then
    prenom := split_part(meta->>'full_name', ' ', 1);
    nom := nullif(substr(meta->>'full_name', length(prenom) + 2), '');
  end if;
  p := public.antirobot_score_nom(prenom);
  n := public.antirobot_score_nom(nom);
  g := public.antirobot_gmail_points(v_email);
  total := p + n;
  if (p >= 2 and n >= 2) or (total >= 3 and g >= 1) or (total >= 1 and g >= 2) or total >= 4 then
    insert into inscriptions_refusees (email, prenom, nom, telephone, score, motif)
    values (v_email, prenom, nom, meta->>'phone',
            jsonb_build_object('prenom', p, 'nom', n, 'gmail', g, 'total', total), 'filtre_noms');
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 400, 'message', 'inscription_refusee_controle'));
  end if;
  return '{}'::jsonb;
end;
$$;
grant execute on function public.hook_filtre_inscription(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_filtre_inscription(jsonb) from public, anon, authenticated;
grant select on public.inscriptions_autorisees, public.domaines_jetables to supabase_auth_admin;
grant insert on public.inscriptions_refusees to supabase_auth_admin;
grant execute on function public.captcha_verifier(jsonb) to supabase_auth_admin;

-- La preuve de calcul voyage dans les métadonnées d'inscription : on ne la garde pas
-- dans le compte (elle n'a plus aucune utilité une fois vérifiée).
create or replace function public.retirer_preuve_captcha()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.raw_user_meta_data ? 'captcha' then
    new.raw_user_meta_data := new.raw_user_meta_data - 'captcha';
  end if;
  return new;
end;
$$;
drop trigger if exists retirer_preuve_captcha_trg on auth.users;
create trigger retirer_preuve_captcha_trg before insert on auth.users
  for each row execute function public.retirer_preuve_captcha();
