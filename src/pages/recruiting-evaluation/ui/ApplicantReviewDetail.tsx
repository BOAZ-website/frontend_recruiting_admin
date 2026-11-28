import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';

import { SelectDropdown } from '@/shared/ui/SelectDropdown';

import {
  type MyEvaluationErrors,
  SCORE_SELECT_OPTIONS,
  scoreFromSelect,
} from '../model/myEvaluationForm';
import {
  type ApplicantAnswerDto,
  type ApplicantEvaluationDto,
  DECISION_LABELS,
  type EvaluationDecision,
  type EvaluatorDetailItem,
  type InterviewQuestionItem,
  SELECTABLE_DECISIONS,
  TRACK_LABELS,
} from '../model/types';
import { ApplicantAnswersSection } from './ApplicantAnswersSection';
import { ApplicantDetailModal } from './ApplicantDetailModal';
import { EvaluatorResultsTab, type OwnRowEditing } from './EvaluatorResultsTab';
import { type SegmentedTabItem, SegmentedTabs } from './SegmentedTabs';

/** 지원자 상세 오른쪽 영역의 탭. 평가 현황은 조회 전용이고, 입력은 개인 평가 탭에만 있다. */
export type ReviewDetailTab = 'review' | 'status';

/** 새로고침 뒤 답변을 보던 위치로 돌아오게 지원자 id와 스크롤 위치를 탭마다 기억한다(sessionStorage). */
const ANSWERS_SCROLL_KEY = 'boaz_recruit_answers_scroll';
/** 답변을 다 읽어 오기를 기다리는 최대 시간. 이 안에 저장한 위치까지 내려갈 수 없으면 맨 위에 둔다. */
const SCROLL_RESTORE_WAIT_MS = 3_000;

function readSavedAnswersScroll(applicantId: number): number {
  try {
    const saved = JSON.parse(sessionStorage.getItem(ANSWERS_SCROLL_KEY) ?? 'null') as {
      id?: unknown;
      top?: unknown;
    } | null;
    return saved?.id === applicantId && typeof saved.top === 'number' ? saved.top : 0;
  } catch {
    return 0;
  }
}

const DETAIL_TABS: SegmentedTabItem<ReviewDetailTab>[] = [
  { id: 'review', label: '개인 평가' },
  { id: 'status', label: '운영진 평가 현황' },
];

interface ApplicantReviewDetailProps {
  applicant: ApplicantEvaluationDto;
  /** 로그인한 평가자 id. 평가 현황에서 본인 행을 맨 위에 둘 때 쓴다. */
  currentEvaluatorId: number;
  /** 지금 보이는 탭. 지원자를 옮겨도 유지되도록 페이지가 가진다. */
  tab: ReviewDetailTab;
  onTabChange: (tab: ReviewDetailTab) => void;
  fetchAnswers: (applicantIdKey: string) => Promise<ApplicantAnswerDto[]>;
  fetchEvaluations: (applicantIdKey: string) => Promise<EvaluatorDetailItem[]>;
  fetchInterviewQuestions: (applicantIdKey: string) => Promise<InterviewQuestionItem[]>;
  /** 내 평가(REC-ADMIN-16)를 읽는 중이면 폼을 잠근다. */
  isMyEvaluationLoading: boolean;
  myEvaluationError: Error | null;
  onRetryMyEvaluation: () => void;
  /** 아직 고르지 않았으면 null. 저장할 때 판정이 없으면 필드 오류를 보여 준다. */
  decision: EvaluationDecision | null;
  /** 1~10점 중 고른 값. 고르지 않으면 null(선택 입력). */
  score: number | null;
  /** 저장을 누른 뒤 보여 줄 필드 오류. */
  errors: MyEvaluationErrors;
  memo: string;
  interview: string;
  saving: boolean;
  /** 운영진 평가 현황의 본인 행 편집. 개인 평가와 같은 초안·저장을 쓴다. */
  ownRowEditing: OwnRowEditing;
  /** 바뀌면 운영진 평가 현황을 다시 읽는다. */
  statusRefreshKey: number;
  /** 저장한 값과 다른 입력이 있는지. 다르면 저장하기 버튼을 강조한다. */
  isDirty: boolean;
  onDecision: (value: EvaluationDecision) => void;
  onScore: (value: number | null) => void;
  onMemo: (value: string) => void;
  onInterview: (value: string) => void;
  onSave: () => void;
  onBack: () => void;
  onNavigate: (direction: 'PREV' | 'NEXT') => void;
  position: number;
  total: number;
}

