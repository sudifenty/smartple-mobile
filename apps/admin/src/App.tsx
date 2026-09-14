import { useEffect, useState } from 'react';
import { supabase, Profile } from './lib/supabase';
import { useTheme } from './lib/theme';
import Login from './pages/Login';
import Students from './pages/Students';
import Register from './pages/Register';
import Live from './pages/Live';
import Controls from './pages/Controls';
import Cheating from './pages/Cheating';
import Usage from './pages/Usage';
import Exams from './pages/Exams';
import Automations from './pages/Automations';
import Parent from './pages/Parent';

const NAV = [
  ['students', 'Students', '👥'],
  ['register', 'Register', '➕'],
  ['live', 'Live Activity', '📡'],
  ['controls', 'Remote Control', '🎛️'],
  ['cheating', 'Cheating', '🚩'],
  ['usage', 'Usage', '📊'],
  ['exams', 'Exams', '📝'],
  ['auto', 'Automations', '⚙️'],
] as const;
type Page = (typeof NAV)[number][0];

function route(): string {
  const h = window.location.hash.replace(/^#\/?/, '');
  return h || 'students';
}

/* A small mark so the header reads as a product rather than a debug page. */
function Mark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" className="fill-brand-600 dark:fill-brand-500" />
      <path d="M9 21.5 14 11l3.4 7.2L20 14l3 7.5" fill="none" stroke="white"
        strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="23" cy="10" r="2.1" className="fill-accent-400" />
    </svg>
  );
}

function ThemeToggle() {
  const [theme, toggle] = useTheme();
  return (
    <button onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      className="w-10 h-10 shrink-0 grid place-items-center rounded-xl border border-surface-line
                 bg-surface-raised text-surface-muted transition hover:text-surface-ink
                 hover:border-brand-300 dark:hover:border-brand-700">
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 14.5A8.2 8.2 0 0 1 9.5 4a8.3 8.3 0 1 0 10.5 10.5Z" />
        </svg>
      )}
    </button>
  );
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
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="flex flex-col items-center gap-3 text-surface-muted">
          <Mark className="w-10 h-10 animate-pulse" />
          <span className="text-sm font-semibold">Loading…</span>
        </div>
      </div>
    );

  // HARD GATE: not admin → login only. Students never see anything.
  if (!profile || profile.role !== 'admin') {
    if (signedInAs)
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="card w-full max-w-md">
            <Mark className="w-10 h-10 mb-3" />
            <h1 className="mb-2">Signed in — but not an admin</h1>
            <p className="text-sm text-surface-muted mb-3">
              You are signed in as <b className="text-surface-ink">{signedInAs}</b>, but this
              account has no <code className="kbd">role='admin'</code> row in{' '}
              <b className="text-surface-ink">smartple_profiles</b> of the Supabase project this
              dashboard is connected to (see the console for the fetched profile).
            </p>
            <p className="text-sm text-surface-muted mb-4">
              Fix: run in the SQL editor —{' '}
              <code className="kbd break-all">UPDATE smartple_profiles SET role='admin' WHERE user_id=(SELECT id FROM auth.users WHERE email='{signedInAs}');</code>{' '}
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
      <header className="sticky top-0 z-20 bg-surface-raised/90 backdrop-blur border-b border-surface-line">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-3 py-3">
            <Mark className="w-9 h-9 shrink-0" />
            <div className="min-w-0">
              <div className="font-black leading-tight tracking-tight">SmartPle</div>
              <div className="text-xs text-surface-faint font-semibold leading-tight -mt-0.5">Admin</div>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
              <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-surface-line">
                <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-800 grid place-items-center
                                text-xs font-black dark:bg-brand-900 dark:text-brand-200">
                  {(signedInAs || '?').slice(0, 1).toUpperCase()}
                </div>
                <button className="text-sm font-semibold text-surface-muted hover:text-surface-ink transition"
                  onClick={() => supabase.auth.signOut()}>
                  Sign out
                </button>
              </div>
              <button className="sm:hidden btn-s !px-3 !py-2 text-xs" onClick={() => supabase.auth.signOut()}>
                Out
              </button>
            </div>
          </div>

          {/* Nav scrolls sideways on a phone rather than wrapping into a wall */}
          <nav className="flex gap-1 overflow-x-auto pb-2 -mb-px scroll-smooth"
               style={{ scrollbarWidth: 'none' }}>
            {NAV.map(([id, label, icon]) => (
              <a key={id} href={`#/${id}`}
                 className={page === id ? 'nav-link-active' : 'nav-link'}>
                <span className="mr-1.5" aria-hidden="true">{icon}</span>{label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main className="p-4 sm:p-6 max-w-7xl mx-auto pb-16">
        {page === 'students' && <Students />}
        {page === 'register' && <Register />}
        {page === 'live' && <Live />}
        {page === 'controls' && <Controls />}
        {page === 'cheating' && <Cheating />}
        {page === 'usage' && <Usage />}
        {page === 'exams' && <Exams />}
        {page === 'auto' && <Automations />}
      </main>
    </div>
  );
}
