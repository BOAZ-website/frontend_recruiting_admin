// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthSession } from '@/entities/auth/model/types';
import { fake, ME } from '@/test/fakeRecruitmentApi';
import {
  click,
  getBySelector,
  getByText,
  keyDown,
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

async function renderList(viewer: AuthSession = account) {
  screen = await render(
    <EvaluationManagePage
      recruitmentId={3}
      account={viewer}
      initialTab="my"
      track="ENGINEERING"
      onOpenTrack={() => {}}
    />,
  );
}

async function openApplicant(id: number) {
  await renderList();
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

describe('입력 길이와 저장 실패', () => {
  const over = '가'.repeat(20_001);

  it('R-03: 의견이 20,000자를 넘으면 저장하지 않고 알림 창만 띄우며 입력은 그대로 둔다', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    await openApplicant(1);
    await typeInto(memoField(), over);
    await click(getByText(document, 'button', '저장하기'));

    expect(alert).toHaveBeenCalledWith('평가 의견은 20,000자 이내로 입력해 주세요.');
    expect(fake.saved).toHaveLength(0);
    expect(memoField().value).toBe(over);
    expect(memoField().maxLength).toBe(-1);
  });

  it('R-15: 행 편집도 같은 한도를 쓰고, 저장할지 묻기 전에 알린다', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await openApplicant(1);
    await click(tab('운영진 평가 현황'));
    await click(await waitFor(() => getBySelector(document, 'button[aria-label="내 평가 수정"]')));
    await typeInto(
      getBySelector<HTMLTextAreaElement>(document, 'textarea[aria-label="내 면접 추천 질문"]'),
      over,
    );
    await click(getByText(document, 'button', '확인'));

    expect(alert).toHaveBeenCalledWith('면접 추천 질문은 20,000자 이내로 입력해 주세요.');
    expect(confirm).not.toHaveBeenCalled();
    expect(fake.saved).toHaveLength(0);
  });

  it('C-05: 서버 저장 실패는 알림 창 대신 토스트로 알리고 입력을 유지한다', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    fake.saveError = new Error('500');
    await openApplicant(1);
    await typeInto(memoField(), '실패할 메모');
    await click(getByText(document, 'button', '저장하기'));

    const toast = await waitFor(() => getBySelector(document, '[role="alert"].fixed'));
    expect(toast.textContent).toBe('평가를 저장하지 못했습니다.');
    expect(toast.className).toContain('bg-slate-800');
    expect(alert).not.toHaveBeenCalled();
    expect(memoField().value).toBe('실패할 메모');
  });
});

describe('C-03 최종 평가 저장 실패 후 재조회 실패', () => {
  it('이미 보이던 표를 남기고 표 위에 안내와 다시 불러오기 버튼을 둔다', async () => {
    fake.finalDecisionError = new Error('PATCH 실패');
    await renderList({ ...account, role: 'SUPER', teamName: '대표진' });
    const button = await waitFor(() =>
      getBySelector(document, 'button[aria-label="지원자1 최종 평가"]'),
    );
    fake.listErrors = [new Error('GET 실패')];
    await click(button);
    await click(getByText(document, '[role="option"]', '합격'));

    await waitFor(() =>
      getByText(
        document,
        'p',
        '목록을 새로 불러오지 못했습니다. 마지막으로 불러온 목록을 표시합니다.',
      ),
    );
    expect(document.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(getByText(document, '[role="alert"].fixed', '평가를 저장하지 못했습니다.')).toBeTruthy();

    await click(getByText(document, 'button', '다시 불러오기'));
    await waitFor(() => expect(document.body.textContent).not.toContain('목록을 새로 불러오지'));
    expect(document.querySelectorAll('tbody tr')).toHaveLength(3);
  });
});

describe('지원자 이동 키', () => {
  const position = () => getBySelector(document, '.review-toolbar span').textContent?.trim();

  it('R-07·C-07: 점수 목록이 열린 동안 →로 이동하지 않고 저장 요청도 없다', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    await openApplicant(2);
    await click(getBySelector(document, 'button[data-decision="FAIL"]'));
    const scoreButton = getBySelector(document, 'button[aria-label="점수"]');
    await click(scoreButton);
    expect(document.querySelector('[role="listbox"]')).not.toBeNull();

    await keyDown(document.body, 'ArrowRight');
    expect(position()).toBe('2 / 3');
    expect(confirm).not.toHaveBeenCalled();
    expect(fake.saved).toHaveLength(0);

    // 목록을 닫으면 다시 이동할 수 있다(입력이 있으니 저장할지 묻는다).
    await keyDown(scoreButton, 'Escape');
    confirm.mockReturnValue(false);
    await keyDown(document.body, 'ArrowRight');
    expect(confirm).toHaveBeenCalled();
  });

  it('R-08: 키를 누르고 있어 반복되는 입력은 무시한다', async () => {
    await openApplicant(2);
    await keyDown(document.body, 'ArrowRight', { repeat: true });
    expect(position()).toBe('2 / 3');
    await keyDown(document.body, 'ArrowRight');
    await waitFor(() => expect(position()).toBe('3 / 3'));
  });
});

