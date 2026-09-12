import { useEffect, useState } from 'react';
import { supabase, Profile } from '../lib/supabase';

/**
 * "Student View" — renders what THIS student sees in their app, using their
 * data. No login, no password: the admin session reads the student's rows
 * (allowed because admins have full read access).
 */
export default function StudentView({ student }: { student: Profile }) {
  const [assignment, setAssignment] = useState<any>(null);
  const [topics, setTopics] = useState<{ subject: string; topic: string }[]>([]);
  const [recent, setRecent] = useState<any[]>([]);
  const [nudges, setNudges] = useState<any[]>([]);
  const [exam, setExam] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    (async () => {
      const uid = student.user_id;
      const [{ data: a }, { data: rec }, { data: nud }, { data: ex }] = await Promise.all([
        supabase.from('smartple_assignments').select('*').eq('user_id', uid).maybeSingle(),
        supabase.from('smartple_attempts').select('topic, tier, is_correct, skipped, created_at')
          .eq('user_id', uid).order('created_at', { ascending: false }).limit(12),
        supabase.from('smartple_nudges').select('message, created_at')
          .eq('user_id', uid).order('created_at', { ascending: false }).limit(5),
        supabase.from('smartple_exam_assignments').select('*')
          .eq('user_id', uid).in('status', ['locked', 'in_progress'])
          .order('created_at', { ascending: false }).limit(1).maybeSingle()
      ]);
      const asg = a as any;
      setAssignment(asg || null);
      setRecent((rec as any[]) || []);
      setNudges((nud as any[]) || []);
      setExam((ex as any) || null);

      // topics exactly as the student's home screen computes them
      const klass = asg?.forced_class || student.class || 'P6';
      let q = supabase.from('smartple_questions').select('subject, topic').eq('class', klass);
      if (asg?.forced_subject) q = q.eq('subject', asg.forced_subject);
      if (asg?.forced_topic) q = q.eq('topic', asg.forced_topic);
      const { data: qs } = await q;
      const uniq: Record<string, { subject: string; topic: string }> = {};
      for (const row of (qs as any[]) || []) uniq[`${row.subject}|${row.topic}`] = row;
      setTopics(Object.values(uniq));
      setLoading(false);
    })();
  }, [student.user_id]);

  const klass = assignment?.forced_class || student.class || 'P6';
  const chip = (on: boolean) =>
    `px-2 py-0.5 rounded-full text-xs font-bold ${on ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`;

  return (
    <div className="max-w-md mx-auto">
      <div className="card mb-3" style={{ backgroundColor: '#FFF6E6' }}>
        <p className="text-xs text-slate-500 mb-1 font-bold">👁 STUDENT VIEW — what {student.display_name} sees in the app</p>
        <h2 className="font-black text-xl">Hello {student.display_name || 'learner'} 👋</h2>
        <p className="text-sm text-slate-600">
          Class {klass}
          {assignment?.forced_subject ? ` · ${assignment.forced_subject}` : ''}
          {assignment?.forced_topic ? ` · ${assignment.forced_topic}` : ''}
        </p>
      </div>

      {exam && (
        <div className="card mb-3 border-2 border-red-300">
          <b className="text-red-700">🔒 Locked exam:</b> this student is forced straight into
          exam #{exam.exam_id} ({exam.status}) when they open the app.
        </div>
      )}

      {assignment && (
        <div className="card mb-3">
          <h3 className="font-bold mb-2">Teacher settings applied to this student</h3>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <span className={chip(assignment.allow_notes)}>Notes {assignment.allow_notes ? 'on' : 'OFF'}</span>
            <span className={chip(assignment.allow_practice_with_answers)}>Practice w/ answers {assignment.allow_practice_with_answers ? 'on' : 'OFF'}</span>
            <span className={chip(assignment.allow_practice_no_answers)}>No-answers drill {assignment.allow_practice_no_answers ? 'on' : 'OFF'}</span>
            {assignment.forced_tier && <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">Forced tier {assignment.forced_tier}</span>}
          </div>
          {assignment.note && <p className="text-xs text-slate-500 mt-2">📝 {assignment.note}</p>}
        </div>
      )}

      <div className="card mb-3">
        <h3 className="font-bold mb-2">Their topic list {loading ? '…' : `(${topics.length})`}</h3>
        {topics.map(t => (
          <div key={`${t.subject}|${t.topic}`} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
            <div>
              <p className="font-semibold text-sm">{t.topic}</p>
              <p className="text-xs text-slate-400">{t.subject}</p>
            </div>
            <span className="text-xs text-slate-400">📖 ✏️ 🚀</span>
          </div>
        ))}
        {!loading && !topics.length && <p className="text-sm text-slate-400">No topics for this class/filter — the student sees an empty home screen. Fix via Remote Control or add questions.</p>}
      </div>

      {nudges.length > 0 && (
        <div className="card mb-3">
          <h3 className="font-bold mb-2">📬 Undelivered messages (pop on their next app open)</h3>
          {nudges.map((n, i) => (
            <p key={i} className="text-sm bg-yellow-50 rounded-lg p-2 mb-1">“{n.message}” <span className="text-xs text-slate-400">· {new Date(n.created_at).toLocaleTimeString()}</span></p>
          ))}
        </div>
      )}

      <div className="card">
        <h3 className="font-bold mb-2">Their latest answers</h3>
        {recent.map((a, i) => (
          <div key={i} className="flex justify-between text-sm py-1 border-b border-slate-100 last:border-0">
            <span>{a.topic} {a.tier ? `T${a.tier}` : ''}</span>
            <span>{a.skipped ? '⏭ skipped' : a.is_correct ? '✓' : a.is_correct === false ? '✗' : '—'} <span className="text-xs text-slate-400">{new Date(a.created_at).toLocaleTimeString()}</span></span>
          </div>
        ))}
        {!recent.length && <p className="text-sm text-slate-400">No answers yet.</p>}
      </div>
    </div>
  );
}
