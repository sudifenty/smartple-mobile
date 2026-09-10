import { useEffect, useState } from 'react';
import { supabase, Profile } from '../lib/supabase';

export default function Usage() {
  const [students, setStudents] = useState<Profile[]>([]);
  const [sel, setSel] = useState<Profile | null>(null);
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    supabase.from('smartple_profiles').select('*').eq('role', 'student')
      .then(({ data }) => setStudents((data as Profile[]) || []));
  }, []);

  const pick = async (s: Profile) => {
    setSel(s);
    const from = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
    const { data } = await supabase.from('smartple_usage').select('*')
      .eq('user_id', s.user_id).gte('date', from).order('date');
    setRows(data || []);
  };

  const days: { d: string; on: number; off: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    const dayRows = rows.filter(r => r.date === d);
    days.push({
      d,
      on: dayRows.filter(r => !r.is_offline).reduce((s, r) => s + Number(r.minutes_used), 0),
      off: dayRows.filter(r => r.is_offline).reduce((s, r) => s + Number(r.minutes_used), 0)
    });
  }
  const today = days[days.length - 1];
  const max = Math.max(1, ...days.map(x => x.on + x.off));

  return (
    <div className="card">
      <h2 className="font-black mb-2">Usage — online vs offline-synced</h2>
      <select className="input mb-4 max-w-xs" value={sel?.user_id || ''}
        onChange={e => pick(students.find(s => s.user_id === e.target.value)!)}>
        <option value="">Select student…</option>
        {students.map(s => <option key={s.user_id} value={s.user_id}>{s.display_name}</option>)}
      </select>
      {sel && (
        <>
          <div className="flex gap-4 mb-4 text-sm">
            <div className="px-3 py-2 rounded-xl bg-indigo-50"><b>Today:</b> {(today.on + today.off).toFixed(1)} min</div>
            <div className="px-3 py-2 rounded-xl bg-green-50">Online {today.on.toFixed(1)}</div>
            <div className="px-3 py-2 rounded-xl bg-slate-100">Offline {today.off.toFixed(1)}</div>
            <a className="px-3 py-2 rounded-xl bg-slate-800 text-white" href={`#/parent/${sel.user_id}`}>Parent view ↗</a>
          </div>
          <div className="flex items-end gap-2 h-40">
            {days.map(x => (
              <div key={x.d} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex flex-col justify-end" style={{ height: '120px' }}>
                  <div className="w-full bg-slate-300 rounded-t" style={{ height: `${(x.off / max) * 100}%` }} title="offline" />
                  <div className="w-full bg-indigo-500" style={{ height: `${(x.on / max) * 100}%` }} title="online" />
                </div>
                <span className="text-[10px] text-slate-400">{x.d.slice(5)}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-2">Green-grey = synced from offline sessions (is_offline).</p>
        </>
      )}
    </div>
  );
}
