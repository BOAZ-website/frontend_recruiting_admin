import { useEffect, useRef, useState } from 'react';

import type { AuthSession } from '@/entities/auth/model/types';
import { TRACK_IMAGE_BY_CODE } from '@/entities/user/model/trackImage';
import { registerLeaveGuard } from '@/shared/lib/leaveGuard';
import { Toast, type ToastMessage } from '@/shared/ui/Toast';

import {
  canViewAllApplicants,
  canWriteFinalDecisionOf,
  DEFAULT_REVIEW_QUERY,
  filterReviewList,
  type ReviewListQuery,
  visibleTracksOf,
} from '../model/applicantList';
import {
  DISCARD_UNDECIDED_EVALUATION_MESSAGE,
  draftFromMyEvaluation,
  draftFromSaveInput,
  EMPTY_DRAFT,
  isDraftChanged,
  lengthLimitMessageOf,
  type MyEvaluationDraft,
  saveFailureNoticeOf,
  toSaveInput,
  UNSAVED_EVALUATION_MESSAGE,
  validateMyEvaluation,
} from '../model/myEvaluationForm';
import { FINAL_DECISION_SAVED_MESSAGE, finalDecisionFailureNoticeOf } from '../model/finalDecision';
import {
  type ApplicantEvaluationDto,
  type EvaluationDecision,
  type EvaluationTab,
  type MyEvaluationInput,
  TRACK_LABELS,
  type TrackType,
} from '../model/types';
import { useEvaluationData } from '../model/useEvaluationData';
import { ApplicantReviewDetail, type ReviewDetailTab } from './ApplicantReviewDetail';
import { ApplicantsOverview } from './ApplicantsOverview';
import { MyEvaluationList } from './MyEvaluationList';

/** 제목은 상단 메뉴 이름과 같다. */
const MAIN_TAB_TITLES: Record<EvaluationTab, string> = {
  applicants: '전체 지원 현황',
  my: '서류 평가',
};

interface EvaluationManagePageProps {
  /** 보는 모집 공고. 바뀌면 App이 화면을 key로 새로 만든다. */
  recruitmentId: number;
  /** 로그인한 운영진. 평가자 id, 볼 부문, 최종 평가 수정 가능 여부를 정한다. */
  account: AuthSession;
  initialTab?: EvaluationTab;
  /** 서류 평가 목록(my)이 보여 줄 부문. 상단의 부문 메뉴가 정한다. */
  track: TrackType;
  /** 그 부문의 서류 평가 메뉴로 옮긴다(전체 지원 현황의 "평가"). */
  onOpenTrack: (track: TrackType) => void;
  /** 상단 메뉴를 누를 때마다 바뀐다. 바뀌면 지원자 상세를 닫고 목록으로 돌아간다. */
  listRequest?: number;
}

// 새로고침 뒤 되살릴 평가 화면. 브라우저 탭을 닫으면 사라진다(sessionStorage).
const DETAIL_KEY = 'boaz_recruit_detail';

interface SavedDetail {
  recruitmentId: number;
  applicantId: number;
  tab: ReviewDetailTab;
  queue: number[];
}

