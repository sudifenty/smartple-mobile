import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, BackHandler, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { refreshRemote } from '../../lib/remote';

type ExamQ = { question_id: number; prompt: string; options: string[] | null; answer: string; tier: number };

/**
 * Forced exam. While an assignment is locked/in_progress:
 *  - this screen is the ONLY screen (router.replace in _layout)
 *  - hardware Back is swallowed
 *  - Notes/Practice are unreachable (home never renders)
 * Completing sets status='completed' + score → app unlocks instantly.
 */
export default function ExamScreen() {
  const { exam_id } = useLocalSearchParams<{ exam_id: string }>();
  const router = useRouter();
  const [exam, setExam] = useState<any>(null);
  const [assignment, setAssignment] = useState<any>(null);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const timer = useRef<any>(null);

  // swallow Android hardware back — no escape from a locked exam
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    // The exam tables were dropped in the DB restructure — exams are paused
    // until they're restored. Send the student home instead of dead queries.
    Alert.alert('Exams paused', 'The exam system is being upgraded by your teacher. Carry on with your practice!');
    router.replace('/');
  }, [exam_id]);

  useEffect(() => {
    if (secondsLeft === null) return;
    timer.current = setInterval(() => setSecondsLeft(x => (x === null ? null : x - 1)), 1000);
    return () => clearInterval(timer.current);
  }, [secondsLeft !== null]);

  useEffect(() => {
    if (secondsLeft === 0) finish(true);
  }, [secondsLeft]);

  const finish = async (auto: boolean) => {
    if (!exam || !assignment) return;
    clearInterval(timer.current);
    const qs: ExamQ[] = exam.questions || [];
    let correct = 0;
    qs.forEach((q, i) => {
      const given = picked[i] || '';
      if (q.answer.split(',').map(a => a.trim().toLowerCase()).includes(given.trim().toLowerCase())) correct++;
    });
    const score = qs.length ? Math.round((correct / qs.length) * 1000) / 10 : 0;
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('smartple_exam_assignments')
      .update({ status: 'completed', score }).eq('id', assignment.id);
    // log every answer for the admin dashboard
    if (user) await supabase.from('smartple_attempts').insert(
      qs.map((q, i) => ({
        user_id: user.id, subject: exam.subject || 'Exam', topic: exam.title,
        subtopic: null, tier: q.tier, question_id: q.question_id,
        given_answer: picked[i] || null,
        is_correct: (q.answer || '').split(',').map((a: string) => a.trim().toLowerCase()).includes((picked[i] || '').trim().toLowerCase()),
        skipped: !picked[i], time_spent_seconds: null
      }))
    );
    if (user) await refreshRemote(user.id);
    Alert.alert(auto ? '⏰ Time is up' : 'Exam submitted', `You scored ${score}%`, [
      { text: 'OK', onPress: () => router.replace('/') }
    ]);
  };

  if (!exam) return <View style={s.center}><Text style={s.lockT}>🔒 Preparing your exam…</Text></View>;

  const qs: ExamQ[] = exam.questions || [];
  const q = qs[idx];
  const mm = secondsLeft !== null ? Math.floor(Math.max(0, secondsLeft) / 60) : 0;
  const ss = secondsLeft !== null ? Math.max(0, secondsLeft) % 60 : 0;

  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <View style={s.head}>
        <Text style={s.title}>🔒 {exam.title}</Text>
        <Text style={s.clock}>⏱ {mm}:{String(ss).padStart(2, '0')}</Text>
      </View>
      <Text style={s.sub}>This exam was sent by your teacher. Notes and practice are paused until you finish.</Text>
      <View style={s.dots}>
        {qs.map((_, i) => (
          <Pressable key={i} onPress={() => setIdx(i)}
            style={[s.dot, i === idx && s.dotNow, !!picked[i] && s.dotDone]}>
            <Text style={s.dotT}>{i + 1}</Text>
          </Pressable>
        ))}
      </View>
      <View style={s.qcard}>
        <Text style={s.q}>{q.prompt}</Text>
        {(q.options || []).map(o => (
          <Pressable key={o} style={[s.opt, picked[idx] === o && s.optOn]} onPress={() => setPicked(p => ({ ...p, [idx]: o }))}>
            <Text style={picked[idx] === o ? s.optOnT : s.optT}>{o}</Text>
          </Pressable>
        ))}
      </View>
      <View style={s.row}>
        <Pressable style={s.ghost} disabled={idx === 0} onPress={() => setIdx(idx - 1)}><Text style={s.ghostT}>← Prev</Text></Pressable>
        {idx < qs.length - 1
          ? <Pressable style={s.ghost} onPress={() => setIdx(idx + 1)}><Text style={s.ghostT}>Next →</Text></Pressable>
          : <Pressable style={s.btn} onPress={() => finish(false)}><Text style={s.btnT}>Submit exam ✔</Text></Pressable>}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lockT: { fontSize: 18, fontWeight: '900', color: '#2D4159' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '900', color: '#2D4159', flex: 1 },
  clock: { fontSize: 20, fontWeight: '900', color: '#B00020' },
  sub: { color: '#8A7F6A', fontSize: 12, marginVertical: 8 },
  dots: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  dot: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E6DCC8', alignItems: 'center', justifyContent: 'center' },
  dotNow: { borderColor: '#2D6CDF', borderWidth: 2 },
  dotDone: { backgroundColor: '#DCE9FF' },
  dotT: { fontSize: 11, fontWeight: '800', color: '#2D4159' },
  qcard: { backgroundColor: '#fff', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#EFE6D2', marginBottom: 12 },
  q: { fontSize: 18, fontWeight: '800', color: '#2D4159', marginBottom: 12 },
  opt: { borderWidth: 1.5, borderColor: '#E6DCC8', borderRadius: 12, padding: 13, marginBottom: 8 },
  optOn: { backgroundColor: '#2D6CDF', borderColor: '#2D6CDF' },
  optT: { color: '#2D4159', fontWeight: '700' },
  optOnT: { color: '#fff', fontWeight: '700' },
  row: { flexDirection: 'row', gap: 8 },
  ghost: { flex: 1, backgroundColor: '#F3EDDD', borderRadius: 12, padding: 14, alignItems: 'center' },
  ghostT: { fontWeight: '800', color: '#2D4159' },
  btn: { flex: 1, backgroundColor: '#1E9E4A', borderRadius: 12, padding: 14, alignItems: 'center' },
  btnT: { color: '#fff', fontWeight: '900' }
});
