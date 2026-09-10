import { useEffect, useState } from 'react';
import { supabase, Profile } from '../lib/supabase';

type TL = { subtopic: string; question_id: number | null; viewed_answer: string | null;
            started_typing: string | null; submitted: string | null; flag: string };

export default function Cheating() {
  const [students, setStudents] = useState<Profile[]>([]);
  const [sel, setSel] = useState<Profile | null>(null);
  const [timeline, setTimeline] = useState<TL[]>([]);
  const [guessers, setGuessers] = useState<any[]>([]);
  const [randomGuess, setRandomGuess] = useState<number>(0);

  useEffect(() => {
    supabase.from('smartple_profiles').select('*').eq('role', 'student')
      .then(({ data }) => setStudents((data as Profile[]) || []));
    supabase.rpc('scan_guessers').then(({ data }) => setGuessers((data as any[]) || []));
  }, []);

  const pick = async (s: Profile) => {
    setSel(s);
    const { data } = await supabase.rpc('note_cheat_timeline', { p_user: s.user_id });
    setTimeline((data as TL[]) || []);
    // random guessing: <3s AND wrong, repeatedly
    const { data: att } = await supabase.from('smartple_attempts')
      .select('is_correct, time_spent_seconds').eq('user_id', s.user_id);
    const fast = (att || []).filter((a: any) => (a.time_spent_seconds ?? 99) < 3 && a.is_correct === false);
    setRandomGuess(fast.length);
  };

  const badge = (flag: string) =>
    flag === 'COPIED' ? '🚩 COPIED' :
    flag === 'VIEWED_BEFORE_ATTEMPT' ? '⚠️ Viewed before attempting' :
    flag === 'GENUINE' ? '✅ Genuine' : '…';
  const badgeCls = (flag: string) =>
    flag === 'COPIED' ? 'bg-red-100 text-red-700' :
    flag === 'VIEWED_BEFORE_ATTEMPT' ? 'bg-amber-100 text-amber-700' :
    'bg-green-100 text-green-700';

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="font-black mb-2">Speed-guessing alerts (5 MCQs &lt; 15s, last 24h)</h2>
        {guessers.length === 0 && <p className="text-sm text-slate-400">None right now. 🎉</p>}
        {guessers.map((g, i) => (
          <div key={i} className="text-sm py-1">🚩 <b>{g.display_name}</b> — {g.n_questions} questions in {g.total_seconds}s → flagged “Guessing”</div>
        ))}
      </div>

      <div className="card">
        <h2 className="font-black mb-2">Notes cheating timeline</h2>
        <select className="input mb-3 max-w-xs" value={sel?.user_id || ''}
          onChange={e => pick(students.find(s => s.user_id === e.target.value)!)}>
          <option value="">Select student…</option>
          {students.map(s => <option key={s.user_id} value={s.user_id}>{s.display_name}</option>)}
        </select>
        {sel && randomGuess >= 3 && (
          <div className="mb-3 px-3 py-2 rounded-xl bg-orange-100 text-orange-700 text-sm font-bold">
            ⚠️ Random Guessing pattern: {randomGuess} answers under 3 seconds and wrong.
          </div>
        )}
        {sel && (
          <table className="w-full">
            <thead><tr><th className="th">Subtopic</th><th className="th">Viewed</th><th className="th">Typed</th><th className="th">Submitted</th><th className="th">Verdict</th></tr></thead>
            <tbody>
              {timeline.map((t, i) => (
                <tr key={i}>
                  <td className="td">{t.subtopic}</td>
                  <td className="td text-xs">{t.viewed_answer ? new Date(t.viewed_answer).toLocaleTimeString() : '—'}</td>
                  <td className="td text-xs">{t.started_typing ? new Date(t.started_typing).toLocaleTimeString() : '—'}</td>
                  <td className="td text-xs">{t.submitted ? new Date(t.submitted).toLocaleTimeString() : '—'}</td>
                  <td className="td"><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${badgeCls(t.flag)}`}>{badge(t.flag)}</span></td>
                </tr>
              ))}
              {!timeline.length && <tr><td className="td text-slate-400" colSpan={5}>No note events.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
