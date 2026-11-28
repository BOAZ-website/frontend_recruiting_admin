// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import {
  forgetRecoveredDrafts,
  keepDraftForRelogin,
  RECOVERED_DRAFTS_KEY,
  registerDraftSnapshot,
  takeRecoveredDraft,
} from './draftRecovery';

const draft = { decision: 'PASS' as const, score: 7, memo: '쓰던 의견', interview_question: '' };
const target = { adminId: 7, recruitmentId: 3, applicantId: 11 };

beforeEach(() => sessionStorage.clear());

describe('로그인 만료 뒤 초안 복구', () => {
  it('세션이 끝날 때 열린 화면의 미저장 초안만 남기고, 같은 계정·공고·지원서에서 한 번 꺼낸다', () => {
    const unregister = registerDraftSnapshot(() => ({ ...target, draft }));
    keepDraftForRelogin();
    unregister();

    expect(takeRecoveredDraft({ ...target, adminId: 8 })).toBeNull();
    expect(takeRecoveredDraft({ ...target, recruitmentId: 4 })).toBeNull();
    expect(takeRecoveredDraft(target)).toEqual(draft);
    // 꺼내면 지운다.
    expect(takeRecoveredDraft(target)).toBeNull();
    expect(sessionStorage.getItem(RECOVERED_DRAFTS_KEY)).toBeNull();
  });

  it('미저장 초안이 없으면 아무것도 남기지 않는다', () => {
    const unregister = registerDraftSnapshot(() => null);
    keepDraftForRelogin();
    unregister();
    expect(sessionStorage.getItem(RECOVERED_DRAFTS_KEY)).toBeNull();
  });

  it('정상 로그아웃 때 모두 지운다', () => {
    const unregister = registerDraftSnapshot(() => ({ ...target, draft }));
    keepDraftForRelogin();
    unregister();
    forgetRecoveredDrafts();
    expect(takeRecoveredDraft(target)).toBeNull();
  });

  it('모양이 깨진 값은 쓰지 않는다', () => {
    sessionStorage.setItem(RECOVERED_DRAFTS_KEY, JSON.stringify({ '7:3:11': { memo: 1 } }));
    expect(takeRecoveredDraft(target)).toBeNull();
  });
});
