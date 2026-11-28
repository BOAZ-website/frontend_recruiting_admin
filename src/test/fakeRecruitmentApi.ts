/**
 * 서류 평가 API(recruitmentApi)의 테스트용 가짜. 테스트 파일에서
 * `vi.mock('@/entities/recruitment/api/recruitmentApi', () => import('@/test/fakeRecruitmentApi'))`로 바꿔 끼운다.
 * 저장은 fake.saveGate가 있으면 그 Promise가 풀릴 때까지 기다린다(저장 중 상태를 시험할 때).
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

export interface RecruitmentDto {
  recruitment_id: number;
  term: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

export const ME = 7;

export function summaryOf(
  id: number,
  patch: Partial<ApplicantSummaryDto> = {},
): ApplicantSummaryDto {
  return {
    id,
    user_id: id,
    status: 'SUBMITTED',
    track: 'ENGINEERING',
    name: `지원자${id}`,
    email: `a${id}@example.com`,
    phone: '01012345678',
    university: '서울대학교',
    major: '컴퓨터공학',
    minor_double_major: null,
    last_semester: 6,
    military_status: null,
    birth_date: null,
    graduation_date: '2027-02',
    grad_school_plan: false,
    submitted_at: `2026-11-0${id}T10:00:00`,
    ...patch,
  };
}

export const fake = {
  summaries: [] as ApplicantSummaryDto[],
  myEvaluations: new Map<number, MyEvaluationDto | null>(),
  finalDecisions: new Map<number, EvaluationDecision>(),
  saved: [] as { applicantId: number; input: MyEvaluationInput }[],
  saveGate: null as Promise<void> | null,
  saveError: null as Error | null,
  finalDecisionError: null as Error | null,
  /** 있으면 최종 평가 저장이 이 Promise가 풀릴 때까지 기다린다. */
  finalDecisionGate: null as Promise<void> | null,
  /** 목록(평가 집계) 조회 실패. 한 번 쓰면 비운다. */
  listErrors: [] as Error[],
  answers: new Map<number, ApplicantAnswersResponse['answers']>(),
  reset() {
    this.summaries = [summaryOf(1), summaryOf(2), summaryOf(3)];
    this.myEvaluations = new Map();
    this.finalDecisions = new Map();
    this.saved = [];
    this.saveGate = null;
    this.saveError = null;
    this.finalDecisionError = null;
    this.finalDecisionGate = null;
    this.listErrors = [];
    this.answers = new Map();
  },
};
fake.reset();

function evaluationOf(summary: ApplicantSummaryDto): ApplicantEvaluationResponse {
  const { status: _status, ...rest } = summary;
  void _status;
  const mine = fake.myEvaluations.get(summary.id) ?? null;
  return {
    ...rest,
    pass_count: mine?.decision === 'PASS' ? 1 : 0,
    hold_count: mine?.decision === 'HOLD' ? 1 : 0,
    fail_count: mine?.decision === 'FAIL' ? 1 : 0,
    total_score: mine?.score ?? 0,
    final_decision: fake.finalDecisions.get(summary.id) ?? 'PENDING',
    my_decision: mine?.decision ?? null,
  };
}

export async function fetchRecruitments(): Promise<RecruitmentDto[]> {
  return [{ recruitment_id: 3, term: 27, start_date: '', end_date: '', is_active: true }];
}

export async function fetchApplicantSummaries(): Promise<ApplicantSummaryDto[]> {
  return fake.summaries.map((item) => ({ ...item }));
}

export async function fetchApplicantEvaluations(): Promise<ApplicantEvaluationResponse[]> {
  const error = fake.listErrors.shift();
  if (error) throw error;
  return fake.summaries.filter((item) => item.status === 'SUBMITTED').map(evaluationOf);
}

export async function fetchQuestions(): Promise<QuestionDto[]> {
  return [];
}

export async function fetchApplicantAnswers(
  applicantId: number,
): Promise<ApplicantAnswersResponse> {
  return { applicant_id: applicantId, answers: fake.answers.get(applicantId) ?? [] };
}

export async function fetchEvaluators(applicantId: number): Promise<EvaluatorDetailItem[]> {
  const mine = fake.myEvaluations.get(applicantId);
  return mine
    ? [
        {
          admin_id: ME,
          name: '나',
          track: 'ENGINEERING',
          decision: mine.decision,
          score: mine.score,
          memo: mine.memo,
        },
      ]
    : [];
}

export async function fetchInterviewQuestions(
  applicantId: number,
): Promise<InterviewQuestionItem[]> {
  const mine = fake.myEvaluations.get(applicantId);
  return mine
    ? [
        {
          admin_id: ME,
          name: '나',
          track: 'ENGINEERING',
          interview_question: mine.interview_question,
        },
      ]
    : [];
}

export async function fetchMyEvaluation(applicantId: number): Promise<MyEvaluationDto | null> {
  return fake.myEvaluations.get(applicantId) ?? null;
}

export async function saveMyEvaluation(
  applicantId: number,
  input: MyEvaluationInput,
): Promise<MyEvaluationDto> {
  fake.saved.push({ applicantId, input });
  if (fake.saveGate) await fake.saveGate;
  if (fake.saveError) throw fake.saveError;
  const saved: MyEvaluationDto = {
    evaluation_id: applicantId,
    applicant_id: applicantId,
    ...input,
  };
  fake.myEvaluations.set(applicantId, saved);
  return saved;
}

export async function updateFinalDecision(
  applicantId: number,
  decision: EvaluationDecision,
): Promise<{ applicant_id: number; final_decision: EvaluationDecision }> {
  if (fake.finalDecisionGate) await fake.finalDecisionGate;
  if (fake.finalDecisionError) throw fake.finalDecisionError;
  fake.finalDecisions.set(applicantId, decision);
  return { applicant_id: applicantId, final_decision: decision };
}
