import { describe, expect, it } from 'vitest';

import { summaryOf } from '@/test/fakeRecruitmentApi';

import { assertApplicantResponses, InvalidResponseError } from './applicantResponse';

const evaluation = {
  id: 1,
  pass_count: 1,
  hold_count: 0,
  fail_count: 0,
  total_score: 5,
  final_decision: 'PENDING',
  my_decision: null,
};

describe('지원자 목록 응답 검증', () => {
  it('아는 값이면 통과한다(임시저장의 빈 부문 포함)', () => {
    expect(() =>
      assertApplicantResponses(
        [summaryOf(1), summaryOf(2, { status: 'DRAFT', track: null as never })],
        [evaluation],
      ),
    ).not.toThrow();
  });

  it('모르는 상태·부문·판정이나 배열이 아닌 응답은 InvalidResponseError', () => {
    const cases: [unknown, unknown][] = [
      [[{ ...summaryOf(1), status: 'WITHDRAWN' }], [evaluation]],
      [[{ ...summaryOf(1), track: 'MARKETING' }], [evaluation]],
      [[summaryOf(1)], [{ ...evaluation, final_decision: 'MAYBE' }]],
      [[summaryOf(1)], [{ ...evaluation, my_decision: 'MAYBE' }]],
      [[summaryOf(1)], [{ ...evaluation, total_score: '5' }]],
      [{ items: [] }, []],
    ];
    for (const [summaries, evaluations] of cases) {
      expect(() => assertApplicantResponses(summaries, evaluations)).toThrow(InvalidResponseError);
    }
  });
});
