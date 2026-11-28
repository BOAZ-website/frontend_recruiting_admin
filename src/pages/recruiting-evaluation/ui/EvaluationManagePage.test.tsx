// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthSession } from '@/entities/auth/model/types';
import { fake, ME } from '@/test/fakeRecruitmentApi';
import {
  click,
  getBySelector,
  getByText,
  type Rendered,
  render,
  typeInto,
  waitFor,
} from '@/test/dom';

import { EvaluationManagePage } from './EvaluationManagePage';

vi.mock('@/entities/recruitment/api/recruitmentApi', () => import('@/test/fakeRecruitmentApi'));

const account: AuthSession = {
  adminId: ME,
  username: 'me',
  name: '나',
  role: 'TEAM',
  teamName: '엔지니어링팀',
  track: 'ENGINEERING',
};

let screen: Rendered;

beforeEach(() => {
  fake.reset();
  sessionStorage.clear();
  // 앞 테스트가 평가 화면을 열며 쌓은 방문 기록을 지운다(남아 있으면 뒤로 가기로 화면이 닫힌다).
  window.history.replaceState(null, '');
  Element.prototype.scrollTo = () => {};
  fake.myEvaluations.set(1, {
    evaluation_id: 1,
    applicant_id: 1,
    decision: 'PASS',
    score: 5,
    memo: '저장본',
    interview_question: '',
  });
});

afterEach(() => {
  screen?.unmount();
  vi.restoreAllMocks();
});

async function openApplicant(id: number) {
  screen = await render(
    <EvaluationManagePage
      recruitmentId={3}
      account={account}
      initialTab="my"
      track="ENGINEERING"
      onOpenTrack={() => {}}
    />,
  );
  const row = await waitFor(() =>
    getBySelector(document, `tr[aria-label="지원자${id} 평가 열기"]`),
  );
  await click(row);
  await waitFor(() =>
    expect(getBySelector<HTMLTextAreaElement>(document, '#review-memo').disabled).toBe(false),
  );
}

const memoField = () => getBySelector<HTMLTextAreaElement>(document, '#review-memo');
const tab = (label: string) => getByText(document, 'button', label) as HTMLButtonElement;

describe('운영진 평가 현황 본인 행 편집', () => {
  it('R-01: 행 편집을 취소해도 개인 평가 탭의 미저장 입력은 남는다', async () => {
    await openApplicant(1);
    await typeInto(memoField(), '미저장 메모');
    await click(tab('운영진 평가 현황'));
    await click(await waitFor(() => getBySelector(document, 'button[aria-label="내 평가 수정"]')));
    const rowMemo = getBySelector<HTMLTextAreaElement>(
      document,
      'textarea[aria-label="내 평가 메모"]',
    );
    expect(rowMemo.value).toBe('미저장 메모');
    await typeInto(rowMemo, '행에서 고친 메모');
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await click(getByText(document, 'button', '확인'));

    await click(tab('개인 평가'));
    expect(memoField().value).toBe('미저장 메모');
    expect(fake.saved).toHaveLength(0);
  });

  it('R-02: 행 저장 중에는 입력이 잠기고, 저장 후 보낸 값이 저장 기준이 된다', async () => {
    let release = () => {};
    fake.saveGate = new Promise((resolve) => {
      release = resolve;
    });
    await openApplicant(1);
    await click(tab('운영진 평가 현황'));
    await click(await waitFor(() => getBySelector(document, 'button[aria-label="내 평가 수정"]')));
    const rowMemo = getBySelector<HTMLTextAreaElement>(
      document,
      'textarea[aria-label="내 평가 메모"]',
    );
    await typeInto(rowMemo, '행수정-저장본');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await click(getByText(document, 'button', '확인'));

    await waitFor(() => expect(fake.saved).toHaveLength(1));
    expect(rowMemo.disabled).toBe(true);
    for (const label of ['내 판정', '내 점수']) {
      expect(
        getBySelector<HTMLButtonElement>(document, `button[aria-label="${label}"]`).disabled,
      ).toBe(true);
    }
    expect(
      getBySelector<HTMLTextAreaElement>(document, 'textarea[aria-label="내 면접 추천 질문"]')
        .disabled,
    ).toBe(true);

    release();
    await waitFor(() =>
      expect(document.querySelector('textarea[aria-label="내 평가 메모"]')).toBeNull(),
    );
    expect(fake.saved[0].input.memo).toBe('행수정-저장본');
    await click(tab('개인 평가'));
    expect(memoField().value).toBe('행수정-저장본');
    // 보낸 값과 화면 값이 같으므로 저장하지 않은 수정이 없다.
    expect(getByText(document, 'button', '저장하기').hasAttribute('disabled')).toBe(true);
  });

  it('R-09: 개인 평가 저장 중에는 탭을 옮길 수 없다', async () => {
    let release = () => {};
    fake.saveGate = new Promise((resolve) => {
      release = resolve;
    });
    await openApplicant(1);
    await typeInto(memoField(), '새 메모');
    await click(getByText(document, 'button', '저장하기'));
    await waitFor(() => expect(fake.saved).toHaveLength(1));

    expect(tab('운영진 평가 현황').disabled).toBe(true);
    await click(tab('운영진 평가 현황'));
    expect(tab('개인 평가').getAttribute('aria-pressed')).toBe('true');

    release();
    await waitFor(() => expect(tab('운영진 평가 현황').disabled).toBe(false));
  });
});
