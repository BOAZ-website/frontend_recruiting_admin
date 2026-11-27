/**
 * 전체 지원 현황(EVL-APP) 목록의 필터·검색·정렬·통계 계산. 서버는 목록 전체를 주고 화면이 거른다(REC-ADMIN-13).
 */
import type { AuthSession } from '@/entities/auth/model/types';

import {
  APPLICATION_STATUS_LABELS,
  type ApplicantSummaryDto,
  type ApplicantEvaluationDto,
  type ApplicationStatus,
  type EvaluationDecision,
  MILITARY_STATUS_LABELS,
  type TableLayout,
  TRACK_LABELS,
  type TrackType,
} from './types';

/** 부문 표시·필터 순서(AI(ANALYSIS) → 시각화 → 엔지니어링). */
export const TRACK_ORDER: readonly TrackType[] = ['ANALYSIS', 'VISUALIZATION', 'ENGINEERING'];

/** 부문 필터 선택지(전체 / AI / 시각화 / 엔지니어링). 전체 지원 현황과 합격자 부원 등록이 쓴다. */
export const TRACK_FILTER_OPTIONS: readonly { value: 'ALL' | TrackType; label: string }[] = [
  { value: 'ALL', label: '전체' },
  ...TRACK_ORDER.map((track) => ({ value: track, label: TRACK_LABELS[track] })),
];

export type ApplicantSort = 'SUBMITTED_DESC' | 'SUBMITTED_ASC' | 'NAME';

/** 전체 지원 현황 목록의 조회 조건. */
export interface ApplicantListQuery {
  status: 'ALL' | ApplicationStatus;
  track: 'ALL' | TrackType;
  search: string;
  sort: ApplicantSort;
}

export const DEFAULT_APPLICANT_QUERY: ApplicantListQuery = {
  status: 'ALL',
  track: 'ALL',
  search: '',
  sort: 'SUBMITTED_DESC',
};

export const APPLICANT_SORT_LABELS: Record<ApplicantSort, string> = {
  SUBMITTED_DESC: '제출일 최신순',
  SUBMITTED_ASC: '제출일 오래된순',
  NAME: '이름순',
};

// order 1은 오래된순, -1은 최신순. 제출일이 없는 DRAFT는 순서와 관계없이 뒤에 둔다(REC-ADMIN-13 정렬 규칙).
const compareSubmittedAt = (a: string | null, b: string | null, order: 1 | -1): number => {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -order : order;
};

/** 조건에 맞는 지원자만 남기고 정렬한다. 비어 있는(null) 필드는 검색에서 빠진다. */
export function filterApplicants(
  applicants: readonly ApplicantEvaluationDto[],
  query: ApplicantListQuery,
): ApplicantEvaluationDto[] {
  const keyword = query.search.trim().toLowerCase();
  return applicants
    .filter((applicant) => query.status === 'ALL' || applicant.status === query.status)
    .filter((applicant) => query.track === 'ALL' || applicant.track === query.track)
    .filter(
      (applicant) =>
        !keyword ||
        [applicant.name, applicant.email, applicant.university, applicant.major].some((value) =>
          (value ?? '').toLowerCase().includes(keyword),
        ),
    )
    .sort((a, b) =>
      query.sort === 'NAME'
        ? (a.name ?? '').localeCompare(b.name ?? '', 'ko')
        : compareSubmittedAt(
            a.submitted_at,
            b.submitted_at,
            query.sort === 'SUBMITTED_DESC' ? -1 : 1,
          ),
    );
}

/** 지원 현황(APP-07)과 평가 현황(APP-08) 통계. 평가 현황은 제출 완료 지원서만 센다. */
export interface ApplicantSummary {
  total: number;
  submitted: number;
  draft: number;
  myEvaluated: number;
  finalPass: number;
  finalHold: number;
  finalFail: number;
  finalPending: number;
}

/** 받은 목록으로 통계를 센다. 넘긴 목록 범위(전체 또는 한 부문)의 인원이다. */
export function summarizeApplicants(
  applicants: readonly ApplicantEvaluationDto[],
): ApplicantSummary {
  const submitted = applicants.filter((applicant) => applicant.status === 'SUBMITTED');
  const countFinal = (decision: ApplicantEvaluationDto['final_decision']) =>
    submitted.filter((applicant) => applicant.final_decision === decision).length;
  return {
    total: applicants.length,
    submitted: submitted.length,
    draft: applicants.length - submitted.length,
    myEvaluated: submitted.filter((applicant) => applicant.my_decision !== null).length,
    finalPass: countFinal('PASS'),
    finalHold: countFinal('HOLD'),
    finalFail: countFinal('FAIL'),
    finalPending: countFinal('PENDING'),
  };
}

