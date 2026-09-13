import { useEffect, useMemo, useState } from 'react';
import { supabase, Profile } from '../lib/supabase';

/* ------------------------------------------------------------------
   StudentAnswers — exactly what ONE student answered.

   Read straight from learning_events, which is where the phone writes.
   An `exam_submitted` row carries the whole paper: every question, what
   they typed or tapped, the model answer, and whether it marked itself.
   Nothing here is recomputed or guessed — if the phone did not record it,
   this page says so rather than showing a blank that looks like a wrong
   answer.

   Verdicts:
     ok === true    marked itself, correct
     ok === false   marked itself, not correct
     ok === null    a written answer — you mark it, the model answer is
                    shown beside it
------------------------------------------------------------------ */

type Ans = {
  q: string; given: string; answer: string; ok: boolean | null;
  kind: string; marks: number; qid?: string; self?: string | null; max?: number;
};
type Attempt = {
  key: string; at: string; source: 'exam' | 'practice';
  title: string; score: number | null; auto: boolean; answers: Ans[];
  subject?: string; topic?: string; examId?: number;
};

const when = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const str = (v: any) => (v == null ? '' : String(v));

function toAttempt(r: any, i: number): Attempt | null {
  const d = r?.details && typeof r.details === 'object' ? r.details : {};
  const at = str(r.created_at);
  const batched = r.event_type === 'exam_submitted' || r.event_type === 'practice_submitted';
  if (batched && Array.isArray(d.answers)) {
    const practice = r.event_type === 'practice_submitted';
    return {
      key: `${practice ? 'p' : 'e'}${r.id ?? i}`, at,
      source: practice ? 'practice' : 'exam',
      examId: d.exam_id == null ? undefined : Number(d.exam_id),
      title: practice
        ? [d.topic, d.set].filter(Boolean).join(' · ') || 'Practice'
        : str(d.title) || `exam ${d.exam_id ?? ''}`.trim(),
      score: d.score != null ? Number(d.score) : (d.pct != null ? Number(d.pct) : null),
      auto: practice ? false : !!d.auto,
      answers: d.answers.map((a: any) => ({
        q: str(a.q), given: str(a.given), answer: str(a.answer),
        ok: typeof a.ok === 'boolean' ? a.ok : null,
        kind: str(a.kind) || 'short', marks: Number(a.marks) || 0,
        qid: a.qid, self: a.self || null, max: a.max == null ? null : Number(a.max)
      }))
    };
  }
  if (r.event_type === 'practice_answer') {
    return {
      key: `p${r.id ?? i}`, at, source: 'practice',
      title: [d.subject, d.topic].filter(Boolean).join(' · ') || 'Practice',
      subject: d.subject, topic: d.topic,
      score: null, auto: true,
      answers: [{
        q: str(d.q || d.question), given: str(d.given), answer: str(d.answer || d.correct),
        ok: typeof d.ok === 'boolean' ? d.ok : (typeof d.correct === 'boolean' ? d.correct : null),
        kind: str(d.kind) || 'short', marks: Number(d.marks) || 1, qid: d.qid
      }]
    };
  }
  return null;
}

