-- ════════════════════════════════════════════════════════════════════════════
-- FILTRE ANTI-ROBOTS À L'INSCRIPTION (hook Supabase Auth « Before User Created »)
--
-- Constat (24 sept 2026) : 53 des 55 comptes étaient des robots de « bombardement
-- d'inscriptions » — ils inscrivent l'adresse d'une VICTIME (souvent une vraie adresse
-- étrangère) pour lui faire recevoir nos e-mails de confirmation. Signature :
--   • prénom / nom en consonnes aléatoires : « Fbcroug », « Xeikdx », « Wwvihtx » ;
--   • Gmail truffé de points : « o.foyap.o.ye.b6.2.4@gmail.com » ;
--   • téléphone +33 + 9 chiffres au hasard.
--
-- Règle d'or : AUCUN signal seul ne bloque. Réglé sur les 53 robots réels et sur
-- 66 495 combinaisons de VRAIS noms difficiles (polonais, tchèque, gallois, géorgien,
-- vietnamien, africains, indiens, basques, bretons, noms très courts) :
--   → 28/53 robots refusés, 0 faux positif.
-- La barrière principale est le captcha maison (preuve de calcul, 20260924150000) ; ce
-- filtre est le filet de sécurité côté serveur, que l'API seule ne contourne pas.
--
-- Côté formulaire : champ piège + délai minimal + case « Je ne suis pas un robot » (AuthPage.tsx).
-- ⚠ ACTIVATION : Dashboard Supabase > Authentication > Hooks > « Before User Created »
--   > Postgres > public.hook_filtre_inscription.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.inscriptions_refusees (
  id bigint generated always as identity primary key,
  cree_le timestamptz not null default now(),
  email text,
  prenom text,
  nom text,
  telephone text,
  score jsonb,
  motif text
);
alter table public.inscriptions_refusees enable row level security;
revoke all on public.inscriptions_refusees from anon, authenticated;
create policy inscriptions_refusees_admin_lecture on public.inscriptions_refusees
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
grant select on public.inscriptions_refusees to authenticated;

-- Paires de consonnes « improbables » dans un mot déjà normalisé (a-z).
create or replace function public.antirobot_paires_rares(mot text)
returns int
language plpgsql
immutable
as $$
declare
  n int := 0;
  i int;
  a text;
  b text;
  voy constant text := 'aeiouy';
  liantes constant text := 'lrnhsmw';
  ok constant text[] := string_to_array(
    'ck ct pt ps ts tz cz sz dz zd gd kt ks gn mb mp nd nt ng nk nc nz '
    'bb cc dd ff gg kk pp tt zz ll mm nn rr ss '
    'bd bj dj dv dg gb gt kb kd kf kp kv kz pf pk tk tc tj tv tx vd xt zk zt zb zg zp zc zv '
    'bt ft gk dt pc cq cs xs xc dk gz jk kc tp vk bz dp', ' ');
begin
  if mot is null then return 0; end if;
  for i in 1 .. length(mot) - 1 loop
    a := substr(mot, i, 1);
    b := substr(mot, i + 1, 1);
    continue when position(a in voy) > 0 or position(b in voy) > 0;
    continue when position(a in liantes) > 0 or position(b in liantes) > 0;
    continue when (a || b) = any(ok);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Score d'un nom : paires rares + 2 par lettre triplée + 2 par mot (≥4 lettres) sans voyelle.
create or replace function public.antirobot_score_nom(nom text)
returns int
language plpgsql
immutable
as $$
declare
  s int := 0;
  m text;
  norm text;
begin
  if nom is null then return 0; end if;
  norm := lower(translate(nom,
    'ÀÁÂÃÄÅàáâãäåÇçÈÉÊËèéêëÌÍÎÏìíîïÑñÒÓÔÕÖØòóôõöøÙÚÛÜùúûüÝýÿŁłŚśŹźŻżŃńĆćĘęĄąŠšŽžČčŘřĚěŮůŤťĎďŇňĞğİıŞşÆæŒœßÐðÞþ',
    'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOOooooooUUUUuuuuYyyLlSsZzZzNnCcEeAaSsZzCcRrEeUuTtDdNnGgIiSsAaOosDdTt'));
  foreach m in array regexp_split_to_array(norm, '[\s\-'']+') loop
    m := regexp_replace(m, '[^a-z]', '', 'g');
    continue when m = '';
    s := s + public.antirobot_paires_rares(m);
    if m ~ '(.)\1\1' then s := s + 2; end if;
    if length(m) >= 4 and m !~ '[aeiouy]' then s := s + 2; end if;
  end loop;
  return s;
end;
$$;

-- Gmail « à points » : ≥3 points (+1) et ≥2 segments de 1-2 caractères (+1).
create or replace function public.antirobot_gmail_points(email text)
returns int
language plpgsql
immutable
as $$
declare
  loc text;
  dom text;
  segs text[];
  courts int := 0;
  s text;
begin
  loc := lower(split_part(coalesce(email, ''), '@', 1));
  dom := lower(split_part(coalesce(email, ''), '@', 2));
  if dom not in ('gmail.com', 'googlemail.com') then return 0; end if;
  segs := string_to_array(loc, '.');
  foreach s in array segs loop
    if length(s) <= 2 then courts := courts + 1; end if;
  end loop;
  return (case when array_length(segs, 1) - 1 >= 3 then 1 else 0 end)
       + (case when courts >= 2 then 1 else 0 end);
end;
$$;

create or replace function public.hook_filtre_inscription(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  u jsonb := event->'user';
  meta jsonb := coalesce(u->'user_metadata', '{}'::jsonb);
  email text := u->>'email';
  prenom text := meta->>'first_name';
  nom text := meta->>'last_name';
  p int;
  n int;
  g int;
  total int;
  bloque boolean;
begin
  -- Nom complet seul (ancien formulaire) : on le découpe comme le site.
  if prenom is null and meta ? 'full_name' then
    prenom := split_part(meta->>'full_name', ' ', 1);
    nom := nullif(substr(meta->>'full_name', length(prenom) + 2), '');
  end if;
  p := public.antirobot_score_nom(prenom);
  n := public.antirobot_score_nom(nom);
  g := public.antirobot_gmail_points(email);
  total := p + n;
  bloque := (p >= 2 and n >= 2) or (total >= 3 and g >= 1) or (total >= 1 and g >= 2) or total >= 4;
  if not bloque then
    return '{}'::jsonb;
  end if;
  insert into inscriptions_refusees (email, prenom, nom, telephone, score, motif)
  values (email, prenom, nom, meta->>'phone',
          jsonb_build_object('prenom', p, 'nom', n, 'gmail', g, 'total', total),
          'filtre_noms');
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 400,
    'message', 'inscription_refusee_controle'));
end;
$$;

-- Le hook est appelé par le service Auth, et par lui seul.
grant execute on function public.hook_filtre_inscription(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_filtre_inscription(jsonb) from public, anon, authenticated;
grant insert on public.inscriptions_refusees to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