/** 배포된 백엔드에서 전 부문 지원서를 보는 계정인지. 차기대표진(SUPER)만 전 부문이고, 현재 대표진을 포함한 나머지는 본인 부문만 본다. */
export function isAllTrackViewer(account: Pick<AuthSession, 'role' | 'teamName'>): boolean {
  return account.role === 'SUPER' && account.teamName === '차기대표진';
}

/**
 * 전체 지원 현황에서 전 부문 지원서(임시저장 포함)를 보는 계정인지. 차기대표진과 서비스운영팀장(MASTER)이다.
 * 서비스운영팀 팀원(TEAM)은 일반 운영진처럼 본인 부문의 제출 완료만 본다. 평가 메뉴·최종 평가 권한은 isAllTrackViewer를 따른다.
 */
export function canViewAllApplicants(account: Pick<AuthSession, 'role' | 'teamName'>): boolean {
  return isAllTrackViewer(account) || account.role === 'MASTER';
}

/**
 * 배포된 백엔드에서 이 부문 지원자의 최종 평가를 바꿀 수 있는지.
 * SUPER이면서 대표진·차기대표진인 계정만 바꾸고, 대표진은 본인 부문만, 차기대표진은 전 부문이다.
 */
export function canWriteFinalDecisionOf(
  account: Pick<AuthSession, 'role' | 'teamName' | 'track'>,
  track: TrackType,
): boolean {
  if (account.role !== 'SUPER') return false;
  if (account.teamName === '차기대표진') return true;
  return account.teamName === '대표진' && account.track === track;
}

/** 부문 메뉴와 전체 지원 현황 목록에서 보여 줄 부문. 서버 평가 목록 API와 같은 기준이다. */
export function visibleTracksOf(
  account: Pick<AuthSession, 'role' | 'teamName' | 'track'>,
): TrackType[] {
  if (isAllTrackViewer(account) || account.track === 'ALL') return [...TRACK_ORDER];
  return TRACK_ORDER.filter((track) => track === account.track);
}

/** 비어 있는 값(null·빈 문자열·빈 목록)은 '-'로 보여 준다. DRAFT는 입력하지 않은 개인정보가 null이다. */
export function displayValue(
  value: string | number | boolean | readonly string[] | null | undefined,
): string {
  if (value === null || value === undefined || value === '') return '-';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '-';
  // 지원서 화면의 대학원 진학 여부 선택지(예 / 아니오)와 같다.
  if (typeof value === 'boolean') return value ? '예' : '아니오';
  return String(value);
}

/** 지원서는 하이픈 없이 받는다(01012345678). 읽기 쉽게 010-1234-5678 모양으로 보여 주고, 다른 모양이면 그대로 둔다. */
export function phoneText(phone: string | null): string {
  if (!phone) return '-';
  const digits = phone.replace(/-/g, '');
  if (/^01\d{9}$/.test(digits))
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (/^01\d{8}$/.test(digits))
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return phone;
}

/**
 * 복수/부전공은 지원서에서 칸을 하나씩 늘려 적으므로(최대 3개) 쉼표로 이어 한 줄에 보여 준다.
 * 선택 항목이라 제출한 지원서가 비어 있으면 "없음", 임시저장이라 아직 안 적었으면 다른 항목처럼 "-"다.
 */
/** 문항 metadata에서 표의 줄·칸 목록을 꺼낸다. 모양이 다르면 null(답변만으로 그린다). */
export function tableLayoutOf(metadata: unknown): TableLayout | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const { rows, columns, multiple } = metadata as {
    rows?: unknown;
    columns?: unknown;
    multiple?: unknown;
  };
  const isTextList = (value: unknown): value is string[] =>
    Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string');
  return isTextList(rows) && isTextList(columns)
    ? { rows, columns, multiple: multiple === true }
    : null;
}

export function minorDoubleMajorText(
  applicant: Pick<ApplicantSummaryDto, 'minor_double_major' | 'status'>,
): string {
  // 서버에는 null·빈 문자열이 섞여 저장될 수 있어 글자가 있는 항목만 남긴다.
  const majors = (applicant.minor_double_major ?? []).filter(
    (major): major is string => typeof major === 'string' && major.trim() !== '',
  );
  if (majors.length) return majors.join(', ');
  return applicant.status === 'SUBMITTED' ? '없음' : '-';
}

/**
 * 지원자 인적사항 항목(이름 제외). 전체 지원 현황 상세와 서류 평가 상세가 같은 항목을 같은 순서로 보여 준다.
 * 순서는 API 명세(REC-ADMIN-13 ApplicantSummaryResponse)의 필드 순서이고, 내부 식별자(id·user_id)는 뺀다.
 * 제출일은 전체 지원 현황 목록의 열로만 보여 주고 여기서는 뺀다.
 * 항목 이름과 값 문구는 지원서 화면(frontend personal-info-section.tsx)과 같다.
 */