describe('V-10 최종 평가 저장 중 화면 왕복', () => {
  it('상세에 다녀와도 저장이 끝날 때까지 그 행을 잠그고 고른 값을 보인다', async () => {
    let release = () => {};
    fake.finalDecisionGate = new Promise((resolve) => {
      release = resolve;
    });
    await renderList({ ...account, role: 'SUPER', teamName: '대표진' });
    const finalButton = () =>
      getBySelector<HTMLButtonElement>(document, 'button[aria-label="지원자1 최종 평가"]');
    await click(await waitFor(finalButton));
    await click(getByText(document, '[role="option"]', '보류'));
    expect(finalButton().disabled).toBe(true);

    await click(getBySelector(document, 'tr[aria-label="지원자2 평가 열기"]'));
    await waitFor(() => getBySelector(document, '#review-memo'));
    await click(getBySelector(document, 'button[aria-label="지원자 목록으로"]'));

    await waitFor(finalButton);
    expect(finalButton().disabled).toBe(true);
    expect(finalButton().textContent).toBe('보류');

    release();
    await waitFor(() => expect(finalButton().disabled).toBe(false));
    expect(finalButton().textContent).toBe('보류');
  });
});

describe('로그인 만료 뒤 초안 복구와 화면 기억', () => {
  const keepDraftOf = (adminId: number) =>
    sessionStorage.setItem(
      'boaz_recruit_drafts',
      JSON.stringify({
        [`${adminId}:3:1`]: {
          decision: 'HOLD',
          score: 3,
          memo: '만료 전 쓰던 메모',
          interview_question: '',
        },
      }),
    );

  it('같은 계정이면 서버 값을 저장 기준으로 두고 미저장 입력으로 되살린다(자동 저장 없음)', async () => {
    keepDraftOf(ME);
    await openApplicant(1);
    expect(memoField().value).toBe('만료 전 쓰던 메모');
    expect(getByText(document, 'button', '저장하기').hasAttribute('disabled')).toBe(false);
    expect(fake.saved).toHaveLength(0);
    expect(sessionStorage.getItem('boaz_recruit_drafts')).toBeNull();
  });

  it('다른 계정이 남긴 초안은 보이지 않는다', async () => {
    keepDraftOf(ME + 1);
    await openApplicant(1);
    expect(memoField().value).toBe('저장본');
  });

  it('보던 지원자 화면은 같은 계정·공고일 때만 되살린다', async () => {
    const detail = { recruitmentId: 3, applicantId: 1, tab: 'review', queue: [3, 2, 1] };
    sessionStorage.setItem('boaz_recruit_detail', JSON.stringify({ ...detail, adminId: ME + 1 }));
    await renderList();
    await waitFor(() => getBySelector(document, 'tr[aria-label="지원자1 평가 열기"]'));
    expect(document.querySelector('#review-memo')).toBeNull();
    screen.unmount();

    sessionStorage.setItem('boaz_recruit_detail', JSON.stringify({ ...detail, adminId: ME }));
    await renderList();
    await waitFor(() => expect(memoField().value).toBe('저장본'));
  });
});
