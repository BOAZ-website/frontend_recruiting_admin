/**
 * 서류 평가 API의 요청·응답 타입. 필드 이름은 배포된 백엔드(main) 응답(REC-ADMIN-13~20)의 snake_case를 따른다.
 * 여러 계층(entities·pages)이 함께 쓰므로 여기에 둔다.
 */

export type ApplicationStatus = 'DRAFT' | 'SUBMITTED';
export type EvaluationDecision = 'PASS' | 'HOLD' | 'FAIL' | 'PENDING';
export type TrackType = 'ANALYSIS' | 'ENGINEERING' | 'VISUALIZATION';
/** 백엔드 MilitaryStatus. DRAFT 지원서는 null일 수 있다. */
export type MilitaryStatus = 'COMPLETED_OR_EXEMPT' | 'NOT_COMPLETED';

/** 지원자 요약(REC-ADMIN-13 ApplicantSummaryResponse). */
export interface ApplicantSummaryDto {
  id: number;
  user_id: number;
  status: ApplicationStatus;
  track: TrackType;
  name: string;
  email: string;
  phone: string;
  university: string;
  major: string | null;
  /** 서버가 저장한 값 그대로라 null이거나 null·빈 문자열이 섞일 수 있다. */
  minor_double_major: (string | null)[] | null;
  last_semester: number | null;
  military_status: MilitaryStatus | null;
  birth_date: string | null;
  graduation_date: string | null;
  grad_school_plan: boolean | null;
  submitted_at: string | null;
}

/** 평가 집계 필드(REC-ADMIN-14 ApplicantEvaluationResponse 중 지원서 요약에 없는 것). */
interface EvaluationAggregate {
  pass_count: number;
  hold_count: number;
  fail_count: number;
  total_score: number;
  final_decision: EvaluationDecision;
  my_decision: EvaluationDecision | null;
}

/** REC-ADMIN-14 응답 한 줄. 제출 완료 지원서만 오고 status는 없다. */
export type ApplicantEvaluationResponse = Omit<ApplicantSummaryDto, 'status'> & EvaluationAggregate;

/**
 * 화면이 쓰는 지원자 한 줄. 지원서 요약(REC-ADMIN-13, DRAFT 포함)에 평가 집계(REC-ADMIN-14)를 붙인 것이다.
 * 집계가 없는 지원서(DRAFT)는 개수 0, 최종 평가 PENDING, 내 판정 null이다.
 */
export interface ApplicantEvaluationDto extends ApplicantSummaryDto, EvaluationAggregate {}

/** 평가자별 평가 한 줄(REC-ADMIN-15 evaluations[]). */
export interface EvaluatorDetailItem {
  admin_id: number;
  name: string;
  track: TrackType | 'COMMON';
  decision: EvaluationDecision | null;
  score: number | null;
  memo: string | null;
}

/** 평가자별 면접 질문 한 줄(REC-ADMIN-19 interview_questions[]). */
export interface InterviewQuestionItem {
  admin_id: number;
  name: string;
  track: TrackType | 'COMMON';
  interview_question: string | null;
}

/** 지원서 문항 카테고리(백엔드 ApplicationQuestion.Category). */
export type QuestionCategory = 'COMMON' | 'ANALYSIS' | 'VISUALIZATION' | 'ENGINEERING';

/**
 * 지원서 답변 한 줄(REC-ADMIN-20 answers[]). TEXT는 문자열, TABLE은 항목별 문자열 객체다.
 * 저장된 TABLE 답을 서버가 읽지 못하면 answer가 null이다.
 */
export interface ApplicantAnswerDto {
  question_id: number;
  /** 파일 내보내기용 열 이름. 없을 수 있다. */
  label: string | null;
  category: QuestionCategory;
  type: 'TEXT' | 'TABLE';
  /** 질문 내용. 서버가 {Track}을 지원서 부문 이름으로 바꿔 준다. */
  content: string;
  order_num: number;
  /** TEXT는 글, TABLE은 줄 이름별 답. 여러 개 고르는 표 문항이면 칸 값이 고른 항목 목록이다. */
  answer: string | Record<string, string | string[] | null> | null;
  /** 표 문항의 줄·칸 목록. 답변 API에는 없어 화면이 문항 조회(QuestionDto)로 채운다. 못 채우면 없다. */
  table_layout?: TableLayout | null;
}

/** 표 문항에서 지원자가 본 줄(rows)과 고를 칸(columns). */
export interface TableLayout {
  rows: string[];
  columns: string[];
  /** 줄마다 여러 칸을 고를 수 있는 문항(체크박스)인지. 아니면 줄마다 하나(라디오 버튼)다. */
  multiple: boolean;
}

/** 관리자 문항 조회(GET /api/v1/admin/recruitment/{id}/questions) 항목 중 화면이 쓰는 필드. */
export interface QuestionDto {
  question_id: number;
  type: 'TEXT' | 'TABLE';
  /** 표 문항이면 { rows, columns, multiple? }. 서버가 저장한 JSON 그대로다. */
  metadata: unknown;
}

/** REC-ADMIN-20 응답의 data. 답변은 order_num 오름차순이고, 답하지 않은 문항은 없다. */
export interface ApplicantAnswersResponse {
  applicant_id: number;
  answers: ApplicantAnswerDto[];
}

/** 백엔드 성공 응답 형식({ status, data }). */
export interface ApiResponse<T> {
  status: number;
  data: T;
}

/** 개인 평가 저장 요청(REC-ADMIN-17 body). */
export interface MyEvaluationInput {
  decision: EvaluationDecision;
  /** 1~10 정수. 비워 두면 null. */
  score: number | null;
  memo: string;
  interview_question: string;
}

/** 내 평가(REC-ADMIN-16 data). 아직 평가하지 않았으면 응답 data가 null이다(오류 아님). */
export interface MyEvaluationDto {
  evaluation_id: number;
  applicant_id: number;
  decision: EvaluationDecision;
  score: number | null;
  memo: string | null;
  interview_question: string | null;
}
