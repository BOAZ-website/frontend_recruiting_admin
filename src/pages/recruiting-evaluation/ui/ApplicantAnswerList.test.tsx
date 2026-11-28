// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { type Rendered, render } from '@/test/dom';

import type { ApplicantAnswerDto } from '../model/types';
import { ApplicantAnswerList } from './ApplicantAnswerList';

const answerOf = (patch: Partial<ApplicantAnswerDto>): ApplicantAnswerDto => ({
  question_id: 1,
  label: null,
  category: 'COMMON',
  type: 'TEXT',
  content: '지원 동기',
  order_num: 1,
  answer: '관심이 있습니다.',
  ...patch,
});

let screen: Rendered;
afterEach(() => screen?.unmount());

describe('V-13 빈 답변 표시', () => {
  it('빈 문항은 제목을 남기고 옆에 미작성만 두며 답변 자리를 그리지 않는다', async () => {
    screen = await render(
      <ApplicantAnswerList
        answers={[
          answerOf({ question_id: 1 }),
          answerOf({ question_id: 2, content: '협업 경험', answer: '' }),
          answerOf({ question_id: 3, content: '경험 표', type: 'TABLE', answer: null }),
        ]}
      />,
    );
    const sections = [...screen.container.querySelectorAll('section')];
    expect(sections.map((section) => section.querySelector('h2')?.textContent)).toEqual([
      '지원 동기',
      '협업 경험미작성',
      '경험 표미작성',
    ]);
    expect(sections[1].querySelector('.review-answer, table')).toBeNull();
    expect(sections[2].querySelector('.review-answer, table')).toBeNull();
    expect(screen.container.textContent).not.toContain('-');
  });

  it('답변 목록 자체가 없으면 기존 안내를 한 번만 보인다', async () => {
    screen = await render(<ApplicantAnswerList answers={[]} />);
    expect(screen.container.textContent).toBe('제출된 답변이 없습니다.');
  });
});
