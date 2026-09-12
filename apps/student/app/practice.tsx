import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, TextInput, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { effectiveFilters, getRemote } from '../lib/remote';
import { fetchQuestionsFor, logEvent, SQ } from '../lib/data';
import { setTopic } from '../lib/usage';

/**
 * Practice: two modes.
 *  - answers   : MCQ, 4 options, instant check
 *  - no-answers: empty text box, typing only (answers hidden until check)
 * Both respect the admin's allow_* toggles and forced_* filters — enforced
 * on mount (screen refuses to open when the teacher locked it) AND per mode.
 */
export default function Practice() {
  const { topic, subject, klass } = useLocalSearchParams<{ topic: string; subject: string; klass: string }>();
  const router = useRouter();
  const f = effectiveFilters(klass);
  const [mode, setMode] = useState<'answers' | 'noanswers' | null>(null);
  const [qs, setQs] = useState<SQ[]>([]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [checked, setChecked] = useState<null | boolean>(null);
  const [startedAt, setStartedAt] = useState(Date.now());

  // HARD GATE: teacher locked both practice modes → straight back out
  useEffect(() => {
    if (!f.allowPracticeAnswers && !f.allowPracticeNoAnswers) {
      Alert.alert('Locked by your teacher 🔒', 'Practice is turned off right now. Read your notes first — your teacher will reopen it.');
      router.back();
    } else if (f.allowPracticeAnswers && !f.allowPracticeNoAnswers) {
      start('answers');   // only one mode allowed → skip the picker
    } else if (!f.allowPracticeAnswers && f.allowPracticeNoAnswers) {
      start('noanswers');
    }
  }, []);

  const start = async (m: 'answers' | 'noanswers') => {
    if (m === 'answers' && !f.allowPracticeAnswers) return Alert.alert('Locked', 'Your teacher turned this mode off.');
    if (m === 'noanswers' && !f.allowPracticeNoAnswers) return Alert.alert('Locked', 'Your teacher turned this mode off.');
    const a = getRemote().assignment;
    const rows = await fetchQuestionsFor({
      klass, subject, topic,
      tier: a?.forced_tier ?? null,
      kind: m === 'answers' ? 'mcq' : 'typed'
    });
    if (!rows.length) return Alert.alert('Nothing here', 'No questions for this mode yet.');
    setMode(m); setQs(rows); setIdx(0); setPicked(null); setTyped('');
    setChecked(null); setStartedAt(Date.now());
    setTopic(`${topic} practice`);
  };

  const check = () => {
    const qq = qs[idx];
    const given = (mode === 'answers' ? picked : typed) || '';
    const ok = qq.answer.split(',').map(x => x.trim().toLowerCase()).includes(given.trim().toLowerCase());
    setChecked(ok);
    logEvent({
      questionId: qq.id, subject, topic, subtopic: qq.subtopic, tier: qq.tier,
      correct: ok, seconds: Math.round((Date.now() - startedAt) / 1000)
    });
  };

  const next = () => {
    setChecked(null); setPicked(null); setTyped(''); setStartedAt(Date.now());
    if (idx + 1 < qs.length) setIdx(idx + 1);
    else { setMode(null); Alert.alert('Done!', 'Nice work. Pick another mode or go back.'); }
  };

  if (!mode) return (
    <View style={s.center}>
      <Pressable style={s.back} onPress={() => router.back()}><Text style={s.backT}>← Back</Text></Pressable>
      <Text style={s.h}>{topic}</Text>
      {f.allowPracticeAnswers && (
        <Pressable style={s.big} onPress={() => start('answers')}>
          <Text style={s.bigIco}>✏️</Text>
          <Text style={s.bigT}>Practice WITH answers</Text>
          <Text style={s.bigS}>4 choices, instant feedback</Text>
        </Pressable>
      )}
      {f.allowPracticeNoAnswers && (
        <Pressable style={s.big} onPress={() => start('noanswers')}>
          <Text style={s.bigIco}>🧠</Text>
          <Text style={s.bigT}>Practice NO answers</Text>
          <Text style={s.bigS}>Type the answer yourself</Text>
        </Pressable>
      )}
    </View>
  );

  const qq = qs[idx];
  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <Text style={s.progress}>Q{idx + 1}/{qs.length} · {mode === 'answers' ? 'with answers' : 'no answers'}</Text>
      <View style={s.qcard}>
        <Text style={s.q}>{qq.prompt}</Text>
        {mode === 'answers'
          ? (qq.options || []).map(o => (
              <Pressable key={o} disabled={checked !== null}
                style={[s.opt, picked === o && s.optOn,
                  checked !== null && o === qq.answer && s.optRight,
                  checked === false && picked === o && s.optWrong]}
                onPress={() => setPicked(o)}>
                <Text style={s.optT}>{o}</Text>
              </Pressable>
            ))
          : <TextInput style={s.typeIn} value={typed} onChangeText={setTyped}
              editable={checked === null} placeholder="Type your answer…" placeholderTextColor="#B7AC93" />}
        {checked !== null && (
          <Text style={checked ? s.right : s.wrong}>
            {checked ? '✅ Correct!' : `Not quite — answer: ${qq.answer}`}
            {qq.explain ? `\n${qq.explain}` : ''}
          </Text>
        )}
      </View>
      {checked === null
        ? <Pressable style={s.btn} disabled={mode === 'answers' ? !picked : !typed.trim()} onPress={check}><Text style={s.btnT}>Check</Text></Pressable>
        : <Pressable style={s.btn} onPress={next}><Text style={s.btnT}>{idx + 1 === qs.length ? 'Finish' : 'Next'}</Text></Pressable>}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1 },
  center: { flex: 1, padding: 24, justifyContent: 'center' },
  back: { marginBottom: 8 }, backT: { color: '#2D6CDF', fontWeight: '800' },
  h: { fontSize: 24, fontWeight: '900', color: '#2D4159', textAlign: 'center', marginBottom: 16 },
  big: { backgroundColor: '#fff', borderRadius: 18, padding: 20, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#EFE6D2' },
  off: { opacity: 0.4 },
  bigIco: { fontSize: 34 },
  bigT: { fontWeight: '900', color: '#2D4159', fontSize: 17, marginTop: 4 },
  bigS: { color: '#8A7F6A', fontSize: 12 },
  progress: { color: '#8A7F6A', fontWeight: '700', marginBottom: 8 },
  qcard: { backgroundColor: '#fff', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#EFE6D2', marginBottom: 12 },
  q: { fontSize: 18, fontWeight: '800', color: '#2D4159', marginBottom: 12 },
  opt: { borderWidth: 1.5, borderColor: '#E6DCC8', borderRadius: 12, padding: 13, marginBottom: 8 },
  optOn: { borderColor: '#2D6CDF', backgroundColor: '#EAF1FF' },
  optRight: { borderColor: '#1E9E4A', backgroundColor: '#E7F7EC' },
  optWrong: { borderColor: '#D64545', backgroundColor: '#FDECEC' },
  optT: { color: '#2D4159', fontWeight: '700' },
  typeIn: { borderWidth: 1.5, borderColor: '#E6DCC8', borderRadius: 12, padding: 13, fontSize: 16, color: '#2D4159' },
  right: { color: '#1E9E4A', fontWeight: '800', marginTop: 10 },
  wrong: { color: '#D64545', fontWeight: '800', marginTop: 10 },
  btn: { backgroundColor: '#2D6CDF', borderRadius: 14, padding: 15, alignItems: 'center' },
  btnT: { color: '#fff', fontWeight: '900', fontSize: 16 }
});
