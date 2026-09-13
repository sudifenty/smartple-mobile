import { useEffect, useMemo, useState } from 'react';
import { Draft } from '../lib/examTypes';

/* ------------------------------------------------------------------
   RevisionPicker — the teacher's OWN exercises, out of the notes.

   Nothing on this screen is generated. apps/admin/tools/extractRevisionBank.mjs
   copies each topic's REVISION QUESTIONS block and its ANSWERS block, pairs
   them one-for-one, and writes src/data/revisionBank.json. The parser's test
   suite re-reads the notes and fails if a single question is not in them.

   The bank is ~700 KB, so it is imported dynamically: the dashboard never
   downloads it unless this panel is opened.
------------------------------------------------------------------ */

type RevQ = {
  id: number; qid: string; question: string; type: 'short';
  options: null; correct: null; answer: string; marks: number;
  source: string; source_section: string;
};
type RevEntry = {
  subject: string; subject_code: string; level: string; topic: string;
  topic_id: string; slug: string; subtopics: string[]; source_section: string;
  questions: RevQ[];
};
type Bank = {
  counts: { topics: number; questions: number };
  levels: string[]; subjects: string[]; items: RevEntry[];
};

type Props = {
  onAdd: (drafts: Draft[], meta: { subject_code: string; subject: string; topic: string; level: string }) => void;
  onClose: () => void;
  preferSubject?: string;
};

