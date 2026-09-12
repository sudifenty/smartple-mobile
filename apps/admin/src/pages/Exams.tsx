import { useEffect, useState } from 'react';
import { supabase, Profile } from '../lib/supabase';

export default function Exams() {
  const [students, setStudents] = useState<Profile[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [assigns, setAssigns] = useState<any[]>([]);
  // builder state
  const [fClass, setFClass] = useState('P6');
  const [fTopic, setFTopic] = useState('');
  const [fTier, setFTier] = useState('');
  const [bank, setBank] = useState<any[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(45);

  const reload = async () => {
    const [{ data: s }, { data: e }, { data: a }] = await Promise.all([
      supabase.from('smartple_profiles').select('*').eq('role', 'student'),
      supabase.from('smartple_exams').select('*').order('created_at', { ascending: false }),
      supabase.from('smartple_exam_assignments').select('*').order('created_at', { ascending: false }).limit(50),
    ]);
    setStudents((s as Profile[]) || []); setExams(e || []); setAssigns(a || []);
  };
  useEffect(() => { reload(); }, []);

  const search = async () => {
    let q = supabase.from('smartple_questions').select('*').eq('class', fClass);
    if (fTopic) q = q.ilike('topic', `%${fTopic}%`);
    if (fTier) q = q.eq('tier', Number(fTier));
    const { data } = await q.limit(100);
    setBank(data || []);
  };

  const toggle = (id: number) => setPicked(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const createAndLock = async () => {
    if (!title.trim() || picked.size === 0) return alert('Give the exam a title and pick questions.');
    const studentId = (document.getElementById('lockStudent') as HTMLSelectElement)?.value;
    if (!studentId) return alert('Pick the student to lock.');
    const qs = bank.filter(b => picked.has(b.id)).map(b => ({
      question_id: b.id, prompt: b.prompt, options: b.options, answer: b.answer, tier: b.tier
    }));
    const { data: exam, error } = await supabase.from('smartple_exams')
      .insert({ title, subject: bank[0]?.subject || null, questions: qs, duration_minutes: duration })
      .select().single();
    if (error) return alert(error.message);
    await supabase.from('smartple_exam_assignments')
      .insert({ exam_id: exam.id, user_id: studentId, status: 'locked', assigned_by: (await supabase.auth.getUser()).data.user?.id });
    setPicked(new Set()); setTitle('');
    reload();
    alert('Exam sent — the student app locks instantly on next open.');
  };

  const setStatus = async (id: number, status: string) => {
    await supabase.from('smartple_exam_assignments').update({ status }).eq('id', id);
    reload();
  };

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="font-black mb-2">Create Exam & Lock Student</h2>
        <div className="flex flex-wrap gap-2 mb-2">
          <input className="input max-w-[120px]" value={title} onChange={e => setTitle(e.target.value)} placeholder="Exam title" />
          <input className="input max-w-[90px]" type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} />
          <select className="input max-w-[100px]" value={fClass} onChange={e => setFClass(e.target.value)}>
            {['P4', 'P5', 'P6', 'P7'].map(c => <option key={c}>{c}</option>)}
          </select>
          <input className="input max-w-[160px]" value={fTopic} onChange={e => setFTopic(e.target.value)} placeholder="Topic contains…" />
          <select className="input max-w-[110px]" value={fTier} onChange={e => setFTier(e.target.value)}>
            <option value="">Any tier</option>
            {[1, 2, 3, 4, 5].map(t => <option key={t} value={t}>T{t}</option>)}
          </select>
          <button className="btn-s" onClick={search}>Search bank</button>
        </div>
        <div className="max-h-56 overflow-auto border rounded-xl mb-2">
          {bank.map(b => (
            <label key={b.id} className="flex gap-2 px-3 py-1.5 text-sm hover:bg-slate-50 cursor-pointer">
              <input type="checkbox" checked={picked.has(b.id)} onChange={() => toggle(b.id)} className="mt-1" />
              <span><b>T{b.tier}</b> · {b.topic} — {b.prompt.slice(0, 90)}</span>
            </label>
          ))}
          {!bank.length && <p className="text-sm text-slate-400 p-3">Search the question bank first.</p>}
        </div>
        <div className="flex gap-2 items-center">
          <select id="lockStudent" className="input max-w-xs">
            <option value="">Lock which student?</option>
            {students.map(s => <option key={s.user_id} value={s.user_id}>{s.display_name} ({s.class})</option>)}
          </select>
          <button className="btn-p" onClick={createAndLock}>Send & Lock 🔒 ({picked.size} q)</button>
        </div>
      </div>

      <div className="card">
        <h2 className="font-black mb-2">Recent assignments</h2>
        <table className="w-full">
          <thead><tr><th className="th">Exam</th><th className="th">Student</th><th className="th">Status</th><th className="th">Score</th><th className="th"></th></tr></thead>
          <tbody>
            {assigns.map(a => (
              <tr key={a.id}>
                <td className="td">{exams.find(e => e.id === a.exam_id)?.title || a.exam_id}</td>
                <td className="td">{students.find(s => s.user_id === a.user_id)?.display_name || (a.user_id ? a.user_id.slice(0, 6) : '(unknown)')}</td>
                <td className="td"><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${a.status === 'completed' ? 'bg-green-100 text-green-700' : a.status === 'locked' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{a.status}</span></td>
                <td className="td">{a.score != null ? `${a.score}%` : '—'}</td>
                <td className="td text-right whitespace-nowrap">
                  {a.status !== 'completed' && <button className="text-xs text-slate-400 underline mr-2" onClick={() => setStatus(a.id, 'completed')}>mark done</button>}
                  {a.status === 'completed' && <button className="text-xs text-slate-400 underline" onClick={() => setStatus(a.id, 'locked')}>re-lock</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
