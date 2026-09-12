import { useEffect, useState } from 'react';
import { supabase, Profile } from '../lib/supabase';
import StudentView from './StudentView';

type Row = { subject: string; topic: string; subtopic: string | null; avg_score: number; n: number };
type Skip = { topic: string; tier: number | null; n: number };

export default function Students() {
  const [students, setStudents] = useState<Profile[]>([]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Profile | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [skips, setSkips] = useState<Skip[]>([]);
  const [view, setView] = useState<'progress' | 'student'>('progress');

  useEffect(() => {
    supabase.from('smartple_profiles').select('*').eq('role', 'student')
      .then(({ data }) => setStudents(((data as Profile[]) || []).filter(s => !!s.user_id)));
  }, []);

  const list = students.filter(s =>
    !q || (s.display_name || '').toLowerCase().includes(q.toLowerCase()));

  const pick = async (s: Profile) => {
    setSel(s);
    setView('progress');
    // weakest subtopics first (heatmap source)
    const { data: attempts } = await supabase.from('smartple_attempts')
      .select('subject, topic, subtopic, is_correct, skipped, tier')
      .eq('user_id', s.user_id);
    const acc: Record<string, Row> = {};
    const sk: Record<string, Skip> = {};
    for (const a of attempts || []) {
      const key = `${a.subject}|${a.topic}|${a.subtopic || '-'}`;
      acc[key] = acc[key] || { subject: a.subject, topic: a.topic, subtopic: a.subtopic, avg_score: 0, n: 0 };
      if (a.is_correct !== null) { acc[key].avg_score += a.is_correct ? 100 : 0; acc[key].n += 1; }
      if (a.skipped) {
        const k2 = `${a.topic}|${a.tier}`;
        sk[k2] = sk[k2] || { topic: a.topic, tier: a.tier, n: 0 };
        sk[k2].n += 1;
      }
    }
    const rowsOut = Object.values(acc).filter(r => r.n > 0)
      .map(r => ({ ...r, avg_score: Math.round(r.avg_score / r.n) }))
      .sort((a, b) => a.avg_score - b.avg_score);
    setRows(rowsOut);
    setSkips(Object.values(sk).sort((a, b) => b.n - a.n));
  };

  const heat = (score: number) =>
    score < 40 ? 'bg-red-100 text-red-700' : score < 60 ? 'bg-amber-100 text-amber-700'
    : score < 80 ? 'bg-yellow-50 text-yellow-700' : 'bg-green-100 text-green-700';

  return (
    <div className="grid md:grid-cols-[280px,1fr] gap-4">
      <div className="card">
        <input className="input mb-2" placeholder="Search by name…" value={q} onChange={e => setQ(e.target.value)} />
        <div className="max-h-[70vh] overflow-auto">
          {list.map(s => (
            <button key={s.user_id || s.display_name || 'row'} onClick={() => pick(s)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm ${sel?.user_id === s.user_id ? 'bg-indigo-50 font-bold' : 'hover:bg-slate-50'}`}>
              {s.display_name || (s.user_id ? s.user_id.slice(0, 8) : '(no name)')} <span className="text-slate-400">· {s.class || '?'}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        {!sel && <div className="card text-slate-500">Pick a student to see their heatmap.</div>}
        {sel && (
          <>
            <div className="card mb-3">
              <h2 className="font-black">{sel.display_name} <span className="text-slate-400 font-normal">· {sel.class}</span></h2>
              <p className="text-xs text-slate-400">{sel.user_id}</p>
              <div className="flex gap-2 mt-2">
                <button className={view === 'progress' ? 'btn-p' : 'btn-s'} onClick={() => setView('progress')}>📊 Progress</button>
                <button className={view === 'student' ? 'btn-p' : 'btn-s'} onClick={() => setView('student')}>👁 Student View</button>
              </div>
            </div>
            {view === 'student' && <StudentView student={sel} />}
            {view === 'progress' && <>
            <div className="card mb-3">
              <h3 className="font-bold mb-2">Weakest subtopics (worst first)</h3>
              <table className="w-full">
                <thead><tr><th className="th">Subject</th><th className="th">Topic</th><th className="th">Subtopic</th><th className="th">Avg</th><th className="th">N</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className="td">{r.subject}</td><td className="td">{r.topic}</td><td className="td">{r.subtopic || '-'}</td>
                      <td className="td"><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${heat(r.avg_score)}`}>{r.avg_score}%</span></td>
                      <td className="td">{r.n}</td>
                    </tr>
                  ))}
                  {!rows.length && <tr><td className="td text-slate-400" colSpan={5}>No attempts yet.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="card">
              <h3 className="font-bold mb-2">Skips = anxiety signal 😰</h3>
              <table className="w-full">
                <thead><tr><th className="th">Topic</th><th className="th">Tier</th><th className="th">Skips</th></tr></thead>
                <tbody>
                  {skips.map((s, i) => (
                    <tr key={i}><td className="td">{s.topic}</td><td className="td">T{s.tier ?? '?'}</td><td className="td font-bold">{s.n}</td></tr>
                  ))}
                  {!skips.length && <tr><td className="td text-slate-400" colSpan={3}>No skips.</td></tr>}
                </tbody>
              </table>
            </div>
            </>}
          </>
        )}
      </div>
    </div>
  );
}
