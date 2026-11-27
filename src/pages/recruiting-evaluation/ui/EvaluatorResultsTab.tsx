import { useEffect, useRef, useState } from 'react';

import { ApiError } from '@/shared/api/apiError';
import { useLoaded } from '@/shared/lib/useLoaded';
import { SelectDropdown } from '@/shared/ui/SelectDropdown';

import {
  aggregateEvaluations,
  mergeEvaluatorRecords,
  orderForViewer,
} from '../model/evaluationStatus';
import {
  type MyEvaluationDraft,
  SCORE_SELECT_OPTIONS,
  scoreFromSelect,
  validateMyEvaluation,
} from '../model/myEvaluationForm';
import {
  DECISION_LABELS,
  type EvaluatorDetailItem,
  type InterviewQuestionItem,
  SELECTABLE_DECISIONS,
} from '../model/types';
import { ListLoading } from './ListLoading';
import { ValueText } from './ValueText';

/** 본인 행 편집. 개인 평가 탭과 같은 초안·검증·저장을 페이지가 맡고, 이 표는 그리기와 편집 여부만 가진다. */
const hasSavedDecision = (row: { decision: string | null }) =>
  row.decision !== null && row.decision !== 'PENDING';

export interface OwnRowEditing {
  draft: MyEvaluationDraft;
  saving: boolean;
  /** 내 평가를 읽는 중이거나 읽지 못했으면 편집을 막는다. */
  locked: boolean;
  onChange: (patch: Partial<MyEvaluationDraft>) => void;
  /** 편집을 시작해도 되는지. 저장하지 않은 입력이 있으면 페이지가 묻고, 초안을 저장값으로 되돌린다. */
  onStart: () => boolean;
  /** 저장값과 다른 입력이 있는지. 없으면 확인을 눌러도 묻지 않고 편집만 끝낸다. */
  isDirty: boolean;
  /** 입력을 저장값으로 되돌린다. */
  onCancel: () => void;
  /** 저장에 성공하면 true. 실패하면 페이지가 알리고 입력은 그대로 둔다. */
  onSave: () => Promise<boolean>;
}

interface EvaluatorResultsTabProps {
  /** 지원자가 바뀌어도 새로 그리지 않는다. 새로 읽는 동안에는 앞 지원자의 결과를 흐리게 보이고 수정은 막는다. */
  applicantId: number;
  currentEvaluatorId: number;
  fetchEvaluations: (applicantIdKey: string) => Promise<EvaluatorDetailItem[]>;
  fetchInterviewQuestions: (applicantIdKey: string) => Promise<InterviewQuestionItem[]>;
  /** 바뀌면 평가 기록을 다시 읽는다. 개인 평가 탭에서 저장한 뒤 현황을 맞출 때 쓴다. */
  refreshKey: number;
  editing: OwnRowEditing;
  /** 맨 위 제목으로 보여 줄 지원자 이름. */
  applicantName: string;
  /** 이름 옆 부문 태그 글자(예: AI). */
  trackLabel: string;
  /** 이름을 누르면 인적사항 창을 연다. */
  onOpenProfile: () => void;
}

// 서류 평가 목록 표(MyEvaluationList)와 같은 방식: 짧은 열은 고정 너비, 메모·면접 추천 질문은 남는 너비를 나눠 쓴다.
const COLUMNS: { label: string; width?: string }[] = [
  { label: '평가자', width: '96px' },
  { label: '평가', width: '112px' },
  { label: '점수', width: '120px' },
  { label: '메모' },
  { label: '면접 추천 질문' },
];
// 수정·확인 글자 버튼 하나만 들어가는 칸. 남는 폭은 메모·면접 추천 질문이 나눠 쓴다.
const EDIT_WIDTH = '72px';

// 고를 수 있는 판정은 합격·보류·불합격이다. 미평가(null)는 처음 값으로만 보여 준다.
const DECISION_OPTIONS = SELECTABLE_DECISIONS.map((decision) => ({
  value: decision,
  label: DECISION_LABELS[decision],
}));
/**
 * 운영진 평가 현황(GROUP-05·07, REC-ADMIN-15·19). 위에 판정 수·총점, 아래 표에 운영진별 판정·점수·메모·면접 추천 질문을 둔다.
 * 로그인한 평가자의 행은 맨 위에 두고 그 행만 고칠 수 있다. 다른 운영진 행은 조회만 한다.
 * shortcut: 본인 행이면 고칠 수 있게 둔다, 평가 API 연동 때 /accounts/me의 부문 권한(EVALUATION_*_TRACK_WRITE)도 확인한다
 */