export function applicantInfoFields(applicant: ApplicantSummaryDto): [string, string][] {
  return [
    ['상태', APPLICATION_STATUS_LABELS[applicant.status]],
    ['부문', applicant.track ? TRACK_LABELS[applicant.track] : '-'],
    ['이메일', displayValue(applicant.email)],
    ['전화번호', phoneText(applicant.phone)],
    ['학교', displayValue(applicant.university)],
    ['전공', displayValue(applicant.major)],
    ['복수/부전공', minorDoubleMajorText(applicant)],
    // 백엔드에 저장된 숫자 그대로 보여 준다(학년·학기로 바꾸지 않는다).
    ['마지막 재학 학기', displayValue(applicant.last_semester)],
    [
      '병역 이수 여부',
      applicant.military_status ? MILITARY_STATUS_LABELS[applicant.military_status] : '-',
    ],
    ['생년월일', displayValue(applicant.birth_date)],
    ['졸업 예정시점', displayValue(applicant.graduation_date)],
    ['대학원 진학 여부', displayValue(applicant.grad_school_plan)],
  ];
}

/**
 * 서류 평가 목록의 개인 평가 필터(MY-02). 화면에서 아직 평가하지 않은 것(null)과 미정(PENDING)으로 저장한 것을
 * 모두 '미정'으로 보여 주므로, 미정은 둘을 함께 거른다. 명세 §2.2의 미평가/저장됨 구분과 다르다.
 */
export type MyEvaluationFilter = 'ALL' | EvaluationDecision;

export const MY_EVALUATION_FILTER_LABELS: Record<MyEvaluationFilter, string> = {
  ALL: '전체',
  PENDING: '미정',
  PASS: '합격',
  HOLD: '보류',
  FAIL: '불합격',
};

/** 내 평가 판정으로 거른다. my_decision이 null이면 미정으로 본다. */
export function filterByMyEvaluation(
  applicants: readonly ApplicantEvaluationDto[],
  filter: MyEvaluationFilter,
): ApplicantEvaluationDto[] {
  if (filter === 'ALL') return [...applicants];
  return applicants.filter((applicant) => (applicant.my_decision ?? 'PENDING') === filter);
}

/** 서류 평가 목록의 정렬. 전체 지원 현황 정렬에 전체 평가의 집계 정렬(GROUP-04)을 더했다. */
export type ReviewSort = ApplicantSort | 'PASS_COUNT_DESC' | 'TOTAL_SCORE_DESC';

export const REVIEW_SORT_LABELS: Record<ReviewSort, string> = {
  ...APPLICANT_SORT_LABELS,
  PASS_COUNT_DESC: '합격 평가 많은순',
  TOTAL_SCORE_DESC: '총점수 높은순',
};

/** 정렬 드롭다운 선택지. 서류 평가와 합격자 부원 등록이 쓴다. */
export const REVIEW_SORT_OPTIONS: readonly { value: ReviewSort; label: string }[] = (
  Object.keys(REVIEW_SORT_LABELS) as ReviewSort[]
).map((sort) => ({ value: sort, label: REVIEW_SORT_LABELS[sort] }));

/** 서류 평가 목록(개인 평가 + 전체 평가)의 조회 조건. 상세에서 목록으로 돌아와도 유지한다. */
export interface ReviewListQuery {
  track: 'ALL' | TrackType;
  search: string;
  sort: ReviewSort;
  myFilter: MyEvaluationFilter;
  finalDecision: 'ALL' | EvaluationDecision;
}

export const DEFAULT_REVIEW_QUERY: ReviewListQuery = {
  track: 'ALL',
  search: '',
  sort: 'SUBMITTED_DESC',
  myFilter: 'ALL',
  finalDecision: 'ALL',
};

/**
 * 제출 완료 지원자만 남겨 거르고 정렬한다. 집계 정렬은 같은 값끼리 제출일 최신순을 유지한다.
 * 이전·다음 이동 순서도 이 결과를 따른다.
 */
export function filterReviewList(
  applicants: readonly ApplicantEvaluationDto[],
  query: ReviewListQuery,
): ApplicantEvaluationDto[] {
  const isCountSort = query.sort === 'PASS_COUNT_DESC' || query.sort === 'TOTAL_SCORE_DESC';
  const rows = filterByMyEvaluation(
    filterApplicants(applicants, {
      status: 'SUBMITTED',
      track: query.track,
      search: query.search,
      sort: isCountSort ? 'SUBMITTED_DESC' : (query.sort as ApplicantSort),
    }),
    query.myFilter,
  ).filter(
    (applicant) =>
      query.finalDecision === 'ALL' || applicant.final_decision === query.finalDecision,
  );
  if (query.sort === 'PASS_COUNT_DESC') {
    return rows.sort((a, b) => b.pass_count - a.pass_count || b.total_score - a.total_score);
  }
  if (query.sort === 'TOTAL_SCORE_DESC') {
    return rows.sort((a, b) => b.total_score - a.total_score || b.pass_count - a.pass_count);
  }
  return rows;
}
