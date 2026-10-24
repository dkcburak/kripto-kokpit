-- KasaNot bulut şeması (Supabase). Veri satırı = JSON; her işletme kendi satırlarını görür (RLS).
create table if not exists public.isletme (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  olusturma timestamptz not null default now()
);
create table if not exists public.uye (
  isletme uuid not null references public.isletme on delete cascade,
  kullanici uuid not null references auth.users on delete cascade,
  rol text not null default 'uye' check (rol in ('sahip','uye')),
  primary key (isletme, kullanici)
);
create table if not exists public.kayit (
  isletme uuid not null references public.isletme on delete cascade,
  depo text not null check (depo in ('cariler','hareketler','fiyatlar','personel','mesai','avans','dosyalar')),
  id bigint not null,
  veri jsonb not null default '{}'::jsonb,
  sil boolean not null default false,
  guncelleme timestamptz not null default now(),
  primary key (isletme, depo, id)
);
create index if not exists kayit_guncelleme_idx on public.kayit (isletme, guncelleme);

alter table public.isletme enable row level security;
alter table public.uye enable row level security;
alter table public.kayit enable row level security;

create or replace function public.uyemi(i uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.uye where isletme = i and kullanici = auth.uid())
$$;

drop policy if exists isletme_oku on public.isletme;
create policy isletme_oku on public.isletme for select to authenticated using (public.uyemi(id));
drop policy if exists uye_oku on public.uye;
create policy uye_oku on public.uye for select to authenticated using (public.uyemi(isletme));
drop policy if exists kayit_oku on public.kayit;
create policy kayit_oku on public.kayit for select to authenticated using (public.uyemi(isletme));
drop policy if exists kayit_ekle on public.kayit;
create policy kayit_ekle on public.kayit for insert to authenticated with check (public.uyemi(isletme));
drop policy if exists kayit_guncelle on public.kayit;
create policy kayit_guncelle on public.kayit for update to authenticated using (public.uyemi(isletme)) with check (public.uyemi(isletme));

-- Zaman damgasını sunucu verir (cihaz saati yanlış olsa da eşitleme bozulmaz)
create or replace function public.kayit_zaman() returns trigger language plpgsql as $$
begin new.guncelleme := clock_timestamp(); return new; end $$;
drop trigger if exists kayit_zaman_t on public.kayit;
create trigger kayit_zaman_t before insert or update on public.kayit for each row execute function public.kayit_zaman();

create or replace function public.isletme_olustur(p_ad text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if auth.uid() is null then raise exception 'giriş gerekli'; end if;
  if length(trim(coalesce(p_ad,''))) = 0 then raise exception 'ad gerekli'; end if;
  insert into public.isletme (ad) values (trim(p_ad)) returning id into v;
  insert into public.uye (isletme, kullanici, rol) values (v, auth.uid(), 'sahip');
  return v;
end $$;

create or replace function public.uye_ekle(p_isletme uuid, p_email text) returns void
language plpgsql security definer set search_path = public, auth as $$
declare k uuid;
begin
  if not exists (select 1 from public.uye where isletme = p_isletme and kullanici = auth.uid() and rol = 'sahip') then
    raise exception 'yalnız işletme sahibi üye ekleyebilir';
  end if;
  select id into k from auth.users where lower(email) = lower(trim(p_email));
  if k is null then raise exception 'Bu e-postayla kayıtlı kullanıcı yok; önce uygulamaya kayıt olsun.'; end if;
  insert into public.uye (isletme, kullanici, rol) values (p_isletme, k, 'uye') on conflict do nothing;
end $$;

create or replace function public.uyeler(p_isletme uuid) returns table (email text, rol text)
language sql stable security definer set search_path = public, auth as $$
  select u.email::text, m.rol from public.uye m join auth.users u on u.id = m.kullanici
  where m.isletme = p_isletme and public.uyemi(p_isletme)
$$;

-- Yetkiler (Data API'ye otomatik açma kapalı olduğundan elle verilir)
grant usage on schema public to authenticated;
grant select on public.isletme, public.uye to authenticated;
grant select, insert, update on public.kayit to authenticated;
revoke all on function public.uyemi(uuid), public.isletme_olustur(text), public.uye_ekle(uuid, text), public.uyeler(uuid) from public, anon;
grant execute on function public.uyemi(uuid), public.isletme_olustur(text), public.uye_ekle(uuid, text), public.uyeler(uuid) to authenticated;

-- Belge fotoğrafları (özel depo; yol: <isletme>/<kayıt id>)
insert into storage.buckets (id, name, public, file_size_limit)
values ('belgeler', 'belgeler', false, 10485760) on conflict (id) do nothing;
drop policy if exists belge_oku on storage.objects;
create policy belge_oku on storage.objects for select to authenticated
  using (bucket_id = 'belgeler' and public.uyemi(((storage.foldername(name))[1])::uuid));
drop policy if exists belge_ekle on storage.objects;
create policy belge_ekle on storage.objects for insert to authenticated
  with check (bucket_id = 'belgeler' and public.uyemi(((storage.foldername(name))[1])::uuid));
drop policy if exists belge_guncelle on storage.objects;
create policy belge_guncelle on storage.objects for update to authenticated
  using (bucket_id = 'belgeler' and public.uyemi(((storage.foldername(name))[1])::uuid));
