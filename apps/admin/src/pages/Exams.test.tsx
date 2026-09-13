import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/* ------------------------------------------------------------------
   End-to-end for the bit that actually touches the database: pick a real
   revision exercise, save the exam, and inspect the row that would be
   inserted into smartple_exams.questions.

   supabase is mocked, so this asserts the PAYLOAD, not the network. The
   payload is what has to carry is_from_revision_bank.
------------------------------------------------------------------ */

const inserted: { table: string; payload: any }[] = [];

function chain(table: string) {
  const q: any = {
    select: () => q,
    order: () => q,
    limit: () => q,
    eq: () => q,
    delete: () => q,
    insert: (payload: any) => {
      inserted.push({ table, payload });
      return { select: async () => ({ data: [{ id: 4242 }], error: null }) };
    },
    then: (onFulfilled: any, onRejected: any) =>
      Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected)
  };
  return q;
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (t: string) => chain(t),
    storage: { from: () => ({ upload: async () => ({ error: null }) }) }
  }
}));

const Exams = (await import('../pages/Exams')).default;

const FIRST_Q = 'Write in set notation: the set of vowels in the English alphabet.';
const FIRST_A = '{a, e, i, o, u}';

describe('Create exam → Use Revision Exercises → Save', () => {
  beforeEach(() => { inserted.length = 0; document.body.innerHTML = ''; });

  it('saves the chosen exercise with is_from_revision_bank and the notes\' answer', async () => {
    const user = userEvent.setup();
    render(<Exams />);

    await user.type(screen.getByPlaceholderText(/Exam title/), 'P5 Maths · Set Concepts · Test 1');
    await user.click(screen.getByRole('button', { name: 'Use Revision Exercises' }));

    await screen.findByText(/real questions from/, {}, { timeout: 15000 });
    /* the picker follows the exam's subject, which starts on SST */
    await user.selectOptions(screen.getByLabelText('subject'), 'Mathematics');
    await user.selectOptions(screen.getByLabelText('class'), 'P5');
    await user.selectOptions(
      screen.getByLabelText('topic'),
      screen.getByRole('option', { name: /Set Concepts/ }) as HTMLOptionElement
    );

    const row = screen.getByText(FIRST_Q).closest('label')!;
    await user.click(row.querySelector('input[type=checkbox]') as HTMLInputElement);
    await user.click(screen.getByRole('button', { name: /Add 1 to the exam/ }));

    /* it lands in the question list, labelled as to where it came from */
    expect(screen.getByText(/from the notes · P5_MATH_T01-Q1/)).toBeTruthy();
    expect(screen.getByText(/1 questions · 1 marks · 1 from the notes/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Save exam' }));

    await vi.waitFor(() => expect(inserted.length).toBe(1));
    const { table, payload } = inserted[0];
    expect(table).toBe('smartple_exams');
    expect(payload.title).toBe('P5 Maths · Set Concepts · Test 1');
    expect(payload.subject, 'the exam subject follows the notes it came from').toBe('MATH');
    expect(payload.questions.kind).toBe('topic');

    const saved = payload.questions.questions;
    expect(saved, 'the blank starter question must not be saved').toHaveLength(1);
    expect(saved[0]).toMatchObject({
      q: FIRST_Q,
      answer: FIRST_A,
      kind: 'short',
      marks: 1,
      is_from_revision_bank: true,
      qid: 'P5_MATH_T01-Q1',
      topic: 'Set Concepts',
      level: 'P5',
      subject: 'Mathematics'
    });
  });

  it('still saves a hand-written MCQ, and does not claim it came from the notes', async () => {
    const user = userEvent.setup();
    render(<Exams />);

    await user.type(screen.getByPlaceholderText(/Exam title/), 'Hand written');
    await user.type(screen.getByPlaceholderText('The question…'), 'Which is the capital of Uganda?');
    const opts = screen.getAllByPlaceholderText(/^Option [A-D]$/);
    await user.type(opts[0], 'Kampala');
    await user.type(opts[1], 'Gulu');

    await user.click(screen.getByRole('button', { name: 'Save exam' }));
    await vi.waitFor(() => expect(inserted.length).toBe(1));

    const saved = inserted[0].payload.questions.questions;
    expect(saved).toHaveLength(1);
    expect(saved[0].kind).toBe('mcq');
    expect(saved[0].options).toEqual(['Kampala', 'Gulu']);
    expect(saved[0].is_from_revision_bank).toBe(false);
    expect(saved[0].qid).toBeUndefined();
  });
});
