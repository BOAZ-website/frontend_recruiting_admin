import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { openRowOnKey } from '@/shared/lib/rowKeyboard';
import { useLoaded } from '@/shared/lib/useLoaded';
import { FilterDropdown, type FilterDropdownOption } from '@/shared/ui/FilterDropdown';
import { SearchInput } from '@/shared/ui/SearchInput';
import { SelectDropdown } from '@/shared/ui/SelectDropdown';

import {
  displayValue,
  filterReviewList,
  MY_EVALUATION_FILTER_LABELS,
  type MyEvaluationFilter,
  REVIEW_SORT_LABELS,
  REVIEW_SORT_OPTIONS,
  type ReviewListQuery,
} from '../model/applicantList';
import { FINAL_DECISION_OPTIONS } from '../model/finalDecision';
import {
  type ApplicantEvaluationDto,
  DECISION_LABELS,
  type EvaluationDecision,
  SELECTABLE_DECISIONS,
  type TrackType,
} from '../model/types';
import { ListLoading, ListRefreshNotice } from './ListLoading';
import { ValueText } from './ValueText';

interface MyEvaluationListProps {
  fetchApplicants: () => Promise<ApplicantEvaluationDto[]>;
  /** 사이드바 부문 메뉴가 정한 부문. 이 부문 지원자만 보여 준다. */
  track: TrackType;
  /** 조회 조건. 상세에서 목록으로 돌아와도 남도록 페이지가 가진다. */
  query: ReviewListQuery;
  onQueryChange: (query: ReviewListQuery) => void;
  /** 지원자의 상세 화면을 연다. 이전·다음 이동은 지금 목록 순서(orderedIds)를 따른다. */
  onOpen: (applicantId: number, orderedIds: number[]) => void;
  /** FINAL_DECISION_WRITE가 있으면 최종 평가를 골라 바로 저장한다. 없으면 조회만 한다. */
  canWriteFinalDecision: boolean;
  /** 최종 판정 저장(REC-ADMIN-18). 결과 안내는 페이지가 하고, 성공 여부만 돌려준다. */
  onSaveFinalDecision: (
    applicant: ApplicantEvaluationDto,
    decision: EvaluationDecision,
  ) => Promise<boolean>;
}

// 부문은 메뉴가 정하므로 부문 열이 없다. 평가자별 상세는 상세 화면의 운영진 평가 현황에서 본다.
// 열마다 기준 너비가 있고 화면이 넓으면 같은 비율로 함께 넓어진다(실제 값은 review-design.css의 .review-eval-table).
// decision이 있는 열은 머리글을 판정 버튼과 같은 색으로 칠한다(review-design.css).
const COLUMNS: { label: string; width?: string; decision?: 'PASS' | 'HOLD' | 'FAIL' }[] = [
  { label: '이름', width: '96px' },
  { label: '학교' },
  { label: '전공' },
  { label: '학기', width: '64px' },
  { label: '졸업 예정', width: '88px' },
  { label: '합격', width: '64px', decision: 'PASS' },
  { label: '보류', width: '64px', decision: 'HOLD' },
  { label: '불합', width: '64px', decision: 'FAIL' },
  { label: '총점수', width: '72px' },
  { label: '개인 평가', width: '96px' },
  { label: '최종 평가', width: '168px' },
];

const MY_FILTER_OPTIONS: readonly FilterDropdownOption<MyEvaluationFilter>[] = (
  Object.keys(MY_EVALUATION_FILTER_LABELS) as MyEvaluationFilter[]
).map((filter) => ({ value: filter, label: MY_EVALUATION_FILTER_LABELS[filter] }));

const FINAL_FILTER_OPTIONS: readonly FilterDropdownOption<ReviewListQuery['finalDecision']>[] = [
  { value: 'ALL', label: '전체' },
  ...FINAL_DECISION_OPTIONS.map((decision) => ({
    value: decision,
    label: DECISION_LABELS[decision],
  })),
];

// 최종 평가 선택지. 미정(PENDING)은 백엔드의 처음 값이라, 골라 두었던 판정을 미정으로 되돌리면 처음 상태와 같아진다.
const FINAL_DECISION_SELECT_OPTIONS = [
  { value: 'PENDING' as const, label: DECISION_LABELS.PENDING },
  ...SELECTABLE_DECISIONS.map((decision) => ({
    value: decision,
    label: DECISION_LABELS[decision],
  })),
];

/**
 * 서류 평가 목록. 개인 평가 목록(EVL-MY)과 전체 평가 목록(EVL-GROUP)을 합쳤다.
 * 제출 완료 지원자만 보여 주고, 개인 평가 집계와 최종 판정을 나눠 표시한다.
 * 최종 평가는 권한이 있으면 행에서 고르는 즉시 저장한다(명세 §5.6, 저장 버튼 없음). 기수 전체 확정은 없다.
 */
