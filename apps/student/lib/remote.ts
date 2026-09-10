import { supabase } from './supabase';
import { Assignment, ExamAssignment } from './types';

/**
 * Remote-control state. Fetched on app start and on EVERY screen focus.
 * Works offline: last known values are kept in memory + AsyncStorage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = 'sp_remote_cache';

export type RemoteState = {
  assignment: Assignment | null;
  lockedExam: ExamAssignment | null;   // exam_assignment with status locked/in_progress
  nudge: { id: number; message: string } | null;
  fetchedAt: number;
};

let state: RemoteState = { assignment: null, lockedExam: null, nudge: null, fetchedAt: 0 };

export const getRemote = () => state;

export async function refreshRemote(userId: string): Promise<RemoteState> {
  try {
    const [{ data: a }, { data: ea }, { data: n }] = await Promise.all([
      supabase.from('smartple_assignments').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('smartple_exam_assignments').select('*')
        .eq('user_id', userId).in('status', ['locked', 'in_progress'])
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('smartple_nudges').select('*')
        .eq('user_id', userId).eq('seen', false)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
    ]);
    state = {
      assignment: (a as Assignment) || null,
      lockedExam: (ea as ExamAssignment) || null,
      nudge: n ? { id: n.id, message: n.message } : null,
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

export async function markNudgeSeen(id: number) {
  state = { ...state, nudge: null };
  try { await supabase.from('smartple_nudges').update({ seen: true }).eq('id', id); } catch {}
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
