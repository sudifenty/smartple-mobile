# SmartPle Mobile — Student App + Admin Dashboard

Two apps, ONE Supabase project (the same one your web app + paywall already uses).

```
smartple-mobile/
├── supabase/
│   ├── schema.sql        ← run ONCE in the Supabase SQL editor (top to bottom)
│   └── seed_example.sql  ← example: P4 Math Fractions, all 5 tiers
└── apps/
    ├── student/          ← Expo (React Native) student app, P4–P7
    └── admin/            ← secret admin dashboard (React + Vite + Tailwind)
```

## 1. Database (once)

1. Supabase dashboard → SQL editor → paste `supabase/schema.sql` → Run.
   (Additive: your existing `smartple_profiles` paywall columns are preserved.)
2. Optional: run `supabase/seed_example.sql` for a demo topic.
3. Make yourself admin (bottom of schema.sql):
   ```sql
   UPDATE public.smartple_profiles SET role='admin'
    WHERE user_id = (SELECT id FROM auth.users WHERE email='you@example.com');
   ```

Tables: `smartple_profiles` (+role, display_name, class, parent_code),
`smartple_questions` (class/subject/topic/subtopic/tier/is_visual),
`smartple_attempts`, `smartple_assignments`, `smartple_usage`,
`smartple_note_events`, `smartple_exams`, `smartple_exam_assignments`,
`smartple_nudges`, `smartple_notes`.
RPCs: `scan_weak_students()`, `scan_guessers()`, `note_cheat_timeline(user)`,
`parent_report(user, code)`, `is_admin()` (used by RLS).

## 2. Student app (Expo)

```bash
cd apps/student
cp .env.example .env        # then fill in your Supabase URL + anon key
npm install
npx expo start              # scan QR with Expo Go, or press a for Android
```

Behaviour implemented:
- **5 tiers per topic** (T1 Comfort → T5 PLE UNEB). **80% (12/15) unlocks the next tier.**
  The word FAILED never appears — only “You need X more to level up”.
- **Practice with answers** (MCQ ×4) and **Practice no answers** (typed box).
- **Notes**: read subtopic → 2–3 questions → “View Answer” button.
  Every `viewed_answer` / `started_typing` / `submitted` is logged with timestamps;
  viewed-before-typing gets a gentle “Try first!” nudge; the admin side classifies
  🚩 COPIED (<15s), ⚠️ viewed-before-attempt, ✅ genuine.
- **Offline usage (<50KB)**: minutes tracked in AsyncStorage; flushed to
  `smartple_usage` (`is_offline=true`) the moment NetInfo reports connectivity.
  Notes text is fetched from Supabase and only used topics are cached.
- **Exam lock**: every screen focus re-checks `smartple_exam_assignments`.
  A `locked` exam hard-redirects to `/exam/[id]` — Android back swallowed,
  no close, Notes/Practice unreachable until `completed`.
- **Remote control respected on every fetch**: `forced_class/subject/topic/tier`
  filter all queries; `allow_*` toggles hide/disable buttons; `note` shows on home.
- **Nudges** pop up as an alert from the teacher.

## 3. Admin dashboard (secret)

```bash
cd apps/admin
npm install
VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... npm run build   # → dist/
npm run dev                                                      # local dev
```

Deploy `dist/` anywhere (Netlify/Vercel/GitHub Pages). Login is **role-gated**:
`role !== 'admin'` sees nothing but the login screen — students can never get in.

Pages: **Students** (weakest-subtopic heatmap + skip/anxiety counts) ·
**Remote Control** (3 toggles + force class/subject/topic/tier + note → Save) ·
**Cheating** (per-student timeline with 🚩/⚠️/✅ + speed-guessing alerts) ·
**Usage** (today online vs offline minutes + 7-day bars) ·
**Exams** (build from the bank by class/topic/tier → “Send & Lock”) ·
**Automations** (Scan Weak Students with Force-P4/Force-T1 buttons, send nudges) ·
**Parent view** (`#/parent/<user_id>` + a 6-digit `parent_code` — read-only minutes + weak topics).

## 4. Anti-guessing

- Server RPC `scan_guessers()` flags 5+ MCQs answered in <15s (24h window).
- Admin Cheating page also flags “Random Guessing” (≥3 answers <3s and wrong).

## Notes

- Question bank images stay remote (`image_url`) — the app bundle stays small.
- RLS: students see only their own rows; admins (`is_admin()`) see everything.
- The web paywall (`Uganda-spelling` repo) keeps working — same profiles table,
  same Supabase project, nothing was removed.
