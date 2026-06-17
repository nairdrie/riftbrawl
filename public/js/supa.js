// ─────────────────────────────────────────────────────────────────────────────
// "Sign in with Archway" — auth via Supabase, owned entirely by the browser.
//
// The game server hands us the public Supabase config at /config; we create the
// client, run sign-in/sign-up here, and the rest of the app just asks us for the
// current access token to authenticate its websocket. No build step: the SDK is
// pulled as an ES module straight from the CDN.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TAG_RE = /^[A-Za-z0-9_]{3,16}$/;

let supabase = null;
let config = { studio: 'Archway Games', game: 'RIFTBRAWL' };

export async function initSupa() {
  if (supabase) return supabase;
  const res = await fetch('/config');
  config = await res.json();
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error('Archway sign-in is not configured on the server.');
  }
  supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'archway.auth' },
  });
  return supabase;
}

export function getConfig() { return config; }
export const TAG_PATTERN = TAG_RE;

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: friendly(error) };
  return { session: data.session };
}

export async function signUp(email, password, username) {
  if (!TAG_RE.test(username)) return { error: 'Fighter tag: 3–16 letters, numbers or _' };
  // nice instant feedback; the DB UNIQUE constraint is the real guarantee
  const { data: available } = await supabase.rpc('is_username_available', { tag: username });
  if (available === false) return { error: 'That fighter tag is already taken' };

  const { data, error } = await supabase.auth.signUp({
    email, password, options: { data: { username } },
  });
  if (error) return { error: friendly(error) };
  if (!data.session) return { needsConfirm: true };     // email confirmation on
  return { session: data.session };
}

export async function currentSession() {
  const { data } = await supabase.auth.getSession();
  return data.session || null;
}

export async function signOut() {
  try { await supabase.auth.signOut(); } catch { /* sign out locally anyway */ }
}

// Supabase's raw messages are fine but a touch generic — soften the common ones.
function friendly(error) {
  const m = String(error?.message || '').toLowerCase();
  if (m.includes('invalid login')) return 'Wrong email or password';
  if (m.includes('already registered')) return 'That email already has an Archway account';
  if (m.includes('password')) return 'Password must be at least 6 characters';
  if (m.includes('email')) return 'Enter a valid email address';
  return error?.message || 'Sign-in failed';
}
