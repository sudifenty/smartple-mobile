import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Set these before building, e.g. in apps/admin/.env.local consumed by your host,
// or replace with your project values (the SAME Supabase project as the student app).
const URL = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://YOUR-PROJECT.supabase.co';
const KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'YOUR-ANON-KEY';

export const supabase: SupabaseClient = createClient(URL, KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

export type Profile = {
  user_id: string; display_name: string | null; class: string | null;
  role: 'student' | 'admin'; is_paid?: boolean;
};
export type Assignment = {
  user_id: string; forced_class: string | null; forced_subject: string | null;
  forced_topic: string | null; forced_tier: number | null;
  allow_notes: boolean; allow_practice_with_answers: boolean;
  allow_practice_no_answers: boolean; note: string | null;
};
