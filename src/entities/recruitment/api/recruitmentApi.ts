/**
 * 배포된 백엔드(main)의 모집 공고·서류 평가 API. 경로와 필드는 ApplicantEvaluationAdminController 기준이다.
 * 응답의 data만 돌려준다(client.ts). 부문 범위(본인 부문만, 차기대표진은 전 부문)는 서버가 거른다.
 */
import type {
  ApplicantAnswersResponse,
  ApplicantEvaluationResponse,
  ApplicantSummaryDto,
  EvaluationDecision,
  EvaluatorDetailItem,
  InterviewQuestionItem,
  MyEvaluationDto,
  MyEvaluationInput,
  QuestionDto,
} from '@/entities/recruitment/model/types';
import { api } from '@/shared/api/client';

const BASE = '/api/v1/admin/recruitment';

/** 모집 공고 한 건(GET /api/v1/admin/recruitment). */
export interface RecruitmentDto {
  recruitment_id: number;
  term: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

export function fetchRecruitments(): Promise<RecruitmentDto[]> {
  return api.get(BASE);
}

/** 공고의 지원서 전체(DRAFT 포함). */
export function fetchApplicantSummaries(recruitmentId: number): Promise<ApplicantSummaryDto[]> {
  return api.get(`${BASE}/${recruitmentId}/applicants`);
}

/** 공고의 제출 완료 지원서와 평가 집계·최종 평가·내 판정. */
export function fetchApplicantEvaluations(
  recruitmentId: number,
): Promise<ApplicantEvaluationResponse[]> {
  return api.get(`${BASE}/${recruitmentId}/applicants/evaluations`);
}

/** 공고의 문항 목록. 표 문항의 줄·칸(metadata)을 얻으려고 쓴다. TEAM 계정도 부를 수 있다. */
export function fetchQuestions(recruitmentId: number): Promise<QuestionDto[]> {
  return api.get(`${BASE}/${recruitmentId}/questions`);
}

export async function fetchApplicantAnswers(
  applicantId: number,
): Promise<ApplicantAnswersResponse> {
  return api.get(`${BASE}/applicants/${applicantId}/answers`);
}

export async function fetchEvaluators(applicantId: number): Promise<EvaluatorDetailItem[]> {
  const data = await api.get<{ evaluations: EvaluatorDetailItem[] }>(
    `${BASE}/applicants/${applicantId}/evaluations`,
  );
  return data.evaluations;
}

export async function fetchInterviewQuestions(
  applicantId: number,
): Promise<InterviewQuestionItem[]> {
  const data = await api.get<{ interview_questions: InterviewQuestionItem[] }>(
    `${BASE}/applicants/${applicantId}/interview-questions`,
  );
  return data.interview_questions;
}

/** 내 평가. 아직 평가하지 않았으면 null. */
export function fetchMyEvaluation(applicantId: number): Promise<MyEvaluationDto | null> {
  return api.get(`${BASE}/applicants/${applicantId}/evaluations/me`);
}

export function saveMyEvaluation(
  applicantId: number,
  input: MyEvaluationInput,
): Promise<MyEvaluationDto> {
  return api.put(`${BASE}/applicants/${applicantId}/evaluations/me`, input);
}

/** 최종 평가를 바꾼다. 서버는 SUPER 계정만 허용한다(대표진은 본인 부문, 차기대표진은 전 부문). */
export function updateFinalDecision(
  applicantId: number,
  decision: EvaluationDecision,
): Promise<{ applicant_id: number; final_decision: EvaluationDecision }> {
  return api.patch(`${BASE}/applicants/${applicantId}/final-decision`, {
    final_decision: decision,
  });
}
