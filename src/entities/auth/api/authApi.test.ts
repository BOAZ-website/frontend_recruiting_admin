import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/shared/api/apiError';
import { api, refreshAccessToken } from '@/shared/api/client';

import { restoreSession } from './authApi';

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
