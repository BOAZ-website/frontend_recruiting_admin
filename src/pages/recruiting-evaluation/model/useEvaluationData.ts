import { useCallback, useRef, useState } from 'react';

import * as recruitmentApi from '@/entities/recruitment/api/recruitmentApi';

import { tableLayoutOf } from './applicantList';
import { applyMyEvaluation } from './myEvaluationForm';
import type {
  ApplicantAnswerDto,
  ApplicantEvaluationDto,
  ApplicantEvaluationResponse,
  ApplicantSummaryDto,
  EvaluationDecision,
  EvaluatorDetailItem,
  InterviewQuestionItem,
  MyEvaluationDto,
  MyEvaluationInput,
  TableLayout,
} from './types';

/** 서류 평가 화면의 서버 데이터와 저장 함수. 화면의 선택·필터·입력 상태는 화면이 따로 가진다. */
export interface EvaluationDataState {
  /** 마지막으로 읽은 지원자 목록. 화면이 id로 지원자를 찾을 때 쓴다. */
  applicants: ApplicantEvaluationDto[];
  /** 지금 평가하는 관리자 id. 다른 평가자 결과와 구분할 때 쓴다. */
  currentEvaluatorId: number;
  /** [REC-ADMIN-13·14] 지원자 목록을 읽는다. useLoaded에 넘길 수 있게 참조가 바뀌지 않는다. */
  fetchApplicants: () => Promise<ApplicantEvaluationDto[]>;
  /** [REC-ADMIN-20] 지원서 답변을 읽는다. useLoaded 키(지원서 id 문자열)를 받는다. */
  fetchAnswers: (applicantIdKey: string) => Promise<ApplicantAnswerDto[]>;
  /** [REC-ADMIN-15] 평가자별 평가를 읽는다. useLoaded 키(지원서 id 문자열)를 받는다. */
  fetchEvaluations: (applicantIdKey: string) => Promise<EvaluatorDetailItem[]>;
  /** [REC-ADMIN-19] 평가자별 면접 질문을 읽는다. useLoaded 키(지원서 id 문자열)를 받는다. */
  fetchInterviewQuestions: (applicantIdKey: string) => Promise<InterviewQuestionItem[]>;
  /** [REC-ADMIN-16] 내 평가를 읽는다. 아직 평가하지 않았으면 null. */
  fetchMyEvaluation: (applicantId: number) => Promise<MyEvaluationDto | null>;
  /** [REC-ADMIN-17] 개인 평가를 저장하고, 목록을 다시 읽어 갱신된 지원자를 돌려준다. 거절되면 ApiError를 던진다. */
  saveMyEvaluation: (
    applicant: ApplicantEvaluationDto,
    previous: { decision: EvaluationDecision | null; score: number | null } | null,
    input: MyEvaluationInput,
  ) => Promise<ApplicantEvaluationDto>;
  /** [REC-ADMIN-18] 지원자별 최종 판정을 바꾼다. 거절되면 ApiError를 던지고 데이터는 그대로 둔다. */
  updateFinalDecision: (applicantId: number, decision: EvaluationDecision) => Promise<void>;
}

/** 지원서 요약(DRAFT 포함)에 평가 집계를 붙인다. 집계가 없는 지원서는 빈 집계다. */
export function mergeApplicants(
  summaries: ApplicantSummaryDto[],
  evaluations: ApplicantEvaluationResponse[],
): ApplicantEvaluationDto[] {
  const evaluationById = new Map(evaluations.map((item) => [item.id, item]));
  return summaries.map((summary) => {
    const evaluation = evaluationById.get(summary.id);
    return {
      ...summary,
      pass_count: evaluation?.pass_count ?? 0,
      hold_count: evaluation?.hold_count ?? 0,
      fail_count: evaluation?.fail_count ?? 0,
      total_score: evaluation?.total_score ?? 0,
      final_decision: evaluation?.final_decision ?? 'PENDING',
      my_decision: evaluation?.my_decision ?? null,
    };
  });
}

