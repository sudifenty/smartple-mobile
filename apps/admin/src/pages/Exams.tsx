import { useEffect, useState } from 'react';
import { supabase, Profile } from '../lib/supabase';
import { fetchQuestions, Q } from '../lib/events';

/**
 * Exams — build an exam from the questions bank, then LOCK it onto a student:
 * their app opens straight into the exam (no back, no close) until they submit
 * or time runs out. Requires the exam tables (SQL from the assistant).
 */
export default function Exams() {
  const [students, setStudents] = useState<Profile[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [assigns, setAssigns] = useState<any[]>([]);
  const [dbError, setDbError] = useState<string | null>(null);
  const [qs, setQs] = useState<Q[]>([]);
  const [fClass, setFClass] = useState('P6');
  const [fSubject, setFSubject] = useState('');
  const [fTopic, setFTopic] = useState('');
  const [picked, setPicked] = useState<Set<any>>(new Set());
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(45);

  const reload = async () => {
    const [{ data: s }, { data: e, error: ee }, { data: a }, bank] = await Promise.all([
      supabase.from('smartple_profiles').select('*').eq('role', 'student'),
      supabase.from('smartple_exams').select('*').order('created_at', { ascending: false }),
      supabase.from('smartple_exam_assignments').select('*').order('created_at', { ascending: false }).limit(50),
      fetchQuestions()
    ]);
    setDbError(ee ? String(ee.message) : null);
    setStudents(((s as Profile[]) || []).filter(x => !!x.user_id));
    setExams((e as any[]) || []);
    setAssigns((a as any[]) || []);
    setQs(bank);
  };
  useEffect(() => { reload(); }, []);

  const filtered = qs.filter(q =>
    (!q.klass || q.klass === fClass) &&
    (!fSubject || q.subject === fSubject) &&
    (!fTopic || (q.topic || '').toLowerCase().includes(fTopic.toLowerCase())));
  const subjects = Array.from(new Set(qs.map(q => q.subject).filter(Boolean))) as string[];

  const toggle = (id: any) => setPicked(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const createAndLock = async () => {
    if (!title.trim() || picked.size === 0) return alert('Give the exam a title and tick questions.');
    const studentId = (document.getElementById('lockStudent') as HTMLSelectElement)?.value;
    if (!studentId) return alert('Pick the student to lock.');
    const chosen = filtered.filter(q => picked.has(q.id));
    const payloadQs = chosen.map(q => ({
      question_id: q.id, prompt: q.prompt, options: q.options, answer: q.answer, tier: q.tier
    }));
    const { data: exam, error } = await supabase.from('smartple_exams')
      .insert({ title, subject: chosen[0]?.subject || null, questions: payloadQs, duration_minutes: duration })
      .select().single();
    if (error) return alert('Create failed: ' + error.message +
      '\n\nIf it says the table does not exist, run the exam-tables SQL in the SQL Editor first.');
    const { error: e2 } = await supabase.from('smartple_exam_assignments')
      .insert({ exam_id: exam.id, user_id: studentId, status: 'locked',
                assigned_by: (await supabase.auth.getUser()).data.user?.id });
    if (e2) return alert('Exam created, but locking the student failed: ' + e2.message);
    setPicked(new Set()); setTitle('');
    reload();
    alert('Exam sent — the student app locks into it on next open.');
  };

  const setStatus = async (id: number, status: string) => {
    const { error } = await supabase.from('smartple_exam_assignments').update({ status }).eq('id', id);
    if (error) return alert(error.message);
    reload();
  };

  const nameOf = (uid: string) => students.find(s => s.user_id === uid)?.display_name || uid?.slice(0, 8) || '?';
  const examTitle = (id: number) => exams.find(e => e.id === id)?.title || `#${id}`;

  return (
    <div className="space-y-4">
      {dbError && (
        <div className="card border-2 border-amber-300 bg-amber-50 text-sm">
          <b className="text-amber-800">Exam tables not found yet:</b> {dbError}
          <p className="text-amber-700 mt-1">Run the exam-tables SQL (from the assistant) in the SQL Editor, then refresh this page.</p>
        </div>
      )}

      <div className="card">
        <h2 className="font-black mb-2">Create Exam & Lock Student</h2>
        <div className="flex flex-wrap gap-2 mb-2">
          <input className="input max-w-[160px]" value={title} onChange={e => setTitle(e.target.value)} placeholder="Exam title" />
          <input className="input max-w-[90px]" type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} title="minutes" />
          <select className="input max-w-[100px]" value={fClass} onChange={e => setFClass(e.target.value)}>
            {['P4', 'P5', 'P6', 'P7'].map(c => <option key={c}>{c}</option>)}
          </select>
          <select className="input max-w-[130px]" value={fSubject} onChange={e => setFSubject(e.target.value)}>
            <option value="">All subjects</option>
            {subjects.map(s => <option key={s}>{s}</option>)}
          </select>
          <input className="input max-w-[150px]" placeholder="Search topic…" value={fTopic} onChange={e => setFTopic(e.target.value)} />
        </div>
        <div className="max-h-64 overflow-auto border border-slate-200 rounded-xl mb-2">
          <table className="w-full">
            <thead><tr><th className="th">✓</th><th className="th">Topic</th><th className="th">Tier</th><th className="th">Question</th></tr></thead>
            <tbody>
              {filtered.slice(0, 100).map((q, i) => (
                <tr key={i} className={picked.has(q.id) ? 'bg-indigo-50' : ''}>
                  <td className="td"><input type="checkbox" checked={picked.has(q.id)} onChange={() => toggle(q.id)} /></td>
                  <td className="td">{q.topic || '?'}</td>
                  <td className="td">{q.tier ? `T${q.tier}` : '-'}</td>
                  <td className="td text-sm">{q.prompt.slice(0, 70)}{q.prompt.length > 70 ? '…' : ''}</td>
                </tr>
              ))}
              {!filtered.length && <tr><td className="td text-slate-400" colSpan={4}>No questions for this filter — the bank may be empty.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold">{picked.size} question{picked.size === 1 ? '' : 's'} picked</span>
          <select id="lockStudent" className="input max-w-xs">
            <option value="">Lock to student…</option>
            {students.map(s => <option key={s.user_id} value={s.user_id}>{s.display_name} · {s.class || '?'}</option>)}
          </select>
          <button className="btn-p" onClick={createAndLock}>🔒 Create & Lock</button>
        </div>
      </div>

      <div className="card">
        <h2 className="font-black mb-2">Sent exams</h2>
        <table className="w-full">
          <thead><tr><th className="th">Exam</th><th className="th">Student</th><th className="th">Status</th><th className="th">Score</th><th className="th">Controls</th></tr></thead>
          <tbody>
            {assigns.map(a => (
              <tr key={a.id}>
                <td className="td">{examTitle(a.exam_id)}</td>
                <td className="td">{nameOf(a.user_id)}</td>
                <td className="td">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${a.status === 'completed' ? 'bg-green-100 text-green-700' : a.status === 'in_progress' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                    {a.status}
                  </span>
                </td>
                <td className="td font-bold">{a.score != null ? `${a.score}%` : '—'}</td>
                <td className="td text-right whitespace-nowrap">
                  {a.status !== 'locked' && <button className="text-xs underline mr-2" onClick={() => setStatus(a.id, 'locked')}>Re-lock</button>}
                  {a.status !== 'completed' && <button className="text-xs underline" onClick={() => setStatus(a.id, 'completed')}>Release</button>}
                </td>
              </tr>
            ))}
            {!assigns.length && <tr><td className="td text-slate-400" colSpan={5}>No exams sent yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
