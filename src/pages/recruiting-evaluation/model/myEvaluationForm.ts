/**
 * 개인 평가 입력 폼의 규칙(EVL-MY, MY-06~08). 검증·변경 여부·저장 실패 안내를 계산하고, 그리기는 하지 않는다.
 * 문구는 FE 기능명세 v1.1 §4.4~4.6, §8.2~8.3을 따른다.
 */
import { ApiError } from '@/shared/api/apiError';

import type {
  ApplicantEvaluationDto,
  ApplicationStatus,
  EvaluationDecision,
  MyEvaluationDto,
  MyEvaluationInput,
} from './types';

/** 점수 선택지. FE·BE 명세의 score 범위(1~10 정수)를 1점 단위로 둔다. */
export const SCORE_OPTIONS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** 점수 드롭다운 선택지. 맨 앞 '선택'(빈 값)은 점수 없음이다. 점수는 비워도 저장된다(백엔드 score는 null 허용). */
export const SCORE_SELECT_OPTIONS: readonly { value: string; label: string }[] = [
  { value: '', label: '선택' },
  ...SCORE_OPTIONS.map((score) => ({ value: String(score), label: `${score}점` })),
];

/** 드롭다운 값('' 또는 '1'~'10')을 점수로 바꾼다. 빈 값이면 점수 없음(null). */
export const scoreFromSelect = (value: string): number | null =>
  value === '' ? null : Number(value);

/** 입력 중인 내 평가. 판정을 아직 고르지 않았으면 decision이 null이다. */
export interface MyEvaluationDraft {
  decision: EvaluationDecision | null;
  score: number | null;
  memo: string;
  interview_question: string;
}

export const EMPTY_DRAFT: MyEvaluationDraft = {
  decision: null,
  score: null,
  memo: '',
  interview_question: '',
};

/**
 * 저장된 내 평가로 폼을 채운다. 평가가 없으면(null) 빈 폼이고, 점수가 없으면 '선택'(null)으로 둔다.
 * 예전에 판정을 해제해 미정(PENDING)으로 저장된 평가는 판정을 고르지 않은 것으로 두어, 셋 중 하나를 골라야 저장되게 한다.
 */
export function draftFromMyEvaluation(mine: MyEvaluationDto | null): MyEvaluationDraft {
  if (!mine) return EMPTY_DRAFT;
  return {
    decision: mine.decision === 'PENDING' ? null : mine.decision,
    score: mine.score,
    memo: mine.memo ?? '',
    interview_question: mine.interview_question ?? '',
  };
}

/** 저장 요청으로 보낸 값을 폼 값으로 되돌린다. 저장에 성공하면 이것이 새 저장 기준이다. */
export const draftFromSaveInput = (input: MyEvaluationInput): MyEvaluationDraft => ({
  decision: input.decision,
  score: input.score,
  memo: input.memo,
  interview_question: input.interview_question,
});

/** 저장된 값과 다른지. 다르면 다른 지원자·메뉴로 옮기기 전에 확인한다(§4.5). */
export const isDraftChanged = (draft: MyEvaluationDraft, saved: MyEvaluationDraft): boolean =>
  draft.decision !== saved.decision ||
  draft.score !== saved.score ||
  draft.memo !== saved.memo ||
  draft.interview_question !== saved.interview_question;

/** 필드별 오류 문구. 오류가 없는 필드는 빠진다. */
export interface MyEvaluationErrors {
  decision?: string;
  score?: string;
}

/** 저장 전 검증(§4.4, §7.4). 판정은 필수, 점수는 비워도 되지만 있으면 1~10 정수여야 한다. */
export function validateMyEvaluation(draft: MyEvaluationDraft): MyEvaluationErrors {
  const errors: MyEvaluationErrors = {};
  if (draft.decision === null) errors.decision = '평가 판정을 선택해주세요.';
  if (
    draft.score !== null &&
    !(Number.isInteger(draft.score) && draft.score >= 1 && draft.score <= 10)
  ) {
    errors.score = '점수는 1~10 사이의 정수로 입력해주세요.';
  }
  return errors;
}

const COUNT_FIELD_OF: Partial<
  Record<EvaluationDecision, 'pass_count' | 'hold_count' | 'fail_count'>
> = { PASS: 'pass_count', HOLD: 'hold_count', FAIL: 'fail_count' };

/**
 * 내 평가를 저장한 뒤의 지원자 집계. 전체 목록을 다시 받지 않고 내 이전 값을 빼고 새 값을 더한다.
 * 서버 집계(REC-ADMIN-14)와 같은 규칙이다: 판정 수에는 미정을 세지 않고, 총점은 비어 있지 않은 점수의 합이다.
 * previous는 저장 전 서버에 있던 내 평가(없었으면 null).
 */