/** 공고 하나의 서류 평가 데이터를 서버에서 읽고 쓴다. recruitmentId가 바뀌면 화면을 key로 새로 만든다. */
export function useEvaluationData(recruitmentId: number, adminId: number): EvaluationDataState {
  const [applicants, setApplicants] = useState<ApplicantEvaluationDto[]>([]);

  const fetchApplicants = useCallback(async (): Promise<ApplicantEvaluationDto[]> => {
    const [summaries, evaluations] = await Promise.all([
      recruitmentApi.fetchApplicantSummaries(recruitmentId),
      recruitmentApi.fetchApplicantEvaluations(recruitmentId),
    ]);
    const merged = mergeApplicants(summaries, evaluations);
    setApplicants(merged);
    return merged;
  }, [recruitmentId]);

  // 표 문항의 줄·칸은 답변 API에 없어 공고 문항 목록에서 가져온다. 공고마다 한 번만 읽는다.
  const tableLayoutsRef = useRef<Promise<Map<number, TableLayout>> | null>(null);
  const loadTableLayouts = useCallback(() => {
    tableLayoutsRef.current ??= recruitmentApi
      .fetchQuestions(recruitmentId)
      .then(
        (questions) =>
          new Map(
            questions.flatMap((question) => {
              const layout = tableLayoutOf(question.metadata);
              return layout ? [[question.question_id, layout] as const] : [];
            }),
          ),
      )
      .catch(() => {
        // 문항을 못 읽어도 답변은 보여 준다(표는 줄 이름·답 두 칸으로 그린다). 다음 지원자를 열 때 다시 읽는다.
        tableLayoutsRef.current = null;
        return new Map<number, TableLayout>();
      });
    return tableLayoutsRef.current;
  }, [recruitmentId]);

  const fetchAnswers = useCallback(
    async (applicantIdKey: string): Promise<ApplicantAnswerDto[]> => {
      const [{ answers }, layouts] = await Promise.all([
        recruitmentApi.fetchApplicantAnswers(Number(applicantIdKey)),
        loadTableLayouts(),
      ]);
      return answers.map((answer) =>
        answer.type === 'TABLE'
          ? { ...answer, table_layout: layouts.get(answer.question_id) ?? null }
          : answer,
      );
    },
    [loadTableLayouts],
  );

  const fetchEvaluations = useCallback(
    (applicantIdKey: string) => recruitmentApi.fetchEvaluators(Number(applicantIdKey)),
    [],
  );

  const fetchInterviewQuestions = useCallback(
    (applicantIdKey: string) => recruitmentApi.fetchInterviewQuestions(Number(applicantIdKey)),
    [],
  );

  const fetchMyEvaluation = useCallback(
    (applicantId: number) => recruitmentApi.fetchMyEvaluation(applicantId),
    [],
  );

  const saveMyEvaluation = async (
    applicant: ApplicantEvaluationDto,
    previous: { decision: EvaluationDecision | null; score: number | null } | null,
    input: MyEvaluationInput,
  ): Promise<ApplicantEvaluationDto> => {
    await recruitmentApi.saveMyEvaluation(applicant.id, input);
    // 전체 목록을 다시 받지 않고 이 지원자만 고친다. 목록은 목록 화면으로 돌아갈 때 한 번 다시 읽는다.
    const updated = applyMyEvaluation(applicant, previous, input);
    setApplicants((current) => current.map((item) => (item.id === applicant.id ? updated : item)));
    return updated;
  };

  const updateFinalDecision = async (
    applicantId: number,
    decision: EvaluationDecision,
  ): Promise<void> => {
    const result = await recruitmentApi.updateFinalDecision(applicantId, decision);
    setApplicants((current) =>
      current.map((item) =>
        item.id === applicantId ? { ...item, final_decision: result.final_decision } : item,
      ),
    );
  };

  return {
    applicants,
    currentEvaluatorId: adminId,
    fetchApplicants,
    fetchAnswers,
    fetchEvaluations,
    fetchInterviewQuestions,
    fetchMyEvaluation,
    saveMyEvaluation,
    updateFinalDecision,
  };
}
