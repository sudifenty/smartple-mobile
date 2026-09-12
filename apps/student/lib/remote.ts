import { supabase } from './supabase';
import { Assignment, ExamAssignment } from './types';

/**
 * Remote-control state. Fetched on app start and on EVERY screen focus.
 * Works offline: last known values are kept in memory + AsyncStorage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = 'sp_remote_cache';
const SEEN_NUDGES_KEY = 'sp_seen_nudges';

export type Nudge = { id: string; message: string };

export type RemoteState = {
  assignment: Assignment | null;
  lockedExam: ExamAssignment | null;   // exam_assignment with status locked/in_progress
  fetchedAt: number;
};

let state: RemoteState = { assignment: null, lockedExam: null, fetchedAt: 0 };

export const getRemote = () => state;

export async function refreshRemote(userId: string): Promise<RemoteState> {
  try {
    const [{ data: a }, { data: ea }] = await Promise.all([
      supabase.from('smartple_assignments').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('smartple_exam_assignments').select('*')
        .eq('user_id', userId).in('status', ['locked', 'in_progress'])
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
    ]);
    state = {
      assignment: (a as Assignment) || null,
      lockedExam: (ea as ExamAssignment) || null,
      fetchedAt: Date.now()
    };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(state));
  } catch {
    // offline → keep last known state (trust the cache)
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached && !state.fetchedAt) state = JSON.parse(cached);
  }
  return state;
}

/* ------------------------------------------------------------------ */
/* NUDGES                                                              */
/* The live table has NO seen/is_read column, so "read" is tracked     */
/* locally (AsyncStorage) and the row is deleted server-side on        */
/* dismiss. Rows may target a student via user_id, target_user_id,     */
/* target_email or target_name — all four are matched.                 */
/* ------------------------------------------------------------------ */

// ids already shown+dismissed on this device (survives offline deletes failing)
const shownIds = new Set<string>();

async function getSeenIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_NUDGES_KEY);
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch { return new Set<string>(); }
}

async function addSeenId(id: string) {
  shownIds.add(id);
  const seen = await getSeenIds();
  seen.add(id);
  try { await AsyncStorage.setItem(SEEN_NUDGES_KEY, JSON.stringify([...seen].slice(-200))); } catch {}
}

export function wasShown(id: string) { return shownIds.has(id); }

type NudgeUser = { id: string; email?: string | null; user_metadata?: any };

/** Latest nudge for this user that hasn't been dismissed yet (null if none). */
export async function fetchLatestNudge(user: NudgeUser): Promise<Nudge | null> {
  try {
    const conds = [`user_id.eq.${user.id}`, `target_user_id.eq.${user.id}`];
    if (user.email) conds.push(`target_email.eq.${user.email}`);
    const name: string | undefined = user.user_metadata?.full_name;
    // PostgREST .or() breaks on commas/parens — only use safe names
    if (name && !/[,()]/.test(name)) conds.push(`target_name.eq.${name}`);

    const { data } = await supabase.from('smartple_nudges')
      .select('id, message, created_at')
      .or(conds.join(','))
      .order('created_at', { ascending: false })
      .limit(10);

    const seen = await getSeenIds();
    const fresh = (data || []).find((n: any) => !seen.has(String(n.id)) && !shownIds.has(String(n.id)));
    return fresh ? { id: String(fresh.id), message: fresh.message } : null;
  } catch {
    return null; // offline or table hiccup — never block the app
  }
}

/** Called when the student taps "Thanks!" — mark locally + delete server-side. */
export async function dismissNudge(id: string) {
  await addSeenId(id);
  try { await supabase.from('smartple_nudges').delete().eq('id', id); } catch {}
}

/** Effective class/subject/topic/tier after the admin's forced_* filters. */
export function effectiveFilters(profileClass: string | null) {
  const a = state.assignment;
  return {
    klass: a?.forced_class || profileClass || 'P6',
    subject: a?.forced_subject || null,
    topic: a?.forced_topic || null,
    tier: a?.forced_tier || null,
    allowNotes: a?.allow_notes ?? true,
    allowPracticeAnswers: a?.allow_practice_with_answers ?? true,
    allowPracticeNoAnswers: a?.allow_practice_no_answers ?? true
  };
}
