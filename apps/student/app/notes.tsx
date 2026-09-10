import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, TextInput, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { effectiveFilters, getRemote } from '../lib/remote';
import { setTopic } from '../lib/usage';

type Note = { id: number; subtopic: string; body: string; questions: { q: string; answer: string }[] };

const NOTES_CACHE = 'sp_notes_cache'; // only used topics are cached — app stays light

/**
 * Notes: read the subtopic lesson, then 2-3 questions with a "View Answer" button.
 * EVERY event is logged to smartple_note_events with timestamps:
 *   viewed_answer / started_typing / submitted
 * Cheating rules (also re-checked server-side by note_cheat_timeline):
 *   viewed BEFORE started_typing          → ⚠️ viewed before attempting
 *   submitted − viewed_answer < 15 s      → 🚩 COPIED
 */
export default function Notes() {
  const { topic, subject, klass } = useLocalSearchParams<{ topic: string; subject: string; klass: string }>();
  const router = useRouter();
  const f = effectiveFilters(klass);
  const [subs, setSubs] = useState<string[]>([]);
  const [note, setNote] = useState<Note | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [typedAt, setTypedAt] = useState<Record<number, number>>({});

  useEffect(() => {
    if (!f.allowNotes) { Alert.alert('Locked', 'Your teacher turned Notes off.'); router.back(); return; }
    (async () => {
      const { data } = await supabase.from('smartple_notes')
        .select('*').eq('class', klass).eq('subject', subject).eq('topic', topic);
      let rows = (data as Note[]) || [];
      if (rows.length) {
        // cache for offline re-reading
        const cache = JSON.parse((await AsyncStorage.getItem(NOTES_CACHE)) || '{}');
        cache[`${klass}|${subject}|${topic}`] = rows;
        await AsyncStorage.setItem(NOTES_CACHE, JSON.stringify(cache));
      } else {
        const cache = JSON.parse((await AsyncStorage.getItem(NOTES_CACHE)) || '{}');
        rows = cache[`${klass}|${subject}|${topic}`] || [];
      }
      setSubs(rows.map(r => r.subtopic));
      if (rows[0]) open(rows[0]);
    })();
  }, [klass, subject, topic]);

  const open = (n: Note) => { setNote(n); setAnswers({}); setRevealed({}); setTypedAt({}); setTopic(`notes ${n.subtopic}`); };

  const log = (i: number, type: 'viewed_answer' | 'started_typing' | 'submitted') => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) supabase.from('smartple_note_events').insert({
        user_id: data.user.id, subtopic: note!.subtopic, question_id: i, event_type: type
      });
    });
  };

  const onType = (i: number, v: string) => {
    setAnswers(a => ({ ...a, [i]: v }));
    if (!typedAt[i]) { setTypedAt(t => ({ ...t, [i]: Date.now() })); log(i, 'started_typing'); }
  };

  const viewAnswer = (i: number) => {
    setRevealed(r => ({ ...r, [i]: true }));
    log(i, 'viewed_answer');
    // instant client-side feedback for the honest learner
    if (!typedAt[i]) {
      // viewed before attempting — nudge, not punishment
      setTimeout(() => Alert.alert('Try first!', 'Type your own answer before reading mine — that is how it sticks. 🙂'), 300);
    }
  };

  const submit = (i: number) => {
    log(i, 'submitted');
    const viewedMs = revealed[i] ? Date.now() : 0;
    if (revealed[i] && typedAt[i] && viewedMs - typedAt[i] < 0) {
      Alert.alert('⚠️', 'You looked at the answer before typing. Try the next one on your own!');
    }
    const q = note!.questions[i];
    const ok = q.answer.split(',').map(x => x.trim().toLowerCase()).includes((answers[i] || '').trim().toLowerCase());
    Alert.alert(ok ? '✅ Correct!' : 'Keep going', ok ? 'Well done!' : `The answer was: ${q.answer}`);
  };

  if (!f.allowNotes) return null;

  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <Pressable style={s.back} onPress={() => router.back()}><Text style={s.backT}>← Back</Text></Pressable>
      <Text style={s.h}>{topic}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
        {subs.map((sb, i) => (
          <Pressable key={sb} style={[s.chip, note?.subtopic === sb && s.chipOn]} onPress={() => {
            supabase.from('smartple_notes').select('*')
              .eq('class', klass).eq('subject', subject).eq('topic', topic).eq('subtopic', sb)
              .maybeSingle().then(({ data }) => data && open(data as Note));
          }}>
            <Text style={note?.subtopic === sb ? s.chipOnT : s.chipT}>{i + 1}. {sb}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {note && (
        <>
          <View style={s.lesson}>
            <Text style={s.lessonT}>{note.body}</Text>
          </View>
          {note.questions.map((q, i) => (
            <View key={i} style={s.qcard}>
              <Text style={s.q}>{i + 1}. {q.q}</Text>
              <TextInput style={s.typeIn} value={answers[i] || ''} onChangeText={v => onType(i, v)}
                placeholder="Type your answer…" placeholderTextColor="#B7AC93" />
              <View style={s.row}>
                <Pressable style={s.ghost} onPress={() => viewAnswer(i)}>
                  <Text style={s.ghostT}>{revealed[i] ? `Answer: ${q.answer}` : '👁 View Answer'}</Text>
                </Pressable>
                <Pressable style={s.btn} disabled={!answers[i]} onPress={() => submit(i)}>
                  <Text style={s.btnT}>Submit</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </>
      )}
      {!note && <Text style={s.empty}>No notes for this topic yet.</Text>}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1 },
  back: { marginBottom: 8 }, backT: { color: '#2D6CDF', fontWeight: '800' },
  h: { fontSize: 24, fontWeight: '900', color: '#2D4159', marginBottom: 8 },
  chip: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, borderWidth: 1, borderColor: '#EFE6D2' },
  chipOn: { backgroundColor: '#2D6CDF', borderColor: '#2D6CDF' },
  chipT: { color: '#2D4159', fontWeight: '700', fontSize: 12 },
  chipOnT: { color: '#fff', fontWeight: '700', fontSize: 12 },
  lesson: { backgroundColor: '#FFFDF4', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#F0E6C8', marginBottom: 12 },
  lessonT: { color: '#4A4232', fontSize: 15, lineHeight: 23 },
  qcard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#EFE6D2' },
  q: { fontWeight: '800', color: '#2D4159', marginBottom: 8 },
  typeIn: { borderWidth: 1.5, borderColor: '#E6DCC8', borderRadius: 12, padding: 12, fontSize: 15, color: '#2D4159', marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  ghost: { flex: 1, padding: 10, alignItems: 'center', borderRadius: 10, backgroundColor: '#F3EDDD' },
  ghostT: { color: '#7A5B00', fontWeight: '700', fontSize: 12 },
  btn: { backgroundColor: '#2D6CDF', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  btnT: { color: '#fff', fontWeight: '900' },
  empty: { color: '#8A7F6A', textAlign: 'center', marginTop: 30 }
});
