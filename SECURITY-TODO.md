# ⚠️ Before any public release: turn security back on

Online texting currently runs in **TEST MODE** (no sign-in), so it's easy to test with several players.

In test mode, anyone with the game's public Supabase key can read every chat (including 1:1 chats)
and post or edit as any player. That's fine for private testing, not for real players.

## Steps to restore security

1. In the Supabase dashboard (project `mind-the-gap`), go to **Authentication → Sign In / Providers**
   and turn on **Allow anonymous sign-ins**. Players still don't see a login screen.
2. Apply `supabase/restore-security.sql` to the database. It deletes test players and their chats,
   restores the row-level security rules and the signed-in versions of the chat functions.
3. Restore sign-in in `src/online/store.ts`: create the client with `persistSession: true`, and in
   `connect()` replace `localPlayerId()` with the signed-in user's id from
   `supabase.auth.getSession()` / `supabase.auth.signInAnonymously()`. The four `rpc` calls
   (`join_lobby`, `start_dm`, `create_group`, `add_to_group`) drop their `me` argument, since the
   server reads it from the sign-in.
4. Run the Supabase security advisor and confirm there are no new warnings.
