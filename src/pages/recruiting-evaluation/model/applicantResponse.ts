/**
 * 지원자 목록 응답(REC-ADMIN-13·14) 검사. 모르는 상태·부문·판정 값이 오면 라벨이 비거나 집계에서 빠지므로,
 * 그리지 않고 '지원자 정보를 불러오지 못했습니다.'로 알린다. 다시 읽어도 같은 응답이라 저절로 다시 읽지 않는다.
 */
import type { EvaluationDecision } from './types';

export const INVALID_APPLICANTS_MESSAGE = '지원자 정보를 불러오지 못했습니다.';

/** 응답 모양이 이 화면이 아는 것과 다를 때 던진다. */
export class InvalidResponseError extends Error {
  constructor() {
    super(INVALID_APPLICANTS_MESSAGE);
    this.name = 'InvalidResponseError';
  }
}

const STATUSES: readonly unknown[] = ['DRAFT', 'SUBMITTED'];
const TRACKS: readonly unknown[] = ['ANALYSIS', 'VISUALIZATION', 'ENGINEERING'];
const DECISIONS: readonly unknown[] = [
  'PASS',
  'HOLD',
  'FAIL',
  'PENDING',
] satisfies EvaluationDecision[];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const isNullableString = (value: unknown) => value === null || typeof value === 'string';

function isSummary(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'number' &&
    STATUSES.includes(value.status) &&
    // 부문은 임시저장에서 비어 있을 수 있다.
    (value.track === null || TRACKS.includes(value.track)) &&
    isNullableString(value.name)
  );
}

function isEvaluation(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'number' &&
    ['pass_count', 'hold_count', 'fail_count', 'total_score'].every(
      (field) => typeof value[field] === 'number',
    ) &&
    DECISIONS.includes(value.final_decision) &&
    (value.my_decision === null || DECISIONS.includes(value.my_decision))
  );
}

/** 지원서 요약과 평가 집계 응답을 검사한다. 맞지 않으면 InvalidResponseError를 던진다. */
export function assertApplicantResponses(summaries: unknown, evaluations: unknown): void {
  const isValid =
    Array.isArray(summaries) &&
    summaries.every(isSummary) &&
    Array.isArray(evaluations) &&
    evaluations.every(isEvaluation);
  if (!isValid) throw new InvalidResponseError();
}
