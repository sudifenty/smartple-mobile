import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Live Activity — reads the REAL tables:
 *   learning_events  → answers / activity feed (realtime enabled on it)
 *   profiles         → last_seen (+ email for names)
 *   smartple_profiles→ display names
 * Column names are mapped defensively because learning_events was created
 * outside this repo and its exact columns can vary.
 */

const pick = (r: any, keys: string[]): any => {
  for (const k of keys) if (r?.[k] !== undefined && r?.[k] !== null) return r[k];
  return undefined;
};

type Evt = { uid: string; topic: string; tier: number | null; correct: boolean | null; skipped: boolean; at: string };

const toEvt = (r: any): Evt | null => {
  const uid = pick(r, ['user_id', 'student_id', 'profile_id', 'user']);
  const at = pick(r, ['created_at', 'timestamp', 'at', 'time']);
  if (!uid || !at) return null;
  const rawCorrect = pick(r, ['is_correct', 'correct']);
  const result = pick(r, ['result', 'outcome']);
  const correct = typeof rawCorrect === 'boolean' ? rawCorrect
    : result === 'correct' ? true : result === 'incorrect' || result === 'wrong' ? false : null;
  return {
    uid: String(uid),
    topic: String(pick(r, ['topic', 'subject', 'title', 'activity', 'event_type']) ?? 'activity'),
    tier: pick(r, ['tier', 'level']) ?? null,
    correct,
    skipped: pick(r, ['skipped']) === true || pick(r, ['event_type']) === 'skipped',
    at: String(at)
  };
};

const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)}h ago`;
};

type Stat = { last: string; recent: number; answered: number; correct: number };

export default function Live() {
  const [names, setNames] = useState<Record<string, string>>({});
  const [events, setEvents] = useState<Evt[]>([]);
  const [lastSeen, setLastSeen] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const load = async () => {
    const [le, sp, pf] = await Promise.all([
      supabase.from('learning_events').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('smartple_profiles').select('*').eq('role', 'student'),
      supabase.from('profiles').select('*').limit(300)
    ]);
    if (le.error) {
      setErr(String(le.error.message || le.error.code));
      return;
    }
    setErr(null);

    const nm: Record<string, string> = {};
    for (const r of (sp.data as any[]) || [])
      if (r.user_id) nm[String(r.user_id)] = r.display_name || String(r.user_id).slice(0, 8);
    const ls: Record<string, string> = {};
    for (const r of (pf.data as any[]) || []) {
      const id = String(r.id);
      if (r.email && !nm[id]) nm[id] = String(r.email).split('@')[0];
      if (r.last_seen) ls[id] = String(r.last_seen);
    }
    setNames(nm);
    setLastSeen(ls);

    const evts = ((le.data as any[]) || []).map(toEvt).filter(Boolean) as Evt[];
    setEvents(evts);
  };

  // realtime pushes (enabled on learning_events) + 15s polling fallback
  useEffect(() => {
    load();
    const poll = setInterval(() => setTick(t => t + 1), 15000);
    const ch = supabase.channel('live-activity')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'learning_events' },
        () => setTick(t => t + 1))
      .subscribe();
    return () => { clearInterval(poll); supabase.removeChannel(ch); };
  }, []);

  useEffect(() => { if (tick > 0) load(); }, [tick]);

  const now = Date.now();
  const byStudent: Record<string, Stat> = {};
  const stat = (uid: string): Stat =>
    byStudent[uid] || (byStudent[uid] = { last: '', recent: 0, answered: 0, correct: 0 });

  for (const e of events) {
    const st = stat(e.uid);
    if (e.at > st.last) st.last = e.at;
    const ageMin = (now - new Date(e.at).getTime()) / 60000;
    if (ageMin <= 5) st.recent++;
    if (e.correct !== null && ageMin <= 60) { st.answered++; if (e.correct) st.correct++; }
  }
  // profiles.last_seen merges in (whichever is newer wins)
  for (const [uid, at] of Object.entries(lastSeen)) {
    const st = stat(uid);
    if (at > st.last) st.last = at;
  }

  const entries = Object.entries(byStudent).sort((x, y) => (x[1].last < y[1].last ? 1 : -1));
  const active = entries.filter(([, st]) => st.last && (now - new Date(st.last).getTime()) / 60000 <= 5);
  const idle = entries.filter(([, st]) => !st.last || (now - new Date(st.last).getTime()) / 60000 > 5);

  const StudentCard = ({ uid, st, isActive }: { uid: string; st: Stat; isActive: boolean }) => (
    <div className="card">
      <div className="flex items-center gap-2 mb-1">
        {isActive && <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />}
        <span className="font-black">{names[uid] || uid.slice(0, 8)}</span>
        <span className={`ml-auto text-xs font-bold ${isActive ? 'text-green-600' : 'text-slate-400'}`}>
          {isActive ? `ACTIVE NOW · ${st.recent} event${st.recent === 1 ? '' : 's'} in 5 min` : st.last ? `last seen ${ago(st.last)}` : 'no activity yet'}
        </span>
      </div>
      <div className="text-xs text-slate-500">
        {st.answered > 0
          ? <span>✓ {st.correct}/{st.answered} correct in the last hour</span>
          : <span>no answers in the last hour</span>}
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="font-black text-lg">Live Activity</h2>
        <span className={`px-2.5 py-1 rounded-full text-xs font-black ${active.length ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
          {active.length} active now
        </span>
        <span className="text-xs text-slate-400 ml-auto">realtime on learning_events + 15s refresh</span>
      </div>

      {err && (
        <div className="card mb-3 border-2 border-red-300 text-sm">
          <b className="text-red-700">Can't read learning_events yet:</b> {err}
          <p className="text-slate-600 mt-1">Run the GRANT + policy SQL (chat) in the old project's SQL Editor, then this page fills up.</p>
        </div>
      )}

      {active.length > 0 && (
        <div className="grid md:grid-cols-2 gap-3 mb-4">
          {active.map(([uid, st]) => <StudentCard key={uid} uid={uid} st={st} isActive />)}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-3 mb-4">
        {idle.map(([uid, st]) => <StudentCard key={uid} uid={uid} st={st} isActive={false} />)}
      </div>

      <div className="card">
        <h3 className="font-bold mb-2">Latest events</h3>
        <table className="w-full">
          <thead><tr><th className="th">Student</th><th className="th">Topic</th><th className="th">Tier</th><th className="th">Result</th><th className="th">When</th></tr></thead>
          <tbody>
            {events.slice(0, 30).map((e, i) => (
              <tr key={i}>
                <td className="td font-semibold">{names[e.uid] || e.uid.slice(0, 8)}</td>
                <td className="td">{e.topic}</td>
                <td className="td">{e.tier ? `T${e.tier}` : '-'}</td>
                <td className="td">
                  {e.skipped ? <span className="text-amber-600 font-bold">skipped</span>
                    : e.correct === null ? <span className="text-slate-400">—</span>
                    : e.correct ? <span className="text-green-600 font-bold">✓ correct</span>
                    : <span className="text-red-600 font-bold">✗ wrong</span>}
                </td>
                <td className="td text-slate-500">{ago(e.at)}</td>
              </tr>
            ))}
            {!events.length && !err && <tr><td className="td text-slate-400" colSpan={5}>No events yet — activity appears here the moment students use the app.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
