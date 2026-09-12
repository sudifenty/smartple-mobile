import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Attempt = {
  id: number; user_id: string; subject: string; topic: string; tier: number | null;
  is_correct: boolean | null; skipped: boolean; created_at: string;
};
type UsageRow = { user_id: string; minutes_used: number; topic: string | null; created_at: string };

const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)}h ago`;
};

type Stat = { last: string; recent: number; answered: number; correct: number; minutes: number };

export default function Live() {
  const [names, setNames] = useState<Record<string, string>>({});
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [tick, setTick] = useState(0);

  const load = async () => {
    const [{ data: p }, { data: a }, { data: u }] = await Promise.all([
      supabase.from('smartple_profiles').select('user_id, display_name').eq('role', 'student'),
      supabase.from('smartple_attempts').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('smartple_usage').select('*').eq('date', new Date().toISOString().slice(0, 10))
    ]);
    const nm: Record<string, string> = {};
    for (const r of (p as any[]) || []) if (r.user_id) nm[r.user_id] = r.display_name || String(r.user_id).slice(0, 8);
    setNames(nm);
    setAttempts((a as Attempt[]) || []);
    setUsage((u as UsageRow[]) || []);
  };

  // realtime pushes + a 15s polling fallback (polling works even if the
  // tables aren't in the realtime publication yet)
  useEffect(() => {
    load();
    const poll = setInterval(() => setTick(t => t + 1), 15000);
    const ch = supabase.channel('live-activity')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'smartple_attempts' },
        () => setTick(t => t + 1))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'smartple_usage' },
        () => setTick(t => t + 1))
      .subscribe();
    return () => { clearInterval(poll); supabase.removeChannel(ch); };
  }, []);

  useEffect(() => { if (tick > 0) load(); }, [tick]);

  const now = Date.now();
  const byStudent: Record<string, Stat> = {};
  const stat = (uid: string): Stat =>
    byStudent[uid] || (byStudent[uid] = { last: '', recent: 0, answered: 0, correct: 0, minutes: 0 });

  for (const a of attempts) {
    const st = stat(a.user_id);
    if (a.created_at > st.last) st.last = a.created_at;
    const ageMin = (now - new Date(a.created_at).getTime()) / 60000;
    if (ageMin <= 5) st.recent++;
    if (a.is_correct !== null && ageMin <= 60) { st.answered++; if (a.is_correct) st.correct++; }
  }
  for (const u of usage) {
    const st = stat(u.user_id);
    st.minutes += Number(u.minutes_used) || 0;
    if (u.created_at > st.last) st.last = u.created_at;
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
          {isActive ? `ACTIVE NOW · ${st.recent} answer${st.recent === 1 ? '' : 's'} in 5 min` : st.last ? `last seen ${ago(st.last)}` : 'no activity yet'}
        </span>
      </div>
      <div className="text-xs text-slate-500">
        {st.minutes > 0 && <span>📱 {Math.round(st.minutes)} min today · </span>}
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
        <span className="text-xs text-slate-400 ml-auto">auto-refreshes (realtime + every 15s)</span>
      </div>

      {active.length > 0 && (
        <div className="grid md:grid-cols-2 gap-3 mb-4">
          {active.map(([uid, st]) => <StudentCard key={uid} uid={uid} st={st} isActive />)}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-3 mb-4">
        {idle.map(([uid, st]) => <StudentCard key={uid} uid={uid} st={st} isActive={false} />)}
      </div>

      <div className="card">
        <h3 className="font-bold mb-2">Latest answers</h3>
        <table className="w-full">
          <thead><tr><th className="th">Student</th><th className="th">Topic</th><th className="th">Tier</th><th className="th">Result</th><th className="th">When</th></tr></thead>
          <tbody>
            {attempts.slice(0, 30).map(a => (
              <tr key={a.id}>
                <td className="td font-semibold">{names[a.user_id] || a.user_id.slice(0, 8)}</td>
                <td className="td">{a.topic}</td>
                <td className="td">{a.tier ? `T${a.tier}` : '-'}</td>
                <td className="td">
                  {a.skipped ? <span className="text-amber-600 font-bold">skipped</span>
                    : a.is_correct === null ? <span className="text-slate-400">—</span>
                    : a.is_correct ? <span className="text-green-600 font-bold">✓ correct</span>
                    : <span className="text-red-600 font-bold">✗ wrong</span>}
                </td>
                <td className="td text-slate-500">{ago(a.created_at)}</td>
              </tr>
            ))}
            {!attempts.length && <tr><td className="td text-slate-400" colSpan={5}>No answers recorded yet — activity appears here the moment students use the app.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
