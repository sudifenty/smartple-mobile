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

/* learning_events, as returned by PostgREST: payload inside `details` */
const EVENTS = [
  {
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
  },
  { id: 8, event_type: 'screen_view', user_id: BOLTON.user_id, created_at: '2026-09-13T09:09:45+00:00', details: { screen: 'practice' } }
];

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
  beforeEach(() => { document.body.innerHTML = ''; });

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
    /* the honest gap, stated in the UI rather than left as a silent blank */
    expect(bodyText()).toMatch(/Practice answers are not sent to you yet/);
  });
});