/**
 * 지원자 상세 전체 화면. 위에 인적사항 카드가 있고, 아래는 탭에 따라 바뀐다.
 * 개인 평가: 왼쪽 지원서 답변, 오른쪽 내 평가. 운영진 평가 현황: 전체 너비의 평가자별 표.
 */
/** 방향키를 글자 이동에 쓰는 곳(입력칸, 펼친 목록)에서는 지원자 이동을 하지 않는다. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.closest('input, textarea, select, [role="listbox"], [role="option"]') !== null
  );
}

export function ApplicantReviewDetail(p: ApplicantReviewDetailProps) {
  const a = p.applicant;

  // 키보드 ←·→로 이전·다음 지원자를 연다. 저장하지 않은 평가가 있으면 버튼과 같이 저장할지 묻는다(onNavigate).
  const navigationRef = useRef({ saving: p.saving, onNavigate: p.onNavigate });
  // 다른 지원자로 넘어가면 답변을 맨 위부터 보인다(답변은 새로 읽는 동안 앞 내용을 그대로 두어 스크롤이 남는다).
  const answersScrollRef = useRef<HTMLDivElement>(null);
  // 다른 지원자로 넘어가면 맨 위에서 시작한다. 새로고침으로 같은 지원자를 다시 열었으면 보던 위치로 돌아간다.
  // 답변은 따로 읽어 와서 처음에는 내용이 짧으므로, 저장한 위치까지 내려갈 만큼 내용이 그려지면 그때 옮긴다.
  useEffect(() => {
    const scroller = answersScrollRef.current;
    if (!scroller) return;
    const savedTop = readSavedAnswersScroll(a.id);
    if (!savedTop) {
      scroller.scrollTo({ top: 0 });
      return;
    }
    const restore = () => {
      if (scroller.scrollHeight - scroller.clientHeight < savedTop) return false;
      scroller.scrollTop = savedTop;
      return true;
    };
    if (restore()) return;
    const observer = new MutationObserver(() => {
      if (restore()) observer.disconnect();
    });
    observer.observe(scroller, { childList: true, subtree: true });
    const timer = window.setTimeout(() => observer.disconnect(), SCROLL_RESTORE_WAIT_MS);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [a.id]);
  const handleAnswersScroll = (event: React.UIEvent<HTMLDivElement>) => {
    try {
      sessionStorage.setItem(
        ANSWERS_SCROLL_KEY,
        JSON.stringify({ id: a.id, top: event.currentTarget.scrollTop }),
      );
    } catch {
      // 저장하지 못하면 새로고침 때 맨 위에서 시작한다.
    }
  };
  useEffect(() => {
    navigationRef.current = { saving: p.saving, onNavigate: p.onNavigate };
  });
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      // 키를 누르고 있어 반복되는 입력은 무시한다. 한 번 누를 때 한 명만 옮긴다(R-08).
      if (event.repeat) return;
      if (isTypingTarget(event.target) || navigationRef.current.saving) return;
      // 열린 팝업(확인 창 등)이 있으면 화면 뒤의 지원자를 바꾸지 않는다.
      if (document.querySelector('[role="dialog"]')) return;
      // 드롭다운 목록이 열려 있으면 옮기지 않는다. 포커스는 버튼에 있어 위 검사에 걸리지 않는다(R-07).
      if (document.querySelector('[role="listbox"]')) return;
      event.preventDefault();
      navigationRef.current.onNavigate(event.key === 'ArrowLeft' ? 'PREV' : 'NEXT');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 개인 평가·운영진 평가 현황 제목의 이름을 누르면 인적사항을 창으로 띄운다(답변은 빼고).
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // 내 평가를 읽는 중·실패했거나 저장 중이면 입력을 잠근다(저장 중 값이 바뀌어 다른 값이 저장되지 않게).
  const isFormLocked = p.isMyEvaluationLoading || p.myEvaluationError !== null || p.saving;
  return (
    <div className="evaluation-page evaluation-scale applicant-review">
      {/* 한 줄: 왼쪽은 개인 평가·운영진 평가 현황 밑줄 탭, 오른쪽은 순번과 이전·다음. 밑줄 선은 줄 전체에 그린다. */}
      <div className="review-tab-row">
        <button
          type="button"
          className="review-list-button"
          aria-label="지원자 목록으로"
          title="지원자 목록으로"
          disabled={p.saving}
          onClick={p.onBack}
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <SegmentedTabs
          label="지원자 상세 영역"
          items={DETAIL_TABS}
          value={p.tab}
          onChange={p.onTabChange}
          // 저장 중에는 이전·다음·목록 버튼처럼 탭도 잠근다(R-09).
          disabled={p.saving}
        />
        <div className="review-toolbar">
          <span>
            {p.position} / {p.total}
          </span>
          <button
            className="review-nav-button"
            disabled={p.saving}
            onClick={() => p.onNavigate('PREV')}
            aria-label="이전 지원자"
            title="이전 지원자 (←)"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <button
            className="review-nav-button"
            disabled={p.saving}
            onClick={() => p.onNavigate('NEXT')}
            aria-label="다음 지원자"
            title="다음 지원자 (→)"
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      {/* 운영진 평가 현황은 아래 영역 전체 너비를 쓴다. 개인 평가 영역은 입력값이 남도록 숨기기만 한다. */}
      {p.tab === 'status' && (
        <EvaluatorResultsTab
          applicantId={a.id}
          currentEvaluatorId={p.currentEvaluatorId}
          fetchEvaluations={p.fetchEvaluations}
          fetchInterviewQuestions={p.fetchInterviewQuestions}
          refreshKey={p.statusRefreshKey}
          editing={p.ownRowEditing}
          applicantName={a.name}
          trackLabel={TRACK_LABELS[a.track]}
          onOpenProfile={() => setIsProfileOpen(true)}
        />
      )}
      <div className="review-layout" hidden={p.tab !== 'review'}>
        {/* 답변과 내 평가는 제목을 남긴 채 각자 스크롤한다. tabIndex로 키보드로도 스크롤 영역에 들어간다. */}
        <article
          className="review-paper review-scroll-panel"
          aria-labelledby="review-answers-title"
        >
          {/* 제목은 지원자 이름이다. 운영진 평가 현황처럼 누르면 인적사항 창이 뜬다. */}
          <h2 id="review-answers-title" className="review-section-title review-status-name">
            <button
              type="button"
              className="review-name-button"
              data-tip="인적사항 보기"
              aria-haspopup="dialog"
              onClick={() => setIsProfileOpen(true)}
            >
              {a.name}
            </button>
            <span className="review-tag">{TRACK_LABELS[a.track]}</span>
          </h2>
          <div
            ref={answersScrollRef}
            className="review-scroll"
            tabIndex={0}
            aria-labelledby="review-answers-title"
            onScroll={handleAnswersScroll}
          >
            <ApplicantAnswersSection
              applicantId={a.id}
              fetchAnswers={p.fetchAnswers}
              missingAction={{ label: '목록으로 돌아가기', onClick: p.onBack }}
              deniedAction={{ label: '목록으로 돌아가기', onClick: p.onBack }}
            />
          </div>
        </article>
        <aside className="review-aside">
          {/* 위 탭이 '개인 평가'라 카드 안 제목은 두지 않는다. */}
          <form
            className="review-panel review-scroll-panel"
            aria-label="개인 평가"
            onSubmit={(e) => {
              e.preventDefault();
              p.onSave();
            }}
          >
            <div className="review-scroll" tabIndex={0} aria-label="개인 평가 입력">
              {/* 읽는 동안은 입력이 잠겨 흐려진다. 안내 줄을 끼워 넣으면 입력칸이 밀려 화면이 튀어 화면 읽기 프로그램에만 알린다. */}
              {p.isMyEvaluationLoading && (
                <p role="status" className="sr-only">
                  평가를 불러오는 중입니다.
                </p>
              )}
              {p.myEvaluationError && (
                <div role="alert">
                  <p>평가를 불러오지 못했습니다.</p>
                  <button type="button" onClick={p.onRetryMyEvaluation}>
                    다시 시도
                  </button>
                </div>
              )}
              <fieldset disabled={isFormLocked} className="contents">
                <span className="review-label">점수</span>
                <div className="review-score">
                  <SelectDropdown
                    ariaLabel="점수"
                    value={p.score === null ? '' : String(p.score)}
                    options={SCORE_SELECT_OPTIONS}
                    disabled={isFormLocked}
                    onChange={(score) => p.onScore(scoreFromSelect(score))}
                    buttonClassName="h-8 w-20 text-left"
                  />
                  <span>/ 10</span>
                </div>
                {/* 점수는 목록에서만 골라 오류가 거의 나지 않아, 문구가 생길 때만 자리를 차지한다. */}
                {p.errors.score && (
                  <p id="review-score-error" role="alert" className="review-field-error">
                    {p.errors.score}
                  </p>
                )}
                <span className="review-label" id="review-decision-label">
                  평가
                </span>
                <div
                  className="review-choices"
                  role="group"
                  aria-labelledby="review-decision-label"
                  aria-describedby={p.errors.decision ? 'review-decision-error' : undefined}
                >
                  {SELECTABLE_DECISIONS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={p.decision === d}
                      // 판정별 색(review-design.css)을 고르는 표시다.
                      data-decision={d}
                      // 고른 버튼을 다시 눌러도 해제하지 않는다. 판정은 셋 중 하나를 반드시 고른다.
                      onClick={() => p.onDecision(d)}
                    >
                      {DECISION_LABELS[d]}
                    </button>
                  ))}
                </div>
                {/* 판정 오류 문구 자리는 늘 비워 둔다. 문구가 떠도 아래 칸이 밀리지 않는다. */}
                <p
                  id="review-decision-error"
                  role="alert"
                  className="review-field-error review-field-slot"
                >
                  {p.errors.decision}
                </p>
                <label className="review-label" htmlFor="review-memo">
                  평가 의견
                </label>
                <textarea
                  id="review-memo"
                  value={p.memo}
                  onChange={(e) => p.onMemo(e.target.value)}
                  placeholder="판단의 근거가 된 답변과 의견을 남겨주세요."
                />
                <label className="review-label" htmlFor="review-interview">
                  면접 추천 질문
                </label>
                <textarea
                  id="review-interview"
                  value={p.interview}
                  onChange={(e) => p.onInterview(e.target.value)}
                  placeholder="면접에서 확인하고 싶은 내용을 질문으로 남겨주세요."
                />
              </fieldset>
            </div>
            <button
              className={`review-submit ${p.isDirty ? 'is-dirty' : ''}`}
              type="submit"
              disabled={!p.isDirty || p.saving || isFormLocked}
            >
              {p.saving ? '저장 중…' : '저장하기'}
            </button>
          </form>
        </aside>
      </div>
      {isProfileOpen && (
        <ApplicantDetailModal
          applicant={a}
          fetchAnswers={p.fetchAnswers}
          onClose={() => setIsProfileOpen(false)}
          onMissing={p.onBack}
          withAnswers={false}
        />
      )}
    </div>
  );
}
