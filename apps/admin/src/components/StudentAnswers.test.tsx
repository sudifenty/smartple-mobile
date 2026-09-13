import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/* ------------------------------------------------------------------
   Fixtures are Bolton's REAL rows, copied from the live database, not
   invented shapes. If the reader drifts from what the phone writes, this
   fails — which matters, because a blank on this page looks exactly like
   a wrong answer.
------------------------------------------------------------------ */

const BOLTON = {
  user_id: '7aa3cc38-915e-4b33-8268-c7fb8dd22ef1',
  display_name: 'Bolton', class: 'P6', role: 'student' as const
};

/* learning_events, as returned by PostgREST: payload inside `details`.
   Mutable so a test can add a practice run to Bolton's history. */
const EXAM_ROW = {
    id: 7, event_type: 'exam_submitted', user_id: BOLTON.user_id,
    created_at: '2026-09-13T09:06:28.345775+00:00',
    details: {
      auto: false, score: 0, title: 'East African Community', exam_id: 3,
      answers: [
        {
          q: 'what is East African Community', ok: null, kind: 'short',
          given: 'East African comunity is a regional organization formed by East African countries to work for the benefit of their people',
          marks: 2, answer: ''
        },
        { q: 'countries that formed East African Community', ok: null, kind: 'short', given: '', marks: 2, answer: '' }
      ]
    }
  };
const SCREEN_ROW =
  { id: 8, event_type: 'screen_view', user_id: BOLTON.user_id, created_at: '2026-09-13T09:09:45+00:00', details: { screen: 'practice' } };

/* exactly what the phone now posts when a practice run is finished: prose
   answers carry the learner's own verdict, because the app cannot mark them */
const PRACTICE_ROW = {
  id: 9, event_type: 'practice_submitted', user_id: BOLTON.user_id,
  created_at: '2026-09-13T11:20:00+00:00',
  details: {
    cls: 'P6', subj: 'SST', tid: 'P6_SST_T01', topic: 'East Africa',
    set: 'Basic Practice', mode: '', got: 3, max: 4, pct: 75,
    answers: [
      {
        qid: 'P6_SST_T01_Q01', q: 'Name two countries that border Uganda.',
        given: 'Kenya and Rwanda',
        answer: 'Any two of: Kenya, Tanzania, Rwanda, South Sudan, DR Congo.',
        kind: 'list', marks: 2, max: 2, ok: true, self: null, state: 'right'
      },
      {
        qid: 'P6_SST_T01_Q02', q: 'Explain why the river Nile is important to Uganda.',
        given: 'It gives water for drinking and fish for food',
        answer: 'It supplies water for homes, farms and industry, gives fish, and is used to generate electricity at Jinja.',
        kind: 'self', marks: 1, max: 2, ok: null, self: 'part', state: 'part'
      }
    ]
  }
};

let EVENTS: any[] = [EXAM_ROW, SCREEN_ROW];

const ASSIGNMENTS = [
  { id: 19, exam_id: 4, user_id: BOLTON.user_id, status: 'locked', score: null },
  { id: 18, exam_id: 3, user_id: BOLTON.user_id, status: 'completed', score: 0 }
];
const EXAMS = [{ id: 3, title: 'East African Community' }, { id: 4, title: 'Morning paper' }];

function chain(rows: any) {
  const q: any = {
    select: () => q, order: () => q, limit: () => q, eq: () => q,
    then: (onF: any, onR: any) => Promise.resolve({ data: rows, error: null }).then(onF, onR)
  };
  return q;
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (t: string) =>
      chain(t === 'learning_events' ? EVENTS : t === 'smartple_exam_assignments' ? ASSIGNMENTS : EXAMS)
  }
}));

const StudentAnswers = (await import('../components/StudentAnswers')).default;
const bodyText = () => (document.body.textContent || '').replace(/\s+/g, ' ');