const Verdict = ({ ok }: { ok: boolean | null }) => {
  const c = ok === true ? 'bg-green-100 text-green-700'
    : ok === false ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700';
  const t = ok === true ? 'correct' : ok === false ? 'not correct' : 'needs your marking';
  return <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${c}`}>{t}</span>;
};

/* A multiple-choice answer is stored as the letter the learner tapped ("A").
   That is useless to read, so it is turned back into the option they chose
   using the paper as it was saved. Matching is by the question's own wording,
   falling back to position, so it still works if a paper was edited. */
function optionText(paper: any, ans: Ans): string | null {
  const letter = (ans.given || '').trim().toUpperCase();
  if (!/^[A-D]$/.test(letter)) return null;
  if (!paper) return null;
  const qs: any[] = paper.kind === 'pdf'
    ? (paper.boxes || []).map((b: any) => ({ q: b.label || `Question ${b.n}`, options: b.options }))
    : (paper.questions || (Array.isArray(paper) ? paper : []));
  const byText = qs.find((q: any) => String(q?.q || '').trim() === String(ans.q || '').trim());
  const q = byText || qs[Number(ans.qid?.replace(/\D+/g, '')) - 1] || null;
  const opts: string[] = Array.isArray(q?.options) ? q.options : [];
  const i = letter.charCodeAt(0) - 65;
  return opts[i] ? `${letter}. ${opts[i]}` : null;
}

export default function StudentAnswers({ student }: { student: Profile }) {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [papers, setPapers] = useState<Record<number, any>>({});
  const [pending, setPending] = useState<{ title: string; status: string }[]>([]);
  const [filter, setFilter] = useState<'all' | 'exam' | 'practice'>('all');
  const [openOnly, setOpenOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true); setErr(null);
    (async () => {
      const uid = student.user_id;
      const [{ data: ev, error }, { data: asg }, { data: exams }] = await Promise.all([
        supabase.from('learning_events').select('*').eq('user_id', uid)
          .order('created_at', { ascending: false }).limit(500),
        supabase.from('smartple_exam_assignments').select('*').eq('user_id', uid),
        supabase.from('smartple_exams').select('id, title, questions')
      ]);
      if (!live) return;
      if (error) setErr(String(error.message));
      const byId: Record<number, any> = {};
      for (const e of (exams as any[]) || []) byId[Number(e.id)] = e.questions;
      setPapers(byId);
      const rows = (ev as any[]) || [];
      setAttempts(rows.map(toAttempt).filter(Boolean) as Attempt[]);

      /* exams handed to them that never came back — the useful kind of gap */
      const done = new Set(rows.filter(r => r.event_type === 'exam_submitted')
        .map(r => Number((r.details as any)?.exam_id)));
      setPending(((asg as any[]) || [])
        .filter(a => a.status !== 'completed' && !done.has(Number(a.exam_id)))
        .map(a => ({
          title: (exams as any[])?.find(e => e.id === a.exam_id)?.title || `exam ${a.exam_id}`,
          status: a.status
        })));
      setLoading(false);
    })();
    return () => { live = false; };
  }, [student.user_id]);

  const shown = useMemo(() =>
    attempts.filter(a => filter === 'all' || a.source === filter),
    [attempts, filter]);

  const totals = useMemo(() => {
    let right = 0, wrong = 0, marking = 0, questions = 0, blank = 0;
    for (const a of attempts) for (const q of a.answers) {
      questions++;
      if (!(q.given || '').trim()) blank++;
      if (q.ok === true) right++; else if (q.ok === false) wrong++; else marking++;
    }
    return { right, wrong, marking, questions, blank };
  }, [attempts]);

  if (loading) return <div className="card text-sm text-slate-500">reading {student.display_name}'s answers…</div>;

  return (
    <div className="space-y-3">
      {err && <div className="card bg-red-50 text-red-700 text-sm">{err}</div>}

      <div className="card">
        <div className="flex items-center gap-2 flex-wrap">
          <b className="text-sm">Everything {student.display_name} has answered</b>
          <span className="text-xs text-slate-400">newest first</span>
          <div className="ml-auto flex gap-2">
            {(['all', 'exam', 'practice'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-xs px-2 py-1 rounded-lg font-bold ${filter === f ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {f === 'all' ? 'all' : f === 'exam' ? 'exams' : 'practice'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap mt-2 text-xs">
          <span className="px-2 py-1 rounded-lg bg-slate-100">{totals.questions} answers recorded</span>
          <span className="px-2 py-1 rounded-lg bg-slate-100">{totals.blank} left blank</span>
          <span className="px-2 py-1 rounded-lg bg-amber-50 text-amber-700">{totals.marking} waiting for you to mark</span>
        </div>
        <label className="text-xs text-slate-500 mt-2 flex items-center gap-1">
          <input type="checkbox" checked={openOnly} onChange={() => setOpenOnly(v => !v)} />
          hide the ones already marked
        </label>
      </div>

      {pending.length > 0 && (
        <div className="card bg-slate-50">
          <b className="text-sm">Given but not attempted</b>
          <div className="mt-1 space-y-1">
            {pending.map((p, i) => (
              <div key={i} className="text-sm flex items-center gap-2">
                <span>{p.title}</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${p.status === 'in_progress' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                  {p.status === 'in_progress' ? 'opened, not submitted' : 'locked — not opened'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {shown.map(a => {
        const visible = openOnly ? a.answers.filter(q => q.ok === null) : a.answers;
        if (openOnly && !visible.length) return null;
        const auto = a.answers.filter(q => q.ok !== null).length;
        return (
          <div key={a.key} className="card">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-600">
                {a.source === 'exam' ? 'exam' : 'practice'}
              </span>
              <b className="text-sm">{a.title}</b>
              <span className="text-xs text-slate-400">{when(a.at)}</span>
              {a.score != null && (
                <span className="text-sm font-bold text-indigo-700">{a.score}%</span>
              )}
              {a.score != null && (
                <span className="text-[11px] text-slate-400">
                  {a.source === 'practice'
                    ? 'marked on the phone — prose answers were marked by the learner'
                    : a.auto ? 'marked automatically' : 'auto-marked part only — written answers still need you'}
                </span>
              )}
              <span className="ml-auto text-xs text-slate-400">
                {a.answers.length} answers{auto ? ` · ${auto} marked themselves` : ''}
              </span>
            </div>

            <div className="mt-2 space-y-2">
              {visible.map((q, i) => {
                /* the letter they tapped becomes the words they chose */
                const words = optionText(a.examId != null ? papers[a.examId] : null, q) || (q.given || '').trim();
                return (
                <div key={i} className="border rounded-lg p-2 bg-white">
                  <div className="text-xs text-slate-500">Q{i + 1}. {q.q || '(no question text was stored)'}</div>
                  {/* what they wrote is the biggest thing on the card */}
                  <div className="mt-1 text-[15px] leading-snug break-words">
                    {words
                      ? <span className="font-semibold text-slate-900">{words}</span>
                      : <span className="text-slate-400 italic">left blank — they wrote nothing here</span>}
                  </div>
                  {q.answer
                    ? <div className="text-xs text-slate-500 mt-1">model answer: {q.answer}</div>
                    : q.ok === null && <div className="text-xs text-amber-600 mt-1">no model answer was saved with this question</div>}
                  {q.self && (
                    <div className="text-[11px] text-indigo-600 mt-1">
                      they marked this themselves: {q.self === 'right' ? 'correct' : q.self === 'part' ? 'partly correct' : 'wrong'}
                      {q.max != null && ` · gave themselves ${q.marks}/${q.max}`}
                    </div>
                  )}
                  {/* the verdict stays, but small and underneath */}
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <Verdict ok={q.ok} />
                    <span className="text-[11px] text-slate-400">{q.marks} mark{q.marks === 1 ? '' : 's'}</span>
                    {q.qid && <span className="text-[11px] text-slate-300">{q.qid}</span>}
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {!shown.length && (
        <div className="card text-sm text-slate-500 space-y-1">
          <b>Nothing recorded yet.</b>
          <p>Exam answers arrive here the moment they submit. Practice answers now arrive too, but only
             from runs finished after this update — practice done before it stayed on the phone and cannot
             be recovered. A run finished offline is delivered the next time the phone connects.</p>
        </div>
      )}
    </div>
  );
}
