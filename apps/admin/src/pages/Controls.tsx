import { useEffect, useState } from 'react';
import { supabase, Profile, Assignment } from '../lib/supabase';
import { fetchQuestions } from '../lib/events';

const CLASSES = ['P4', 'P5', 'P6', 'P7'];
const TIERS = [1, 2, 3, 4, 5];

const EMPTY = (uid: string): Assignment => ({
  user_id: uid, forced_class: null, forced_subject: null, forced_topic: null,
  forced_tier: null, allow_notes: true, allow_practice_with_answers: true,
  allow_practice_no_answers: true, note: null
});

export default function Controls() {
  const [students, setStudents] = useState<Profile[]>([]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Profile | null>(null);
  const [a, setA] = useState<Assignment | null>(null);
  const [topics, setTopics] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase.from('smartple_profiles').select('*').eq('role', 'student')
      .then(({ data }) => setStudents(((data as Profile[]) || []).filter(s => !!s.user_id)));
  }, []);

  const pick = async (s: Profile) => {
    setSel(s); setSaved(false);
    const { data } = await supabase.from('smartple_assignments').select('*')
      .eq('user_id', s.user_id).limit(1);
    const row = ((data as Assignment[]) || [])[0];
    setA(row ? { ...row, note: row.note ?? null } : EMPTY(s.user_id));
    refreshTopics(null);
  };

  const refreshTopics = async (subject: string | null) => {
    const qs = await fetchQuestions();
    const filtered = qs.filter(q => q.topic && (!subject || q.subject === subject));
    setTopics(Array.from(new Set(filtered.map(q => q.topic as string))));
  };

  const set = (patch: Partial<Assignment>) => setA(prev => prev ? { ...prev, ...patch } : prev);

  const save = async () => {
    if (!a) return;
    const payload = { ...a, updated_at: new Date().toISOString() };
    // Manual upsert: the live table's key is its own `id` column, not
    // user_id — so an on-conflict upsert targeting user_id is rejected.
    const { data: existing } = await supabase.from('smartple_assignments')
      .select('user_id').eq('user_id', a.user_id).limit(1);
    const { error } = (existing && existing.length)
      ? await supabase.from('smartple_assignments').update(payload).eq('user_id', a.user_id)
      : await supabase.from('smartple_assignments').insert(payload);
    if (error) return alert(`Save FAILED — the student got nothing.\n\n${error.message}`);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const Toggle = ({ label, val, on }: { label: string; val: boolean; on: () => void }) => (
    <button onClick={on}
      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold ${val ? 'border-green-300 bg-green-50 text-green-700' : 'border-red-300 bg-red-50 text-red-600'}`}>
      <span>{val ? '✓' : '✕'}</span> {label}
    </button>
  );

  const list = students.filter(s => !q || (s.display_name || '').toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="grid md:grid-cols-[280px,1fr] gap-4">
      <div className="card">
        <input className="input mb-2" placeholder="Search student…" value={q} onChange={e => setQ(e.target.value)} />
        {list.map(s => (
          <button key={s.user_id} onClick={() => pick(s)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm ${sel?.user_id === s.user_id ? 'bg-indigo-50 font-bold' : 'hover:bg-slate-50'}`}>
            {s.display_name || (s.user_id ? s.user_id.slice(0, 8) : '(no name)')} <span className="text-slate-400">· {s.class || '?'}</span>
          </button>
        ))}
      </div>
      <div>
        {!a && <div className="card text-slate-500">Pick a student to control their app remotely.</div>}
        {a && sel && (
          <div className="card">
            <h2 className="font-black mb-3">{sel.display_name} — Remote Control</h2>
            <div className="flex flex-wrap gap-2 mb-4">
              <Toggle label="Notes" val={a.allow_notes} on={() => set({ allow_notes: !a.allow_notes })} />
              <Toggle label="Practice with answers" val={a.allow_practice_with_answers} on={() => set({ allow_practice_with_answers: !a.allow_practice_with_answers })} />
              <Toggle label="Practice no answers" val={a.allow_practice_no_answers} on={() => set({ allow_practice_no_answers: !a.allow_practice_no_answers })} />
            </div>
            <div className="grid sm:grid-cols-4 gap-2 mb-3">
              <select className="input" value={a.forced_class || ''}
                onChange={e => set({ forced_class: e.target.value || null })}>
                <option value="">Class: (free)</option>
                {CLASSES.map(c => <option key={c} value={c}>Force {c}</option>)}
              </select>
              <select className="input" value={a.forced_subject || ''}
                onChange={e => { set({ forced_subject: e.target.value || null, forced_topic: null }); refreshTopics(e.target.value || null); }}>
                <option value="">Subject: (free)</option>
                {['Math', 'SST', 'English', 'Science'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className="input" value={a.forced_topic || ''}
                onChange={e => set({ forced_topic: e.target.value || null })}>
                <option value="">Topic: (free)</option>
                {topics.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select className="input" value={a.forced_tier || ''}
                onChange={e => set({ forced_tier: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Tier: (free)</option>
                {TIERS.map(t => <option key={t} value={t}>Force T{t}</option>)}
              </select>
            </div>
            <textarea className="input mb-3" rows={2} placeholder="Private note to yourself about this student…"
              value={a.note || ''} onChange={e => set({ note: e.target.value })} />
            <div className="flex items-center gap-3">
              <button className="btn-p" onClick={save}>Save</button>
              {saved && <span className="text-green-600 text-sm font-bold">Saved — student app picks this up on next fetch.</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
