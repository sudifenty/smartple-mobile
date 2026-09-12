import { supabase } from './supabase';

/**
 * Shared access to the NEW schema:
 *   learning_events → normalized "Evt" rows (the old smartple_attempts)
 *   questions       → normalized "Q" rows   (the old smartple_questions)
 * learning_events was created outside this repo and is currently EMPTY, so
 * exact column names are unknown — everything is mapped defensively and all
 * filtering/sorting happens client-side (no server-side .eq on guessed names).
 */

export const pick = (r: any, keys: string[]): any => {
  for (const k of keys) if (r?.[k] !== undefined && r?.[k] !== null) return r[k];
  return undefined;
};

export type Evt = {
  uid: string;
  qid: string | null;
  subject: string;
  topic: string;
  subtopic: string | null;
  tier: number | null;
  correct: boolean | null;
  skipped: boolean;
  seconds: number | null;
  type: string | null;
  at: string;
};

export function toEvt(r: any): Evt | null {
  const uid = pick(r, ['user_id', 'student_id', 'profile_id', 'user']);
  const at = pick(r, ['created_at', 'timestamp', 'at', 'time']);
  if (!uid || !at) return null;
  const rawCorrect = pick(r, ['is_correct', 'correct']);
  const result = pick(r, ['result', 'outcome']);
  const correct = typeof rawCorrect === 'boolean' ? rawCorrect
    : result === 'correct' ? true
    : (result === 'incorrect' || result === 'wrong') ? false : null;
  const etype = pick(r, ['event_type', 'type', 'action']);
  const qid = pick(r, ['question_id', 'qid']);
  const secs = pick(r, ['time_spent_seconds', 'seconds', 'duration_seconds', 'duration', 'time_spent']);
  return {
    uid: String(uid),
    qid: qid !== undefined ? String(qid) : null,
    subject: String(pick(r, ['subject', 'subject_name']) ?? ''),
    topic: String(pick(r, ['topic', 'topic_name', 'title', 'activity']) ?? etype ?? 'activity'),
    subtopic: pick(r, ['subtopic', 'sub_topic']) != null ? String(pick(r, ['subtopic', 'sub_topic'])) : null,
    tier: pick(r, ['tier', 'level', 'difficulty']) ?? null,
    correct,
    skipped: pick(r, ['skipped']) === true || etype === 'skipped' || etype === 'skip',
    seconds: secs !== undefined && secs !== null && !isNaN(Number(secs)) ? Number(secs) : null,
    type: etype !== undefined && etype !== null ? String(etype) : null,
    at: String(at)
  };
}

/** Newest-first normalized events. Client-side sort (column names untrusted). */
export async function fetchEvents(limit = 1500): Promise<Evt[]> {
  const { data } = await supabase.from('learning_events').select('*').limit(limit);
  const evts = ((data as any[]) || []).map(toEvt).filter(Boolean) as Evt[];
  evts.sort((a, b) => (a.at < b.at ? 1 : -1));
  return evts;
}

export const eventsFor = (evts: Evt[], uid: string) => evts.filter(e => e.uid === uid);

export type Q = {
  id: any; klass: string | null; subject: string | null; topic: string | null;
  subtopic: string | null; tier: number | null; prompt: string; options: any; answer: any;
};

export function toQ(r: any): Q {
  return {
    id: r.id,
    klass: pick(r, ['class', 'class_level', 'grade']) ?? null,
    subject: pick(r, ['subject', 'subject_name']) ?? null,
    topic: pick(r, ['topic', 'topic_name']) ?? null,
    subtopic: pick(r, ['subtopic', 'sub_topic']) ?? null,
    tier: pick(r, ['tier', 'level', 'difficulty']) ?? null,
    prompt: String(pick(r, ['prompt', 'question', 'text', 'body']) ?? ''),
    options: pick(r, ['options', 'choices']) ?? null,
    answer: pick(r, ['answer', 'correct_answer', 'answer_text']) ?? null
  };
}

export async function fetchQuestions(limit = 800): Promise<Q[]> {
  const { data } = await supabase.from('questions').select('*').limit(limit);
  return ((data as any[]) || []).map(toQ);
}

/** profiles.last_seen map: { user_id: iso } */
export async function fetchLastSeen(): Promise<Record<string, string>> {
  const { data } = await supabase.from('profiles').select('*').limit(300);
  const ls: Record<string, string> = {};
  for (const r of (data as any[]) || []) if (r?.id && r?.last_seen) ls[String(r.id)] = String(r.last_seen);
  return ls;
}
