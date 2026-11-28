import { useState } from 'react';

import { TRACK_IMAGE_BY_CODE } from '@/entities/user/model/trackImage';
import { dateTimeTextOf } from '@/shared/lib/date';
import { openRowOnKey } from '@/shared/lib/rowKeyboard';
import { useLoaded } from '@/shared/lib/useLoaded';
import { FilterDropdown, type FilterDropdownOption } from '@/shared/ui/FilterDropdown';
import { SearchInput } from '@/shared/ui/SearchInput';

import {
  APPLICANT_SORT_LABELS,
  type ApplicantListQuery,
  type ApplicantSort,
  DEFAULT_APPLICANT_QUERY,
  displayValue,
  filterApplicants,
  summarizeApplicants,
  TRACK_FILTER_OPTIONS,
  TRACK_ORDER,
} from '../model/applicantList';
import {
  type ApplicantAnswerDto,
  type ApplicantEvaluationDto,
  APPLICATION_STATUS_LABELS,
  TRACK_LABELS,
  type TrackType,
} from '../model/types';
import { ApplicantDetailModal } from './ApplicantDetailModal';
import { ListLoading } from './ListLoading';
import { ValueText } from './ValueText';

interface ApplicantsOverviewProps {
  fetchApplicants: () => Promise<ApplicantEvaluationDto[]>;
  fetchAnswers: (applicantIdKey: string) => Promise<ApplicantAnswerDto[]>;
  /** 제출 완료 지원자를 개인 평가 화면에서 연다. 평가할 수 있는 부문(visibleTracks)의 지원자에만 둔다. */
  onEvaluate: (applicantId: number) => void;
  /** 평가할 수 있는 부문(visibleTracksOf). 전 부문을 볼 수 없는 계정은 목록도 이 부문만 보여 준다. 요약 지표는 부문과 상관없이 전체를 센다. */
  visibleTracks: TrackType[];
  /** 전 부문 지원서를 보는 계정(차기대표진, 서비스운영팀장 MASTER)인지. 아니면 본인 부문의 제출 완료 지원서만 보여 준다. */
  canViewAllApplicants: boolean;
}

const STATUS_FILTER_OPTIONS: readonly FilterDropdownOption<ApplicantListQuery['status']>[] = [
  { value: 'ALL', label: '전체' },
  { value: 'SUBMITTED', label: APPLICATION_STATUS_LABELS.SUBMITTED },
  { value: 'DRAFT', label: APPLICATION_STATUS_LABELS.DRAFT },
];

const SORT_OPTIONS: readonly FilterDropdownOption<ApplicantSort>[] = (
  Object.keys(APPLICANT_SORT_LABELS) as ApplicantSort[]
).map((sort) => ({ value: sort, label: APPLICANT_SORT_LABELS[sort] }));

const COLUMNS = ['이름', '부문', '학교', '전공', '학기', '졸업 예정', '제출일', '상태'];
/** 열 너비의 비율. 필터·검색으로 행이 바뀌어도 열 너비가 그대로이게 표를 table-fixed로 두고 이 비율을 쓴다. */
const COLUMN_WEIGHTS: Record<string, number> = {
  이름: 10,
  부문: 9,
  학교: 16,
  전공: 16,
  학기: 7,
  '졸업 예정': 12,
  제출일: 18,
  상태: 12,
};

/**
 * 전체 지원 현황(EVL-APP). 지원서 목록과 지원서 상세를 보여 준다.
 * 요약 지표는 계정과 상관없이 전체 지원자로 센다. 목록은 전 부문 계정이면 임시저장(DRAFT)을 포함한 모든 지원서를,
 * 그 밖의 계정은 본인 부문의 제출 완료 지원서만 보여 준다.
 */