export default function RevisionPicker({ onAdd, onClose, preferSubject }: Props) {
  const [bank, setBank] = useState<Bank | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [level, setLevel] = useState('');
  const [topicId, setTopicId] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [marksFor, setMarksFor] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState('');
  const [showAnswers, setShowAnswers] = useState(true);

  useEffect(() => {
    let live = true;
    import('../data/revisionBank.json')
      .then(m => { if (live) setBank(m.default as unknown as Bank); })
      .catch(e => { if (live) setLoadErr(String(e?.message || e)); });
    return () => { live = false; };
  }, []);

  /* the exam's subject dropdown uses SST / SCI / ENG / MATH — match it if we can */
  useEffect(() => {
    if (!bank || subject) return;
    const want = (preferSubject || '').toUpperCase();
    const hit = bank.items.find(i => i.subject_code === want);
    setSubject(hit ? hit.subject : bank.subjects[0]);
  }, [bank, subject, preferSubject]);

  const levels = useMemo(() => {
    if (!bank || !subject) return [];
    return [...new Set(bank.items.filter(i => i.subject === subject).map(i => i.level))].sort();
  }, [bank, subject]);

  useEffect(() => {
    if (levels.length && !levels.includes(level)) setLevel(levels[0]);
  }, [levels, level]);

  const topics = useMemo(() => {
    if (!bank) return [];
    return bank.items.filter(i => i.subject === subject && i.level === level)
      .sort((a, b) => a.topic.localeCompare(b.topic));
  }, [bank, subject, level]);

  const entry = useMemo(() => topics.find(t => t.topic_id === topicId) || null, [topics, topicId]);

  /* changing the paper you are looking at starts a fresh selection */
  useEffect(() => { setPicked(new Set()); setFilter(''); }, [topicId]);

  const shown = useMemo(() => {
    if (!entry) return [];
    const f = filter.trim().toLowerCase();
    return f ? entry.questions.filter(q => q.question.toLowerCase().includes(f)) : entry.questions;
  }, [entry, filter]);

  if (loadErr) return (
    <div className="card bg-red-50 text-red-700 text-sm space-y-2">
      <b>The revision bank did not load.</b>
      <div>{loadErr}</div>
      <div className="text-xs">Rebuild it with: <code>node apps/admin/tools/extractRevisionBank.mjs</code></div>
      <button onClick={onClose} className="text-xs underline">close</button>
    </div>
  );

  if (!bank) return <div className="text-sm text-slate-500 p-3">loading the revision bank…</div>;

  const toggle = (qid: string) => setPicked(prev => {
    const n = new Set(prev);
    n.has(qid) ? n.delete(qid) : n.add(qid);
    return n;
  });

  const marksOf = (q: RevQ) => marksFor[q.qid] ?? q.marks;
  const chosen = entry ? entry.questions.filter(q => picked.has(q.qid)) : [];
  const chosenMarks = chosen.reduce((a, q) => a + (Number(marksOf(q)) || 1), 0);

  const add = () => {
    if (!entry || !chosen.length) return;
    const drafts: Draft[] = chosen.map(q => ({
      q: q.question,
      options: [],
      answer: q.answer,
      kind: 'short',
      marks: Number(marksOf(q)) || 1,
      /* provenance: this came from the notes, and here is exactly which one */
      is_from_revision_bank: true,
      qid: q.qid,
      topic: entry.topic,
      level: entry.level,
      subject: entry.subject
    }));
    onAdd(drafts, {
      subject_code: entry.subject_code, subject: entry.subject,
      topic: entry.topic, level: entry.level
    });
  };

  return (
    <div className="border rounded-xl bg-white space-y-3 p-3">
      <div className="flex items-start gap-2">
        <div>
          <b className="text-sm">Use Revision Exercises</b>
          <p className="text-xs text-slate-500">
            {bank.counts.questions.toLocaleString()} real questions from {bank.counts.topics} topics,
            lifted word for word from the notes — nothing generated.
          </p>
        </div>
        <button onClick={onClose} className="ml-auto text-xs text-slate-400 underline">close</button>
      </div>

      <div className="grid md:grid-cols-3 gap-2">
        <label className="text-xs text-slate-500">subject
          <select className="input" value={subject} onChange={e => setSubject(e.target.value)}>
            {bank.subjects.map(s => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-500">class
          <select className="input" value={level} onChange={e => setLevel(e.target.value)}>
            {levels.map(l => <option key={l}>{l}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-500">topic
          <select className="input" value={topicId} onChange={e => setTopicId(e.target.value)}>
            <option value="">choose a topic…</option>
            {topics.map(t => <option key={t.topic_id} value={t.topic_id}>
              {t.topic} ({t.questions.length})
            </option>)}
          </select>
        </label>
      </div>

      {entry && (
        <>
          {entry.subtopics.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {entry.subtopics.map(s => (
                <span key={s} className="text-[11px] bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{s}</span>
              ))}
            </div>
          )}
          <p className="text-[11px] text-slate-400">
            One revision set sits at the end of the whole topic and covers the subtopics above — the notes do not
            attach single questions to single subtopics, so nothing here pretends to.
            Source: <b>{entry.source_section}</b>.
          </p>

          <div className="flex gap-2 flex-wrap items-center">
            <input className="input max-w-xs" placeholder="filter these questions…"
              value={filter} onChange={e => setFilter(e.target.value)} />
            <button onClick={() => setPicked(new Set(shown.map(q => q.qid)))} className="text-xs px-2 py-1 rounded bg-slate-100">all shown</button>
            <button onClick={() => setPicked(new Set(shown.slice(0, 10).map(q => q.qid)))} className="text-xs px-2 py-1 rounded bg-slate-100">first 10</button>
            <button onClick={() => setPicked(new Set())} className="text-xs px-2 py-1 rounded bg-slate-100">none</button>
            <label className="text-xs text-slate-500 ml-auto flex items-center gap-1">
              <input type="checkbox" checked={showAnswers} onChange={() => setShowAnswers(v => !v)} />
              show the model answers
            </label>
          </div>

          <div className="space-y-2 max-h-[26rem] overflow-y-auto pr-1">
            {shown.map(q => (
              <label key={q.qid} data-qid={q.qid}
                className={`flex gap-2 rounded-lg border p-2 text-sm ${picked.has(q.qid) ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-slate-200'}`}>
                <input type="checkbox" className="mt-1" checked={picked.has(q.qid)} onChange={() => toggle(q.qid)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs text-slate-400">{q.id}</span>
                    <span>{q.question}</span>
                  </div>
                  {showAnswers && <div className="text-xs text-slate-500 mt-0.5">answer: {q.answer}</div>}
                </div>
                <span className="text-xs text-slate-400 whitespace-nowrap">marks
                  <input type="number" min={1} max={20} className="w-14 ml-1 border rounded px-1"
                    value={marksOf(q)}
                    onChange={e => setMarksFor(p => ({ ...p, [q.qid]: Number(e.target.value) }))} />
                </span>
              </label>
            ))}
            {!shown.length && <p className="text-sm text-slate-400">No question matches that filter.</p>}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">{chosen.length} selected · {chosenMarks} marks</span>
            <button onClick={add} disabled={!chosen.length}
              className="ml-auto px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-40">
              Add {chosen.length || ''} to the exam
            </button>
          </div>
          <p className="text-xs text-slate-400">
            Written questions like these are sent to you for marking. You can still edit any wording, mark or answer
            after adding — and change one to multiple choice if you want it marked automatically.
          </p>
        </>
      )}
    </div>
  );
}
