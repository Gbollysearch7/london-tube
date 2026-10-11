-- Restore signed-in security for the in-game phone. Apply BEFORE any public release.
-- Requires "Allow anonymous sign-ins" to be enabled in Supabase Auth settings.
-- See SECURITY-TODO.md for the matching game-side change.

-- Test-mode players have no sign-in account; remove them (cascades to their chats and messages).
delete from public.profiles p where not exists (select 1 from auth.users u where u.id = p.id);
delete from public.conversations c where c.kind <> 'public' and not exists (select 1 from public.conversation_members m where m.conversation_id = c.id);

alter table public.profiles alter column id drop default;
alter table public.profiles add constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade;

drop policy "test: read players" on public.profiles;
drop policy "test: create player" on public.profiles;
drop policy "test: edit player" on public.profiles;
drop policy "test: read chats" on public.conversations;
drop policy "test: read members" on public.conversation_members;
drop policy "test: mark read" on public.conversation_members;
drop policy "test: leave group" on public.conversation_members;
drop policy "test: read messages" on public.messages;
drop policy "test: send" on public.messages;
drop policy "test: read blocks" on public.blocks;
drop policy "test: block" on public.blocks;
drop policy "test: unblock" on public.blocks;
drop policy "test: read activity" on public.activity;
drop policy "test: post activity" on public.activity;

create policy "players are visible to players" on public.profiles for select to authenticated using (true);
create policy "create own profile" on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy "edit own profile" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "see public and own chats" on public.conversations for select to authenticated using (kind = 'public' or public.is_member(id));

create policy "see members of my chats" on public.conversation_members for select to authenticated using (public.can_read(conversation_id));
create policy "mark own chats read" on public.conversation_members for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "leave a group" on public.conversation_members for delete to authenticated
  using (user_id = (select auth.uid()) and exists (select 1 from public.conversations c where c.id = conversation_id and c.kind = 'group'));

create policy "read my chats" on public.messages for select to authenticated using (public.can_read(conversation_id));
create policy "send as myself" on public.messages for insert to authenticated with check (sender_id = (select auth.uid()) and public.can_read(conversation_id));

create policy "see own blocks" on public.blocks for select to authenticated using (blocker = (select auth.uid()));
create policy "block" on public.blocks for insert to authenticated with check (blocker = (select auth.uid()));
create policy "unblock" on public.blocks for delete to authenticated using (blocker = (select auth.uid()));

create policy "activity is public to players" on public.activity for select to authenticated using (true);
create policy "post own activity" on public.activity for insert to authenticated with check (user_id = (select auth.uid()));

-- Chat functions take the player from the sign-in again, not from an argument.
drop function public.start_dm(uuid, uuid);
drop function public.create_group(uuid, text, text, uuid[]);
drop function public.add_to_group(uuid, uuid, uuid[]);
drop function public.join_lobby(uuid);

create function public.start_dm(other uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  k text;
  conv uuid;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if other = me then raise exception 'You cannot message yourself'; end if;
  if not exists (select 1 from public.profiles where id = other) then raise exception 'No such player'; end if;
  k := least(me::text, other::text) || ':' || greatest(me::text, other::text);
  select id into conv from public.conversations where dm_key = k;
  if conv is null then
    insert into public.conversations (kind, dm_key, created_by) values ('dm', k, me) returning id into conv;
    insert into public.conversation_members (conversation_id, user_id) values (conv, me), (conv, other);
  end if;
  return conv;
end $$;

create function public.create_group(group_name text, group_emoji text, members uuid[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  conv uuid;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if coalesce(array_length(members, 1), 0) > 30 then raise exception 'Groups hold up to 30 players'; end if;
  insert into public.conversations (kind, name, emoji, created_by) values ('group', btrim(group_name), coalesce(nullif(group_emoji, ''), '👥'), me) returning id into conv;
  insert into public.conversation_members (conversation_id, user_id)
    select conv, p.id from public.profiles p where p.id = me or p.id = any(members)
    on conflict do nothing;
  return conv;
end $$;

create function public.add_to_group(conv uuid, members uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.conversations c where c.id = conv and c.kind = 'group') or not public.is_member(conv) then
    raise exception 'You are not in that group';
  end if;
  insert into public.conversation_members (conversation_id, user_id)
    select conv, p.id from public.profiles p where p.id = any(members)
    on conflict do nothing;
end $$;

create function public.join_lobby() returns uuid
language plpgsql security definer set search_path = '' as $$
declare conv uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select id into conv from public.conversations where kind = 'public' order by created_at limit 1;
  insert into public.conversation_members (conversation_id, user_id) values (conv, auth.uid()) on conflict do nothing;
  return conv;
end $$;

revoke execute on function public.start_dm(uuid), public.create_group(text, text, uuid[]), public.add_to_group(uuid, uuid[]), public.join_lobby() from public, anon;
grant execute on function public.start_dm(uuid), public.create_group(text, text, uuid[]), public.add_to_group(uuid, uuid[]), public.join_lobby() to authenticated;

-- Daily challenge: anyone signed in can read and create today's challenge, but runs are posted as yourself.
drop policy "test: read daily" on public.daily_challenges;
drop policy "test: create daily" on public.daily_challenges;
drop policy "test: read runs" on public.daily_runs;
drop policy "test: post run" on public.daily_runs;
create policy "read daily" on public.daily_challenges for select to authenticated using (true);
create policy "create today's daily" on public.daily_challenges for insert to authenticated with check (day::date between current_date - 1 and current_date + 1);
create policy "read runs" on public.daily_runs for select to authenticated using (true);
create policy "post own run" on public.daily_runs for insert to authenticated with check (user_id = (select auth.uid()));
