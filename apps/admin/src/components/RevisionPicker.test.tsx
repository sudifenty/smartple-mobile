import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RevisionPicker from './RevisionPicker';

/* Drives the real component against the real revisionBank.json. If the parser
   ever emits a different shape, or the picker stops pairing a question with its
   own answer, this fails — which is the whole point of the bank. */

const FIRST_Q = 'Write in set notation: the set of vowels in the English alphabet.';
const FIRST_A = '{a, e, i, o, u}';

async function openTopic(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText(/real questions from/, {}, { timeout: 15000 });   // bank finished loading
  await user.selectOptions(screen.getByLabelText('class'), 'P5');
  const topicSel = screen.getByLabelText('topic');
  await user.selectOptions(topicSel, screen.getByRole('option', { name: /Set Concepts/ }) as HTMLOptionElement);
  await screen.findByText(FIRST_Q, {}, { timeout: 5000 });
}

const rowOf = (text: string) => {
  const label = screen.getByText(text).closest('label');
  if (!label) throw new Error(`no row for "${text}"`);
  return {
    label,
    tick: label.querySelector('input[type=checkbox]') as HTMLInputElement,
    marks: label.querySelector('input[type=number]') as HTMLInputElement
  };
};

describe('RevisionPicker', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('loads the bank and lists the notes\' own questions with their answers', async () => {
    const user = userEvent.setup();
    render(<RevisionPicker onAdd={vi.fn()} onClose={vi.fn()} preferSubject="MATH" />);
    expect(screen.getByText(/loading the revision bank…/)).toBeTruthy();

    await openTopic(user);
    expect(screen.getByText(/Lifted|One revision set sits at the end/)).toBeTruthy();
    expect(screen.getByText(`answer: ${FIRST_A}`)).toBeTruthy();
  });

  it('hands back drafts that carry the teacher\'s answer and full provenance', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<RevisionPicker onAdd={onAdd} onClose={vi.fn()} preferSubject="MATH" />);
    await openTopic(user);

    await user.click(rowOf(FIRST_Q).tick);
    await user.click(rowOf('Given M = {3, 6, 9, 12}, find n(M).').tick);
    await user.click(screen.getByRole('button', { name: /Add 2 to the exam/ }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const [drafts, meta] = onAdd.mock.calls[0];
    expect(drafts).toHaveLength(2);

    expect(drafts[0]).toMatchObject({
      q: FIRST_Q,
      answer: FIRST_A,                 // the notes' answer, not an invented one
      kind: 'short',
      options: [],
      is_from_revision_bank: true,
      qid: 'P5_MATH_T01-Q1',
      topic: 'Set Concepts',
      level: 'P5',
      subject: 'Mathematics'
    });
    expect(drafts[1].qid).toBe('P5_MATH_T01-Q2');
    expect(meta).toMatchObject({ subject_code: 'MATH', topic: 'Set Concepts', level: 'P5' });
  });

  it('lets you change the marks before adding, and sends the new number', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<RevisionPicker onAdd={onAdd} onClose={vi.fn()} preferSubject="MATH" />);
    await openTopic(user);

    const row = rowOf(FIRST_Q);
    expect(row.marks.value, 'the bank suggests 1 mark for a one-line question').toBe('1');
    await user.clear(row.marks);
    await user.type(row.marks, '5');
    await user.click(row.tick);

    expect(screen.getByText('1 selected · 5 marks')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Add 1 to the exam/ }));
    expect(onAdd.mock.calls[0][0][0].marks).toBe(5);
  });

  it('filters the list, and cannot add nothing', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<RevisionPicker onAdd={onAdd} onClose={vi.fn()} preferSubject="MATH" />);
    await openTopic(user);

    const rows = () => Array.from(document.querySelectorAll('[data-qid]'));
    const addBtn = screen.getByRole('button', { name: /to the exam/ }) as HTMLButtonElement;
    expect(addBtn.disabled, 'nothing is selected yet').toBe(true);

    const all = rows().length;
    expect(all).toBeGreaterThan(5);

    /* "equal" appears in 2 of this topic's 15 questions — a partial match, which
       is the case that matters. ("venn" is a subtopic heading, not a question.) */
    const box = screen.getByPlaceholderText('filter these questions…');
    await user.type(box, 'equal');
    await vi.waitFor(() => expect(rows().length).toBe(2));
    expect(rows().length).toBeLessThan(all);
    rows().forEach(r => expect((r.textContent || '').toLowerCase()).toContain('equal'));

    await user.clear(box);
    await user.type(box, 'zzzzqqq');
    await screen.findByText('No question matches that filter.');
    expect(rows()).toHaveLength(0);
    expect(onAdd).not.toHaveBeenCalled();
  });
});
