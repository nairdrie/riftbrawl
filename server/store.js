// ─────────────────────────────────────────────────────────────────────────────
// Persistence + auth, backed by Supabase.
//
// Identity ("your Archway account") lives in Supabase Auth — the browser signs
// in directly and hands us its access token, which we verify here. The social
// graph (fighter tags, friends, requests, W/L) lives in Postgres and is reached
// with the service-role key, so this module is the only thing that touches it.
//
// Every export is async — see server/index.js for the await call sites.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
    '(see .env.example and supabase/schema.sql).');
}

// Service-role client: full access, no user session, no token auto-refresh.
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const USERNAME_RE = /^[a-zA-Z0-9_]{3,16}$/;

// shape a profiles row + its social edges into the record the rest of the
// server expects ({ uid, username, wins, losses, friends:[uid], requestsIn:[uid] })
function shape(row, friends = [], requestsIn = []) {
  if (!row) return null;
  return {
    uid: row.id,
    username: row.username,
    wins: row.wins | 0,
    losses: row.losses | 0,
    is_admin: !!row.is_admin,
    created: row.created_at,
    friends,
    requestsIn,
  };
}

// ── auth ──────────────────────────────────────────────────────────────────────

// Verify a Supabase access token and return the player's hydrated profile.
// Creates the profile on first sight if the sign-up trigger didn't (defensive).
export async function verifyToken(accessToken) {
  if (!accessToken) return null;
  const { data, error } = await db.auth.getUser(String(accessToken));
  if (error || !data?.user) return null;
  await ensureProfile(data.user);
  return getUser(data.user.id);
}

// Make sure an auth user has a profiles row. Normally the on_auth_user_created
// trigger already did this; this only fires if the schema's trigger is missing
// or a user predates it.
async function ensureProfile(authUser) {
  const { data: existing } = await db
    .from('profiles').select('id').eq('id', authUser.id).maybeSingle();
  if (existing) return;

  const wanted = String(authUser.user_metadata?.username || '').trim();
  let base = USERNAME_RE.test(wanted)
    ? wanted
    : 'Fighter' + authUser.id.replace(/-/g, '').slice(0, 6);

  for (let attempt = 0; attempt < 5; attempt++) {
    const username = attempt === 0 ? base : `${base.slice(0, 12)}_${attempt}`;
    const { error } = await db.from('profiles').insert({ id: authUser.id, username });
    if (!error) return;
    if (error.code !== '23505') {        // not a unique-violation → give up
      console.error('[store] ensureProfile failed:', error.message);
      return;
    }
  }
}

// ── users ──────────────────────────────────────────────────────────────────────

export async function getUser(uid) {
  if (!uid) return null;
  const { data: row } = await db
    .from('profiles').select('*').eq('id', uid).maybeSingle();
  if (!row) return null;
  const [{ data: fr }, { data: rq }] = await Promise.all([
    db.from('friendships').select('b').eq('a', uid),
    db.from('friend_requests').select('from_id').eq('to_id', uid),
  ]);
  return shape(row, (fr || []).map(r => r.b), (rq || []).map(r => r.from_id));
}

export async function findUserByName(username) {
  const { data: row } = await db
    .from('profiles').select('*').eq('username', String(username)).maybeSingle();
  return row ? getUser(row.id) : null;
}

// Batch-load bare profiles (no edges) for a list of uids — used to build the
// social payload without N round-trips.
export async function getProfiles(uids) {
  if (!uids?.length) return [];
  const { data } = await db.from('profiles').select('*').in('id', uids);
  return (data || []).map(r => shape(r));
}

// ── friends ─────────────────────────────────────────────────────────────────

export async function sendFriendRequest(fromUid, toUsername) {
  const to = await findUserByName(toUsername);
  if (!to) return { error: 'No fighter with that tag' };
  if (to.uid === fromUid) return { error: "You can't befriend yourself" };
  if (to.friends.includes(fromUid)) return { error: 'Already friends' };

  // they already asked us — auto-accept instead of stacking a reverse request
  const { data: incoming } = await db.from('friend_requests')
    .select('from_id').eq('from_id', to.uid).eq('to_id', fromUid).maybeSingle();
  if (incoming) return acceptFriendRequest(fromUid, to.uid);

  const { data: outgoing } = await db.from('friend_requests')
    .select('from_id').eq('from_id', fromUid).eq('to_id', to.uid).maybeSingle();
  if (outgoing) return { error: 'Request already sent' };

  await db.from('friend_requests').insert({ from_id: fromUid, to_id: to.uid });
  return { to };
}

export async function acceptFriendRequest(uid, fromUid) {
  const them = await getUser(fromUid);
  const { data: req } = await db.from('friend_requests')
    .select('from_id').eq('from_id', fromUid).eq('to_id', uid).maybeSingle();
  if (!them || !req) return { error: 'No such request' };
  await db.from('friend_requests').delete().eq('from_id', fromUid).eq('to_id', uid);
  await db.from('friendships').upsert([
    { a: uid, b: fromUid },
    { a: fromUid, b: uid },
  ]);
  return { to: them };
}

export async function declineFriendRequest(uid, fromUid) {
  await db.from('friend_requests').delete().eq('from_id', fromUid).eq('to_id', uid);
  return {};
}

export async function removeFriend(uid, friendUid) {
  await db.from('friendships').delete()
    .or(`and(a.eq.${uid},b.eq.${friendUid}),and(a.eq.${friendUid},b.eq.${uid})`);
  return {};
}

export async function recordResult(winnerUid, loserUid) {
  if (!winnerUid || !loserUid) return;
  // never throw / reject: game.js fires this and forgets, so a stats hiccup
  // must not surface as an unhandled rejection on the match-end path
  try {
    const { error } = await db.rpc('record_match_result', {
      winner: winnerUid, loser: loserUid,
    });
    if (error) console.error('[store] recordResult failed:', error.message);
  } catch (e) {
    console.error('[store] recordResult threw:', e.message);
  }
}
