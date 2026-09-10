import { useState } from 'react';
import { supabase, Profile } from '../lib/supabase';

export default function Automations() {
  const [weak, setWeak] = useState<any[] | null>(null);
  const [students, setStudents] = useState<Profile[] | null>(null);
  const [msg, setMsg] = useState("You're doing great, keep going!");
  const [sent, setSent] = useState('');

  const scanWeak = async () => {
    const { data, error } = await supabase.rpc('scan_weak_students');
    if (error) return alert(error.message);
    setWeak(data || []);
  };

  const force = async (w: any, patch: any) => {
    await supabase.from('smartple_assignments').upsert(
      { user_id: w.user_id, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' });
    alert('Saved to remote control.');
  };

  const loadStudents = async () => {
    if (!students) {
      const { data } = await supabase.from('smartple_profiles').select('*').eq('role', 'student');
      setStudents((data as Profile[]) || []);
    }
  };

  const nudge = async () => {
    loadStudents();
    const uid = (document.getElementById('nudgeStudent') as HTMLSelectElement)?.value;
    if (!uid) return alert('Pick a student.');
    const { error } = await supabase.from('smartple_nudges').insert({ user_id: uid, message: msg });
    if (error) return alert(error.message);
    setSent('Nudge sent — pops up in the student app.');
    setTimeout(() => setSent(''), 2500);
  };

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center gap-3 mb-2">
          <h2 className="font-black">Auto-detect weak students</h2>
          <button className="btn-p" onClick={scanWeak}>Scan Weak Students</button>
        </div>
        <p className="text-xs text-slate-400 mb-2">avg &lt; 50% per topic, with a one-tap suggestion.</p>
        {weak && (
          <table className="w-full">
            <thead><tr><th className="th">Student</th><th className="th">Class</th><th className="th">Topic</th><th className="th">Avg</th><th className="th">Suggestion</th><th className="th"></th></tr></thead>
            <tbody>
              {weak.map((w, i) => (
                <tr key={i}>
                  <td className="td">{w.display_name}</td><td className="td">{w.class || '?'}</td>
                  <td className="td">{w.subject} · {w.topic}</td>
                  <td className="td font-bold text-red-600">{w.avg_score}%</td>
                  <td className="td">{w.suggestion}</td>
                  <td className="td text-right whitespace-nowrap">
                    <button className="text-xs underline mr-2" onClick={() => force(w, { forced_class: 'P4' })}>Force P4</button>
                    <button className="text-xs underline" onClick={() => force(w, { forced_tier: 1, forced_topic: w.topic })}>Force T1</button>
                  </td>
                </tr>
              ))}
              {!weak.length && <tr><td className="td text-slate-400" colSpan={6}>Nobody below 50%. 🎉</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2 className="font-black mb-2">Send a nudge 💬</h2>
        <div className="flex flex-wrap gap-2">
          <select id="nudgeStudent" className="input max-w-xs" onFocus={loadStudents}>
            <option value="">Pick student…</option>
            {(students || []).map(s => <option key={s.user_id} value={s.user_id}>{s.display_name}</option>)}
          </select>
          <input className="input flex-1 min-w-[200px]" value={msg} onChange={e => setMsg(e.target.value)} />
          <button className="btn-p" onClick={nudge}>Send</button>
        </div>
        {sent && <p className="text-green-600 text-sm font-bold mt-2">{sent}</p>}
      </div>
    </div>
  );
}
