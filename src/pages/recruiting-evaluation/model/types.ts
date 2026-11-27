/**
 * 서류 평가 화면의 타입과 표시 이름. API 타입은 entities/recruitment/model에 두고 여기서 다시 내보낸다.
 */
import type {
  ApplicationStatus,
  EvaluationDecision,
  MilitaryStatus,
  TrackType,
} from '@/entities/recruitment/model/types';

export type * from '@/entities/recruitment/model/types';

/** 화면 상단 탭. 전체 지원 현황과 부문별 서류 평가. */
export type EvaluationTab = 'applicants' | 'my';

/** 고를 수 있는 판정(개인 평가 버튼, 최종 평가 드롭다운). PENDING(미정)은 처음 값이거나 저장된 기록을 보여 줄 때만 쓴다. */
export const SELECTABLE_DECISIONS: readonly EvaluationDecision[] = ['PASS', 'HOLD', 'FAIL'];

export const DECISION_LABELS: Record<EvaluationDecision, string> = {
  PASS: '합격',
  HOLD: '보류',
  FAIL: '불합격',
  PENDING: '미정',
};

export const TRACK_LABELS: Record<TrackType, string> = {
  ENGINEERING: '엔지니어링',
  ANALYSIS: 'AI',
  VISUALIZATION: '시각화',
};

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  SUBMITTED: '제출 완료',
  DRAFT: '임시저장',
};

export const MILITARY_STATUS_LABELS: Record<MilitaryStatus, string> = {
  // 지원서 화면(frontend)의 선택지 문구와 같다.
  COMPLETED_OR_EXEMPT: '필 또는 면제(여성)',
  NOT_COMPLETED: '미필',
};