export function applyMyEvaluation(
  applicant: ApplicantEvaluationDto,
  previous: { decision: EvaluationDecision | null; score: number | null } | null,
  input: MyEvaluationInput,
): ApplicantEvaluationDto {
  const next = { ...applicant, my_decision: input.decision };
  const before = previous?.decision ? COUNT_FIELD_OF[previous.decision] : undefined;
  const after = COUNT_FIELD_OF[input.decision];
  if (before) next[before] -= 1;
  if (after) next[after] += 1;
  next.total_score += (input.score ?? 0) - (previous?.score ?? 0);
  return next;
}

/** 전체가 공백·줄바꿈뿐인 글은 빈 값으로 보낸다. 실제 문장의 앞뒤 공백·줄바꿈은 그대로 둔다(R-10). */
const blankToEmpty = (text: string): string => (text.trim() === '' ? '' : text);

/** 검증을 통과한 초안을 저장 요청으로 바꾼다. 네 필드를 모두 보낸다(§4.4). 판정이 없으면 null. */
export function toSaveInput(draft: MyEvaluationDraft): MyEvaluationInput | null {
  if (draft.decision === null) return null;
  return {
    decision: draft.decision,
    score: draft.score,
    memo: blankToEmpty(draft.memo),
    interview_question: blankToEmpty(draft.interview_question),
  };
}

/** 평가 의견·면접 추천 질문에 각각 허용하는 글자 수(R-03, R-15). 입력은 막지 않고 저장할 때만 검사한다. */
export const TEXT_LENGTH_LIMIT = 20_000;

/** 글자 수. 이모지처럼 두 칸을 쓰는 글자도 한 글자로 센다. */
const lengthOf = (text: string): number => Array.from(blankToEmpty(text)).length;

/**
 * 저장하려는 초안의 글자 수가 한도를 넘었을 때 브라우저 알림 창에 띄울 문구. 넘지 않으면 null.
 * 둘 다 넘으면 두 문구를 줄을 바꿔 함께 보인다. 입력한 글은 자르거나 지우지 않는다.
 */
export function lengthLimitMessageOf(draft: MyEvaluationDraft): string | null {
  const messages = [
    lengthOf(draft.memo) > TEXT_LENGTH_LIMIT && '평가 의견은 20,000자 이내로 입력해 주세요.',
    lengthOf(draft.interview_question) > TEXT_LENGTH_LIMIT &&
      '면접 추천 질문은 20,000자 이내로 입력해 주세요.',
  ].filter((message): message is string => Boolean(message));
  return messages.length ? messages.join('\n') : null;
}

/**
 * 저장 실패를 사용자에게 어떻게 알릴지(§4.6, §8.2~8.3). 오류 코드로 고르고 서버 문구는 분기에 쓰지 않는다.
 * leave가 true면 안내 뒤 평가 화면을 닫고 목록으로 돌아간다. 입력한 값은 어느 경우에도 지우지 않는다.
 */
export interface SaveFailureNotice {
  message: string;
  leave: boolean;
}

export function saveFailureNoticeOf(
  error: unknown,
  applicantStatus: ApplicationStatus,
): SaveFailureNotice {
  const code = error instanceof ApiError ? error.code : null;
  if (code === 'ACCESS_DENIED') {
    return { message: '해당 지원서를 평가할 권한이 없습니다.', leave: false };
  }
  if (code === 'APPLICATION_NOT_FOUND') {
    return { message: '지원서를 찾을 수 없습니다.', leave: true };
  }
  if (code === 'INVALID_INPUT_VALUE') {
    // 서버가 DRAFT 여부를 따로 알려 주지 않으므로 화면이 아는 지원서 상태로 문구를 고른다(§8.2 주의).
    return applicantStatus === 'DRAFT'
      ? { message: '제출 완료된 지원서만 평가할 수 있습니다.', leave: true }
      : { message: '입력값이 올바르지 않습니다.', leave: false };
  }
  return { message: SAVE_FAILED_MESSAGE, leave: false };
}

/** 원인을 알 수 없는 서버 저장 실패의 토스트 문구(C-05). 개인 평가와 최종 평가가 함께 쓴다. */
export const SAVE_FAILED_MESSAGE = '평가를 저장하지 못했습니다.';

/** 저장하지 않은 평가가 있을 때 다른 지원자·메뉴로 옮기기 전 확인 문구. 확인이면 저장하고 옮기고, 취소면 저장하지 않고 옮긴다. */
export const UNSAVED_EVALUATION_MESSAGE =
  '저장하지 않은 평가 내용이 있습니다. 저장하고 이동할까요?\n(취소를 누르면 저장하지 않고 이동합니다.)';

/** 판정을 고르지 않아 저장할 수 없는 입력이 있을 때의 확인 문구. 확인이면 입력을 버리고 옮기고, 취소면 머문다. */
export const DISCARD_UNDECIDED_EVALUATION_MESSAGE = '입력한 내용을 저장하지 않고 나가시겠습니까?';
