import { useEffect, useState } from 'react';
import { fetchQuestions, Q } from '../lib/events';

/**
 * Exams — the exam storage tables (smartple_exams / smartple_exam_assignments)
 * were dropped in the database restructure, so creating/locking exams is
 * disabled until they're restored. This page now serves as the question-bank
 * browser (questions table) so the exam builder can be restored on top of it.
 */
export default function Exams() {
  const [qs, setQs] = useState<Q[]>([]);
  const [fClass, setFClass] = useState('');
  const [fSubject, setFSubject] = useState('');
  const [fTopic, setFTopic] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { fetchQuestions().then(d => { setQs(d); setLoaded(true); }); }, []);

  const filtered = qs.filter(q =>
    (!fClass || q.klass === fClass) &&
    (!fSubject || q.subject === fSubject) &&
    (!fTopic || (q.topic || '').toLowerCase().includes(fTopic.toLowerCase())));

  const subjects = Array.from(new Set(qs.map(q => q.subject).filter(Boolean))) as string[];

  return (
    <div className="space-y-4">
      <div className="card border-2 border-amber-300 bg-amber-50">
        <b className="text-amber-800">⚠️ Exam create/lock is paused.</b>
        <p className="text-sm text-amber-700 mt-1">
          The exam tables were dropped when the database was restructured (learning_events/questions).
          The question bank below works. To restore "Create Exam & Lock Student", the exam tables need
          to be recreated — ask for the SQL and it's a 2-minute job.
        </p>
      </div>

      <div className="card">
        <h2 className="font-black mb-2">Question bank {loaded ? `(${filtered.length} shown)` : '…'}</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          <select className="input max-w-[110px]" value={fClass} onChange={e => setFClass(e.target.value)}>
            <option value="">All classes</option>
            {['P4', 'P5', 'P6', 'P7'].map(c => <option key={c}>{c}</option>)}
          </select>
          <select className="input max-w-[140px]" value={fSubject} onChange={e => setFSubject(e.target.value)}>
            <option value="">All subjects</option>
            {subjects.map(s => <option key={s}>{s}</option>)}
          </select>
          <input className="input max-w-[180px]" placeholder="Search topic…" value={fTopic} onChange={e => setFTopic(e.target.value)} />
        </div>
        <table className="w-full">
          <thead><tr><th className="th">Class</th><th className="th">Subject</th><th className="th">Topic</th><th className="th">Tier</th><th className="th">Question</th></tr></thead>
          <tbody>
            {filtered.slice(0, 100).map((q, i) => (
              <tr key={i}>
                <td className="td">{q.klass || '?'}</td>
                <td className="td">{q.subject || '?'}</td>
                <td className="td">{q.topic || '?'}</td>
                <td className="td">{q.tier ? `T${q.tier}` : '-'}</td>
                <td className="td text-sm">{q.prompt.slice(0, 90)}{q.prompt.length > 90 ? '…' : ''}</td>
              </tr>
            ))}
            {loaded && !filtered.length && <tr><td className="td text-slate-400" colSpan={5}>No questions match — the bank may still be empty.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
