import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/shared/api/apiError';
import { api, refreshAccessToken } from '@/shared/api/client';

import { restoreSession, sessionOf } from './authApi';

vi.mock('@/shared/api/client', async () => {
  const { ApiError: Error } = await import('@/shared/api/apiError');
  return {
    ApiError: Error,
    adminIdOfToken: () => 7,
    getAccessToken: () => 'token',
    setAccessToken: vi.fn(),
    refreshAccessToken: vi.fn(),
    api: { get: vi.fn(), post: vi.fn() },
  };
});

const account = {
  id: 7,
  username: 'qa',
  role: 'SUPER',
  name: '나',
  track: 'ENGINEERING',
  team_name: '대표진',
};

beforeEach(() => {
  vi.mocked(refreshAccessToken).mockReset();
  vi.mocked(api.get).mockReset();
});

describe('초기 세션 복원', () => {
  it('재발급이 일시적으로 실패하면 로그아웃이 아니라 확인 실패로 본다', async () => {
    vi.mocked(refreshAccessToken).mockResolvedValue('failed');
    await expect(restoreSession()).resolves.toEqual({ status: 'failed' });
  });

  it('쿠키가 거절되면 로그아웃으로 본다', async () => {
    vi.mocked(refreshAccessToken).mockResolvedValue('rejected');
    await expect(restoreSession()).resolves.toEqual({ status: 'signedOut' });
  });

  it('계정 조회가 연결 끊김·서버 오류면 확인 실패, 4xx면 로그아웃이다', async () => {
    vi.mocked(refreshAccessToken).mockResolvedValue('ok');
    vi.mocked(api.get).mockRejectedValueOnce(new ApiError(503, 'HTTP_ERROR', ''));
    await expect(restoreSession()).resolves.toEqual({ status: 'failed' });
    vi.mocked(api.get).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', ''));
    await expect(restoreSession()).resolves.toEqual({ status: 'failed' });
    vi.mocked(api.get).mockRejectedValueOnce(new ApiError(403, 'ACCESS_DENIED', ''));
    await expect(restoreSession()).resolves.toEqual({ status: 'signedOut' });
  });

  it('정상이면 세션을 돌려준다', async () => {
    vi.mocked(refreshAccessToken).mockResolvedValue('ok');
    vi.mocked(api.get).mockResolvedValue(account);
    await expect(restoreSession()).resolves.toMatchObject({
      status: 'ok',
      session: { adminId: 7, role: 'SUPER', teamName: '대표진', track: 'ENGINEERING' },
    });
  });
});

describe('계정 응답 검증', () => {
  it('모르는 역할(HOST 등)은 TEAM으로 바꾸지 않고 잘못된 계정으로 본다', () => {
    expect(() => sessionOf({ ...account, role: 'HOST' })).toThrow(
      '계정 정보를 확인할 수 없습니다.',
    );
    expect(() => sessionOf({ ...account, role: undefined })).toThrow();
    expect(() => sessionOf({ ...account, team_name: null })).toThrow();
  });

  it('지원하는 역할은 그대로 둔다', () => {
    for (const role of ['SUPER', 'MASTER', 'TEAM']) {
      expect(sessionOf({ ...account, role }).role).toBe(role);
    }
  });

  it('부문이 비었거나 모르는 값이면 null, 알려진 부문과 ALL은 그대로다', () => {
    expect(sessionOf({ ...account, track: null }).track).toBeNull();
    expect(sessionOf({ ...account, track: 'MARKETING' }).track).toBeNull();
    expect(sessionOf({ ...account, track: 'ALL' }).track).toBe('ALL');
    expect(sessionOf(account).track).toBe('ENGINEERING');
  });

  it('세션 복원에서 잘못된 계정이면 안내 화면용 결과를 돌려준다', async () => {
    vi.mocked(refreshAccessToken).mockResolvedValue('ok');
    vi.mocked(api.get).mockResolvedValue({ ...account, role: 'HOST' });
    await expect(restoreSession()).resolves.toEqual({ status: 'invalidAccount' });
  });
});