export function EvaluatorResultsTab({
  applicantId,
  currentEvaluatorId,
  fetchEvaluations,
  fetchInterviewQuestions,
  refreshKey,
  editing,
  applicantName,
  trackLabel,
  onOpenProfile,
}: EvaluatorResultsTabProps) {
  const evaluations = useLoaded(String(applicantId), fetchEvaluations);
  const questions = useLoaded(String(applicantId), fetchInterviewQuestions);
  // 편집 중인 지원자. 다른 지원자로 넘어가면 저절로 편집이 풀린다.
  const [editingApplicantId, setEditingApplicantId] = useState<number | null>(null);
  const isEditing = editingApplicantId === applicantId;
  const setIsEditing = (value: boolean) => setEditingApplicantId(value ? applicantId : null);
  const error = evaluations.error ?? questions.error;
  const isLoading = evaluations.isLoading || questions.isLoading;
  const isLoaded = evaluations.data !== null && questions.data !== null;
  const isOtherApplicant =
    evaluations.dataKey !== String(applicantId) || questions.dataKey !== String(applicantId);
  const rows = orderForViewer(
    mergeEvaluatorRecords(evaluations.data ?? [], questions.data ?? []),
    currentEvaluatorId,
  );
  // 수정 열은 내 판정이 저장돼 있을 때(또는 고치는 중)만 둔다. 미정이면 열을 빼고 그 폭을 메모·면접 추천 질문이 나눠 쓴다.
  const showEditColumn = isEditing || rows.some((row) => row.isMe && hasSavedDecision(row));
  // 판정 수는 PASS·HOLD·FAIL을 저장한 평가자 수다. 미평가(null)와 미정은 세지 않고, 총점은 null 점수를 뺀 합이다.
  const aggregate = aggregateEvaluations(rows);

  const reload = () => {
    evaluations.reload();
    questions.reload();
  };

  // 처음 그릴 때는 이미 읽고 있으므로 refreshKey가 바뀔 때만 다시 읽는다.
  const handledRefreshRef = useRef(refreshKey);
  const { reload: reloadEvaluations } = evaluations;
  const { reload: reloadQuestions } = questions;
  useEffect(() => {
    if (refreshKey === handledRefreshRef.current) return;
    handledRefreshRef.current = refreshKey;
    reloadEvaluations();
    reloadQuestions();
  }, [refreshKey, reloadEvaluations, reloadQuestions]);

  // 확인: 바뀐 게 없으면 편집만 끝내고, 있으면 저장할지 묻는다. 취소하면 입력을 되돌리고 편집을 끝낸다.
  // 입력 오류는 행 안에 쓰지 않고 브라우저 알림 창으로 알린다(행 높이가 바뀌지 않게).
  const handleSave = async () => {
    if (!editing.isDirty) {
      setIsEditing(false);
      return;
    }
    if (!window.confirm('수정한 평가를 저장하시겠습니까?')) {
      editing.onCancel();
      setIsEditing(false);
      return;
    }
    const message = Object.values(validateMyEvaluation(editing.draft))[0];
    if (message) {
      window.alert(message);
      return;
    }
    if (await editing.onSave()) setIsEditing(false);
  };

  const summary: [string, string][] = [
    ['합격', `${aggregate.pass_count}`],
    ['보류', `${aggregate.hold_count}`],
    ['불합', `${aggregate.fail_count}`],
    ['총점수', `${aggregate.total_score}`],
  ];

  return (
    <section className="review-paper review-status" aria-label="운영진 평가 현황">
      {/* 지원자 이름이 제목이다. 누르면 인적사항 창이 뜨고, 어느 화면인지는 위 줄의 경로가 알려 준다. */}
      <div className="flex items-center justify-end gap-1">
        <h2 className="review-status-name mr-auto">
          <button
            type="button"
            className="review-name-button"
            data-tip="인적사항 보기"
            aria-haspopup="dialog"
            onClick={onOpenProfile}
          >
            {applicantName}
          </button>
          <span className="review-tag">{trackLabel}</span>
        </h2>
      </div>
      {/* 지원서가 없으면 다시 읽어도 소용없어 안내만 가운데에 둔다. 그 밖의 실패와 읽는 중은 가운데 로딩 표시를 두고 저절로 다시 읽는다. */}
      {error instanceof ApiError && error.code === 'APPLICATION_NOT_FOUND' ? (
        <p role="alert" className="flex min-h-[240px] items-center justify-center text-sm">
          지원서를 찾을 수 없습니다.
        </p>
      ) : error || !isLoaded ? (
        <ListLoading
          error={error}
          isLoading={isLoading}
          onRetry={reload}
          message="평가 결과를 불러오는 중입니다."
          minHeightClassName="min-h-[240px]"
        />
      ) : (
        // 다른 지원자로 넘어가 다시 읽는 동안은 앞 결과의 자리만 남기고 숨긴다. 로딩 표시로 바꾸면 표가 사라졌다
        // 나타나며 화면이 튀고, 그대로 보이면 앞사람 평가를 이 지원자 것으로 잘못 볼 수 있다.
        <div
          aria-busy={isLoading}
          className={`transition-opacity duration-150 ${isOtherApplicant ? 'invisible' : isLoading ? 'opacity-40' : ''}`}
        >
          <dl className="review-status-summary" aria-label="운영진 평가 집계">
            {summary.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {rows.length === 0 ? (
            <p role="status">아직 등록된 평가가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
              <table
                className="w-full min-w-[760px] table-fixed text-xs"
                aria-label="운영진별 평가 기록"
              >
                <colgroup>
                  {COLUMNS.map((column) => (
                    <col key={column.label} style={{ width: column.width }} />
                  ))}
                  {showEditColumn && <col style={{ width: EDIT_WIDTH }} />}
                </colgroup>
                <thead>
                  <tr>
                    {COLUMNS.map((column) => (
                      <th key={column.label} scope="col" className="px-4 py-3 text-left">
                        {column.label}
                      </th>
                    ))}
                    {showEditColumn && (
                      <th scope="col" className="px-4 py-3">
                        <span className="sr-only">수정</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const isRowEditing = row.isMe && isEditing;
                    const { draft } = editing;
                    return (
                      <tr key={row.admin_id}>
                        <td className="px-4 whitespace-nowrap">{row.displayName}</td>
                        <td className="px-4 whitespace-nowrap">
                          {isRowEditing ? (
                            <SelectDropdown
                              ariaLabel="내 판정"
                              value={draft.decision ?? ''}
                              options={
                                draft.decision === null
                                  ? [{ value: '', label: '미정' }, ...DECISION_OPTIONS]
                                  : DECISION_OPTIONS
                              }
                              onChange={(decision) => decision && editing.onChange({ decision })}
                              buttonClassName="review-cell-select h-[30px] w-full"
                            />
                          ) : row.decision ? (
                            DECISION_LABELS[row.decision]
                          ) : (
                            '미정'
                          )}
                        </td>
                        <td className="px-4 whitespace-nowrap">
                          {isRowEditing ? (
                            <SelectDropdown
                              ariaLabel="내 점수"
                              value={draft.score === null ? '' : String(draft.score)}
                              options={SCORE_SELECT_OPTIONS}
                              onChange={(score) =>
                                editing.onChange({ score: scoreFromSelect(score) })
                              }
                              buttonClassName="review-cell-select h-[30px] w-full"
                            />
                          ) : (
                            <ValueText value={row.score === null ? '-' : String(row.score)} />
                          )}
                        </td>
                        <td className="review-status-text px-4">
                          {isRowEditing ? (
                            <textarea
                              aria-label="내 평가 메모"
                              value={draft.memo}
                              onChange={(e) => editing.onChange({ memo: e.target.value })}
                            />
                          ) : (
                            row.memo
                          )}
                        </td>
                        <td className="review-status-text px-4">
                          {isRowEditing ? (
                            <textarea
                              aria-label="내 면접 추천 질문"
                              value={draft.interview_question}
                              onChange={(e) =>
                                editing.onChange({ interview_question: e.target.value })
                              }
                            />
                          ) : (
                            row.interview_question
                          )}
                        </td>
                        {showEditColumn && (
                          <td className="px-4 whitespace-nowrap">
                            {isRowEditing ? (
                              <button
                                type="button"
                                className="review-row-action review-link-button"
                                disabled={editing.saving}
                                onClick={() => void handleSave()}
                              >
                                {editing.saving ? '저장 중…' : '확인'}
                              </button>
                            ) : (
                              row.isMe &&
                              hasSavedDecision(row) && (
                                // 상자 없는 글자 버튼이다(review-design.css). 누르면 같은 자리에 확인이 나온다.
                                // 저장된 판정이 있을 때만 보인다. 처음 평가는 개인 평가 탭에서 한다.
                                <button
                                  type="button"
                                  aria-label="내 평가 수정"
                                  className="review-row-action review-link-button"
                                  disabled={editing.locked || isLoading}
                                  onClick={() => editing.onStart() && setIsEditing(true)}
                                >
                                  수정
                                </button>
                              )
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
