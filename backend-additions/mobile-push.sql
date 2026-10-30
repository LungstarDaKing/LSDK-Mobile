-- LSDK Chat mobile app: push tokens (ADDITIVE ONLY: creates one new table + two functions; changes nothing that exists).
-- Run once in the Supabase SQL editor AFTER update-v0.14-push.sql.
create table if not exists public.mobile_push_tokens (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  token         text not null unique check (char_length(token) between 10 and 200 and token ~ '^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$'),
  platform      text not null check (platform in ('ios', 'android')),
  show_preview  boolean not null default true,
  updated_at    timestamptz not null default now()
);
create index if not exists mobile_push_tokens_profile_idx on public.mobile_push_tokens(profile_id);
alter table public.mobile_push_tokens enable row level security;
-- No policies on purpose: the app never reads or writes the table directly, only through the two functions below,
-- and the Edge Function reads it with the service role.

create or replace function public.save_mobile_push_token(p_token text, p_platform text, p_show_preview boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  if (select count(*) from public.mobile_push_tokens where profile_id = uid and token <> p_token) >= 10 then
    delete from public.mobile_push_tokens where id in (select id from public.mobile_push_tokens where profile_id = uid and token <> p_token order by updated_at limit 1);
  end if;
  insert into public.mobile_push_tokens (profile_id, token, platform, show_preview)
  values (uid, p_token, p_platform, coalesce(p_show_preview, true))
  on conflict (token) do update set profile_id = uid, platform = excluded.platform, show_preview = excluded.show_preview, updated_at = now();
end $$;

create or replace function public.remove_mobile_push_token(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.mobile_push_tokens where token = p_token and profile_id = auth.uid();
end $$;

revoke all on function public.save_mobile_push_token(text, text, boolean) from public, anon;
revoke all on function public.remove_mobile_push_token(text) from public, anon;
grant execute on function public.save_mobile_push_token(text, text, boolean) to authenticated;
grant execute on function public.remove_mobile_push_token(text) to authenticated;
