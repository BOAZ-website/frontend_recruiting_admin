import { describe, expect, it } from 'vitest';

import { ApiError } from '@/shared/api/apiError';

import { finalDecisionFailureNoticeOf } from './finalDecision';
import {
  EMPTY_DRAFT,
  lengthLimitMessageOf,
  saveFailureNoticeOf,
  TEXT_LENGTH_LIMIT,
  toSaveInput,
} from './myEvaluationForm';

const draftOf = (memo: string, interview_question = '') => ({
  ...EMPTY_DRAFT,
  decision: 'PASS' as const,
  memo,
  interview_question,
});

describe('R-10 공백만 있는 의견·질문', () => {
  it('전체가 공백·줄바꿈이면 빈 값으로 보낸다', () => {
    expect(toSaveInput(draftOf(' \n \t ', '  '))).toMatchObject({
      memo: '',
      interview_question: '',
    });
  });

  it('실제 문장의 앞뒤 공백·줄바꿈은 그대로 보낸다', () => {
    expect(toSaveInput(draftOf('  첫 줄\n둘째 줄  \n'))?.memo).toBe('  첫 줄\n둘째 줄  \n');
  });
});

describe('R-03·R-15 글자 수 한도', () => {
  it('20,000자까지는 통과한다', () => {
    expect(lengthLimitMessageOf(draftOf('가'.repeat(TEXT_LENGTH_LIMIT)))).toBeNull();
  });

  it('넘으면 항목별 정해진 문구를 돌려준다', () => {
    const over = '가'.repeat(TEXT_LENGTH_LIMIT + 1);
    expect(lengthLimitMessageOf(draftOf(over))).toBe('평가 의견은 20,000자 이내로 입력해 주세요.');
    expect(lengthLimitMessageOf(draftOf('', over))).toBe(
      '면접 추천 질문은 20,000자 이내로 입력해 주세요.',
    );
    expect(lengthLimitMessageOf(draftOf(over, over))).toBe(
      '평가 의견은 20,000자 이내로 입력해 주세요.\n면접 추천 질문은 20,000자 이내로 입력해 주세요.',
    );
  });

  it('이모지는 한 글자로 센다', () => {
    expect(lengthLimitMessageOf(draftOf('😀'.repeat(TEXT_LENGTH_LIMIT)))).toBeNull();
  });

  it('공백만 있는 긴 글은 빈 값으로 보내므로 한도에 걸리지 않는다', () => {
    expect(lengthLimitMessageOf(draftOf(' '.repeat(TEXT_LENGTH_LIMIT + 1)))).toBeNull();
  });
});

describe('C-05 저장 실패 문구', () => {
  it('원인을 모르는 실패는 정해진 문구를 쓴다', () => {
    const serverError = new ApiError(500, 'INTERNAL_SERVER_ERROR', '서버 내부 오류');
    expect(saveFailureNoticeOf(serverError, 'SUBMITTED').message).toBe(
      '평가를 저장하지 못했습니다.',
    );
    expect(finalDecisionFailureNoticeOf(serverError, 'SUBMITTED').message).toBe(
      '평가를 저장하지 못했습니다.',
    );
  });

  it('원인이 분명한 실패는 기존 문구를 유지한다', () => {
    const denied = new ApiError(403, 'ACCESS_DENIED', '');
    expect(saveFailureNoticeOf(denied, 'SUBMITTED').message).toBe(
      '해당 지원서를 평가할 권한이 없습니다.',
    );
    expect(finalDecisionFailureNoticeOf(denied, 'SUBMITTED').message).toBe(
      '최종 판정을 변경할 권한이 없습니다.',
    );
  });
});