function readSavedDetail(): SavedDetail | null {
  try {
    const raw = sessionStorage.getItem(DETAIL_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const v = value as Partial<SavedDetail>;
    if (
      typeof v.recruitmentId !== 'number' ||
      typeof v.applicantId !== 'number' ||
      (v.tab !== 'review' && v.tab !== 'status') ||
      !Array.isArray(v.queue) ||
      !v.queue.every((id) => typeof id === 'number')
    ) {
      return null;
    }
    return v as SavedDetail;
  } catch {
    return null;
  }
}

function writeSavedDetail(detail: SavedDetail | null) {
  try {
    if (detail) sessionStorage.setItem(DETAIL_KEY, JSON.stringify(detail));
    else sessionStorage.removeItem(DETAIL_KEY);
  } catch {
    // 저장하지 못하면 새로고침 때 목록에서 시작한다.
  }
}

/** 전체 지원 현황과 부문별 서류 평가를 같은 데이터로 그린다. 데이터 접근은 useEvaluationData Hook만 거친다. */
export function EvaluationManagePage({
  recruitmentId,
  account,
  initialTab = 'applicants',
  track,
  onOpenTrack,
  listRequest = 0,
}: EvaluationManagePageProps) {
  const [mainTab, setMainTab] = useState<EvaluationTab>(initialTab);

  const {
    applicants,
    currentEvaluatorId,
    fetchApplicants,
    fetchAnswers,
    fetchEvaluations,
    fetchInterviewQuestions,
    fetchMyEvaluation,
    saveMyEvaluation,
    updateFinalDecision,
    pendingFinalDecisions,
  } = useEvaluationData(recruitmentId, account.adminId);
  const canWriteFinalDecision = canWriteFinalDecisionOf(account, track);

  // 부문별 서류 평가 목록의 검색·필터·정렬. 상세에서 목록으로 돌아오거나 다른 부문에 다녀와도 남도록 여기서 가진다.
  const [reviewQueries, setReviewQueries] = useState<Record<TrackType, ReviewListQuery>>({
    ANALYSIS: DEFAULT_REVIEW_QUERY,
    VISUALIZATION: DEFAULT_REVIEW_QUERY,
    ENGINEERING: DEFAULT_REVIEW_QUERY,
  });

  // 지원자 상세와 그 탭. 탭은 이전·다음으로 다른 지원자를 열어도 유지한다.
  const [selectedApplicant, setSelectedApplicant] = useState<ApplicantEvaluationDto | null>(null);
  const [modalTab, setModalTab] = useState<ReviewDetailTab>('review');

  // 내 평가 입력 초안과 마지막으로 불러오거나 저장한 값. 둘이 다르면 저장하지 않은 수정이 있다.
  // 내 평가가 없으면 빈 폼이다(명세 §4.4, 판정·점수 기본값 없음).
  const [draft, setDraft] = useState<MyEvaluationDraft>(EMPTY_DRAFT);
  const [savedDraft, setSavedDraft] = useState<MyEvaluationDraft>(EMPTY_DRAFT);
  // 저장을 한 번 눌러 검증에 걸린 뒤부터 필드 오류를 보여 준다(§7.4).
  const [showDraftErrors, setShowDraftErrors] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // 진행 중인 개인 평가 저장. 끝나면 null이다.
  const savingRef = useRef<Promise<boolean> | null>(null);
  // 운영진 평가 현황에서 본인 행 편집을 시작하기 직전의 초안. 행 편집을 취소하면 저장값이 아니라 이 값으로 돌린다(R-01).
  const rowEditBaseRef = useRef<MyEvaluationDraft | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const isDraftDirty = selectedApplicant !== null && isDraftChanged(draft, savedDraft);
  const draftErrors = showDraftErrors ? validateMyEvaluation(draft) : {};
  // 내 평가(REC-ADMIN-16)를 읽는 중인지와 실패 오류. 늦게 온 옛 응답은 openRequestRef로 버린다.
  const [isMyEvaluationLoading, setIsMyEvaluationLoading] = useState(false);
  const [myEvaluationError, setMyEvaluationError] = useState<Error | null>(null);
  const openRequestRef = useRef(0);
  // 평가 화면의 이전·다음 이동 순서(지원서 id). 화면을 연 목록의 필터·정렬 순서를 따른다.
  const [reviewQueue, setReviewQueue] = useState<number[]>([]);
  // 내 평가를 저장할 때마다 올린다. 운영진 평가 현황이 다시 읽어 집계·행을 맞춘다.
  const [statusRefreshKey, setStatusRefreshKey] = useState(0);

  useEffect(() => {
    if (initialTab) {
      setMainTab(initialTab);
    }
  }, [initialTab]);

  // 상단 메뉴로 옮기면(같은 메뉴 재클릭 포함) 상세와 입력 초안을 버린다. 이동 확인은 App이 이미 했다.
  // 읽는 중인 내 평가 응답은 요청 번호를 올려 버린다. 화면을 key로 새로 만들지 않아 검색·필터 조건을 남긴다.
  const handledListRequestRef = useRef(listRequest);
  useEffect(() => {
    if (listRequest === handledListRequestRef.current) return;
    handledListRequestRef.current = listRequest;
    openRequestRef.current += 1;
    setSelectedApplicant(null);
    setReviewQueue([]);
    setDraft(EMPTY_DRAFT);
    setSavedDraft(EMPTY_DRAFT);
    setShowDraftErrors(false);
    setMyEvaluationError(null);
    setIsMyEvaluationLoading(false);
    setToast(null);
  }, [listRequest]);

  /**
   * 저장하지 않은 평가가 없으면 바로 옮긴다.
   * 판정을 아직 고르지 않았으면 저장할 수 없으니(백엔드에 보내지 않는다) 저장하지 않고 나갈지 묻는다. 확인이면 입력을 버리고 옮기고, 취소면 머문다.
   * 그 밖에는 저장할지 묻는다. 확인이면 저장에 성공한 뒤 옮기고, 실패하면 오류를 보인 채 머문다. 취소면 저장하지 않고 옮긴다.
   */
  const leaveAfterSave = async (proceed: () => void) => {
    if (!isDraftDirty) return proceed();
    if (draft.decision === null) {
      if (window.confirm(DISCARD_UNDECIDED_EVALUATION_MESSAGE)) proceed();
      return;
    }
    if (!window.confirm(UNSAVED_EVALUATION_MESSAGE)) return proceed();
    if (await handleSaveMyEvaluation()) proceed();
  };

  // 저장하지 않은 평가가 있으면 상단 메뉴로 다른 메뉴에 갈 때도 목록 버튼과 같이 묻는다(§4.5).
  // 일단 머물고(false), 저장에 성공하면 App이 넘긴 proceed로 누른 메뉴에 옮긴다. 취소·실패면 입력을 둔 채 머문다.
  // 저장이 진행 중이면(어디서 시작했든) 묻지 않고 누른 메뉴만 기억해, 그 저장이 성공하면 마지막에 누른 메뉴로 옮긴다.
  const leaveAfterSaveRef = useRef(leaveAfterSave);
  useEffect(() => {
    leaveAfterSaveRef.current = leaveAfterSave;
  });
  const pendingLeaveRef = useRef<(() => void) | null>(null);
  useEffect(
    () =>
      isDraftDirty
        ? registerLeaveGuard((proceed) => {
            const isWaiting = pendingLeaveRef.current !== null;
            pendingLeaveRef.current = proceed;
            if (isWaiting) return false;
            const goToPendingMenu = () => pendingLeaveRef.current?.();
            const saving = savingRef.current;
            const leaving = saving
              ? saving.then((saved) => {
                  if (saved) goToPendingMenu();
                })
              : leaveAfterSaveRef.current(goToPendingMenu);
            void leaving.finally(() => {
              pendingLeaveRef.current = null;
            });
            return false;
          })
        : undefined,
    [isDraftDirty],
  );

  // 저장하지 않은 평가가 있으면 새로고침·탭 닫기·주소 이동 전에 브라우저가 한 번 묻는다(문구는 브라우저가 정한다).
  useEffect(() => {
    if (!isDraftDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDraftDirty]);

  const showToast = (message: string, tone: ToastMessage['tone']) =>
    setToast({ id: Date.now(), message, tone });

  // 평가 화면을 열고 내 평가(REC-ADMIN-16)를 읽어 폼을 채운다. 없으면(null) 빈 폼으로 둔다.
  async function handleOpenModal(
    app: ApplicantEvaluationDto,
    tab: ReviewDetailTab,
    queueIds: number[],
  ) {
    const requestId = ++openRequestRef.current;
    // 앞 지원자의 알림(저장 완료 등)이 다음 지원자 화면에 남으면 헷갈리므로 닫는다.
    setToast(null);
    setSelectedApplicant(app);
    setModalTab(tab);
    setReviewQueue(queueIds);
    setDraft(EMPTY_DRAFT);
    setSavedDraft(EMPTY_DRAFT);
    setShowDraftErrors(false);
    setMyEvaluationError(null);
    setIsMyEvaluationLoading(true);
    try {
      const loaded = draftFromMyEvaluation(await fetchMyEvaluation(app.id));
      if (requestId !== openRequestRef.current) return;
      setDraft(loaded);
      setSavedDraft(loaded);
    } catch (error) {
      if (requestId !== openRequestRef.current) return;
      setMyEvaluationError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      if (requestId === openRequestRef.current) setIsMyEvaluationLoading(false);
    }
  }

  // 새로고침해도 보던 평가 화면(지원자·탭·이전·다음 순서)으로 돌아오게 브라우저 탭마다 기억한다.
  // 지원자 목록을 처음 읽은 뒤 한 번만 되살리고, 그 전에는 기억한 값을 지우지 않는다.
  const openModalRef = useRef(handleOpenModal);
  useEffect(() => {
    openModalRef.current = handleOpenModal;
  });
  const isDetailRestoredRef = useRef(false);
  useEffect(() => {
    if (isDetailRestoredRef.current || applicants.length === 0) return;
    isDetailRestoredRef.current = true;
    const saved = readSavedDetail();
    if (!saved || saved.recruitmentId !== recruitmentId) return;
    const app = applicants.find((item) => item.id === saved.applicantId);
    if (app) void openModalRef.current(app, saved.tab, saved.queue);
  }, [applicants, recruitmentId]);
  useEffect(() => {
    if (!isDetailRestoredRef.current) return;
    writeSavedDetail(
      selectedApplicant
        ? { recruitmentId, applicantId: selectedApplicant.id, tab: modalTab, queue: reviewQueue }
        : null,
    );
  }, [recruitmentId, selectedApplicant, modalTab, reviewQueue]);

  // 브라우저 뒤로 가기(마우스패드 쓸어 넘기기 포함)로 평가 화면에서 목록으로 돌아가게 한다.
  // 평가 화면을 열 때 방문 기록을 하나 쌓고, 화면 안 버튼·메뉴로 닫으면 그 기록을 되돌린다.
  const isDetailOpen = selectedApplicant !== null;
  // 늦게 온 저장 응답이 지금 다른 지원자 화면인지 목록인지 알 수 있게 둔다.
  const isDetailOpenRef = useRef(isDetailOpen);
  useEffect(() => {
    isDetailOpenRef.current = isDetailOpen;
  }, [isDetailOpen]);
  useEffect(() => {
    const isDetailEntry = (window.history.state as { recruitDetail?: boolean } | null)
      ?.recruitDetail;
    if (isDetailOpen && !isDetailEntry) window.history.pushState({ recruitDetail: true }, '');
    if (!isDetailOpen && isDetailEntry) window.history.back();
  }, [isDetailOpen]);
  useEffect(() => {
    if (!isDetailOpen) return;
    const handlePopState = () => {
      let hasLeft = false;
      void leaveAfterSaveRef
        .current(() => {
          hasLeft = true;
          closeDetail();
        })
        .then(() => {
          // 저장 확인에서 취소하거나 저장에 실패하면 평가 화면에 남으므로 기록을 다시 쌓는다.
          if (!hasLeft) window.history.pushState({ recruitDetail: true }, '');
        });
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isDetailOpen]);

  // 서류 평가 목록에서 지원자를 고르면 그 목록 순서로 평가 화면을 연다.
  function handleOpenFromMyList(applicantId: number, orderedIds: number[]) {
    const app = applicants.find((item) => item.id === applicantId);
    if (app) void handleOpenModal(app, 'review', orderedIds);
  }

  // 전체 지원 현황 상세의 "평가": 그 지원자 부문의 서류 평가 메뉴로 옮기고 평가 화면을 연다.
  function handleEvaluateFromOverview(applicantId: number) {
    const app = applicants.find((item) => item.id === applicantId);
    if (!app || app.status !== 'SUBMITTED') return;
    onOpenTrack(app.track);
    // 이전·다음은 그 부문 서류 평가 목록의 기본 순서(제출 완료, 제출일 최신순)를 따른다.
    const defaultOrder = filterReviewList(applicants, {
      ...DEFAULT_REVIEW_QUERY,
      track: app.track,
    }).map((item) => item.id);
    void handleOpenModal(app, 'review', defaultOrder);
  }

  // 평가 화면의 이전·다음 이동. 화면을 연 목록 순서(reviewQueue)를 따르고, 양 끝에서는 물어본 뒤 반대쪽 끝으로 간다.
  function handleNavigateModal(direction: 'PREV' | 'NEXT') {
    if (!selectedApplicant) {
      return;
    }
    const curIdx = reviewQueue.indexOf(selectedApplicant.id);
    if (curIdx === -1) {
      return;
    }
    const step = direction === 'PREV' ? -1 : 1;
    // 처음에서 이전, 끝에서 다음을 누르면 반대쪽 끝으로 넘어간다. 실수로 넘어가지 않게 먼저 묻는다.
    const isWrapping =
      reviewQueue.length > 1 &&
      ((direction === 'PREV' && curIdx === 0) ||
        (direction === 'NEXT' && curIdx === reviewQueue.length - 1));
    if (
      isWrapping &&
      !window.confirm(
        direction === 'PREV'
          ? '첫 번째 지원자입니다. 맨 마지막 지원자로 갈까요?'
          : '마지막 지원자입니다. 맨 처음 지원자로 갈까요?',
      )
    ) {
      return;
    }
    const nextId = reviewQueue[(curIdx + step + reviewQueue.length) % reviewQueue.length];
    const nextApp = applicants.find((item) => item.id === nextId);
    if (nextApp) void leaveAfterSave(() => void handleOpenModal(nextApp, modalTab, reviewQueue));
  }

  // 평가 화면에서 목록으로 돌아간다. 저장하지 않은 평가가 있으면 먼저 저장할지 묻는다.
  function handleBackToList() {
    void leaveAfterSave(closeDetail);
  }

  // 평가 화면을 닫는다. 요청 번호를 올려, 진행 중인 저장·읽기 응답이 닫은 화면을 다시 열지 않게 한다.
  function closeDetail() {
    openRequestRef.current += 1;
    setSelectedApplicant(null);
  }

  // 개인 평가 저장(MY-07). 검증 → 저장 → 결과 안내 순서이고, 실패해도 입력은 그대로 둔다(§4.5).
  // 데이터 변경은 Hook(saveMyEvaluation)이 맡고, 여기서는 화면 상태와 안내만 다룬다.
  // 성공하면 true. 저장하지 않고 옮기려 할 때(leaveAfterSave·상단 메뉴)도 이 함수로 저장한다.
  async function handleSaveMyEvaluation(): Promise<boolean> {
    // state(isSaving)는 다음 렌더까지 바뀌지 않으므로, 연달아 누른 저장은 savingRef로 먼저 막는다.
    if (!selectedApplicant || savingRef.current || isSaving) {
      return false;
    }
    const input = toSaveInput(draft);
    if (!input || Object.keys(validateMyEvaluation(draft)).length > 0) {
      setShowDraftErrors(true);
      return false;
    }
    // 의견·질문이 한도를 넘으면 저장 요청을 보내지 않고 알림 창으로만 알린다. 입력은 그대로 둔다(R-03, R-15).
    const lengthMessage = lengthLimitMessageOf(draft);
    if (lengthMessage) {
      window.alert(lengthMessage);
      return false;
    }
    // 진행 중인 저장을 남겨 둔다. 저장 중 상단 메뉴를 누르면 새로 저장하지 않고 이 결과를 따른다.
    const saving = submitMyEvaluation(selectedApplicant, input, draft);
    savingRef.current = saving;
    return saving;
  }

  async function submitMyEvaluation(
    applicant: ApplicantEvaluationDto,
    input: MyEvaluationInput,
    draftAtSubmit: MyEvaluationDraft,
  ): Promise<boolean> {
    // 저장 중 메뉴를 옮기거나 목록으로 돌아가면 요청 번호가 바뀐다. 그때는 저장 결과로 닫힌 상세를 다시 열지 않는다.
    const requestId = openRequestRef.current;
    setIsSaving(true);
    try {
      // 저장 전 서버에 있던 내 평가(savedDraft)를 넘겨, 목록 전체를 다시 받지 않고 이 지원자 집계만 고친다.
      const updatedApplicant = await saveMyEvaluation(
        applicant,
        { decision: savedDraft.decision, score: savedDraft.score },
        input,
      );
      // 목록 데이터는 Hook이 이미 고쳤다. 화면을 떠났으면 상세는 다시 열지 않는다.
      // 저장 완료 알림은 같은 지원자를 보고 있거나 목록으로 돌아갔을 때만 띄운다(다른 지원자 화면에서는 헷갈린다).
      const isSameDetail = requestId === openRequestRef.current;
      if (isSameDetail || !isDetailOpenRef.current) showToast('평가가 저장되었습니다.', 'success');
      setStatusRefreshKey((key) => key + 1);
      if (!isSameDetail) return false;
      setSelectedApplicant(updatedApplicant);
      // 저장 기준은 실제로 보낸 값이다(R-02). 저장 중에는 입력이 잠겨 초안이 그대로면 보낸 값으로 맞추고,
      // 그래도 바뀐 입력이 있으면 저장하지 않은 수정으로 남긴다.
      const sent = draftFromSaveInput(input);
      setSavedDraft(sent);
      setDraft((current) => (isDraftChanged(current, draftAtSubmit) ? current : sent));
      setShowDraftErrors(false);
      return true;
    } catch (error) {
      // 서버 저장 실패는 토스트로 알린다(C-05). 입력은 그대로 두고 같은 저장 버튼으로 다시 시도한다.
      const notice = saveFailureNoticeOf(error, applicant.status);
      showToast(notice.message, 'error');
      if (notice.leave && requestId === openRequestRef.current) setSelectedApplicant(null);
      return false;
    } finally {
      setIsSaving(false);
      savingRef.current = null;
    }
  }

  // 지원자별 최종 판정 저장(GROUP-08). 데이터 변경은 Hook이 맡고, 여기서는 결과 안내만 한다.
  async function handleSaveFinalDecision(
    applicant: ApplicantEvaluationDto,
    decision: EvaluationDecision,
  ): Promise<boolean> {
    try {
      await updateFinalDecision(applicant.id, decision);
      showToast(FINAL_DECISION_SAVED_MESSAGE, 'success');
      return true;
    } catch (error) {
      const notice = finalDecisionFailureNoticeOf(error, applicant.status);
      showToast(notice.message, 'error');
      return false;
    }
  }

  const toastNode = <Toast toast={toast} onClose={() => setToast(null)} />;
  if (selectedApplicant)
    return (
      <>
        <ApplicantReviewDetail
          applicant={selectedApplicant}
          currentEvaluatorId={currentEvaluatorId}
          tab={modalTab}
          onTabChange={(tab) => {
            // 저장 중에는 탭을 옮기지 않는다(R-09). 버튼도 잠기지만 같은 렌더에 연달아 누른 경우까지 막는다.
            if (savingRef.current) return;
            // 개인 평가·운영진 평가 현황을 오가면 앞 화면의 알림(저장 완료 등)은 닫는다.
            setToast(null);
            setModalTab(tab);
          }}
          fetchAnswers={fetchAnswers}
          fetchEvaluations={fetchEvaluations}
          fetchInterviewQuestions={fetchInterviewQuestions}
          isMyEvaluationLoading={isMyEvaluationLoading}
          myEvaluationError={myEvaluationError}
          onRetryMyEvaluation={() => void handleOpenModal(selectedApplicant, modalTab, reviewQueue)}
          decision={draft.decision}
          score={draft.score}
          memo={draft.memo}
          interview={draft.interview_question}
          errors={draftErrors}
          saving={isSaving}
          isDirty={isDraftDirty}
          // 본인 행 편집은 개인 평가 탭과 같은 초안을 쓴다. 탭을 오가도 입력이 남으므로 편집을 시작할 때 묻지 않는다.
          ownRowEditing={{
            draft,
            saving: isSaving,
            locked: isMyEvaluationLoading || myEvaluationError !== null,
            onChange: (patch) => setDraft((current) => ({ ...current, ...patch })),
            onStart: () => {
              rowEditBaseRef.current = draft;
              return true;
            },
            isDirty: isDraftDirty,
            // 행 편집만 취소한다. 개인 평가 탭에서 쓰던 미저장 입력은 편집 시작 직전 값으로 남는다(R-01).
            onCancel: () => {
              setDraft(rowEditBaseRef.current ?? savedDraft);
              setShowDraftErrors(false);
            },
            onSave: handleSaveMyEvaluation,
          }}
          statusRefreshKey={statusRefreshKey}
          onDecision={(decision) => setDraft((current) => ({ ...current, decision }))}
          onScore={(score) => setDraft((current) => ({ ...current, score }))}
          onMemo={(memo) => setDraft((current) => ({ ...current, memo }))}
          onInterview={(interview_question) =>
            setDraft((current) => ({ ...current, interview_question }))
          }
          onSave={() => void handleSaveMyEvaluation()}
          onBack={handleBackToList}
          onNavigate={handleNavigateModal}
          position={reviewQueue.indexOf(selectedApplicant.id) + 1}
          total={reviewQueue.length}
        />
        {toastNode}
      </>
    );
  return (
    // evaluation-scale: 서류 평가 관리 화면 공통 크기·여백 규칙(review-design.css 맨 아래, docs/screens/03-evaluation-layout.md)
    <div className="evaluation-page evaluation-scale space-y-6">
      {toastNode}
      {/* 화면 전환은 상단 메뉴가 맡는다. */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/80">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900">
          {/* 서류 평가는 제목 앞에 부문 캐릭터를 둔다. 전체 지원 현황은 그림 없이 제목만 둔다. */}
          {mainTab === 'my' && (
            <img
              src={TRACK_IMAGE_BY_CODE[track]}
              alt=""
              width={28}
              height={28}
              className="size-7 object-contain"
            />
          )}
          {mainTab === 'my'
            ? `${TRACK_LABELS[track]} ${MAIN_TAB_TITLES.my}`
            : MAIN_TAB_TITLES[mainTab]}
        </h1>
      </div>

      {mainTab === 'applicants' && (
        <ApplicantsOverview
          fetchApplicants={fetchApplicants}
          fetchAnswers={fetchAnswers}
          onEvaluate={handleEvaluateFromOverview}
          visibleTracks={visibleTracksOf(account)}
          canViewAllApplicants={canViewAllApplicants(account)}
        />
      )}

      {mainTab === 'my' && (
        <MyEvaluationList
          fetchApplicants={fetchApplicants}
          track={track}
          query={reviewQueries[track]}
          onQueryChange={(query) => setReviewQueries((current) => ({ ...current, [track]: query }))}
          onOpen={handleOpenFromMyList}
          canWriteFinalDecision={canWriteFinalDecision}
          onSaveFinalDecision={handleSaveFinalDecision}
          pendingFinalDecisions={pendingFinalDecisions}
        />
      )}
    </div>
  );
}