export function MyEvaluationList({
  fetchApplicants,
  track,
  query,
  onQueryChange,
  onOpen,
  canWriteFinalDecision,
  onSaveFinalDecision,
}: MyEvaluationListProps) {
  const list = useLoaded('applicants', fetchApplicants);
  // 행마다 고른 최종 평가. 저장하는 동안과 다시 읽기 전까지 보여 주고, 없으면 서버 값을 보여 준다.
  // 고른 최종 평가를 서버 목록이 새로 오기 전까지만 보여 준다. 고를 때의 목록(basis)을 함께 적어 두고,
  // 목록이 다시 오면(다른 대표진이 바꾼 값 포함) 서버 값을 따른다.
  const [finalDrafts, setFinalDrafts] = useState<
    Record<number, { decision: EvaluationDecision; basis: ApplicantEvaluationDto[] | null }>
  >({});
  // 최종 평가를 저장 중인 지원서 id. 그 행만 잠그고 다른 행은 바로 바꿀 수 있다.
  const [savingFinalIds, setSavingFinalIds] = useState<number[]>([]);

  const applicants = list.data ?? [];
  const submitted = applicants.filter(
    (applicant) => applicant.status === 'SUBMITTED' && applicant.track === track,
  );
  // 부문은 메뉴가 정하므로 목록 조건의 부문 값 대신 메뉴의 부문으로 거른다.
  const rows = filterReviewList(applicants, { ...query, track });
  // 필터 줄 왼쪽 인원: 이 부문의 제출 완료 지원자 수. 필터·검색과 관계없이 같다.
  const submittedCount = applicants.filter(
    (applicant) => applicant.track === track && applicant.status === 'SUBMITTED',
  ).length;

  const updateQuery = (patch: Partial<ReviewListQuery>) => onQueryChange({ ...query, ...patch });

  const handleOpen = (applicantId: number) =>
    onOpen(
      applicantId,
      rows.map((row) => row.id),
    );

  const finalDraftOf = (applicant: ApplicantEvaluationDto) => {
    const draft = finalDrafts[applicant.id];
    const isCurrent =
      draft !== undefined && (savingFinalIds.includes(applicant.id) || draft.basis === list.data);
    return isCurrent ? draft.decision : applicant.final_decision;
  };

  // 최종 평가는 고르는 즉시 저장한다(저장 버튼 없음). 같은 값이면 요청하지 않는다.
  // 저장하는 동안 그 행 선택을 잠가 연속 변경과 늦은 응답이 값을 덮어쓰지 않게 한다. 실패하면 이전 값으로 되돌린다.
  const handleChangeFinal = async (
    applicant: ApplicantEvaluationDto,
    decision: EvaluationDecision,
  ) => {
    if (savingFinalIds.includes(applicant.id) || decision === finalDraftOf(applicant)) return;
    setFinalDrafts((current) => ({ ...current, [applicant.id]: { decision, basis: list.data } }));
    setSavingFinalIds((current) => [...current, applicant.id]);
    const saved = await onSaveFinalDecision(applicant, decision);
    // 성공하면 고른 값이 곧 서버 값이라 다시 읽는 동안 깜빡이지 않게 둔다.
    if (!saved) {
      setFinalDrafts((current) => {
        const next = { ...current };
        delete next[applicant.id];
        return next;
      });
    }
    setSavingFinalIds((current) => current.filter((id) => id !== applicant.id));
    list.reload();
  };

  // 한 번도 읽지 못했을 때만 가운데 로딩 표시를 둔다(실패면 잠시 뒤 다시 읽는다).
  // 이미 보여 준 목록이 있으면 다시 읽기에 실패해도 표를 남기고 위에 안내만 둔다(C-03).
  if (!list.data) {
    return <ListLoading error={list.error} isLoading={list.isLoading} onRetry={list.reload} />;
  }

  return (
    <section aria-label="평가 대상 목록">
      <ListRefreshNotice error={list.error} isLoading={list.isLoading} onRetry={list.reload} />
      <div className="review-list-toolbar flex flex-wrap items-center justify-between gap-3 pb-3">
        {/* 표 상자 모서리 곡선이 끝나는 6px(rounded-md)에 맞추고, 줄 아래쪽에 붙여 표와 12px(pb-3) 간격을 둔다. */}
        <span className="self-end pl-1.5 text-xs font-semibold text-slate-600">
          총 {submittedCount}명
        </span>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <FilterDropdown
            ariaLabel="개인 평가 필터"
            title="개인 평가"
            value={query.myFilter}
            options={MY_FILTER_OPTIONS}
            onChange={(myFilter) => updateQuery({ myFilter })}
          />
          <FilterDropdown
            ariaLabel="최종 평가 필터"
            title="최종 평가"
            value={query.finalDecision}
            options={FINAL_FILTER_OPTIONS}
            onChange={(finalDecision) => updateQuery({ finalDecision })}
          />
          <FilterDropdown
            ariaLabel="정렬"
            title={REVIEW_SORT_LABELS.SUBMITTED_DESC}
            value={query.sort}
            options={REVIEW_SORT_OPTIONS}
            onChange={(sort) => updateQuery({ sort })}
          />
          {/* 검색칸. 좁은 화면에서 한 덩어리로 함께 줄바꿈한다(review-design.css). */}
          <div className="review-search-group">
            <SearchInput
              ariaLabel="지원자 검색"
              placeholder="이름, 이메일, 학교, 전공"
              value={query.search}
              onChange={(search) => updateQuery({ search })}
            />
          </div>
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-white">
        <div className="review-table-scroll">
          <table className="review-list-table review-eval-table w-full table-fixed text-xs">
            <colgroup>
              {COLUMNS.map((column) => (
                <col key={column.label} style={{ width: column.width }} />
              ))}
              <col style={{ width: '40px' }} />
            </colgroup>
            <thead>
              <tr>
                {COLUMNS.map((column) => (
                  <th
                    key={column.label}
                    scope="col"
                    data-decision={column.decision}
                    className="px-4 py-3 text-left"
                  >
                    {column.label}
                  </th>
                ))}
                <th scope="col" className="review-cell-chevron px-2">
                  <span className="sr-only">열기</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((applicant) => {
                return (
                  <tr
                    key={applicant.id}
                    tabIndex={0}
                    aria-label={`${displayValue(applicant.name)} 평가 열기`}
                    onClick={() => handleOpen(applicant.id)}
                    onKeyDown={openRowOnKey(() => handleOpen(applicant.id))}
                    className="cursor-pointer"
                  >
                    <td className="px-4 font-semibold break-keep wrap-break-word">
                      {displayValue(applicant.name)}
                    </td>
                    <td className="px-4 truncate" title={applicant.university ?? undefined}>
                      <ValueText value={displayValue(applicant.university)} />
                    </td>
                    <td className="px-4 truncate" title={applicant.major ?? undefined}>
                      <ValueText value={displayValue(applicant.major)} />
                    </td>
                    <td className="px-4">
                      <ValueText value={String(applicant.last_semester ?? '-')} />
                    </td>
                    <td className="px-4 whitespace-nowrap">
                      <ValueText value={displayValue(applicant.graduation_date)} />
                    </td>
                    <td data-decision="PASS" className="px-4">
                      {applicant.pass_count}
                    </td>
                    <td data-decision="HOLD" className="px-4">
                      {applicant.hold_count}
                    </td>
                    <td data-decision="FAIL" className="px-4">
                      {applicant.fail_count}
                    </td>
                    <td className="px-4">{applicant.total_score}</td>
                    <td className="px-4 whitespace-nowrap">
                      {applicant.my_decision === null
                        ? DECISION_LABELS.PENDING
                        : DECISION_LABELS[applicant.my_decision]}
                    </td>
                    <td className="px-4 whitespace-nowrap">
                      {canWriteFinalDecision ? (
                        // 행을 누르거나 Enter를 치면 상세가 열리므로 판정 고르기·저장 클릭과 키 입력은 행으로 올려 보내지 않는다.
                        // 드롭다운은 칸 너비를 채운다. 열이 비율대로 넓어져도 칸 안에서 떠 보이지 않는다.
                        <div
                          className="grid"
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <SelectDropdown
                            ariaLabel={`${displayValue(applicant.name)} 최종 평가`}
                            value={finalDraftOf(applicant)}
                            options={FINAL_DECISION_SELECT_OPTIONS}
                            disabled={savingFinalIds.includes(applicant.id)}
                            onChange={(decision) => void handleChangeFinal(applicant, decision)}
                            buttonClassName="h-[30px] w-full"
                          />
                        </div>
                      ) : (
                        // 바꿀 권한이 없으면 개인 평가 칸처럼 글자로만 보여 준다.
                        DECISION_LABELS[applicant.final_decision]
                      )}
                    </td>
                    {/* 행을 누르면 평가 화면이 열린다는 표시. 꾸밈이라 화면 읽기 프로그램은 건너뛴다. */}
                    <td className="review-cell-chevron px-2">
                      <ChevronRight
                        size={16}
                        aria-hidden="true"
                        className="inline text-slate-400"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {rows.length === 0 && (
          <div role="status" className="flex flex-col items-center gap-3 p-8 text-sm">
            {submitted.length === 0 ? (
              <p>등록된 지원자가 없습니다.</p>
            ) : (
              <p>조건에 맞는 지원자가 없습니다.</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
