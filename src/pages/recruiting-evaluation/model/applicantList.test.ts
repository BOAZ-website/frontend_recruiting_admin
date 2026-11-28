import { describe, expect, it } from 'vitest';

import { summaryOf } from '@/test/fakeRecruitmentApi';

import { mergeApplicants } from './useEvaluationData';
import {
  type ApplicantSort,
  DEFAULT_APPLICANT_QUERY,
  filterApplicants,
  isAnswerEmpty,
} from './applicantList';

const applicants = mergeApplicants(
  [
    summaryOf(1, { name: '다라', submitted_at: '2026-11-01T10:00:00' }),
    summaryOf(2, { name: '가나(임시)', status: 'DRAFT', submitted_at: null }),
    summaryOf(3, { name: '나다', submitted_at: '2026-11-03T10:00:00' }),
    summaryOf(4, { name: '가가', submitted_at: '2026-11-02T10:00:00' }),
  ],
  [],
);
const namesBy = (sort: ApplicantSort) =>
  filterApplicants(applicants, { ...DEFAULT_APPLICANT_QUERY, sort }).map((item) => item.name);

describe('C-06 임시저장은 정렬과 상관없이 마지막 그룹', () => {
  it('이름순에서도 임시저장을 맨 뒤에 두고, 제출 완료끼리는 이름순을 지킨다', () => {
    expect(namesBy('NAME')).toEqual(['가가', '나다', '다라', '가나(임시)']);
  });

  it('제출일 정렬은 기존 순서를 그대로 둔다', () => {
    expect(namesBy('SUBMITTED_DESC')).toEqual(['나다', '가가', '다라', '가나(임시)']);
    expect(namesBy('SUBMITTED_ASC')).toEqual(['다라', '가가', '나다', '가나(임시)']);
  });
});

describe('V-13 빈 답변', () => {
  it('없거나 공백뿐인 글은 비었다', () => {
    expect(isAnswerEmpty(null)).toBe(true);
    expect(isAnswerEmpty(' \n ')).toBe(true);
    expect(isAnswerEmpty('답')).toBe(false);
  });

  it('표는 모든 줄이 비어야 비었다', () => {
    expect(isAnswerEmpty({ Python: null, SQL: [], Linux: ' ' })).toBe(true);
    expect(isAnswerEmpty({ Python: null, SQL: ['학습'] })).toBe(false);
  });
});
