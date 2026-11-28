/**
 * 로그인이 만료돼 화면이 닫힐 때 저장하지 않은 평가 초안을 남겼다가, 같은 탭에서 같은 계정으로 다시 로그인하면 되살린다.
 *   · 세션이 정말 끝났을 때만 남긴다. 새로고침·평소 이동에서는 남기지 않아 기존 이탈 확인 흐름이 그대로다.
 *   · 계정 id·공고 id·지원서 id가 모두 같을 때만 꺼낸다. 다른 계정에는 보이지도 보내지도 않는다.
 *   · 꺼내면 저장소에서 지운다. 서버에는 자동으로 저장하지 않고, 사용자가 저장 버튼을 눌러야 저장한다.
 *   · 탭 저장소(sessionStorage)라 탭을 닫으면 사라진다. 비밀번호·토큰은 담지 않는다.
 */
import type { MyEvaluationDraft } from './myEvaluationForm';

export const RECOVERED_DRAFTS_KEY = 'boaz_recruit_drafts';

export interface DraftSnapshot {
  adminId: number;
  recruitmentId: number;
  applicantId: number;
  draft: MyEvaluationDraft;
}

const keyOf = ({ adminId, recruitmentId, applicantId }: Omit<DraftSnapshot, 'draft'>) =>
  `${adminId}:${recruitmentId}:${applicantId}`;

function readAll(): Record<string, MyEvaluationDraft> {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(RECOVERED_DRAFTS_KEY) ?? '{}');
    return value && typeof value === 'object' ? (value as Record<string, MyEvaluationDraft>) : {};
  } catch {
    return {};
  }
}

function writeAll(drafts: Record<string, MyEvaluationDraft>) {
  try {
    if (Object.keys(drafts).length) {
      sessionStorage.setItem(RECOVERED_DRAFTS_KEY, JSON.stringify(drafts));
    } else {
      sessionStorage.removeItem(RECOVERED_DRAFTS_KEY);
    }
  } catch {
    // 저장소를 쓸 수 없으면 되살리지 못할 뿐이다.
  }
}

const isDraft = (value: unknown): value is MyEvaluationDraft => {
  const draft = value as Partial<MyEvaluationDraft> | null;
  return (
    typeof draft === 'object' &&
    draft !== null &&
    (draft.decision === null || typeof draft.decision === 'string') &&
    (draft.score === null || typeof draft.score === 'number') &&
    typeof draft.memo === 'string' &&
    typeof draft.interview_question === 'string'
  );
};

// 지금 열린 평가 화면의 미저장 초안을 돌려주는 함수. 평가 화면이 등록하고, 세션이 끝날 때 App이 부른다.
let snapshotOf: (() => DraftSnapshot | null) | null = null;

/** 미저장 초안을 돌려주는 함수를 등록한다. 돌려준 함수를 부르면 등록을 푼다. */
export function registerDraftSnapshot(provider: () => DraftSnapshot | null): () => void {
  snapshotOf = provider;
  return () => {
    if (snapshotOf === provider) snapshotOf = null;
  };
}

/** 세션이 끝날 때 부른다. 열린 화면에 미저장 초안이 있으면 남긴다. */
export function keepDraftForRelogin(): void {
  const snapshot = snapshotOf?.();
  if (!snapshot) return;
  writeAll({ ...readAll(), [keyOf(snapshot)]: snapshot.draft });
}

/** 같은 계정·공고·지원서의 남긴 초안을 꺼낸다(꺼내면 지운다). 없으면 null. */
export function takeRecoveredDraft(target: Omit<DraftSnapshot, 'draft'>): MyEvaluationDraft | null {
  const drafts = readAll();
  const draft = drafts[keyOf(target)];
  if (draft === undefined) return null;
  delete drafts[keyOf(target)];
  writeAll(drafts);
  return isDraft(draft) ? draft : null;
}

/** 정상 로그아웃 때 남긴 초안을 모두 지운다. */
export function forgetRecoveredDrafts(): void {
  writeAll({});
}
