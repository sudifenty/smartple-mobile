import { useEffect, useState } from 'react';
import { supabase, Profile } from './lib/supabase';
import Login from './pages/Login';
import Students from './pages/Students';
import Controls from './pages/Controls';
import Cheating from './pages/Cheating';
import Usage from './pages/Usage';
import Exams from './pages/Exams';
import Automations from './pages/Automations';
import Parent from './pages/Parent';

const NAV = [
  ['students', 'Students'],
  ['controls', 'Remote Control'],
  ['cheating', 'Cheating'],
  ['usage', 'Usage'],
  ['exams', 'Exams'],
  ['auto', 'Automations'],
] as const;
type Page = (typeof NAV)[number][0];

function route(): string {
  const h = window.location.hash.replace(/^#\/?/, '');
  return h || 'students';
}

export default function App() {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined); // undefined = loading
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const [page, setPage] = useState<Page>((route() as Page) || 'students');

  // Parent share view works without admin login: #/parent/<user_id>
  const [parentFor, setParentFor] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => {
      const r = route();
      if (r.startsWith('parent/')) { setParentFor(r.slice('parent/'.length)); return; }
      setParentFor(null);
      setPage((r as Page) || 'students');
    };
    window.addEventListener('hashchange', onHash);
    onHash();
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setProfile(null); setSignedInAs(null); return; }
      setSignedInAs(session.user.email || session.user.id);
      const { data, error } = await supabase.from('smartple_profiles')
        .select('*').eq('user_id', session.user.id).maybeSingle();
      console.log('LOGIN SUCCESS', { userId: session.user.id, email: session.user.email });
      console.log('PROFILE', data, 'ERROR', error);
      setProfile((data as Profile) || null);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) setProfile(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (parentFor) return <Parent userId={parentFor} />;

  if (profile === undefined)
    return <div className="p-10 text-slate-500">Loading…</div>;

  // HARD GATE: not admin → login only. Students never see anything.
  if (!profile || profile.role !== 'admin') {
    if (signedInAs)
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="card w-full max-w-md">
            <h1 className="text-lg font-black mb-2">Signed in — but not an admin</h1>
            <p className="text-sm text-slate-600 mb-2">
              You are signed in as <b>{signedInAs}</b>, but this account has no
              <code> role='admin' </code> row in <b>smartple_profiles</b> of the Supabase
              project this dashboard is connected to (see F12 console for the fetched profile).
            </p>
            <p className="text-sm text-slate-500 mb-3">
              Fix: run in the SQL editor — <code>UPDATE smartple_profiles SET role='admin' WHERE user_id=(SELECT id FROM auth.users WHERE email='{signedInAs}');</code>
              (sign up in this project first if you have no account here).
            </p>
            <button className="btn-s" onClick={() => supabase.auth.signOut().then(() => window.location.reload())}>
              Sign out
            </button>
          </div>
        </div>
      );
    return <Login />;
  }

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 flex-wrap sticky top-0 z-10">
        <span className="font-black text-indigo-700">SmartPle Admin</span>
        <nav className="flex gap-1 flex-wrap">
          {NAV.map(([id, label]) => (
            <a key={id} href={`#/${id}`}
               className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${page === id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {label}
            </a>
          ))}
        </nav>
        <button className="ml-auto btn-s" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>
      <main className="p-4 max-w-6xl mx-auto">
        {page === 'students' && <Students />}
        {page === 'controls' && <Controls />}
        {page === 'cheating' && <Cheating />}
        {page === 'usage' && <Usage />}
        {page === 'exams' && <Exams />}
        {page === 'auto' && <Automations />}
      </main>
    </div>
  );
}