describe('StudentAnswers', () => {
  beforeEach(() => { document.body.innerHTML = ''; EVENTS = [EXAM_ROW, SCREEN_ROW]; });

  it('shows exactly what Bolton wrote, word for word', async () => {
    render(<StudentAnswers student={BOLTON} />);
    await screen.findByText(/Everything Bolton has answered/);

    /* his real wording, including the spelling he used */
    expect(bodyText()).toContain(
      'East African comunity is a regional organization formed by East African countries to work for the benefit of their people');
    expect(screen.getByText('what is East African Community')).toBeTruthy();
    expect(screen.getByText('countries that formed East African Community')).toBeTruthy();
  });

  it('marks written answers as needing the teacher, and shows a blank as blank', async () => {
    render(<StudentAnswers student={BOLTON} />);
    await screen.findByText(/Everything Bolton has answered/);

    const needs = screen.getAllByText('needs your marking');
    expect(needs, 'both of his answers were written, so neither marked itself').toHaveLength(2);
    expect(screen.getByText('left blank')).toBeTruthy();
    expect(screen.getAllByText(/no model answer was saved with this question/),
      'neither question was saved with a model answer').toHaveLength(2);
    expect(bodyText()).toMatch(/2 answers recorded/);
    expect(bodyText()).toMatch(/2 waiting for you/);
    /* nothing has been marked yet, so both marked counters are honestly zero */
    expect(bodyText()).toMatch(/0 correct/);
    expect(bodyText()).toMatch(/0 not correct/);
  });

  it('names the paper and says the score covered only the auto-marked part', async () => {
    render(<StudentAnswers student={BOLTON} />);
    await screen.findByText(/Everything Bolton has answered/);
    expect(screen.getByText('East African Community', { selector: 'b' })).toBeTruthy();
    expect(screen.getByText('0%')).toBeTruthy();
    expect(bodyText()).toMatch(/written answers still need you/);
  });

  it('lists the exam he was given but never opened', async () => {
    render(<StudentAnswers student={BOLTON} />);
    await screen.findByText(/Everything Bolton has answered/);
    expect(screen.getByText('Given but not attempted')).toBeTruthy();
    expect(screen.getByText('Morning paper')).toBeTruthy();
    expect(screen.getByText('locked — not opened')).toBeTruthy();
  });

  it('a screen_view is not an answer and must not appear as one', async () => {
    render(<StudentAnswers student={BOLTON} />);
    await screen.findByText(/Everything Bolton has answered/);
    expect(bodyText(), 'only the two real answers count').toMatch(/2 answers recorded/);
    /* one attempt badge, and it is the exam — the screen_view made no attempt card.
       ('practice' also appears on the filter button, so match the badge text.) */
    expect(screen.getAllByText('exam')).toHaveLength(1);
    expect(screen.queryAllByText('practice').length, 'only the filter button, no practice attempt').toBe(1);
  });

  it('filters to practice, where there is nothing, and says why', async () => {
    const user = userEvent.setup();
    render(<StudentAnswers student={BOLTON} />);
    await screen.findByText(/Everything Bolton has answered/);

    await user.click(screen.getByRole('button', { name: 'practice' }));
    expect(screen.getByText('Nothing recorded yet.')).toBeTruthy();
    /* the honest gap: practice before this update stayed on the phone */
    expect(bodyText()).toMatch(/only\s+from runs finished after this update/);
  });
});


describe('StudentAnswers · practice runs', () => {
  beforeEach(() => { document.body.innerHTML = ''; EVENTS = [PRACTICE_ROW]; });

  it('shows what the learner wrote in a practice run', async () => {
    render(<StudentAnswers student={BOLTON} />);
    await screen.findByText(/Everything Bolton has answered/);

    expect(screen.getByText('Name two countries that border Uganda.')).toBeTruthy();
    expect(bodyText()).toContain('Kenya and Rwanda');
    expect(screen.getByText('East Africa · Basic Practice', { selector: 'b' })).toBeTruthy();
    expect(screen.getByText('75%')).toBeTruthy();
    expect(bodyText()).toMatch(/2 answers recorded/);
  });

  it('shows the model answer next to a prose answer they marked themselves', async () => {
    render(<StudentAnswers student={BOLTON} />);
    await screen.findByText(/Everything Bolton has answered/);

    expect(bodyText()).toContain('It gives water for drinking and fish for food');
    expect(bodyText()).toContain('It supplies water for homes, farms and industry');
    /* the learner's own verdict, with what they awarded themselves */
    expect(screen.getByText(/they marked this themselves: partly correct · gave themselves 1\/2/)).toBeTruthy();
    expect(bodyText()).toMatch(/marked on the phone — prose answers were marked by the learner/);
  });

  it('counts a self-marked prose answer as waiting for the teacher', async () => {
    render(<StudentAnswers student={BOLTON} />);
    await screen.findByText(/Everything Bolton has answered/);
    expect(bodyText()).toMatch(/1 correct/);
    expect(bodyText(), 'the prose answer was only self-marked').toMatch(/1 waiting for you/);
  });

  it('appears under the practice filter and not under exams', async () => {
    const user = userEvent.setup();
    render(<StudentAnswers student={BOLTON} />);
    await screen.findByText(/Everything Bolton has answered/);

    await user.click(screen.getByRole('button', { name: 'exams' }));
    expect(screen.getByText('Nothing recorded yet.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'practice' }));
    expect(screen.getByText('Name two countries that border Uganda.')).toBeTruthy();
  });
});