export function ApplicantsOverview({
  fetchApplicants,
  fetchAnswers,
  onEvaluate,
  visibleTracks,
  canViewAllApplicants,
}: ApplicantsOverviewProps) {
  const list = useLoaded('applicants', fetchApplicants);
  const [query, setQuery] = useState<ApplicantListQuery>(DEFAULT_APPLICANT_QUERY);
  const [detail, setDetail] = useState<ApplicantEvaluationDto | null>(null);

  // 서버는 계정과 상관없이 전 부문 지원서(임시저장 포함)를 돌려준다.
  const allApplicants = list.data ?? [];
  // 목록은 전 부문 계정이면 전부, 그 밖의 계정이면 본인 부문의 제출 완료만 보여 준다.
  const applicants = canViewAllApplicants
    ? allApplicants
    : allApplicants.filter(
        (applicant) =>
          applicant.status === 'SUBMITTED' &&
          applicant.track !== null &&
          visibleTracks.includes(applicant.track),
      );
  const rows = filterApplicants(applicants, query);
  const isFirstLoad = list.isLoading && !list.data;
  // 요약 통계는 계정과 상관없이 전체 지원자(임시저장, 부문이 비어 있는 임시저장 포함)로 센다.
  const summary = summarizeApplicants(allApplicants);
  // 계정과 상관없이 열은 늘 같다(본인 부문 계정도 부문·상태 열을 본다).
  const totalWeight = COLUMNS.reduce((sum, label) => sum + COLUMN_WEIGHTS[label], 0);
  // 부원 등록 요약과 같은 모양. 부문 칸은 임시저장을 포함한 그 부문 지원자 전체를 센다.
  const stats: [string, number, string?][] = [
    ['지원자 수', summary.total],
    ['제출 완료', summary.submitted],
    ['임시저장', summary.draft],
    ...TRACK_ORDER.map((track): [string, number, string] => [
      TRACK_LABELS[track],
      allApplicants.filter((applicant) => applicant.track === track).length,
      TRACK_IMAGE_BY_CODE[track],
    ]),
  ];

  const updateQuery = (patch: Partial<ApplicantListQuery>) =>
    setQuery((current) => ({ ...current, ...patch }));

  const handleMissing = () => {
    setDetail(null);
    list.reload();
  };

  // 처음 읽는 중이거나 읽지 못했으면 가운데 로딩 표시만 둔다(실패면 잠시 뒤 다시 읽는다).
  if (list.error || isFirstLoad) {
    return <ListLoading error={list.error} isLoading={list.isLoading} onRetry={list.reload} />;
  }

  return (
    // 요약 칸 배치는 화면 폭이 아니라 이 영역의 폭(@container)을 따른다. 사이드바를 펴면 영역이 좁아지기 때문이다(R-06).
    <div className="@container space-y-4">
      {/* 좁으면 2열, 조금 넓으면 3열, 넓으면 기존처럼 6칸 한 줄이다. 숫자·라벨은 그대로다. */}
      <section
        aria-label="지원 현황 요약"
        className="mb-12 grid grid-cols-2 gap-y-4 rounded-md border border-slate-200 bg-white px-8 py-7 @lg:grid-cols-3 @4xl:px-0 @4xl:grid-flow-col @4xl:grid-cols-none @4xl:auto-cols-[minmax(0,1fr)] @4xl:items-center"
      >
        <dl className="contents">
          {stats.map(([label, count, image], index) => (
            <div
              key={label}
              className={`px-2 text-center ${index > 0 ? '@4xl:border-l @4xl:border-slate-200' : ''}`}
            >
              <dt className="flex items-center justify-center gap-1.5 text-sm leading-5 text-slate-500">
                {image && (
                  <img
                    src={image}
                    alt=""
                    width={20}
                    height={20}
                    className="size-5 object-contain"
                  />
                )}
                {label}
              </dt>
              <dd className="mt-2 text-3xl leading-9 font-semibold text-slate-900">
                {`${count}명`}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-label="지원자 목록">
        <div className="review-list-toolbar flex flex-wrap items-center justify-end gap-3 pb-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {canViewAllApplicants && (
              <>
                <FilterDropdown
                  ariaLabel="제출 상태 필터"
                  title="전체"
                  value={query.status}
                  options={STATUS_FILTER_OPTIONS}
                  onChange={(status) => updateQuery({ status })}
                />
                <FilterDropdown
                  ariaLabel="부문 필터"
                  title="부문"
                  value={query.track}
                  options={TRACK_FILTER_OPTIONS}
                  onChange={(track) => updateQuery({ track })}
                />
              </>
            )}
            <FilterDropdown
              ariaLabel="정렬"
              title={APPLICANT_SORT_LABELS.SUBMITTED_DESC}
              value={query.sort}
              options={SORT_OPTIONS}
              onChange={(sort) => updateQuery({ sort })}
            />
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
            <table className="review-list-table w-full min-w-[880px] table-fixed text-xs">
              <colgroup>
                {COLUMNS.map((label) => (
                  <col
                    key={label}
                    style={{ width: `${(COLUMN_WEIGHTS[label] / totalWeight) * 100}%` }}
                  />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {COLUMNS.map((label) => (
                    <th key={label} scope="col" className="px-4 py-3 text-left">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((applicant) => (
                  <tr
                    key={applicant.id}
                    tabIndex={0}
                    aria-label={`${displayValue(applicant.name)} 지원서 상세`}
                    onClick={() => setDetail(applicant)}
                    onKeyDown={openRowOnKey(() => setDetail(applicant))}
                    className="cursor-pointer"
                  >
                    <td className="px-4 font-semibold break-keep wrap-break-word">
                      {displayValue(applicant.name)}
                    </td>
                    <td className="px-4">
                      <ValueText value={applicant.track ? TRACK_LABELS[applicant.track] : '-'} />
                    </td>
                    <td className="px-4">
                      <ValueText value={displayValue(applicant.university)} />
                    </td>
                    <td className="px-4">
                      <ValueText value={displayValue(applicant.major)} />
                    </td>
                    <td className="px-4 text-right">
                      <ValueText value={String(applicant.last_semester ?? '-')} />
                    </td>
                    <td className="px-4">
                      <ValueText value={displayValue(applicant.graduation_date)} />
                    </td>
                    <td className="px-4 whitespace-nowrap">
                      <ValueText
                        value={
                          applicant.submitted_at ? dateTimeTextOf(applicant.submitted_at) : '-'
                        }
                      />
                    </td>
                    <td className="px-4">{APPLICATION_STATUS_LABELS[applicant.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length === 0 && (
            <div role="status" className="flex flex-col items-center gap-3 p-8 text-sm">
              {applicants.length === 0 ? (
                <p>등록된 지원자가 없습니다.</p>
              ) : (
                <p>조건에 맞는 지원자가 없습니다.</p>
              )}
            </div>
          )}
        </div>
      </section>

      {detail && (
        <ApplicantDetailModal
          applicant={detail}
          fetchAnswers={fetchAnswers}
          onClose={() => setDetail(null)}
          onMissing={handleMissing}
          // 서비스운영팀장(MASTER)은 다른 부문도 보지만 평가 메뉴는 본인 부문만 있다.
          onEvaluate={
            detail.track !== null && visibleTracks.includes(detail.track) ? onEvaluate : undefined
          }
        />
      )}
    </div>
  );
}
