/**
 * 로그인·로그아웃·로그인 상태 되살리기. 비밀번호는 요청에만 쓰고 브라우저에 저장하지 않는다.
 * Access Token은 메모리(client.ts)에만 두고, 새로고침하면 Refresh Token 쿠키로 다시 받는다.
 */
import {
  adminIdOfToken,
  api,
  ApiError,
  getAccessToken,
  refreshAccessToken,
  setAccessToken,
} from '@/shared/api/client';

import type { AuthSession, LoginRequest } from '../model/types';

interface AdminAccountResponse {
  id: number;
  username: string;
  role: string;
  name: string;
  track: string;
  team_name: string;
}

/** Access Token(JWT)의 subject(계정 id)를 읽는다. 서명 검사는 서버가 한다. */
function adminIdOf(token: string): number {
  const id = adminIdOfToken(token);
  if (id === null) throw new Error('로그인 정보를 읽지 못했습니다. 다시 로그인해 주세요.');
  return id;
}

/** 지금 토큰의 계정 정보를 읽는다. 본인 계정 조회는 TEAM 계정도 할 수 있다. */
async function fetchSession(): Promise<AuthSession> {
  const token = getAccessToken();
  if (!token) throw new Error('로그인이 필요합니다.');
  const account = await api.get<AdminAccountResponse>(`/api/v1/admin/accounts/${adminIdOf(token)}`);
  return {
    adminId: account.id,
    username: account.username,
    name: account.name,
    role: account.role === 'SUPER' || account.role === 'MASTER' ? account.role : 'TEAM',
    teamName: account.team_name,
    track: account.track as AuthSession['track'],
  };
}

/** 아이디·비밀번호로 로그인한다. 틀리면 서버 문구를 담은 ApiError를 던진다. */
export async function login(request: LoginRequest): Promise<AuthSession> {
  const { access_token } = await api.post<{ access_token: string }>(
    '/api/v1/auth/admin/login',
    request,
  );
  setAccessToken(access_token);
  try {
    return await fetchSession();
  } catch (error) {
    setAccessToken(null);
    throw error;
  }
}

/**
 * 새로고침 뒤 로그인 상태를 되살린 결과. signedOut은 쿠키가 없거나 서버가 거절한 것(로그인 화면),
 * failed는 연결 끊김·시간 초과·서버 오류처럼 로그인 여부를 확인하지 못한 것(다시 시도 안내)이다.
 */
export type RestoreResult =
  { status: 'ok'; session: AuthSession } | { status: 'signedOut' } | { status: 'failed' };

/** 일시 장애로 보는 실패. 서버가 거절한 4xx와 달리 다시 시도하면 될 수 있다. */
const isTemporaryFailure = (error: unknown) =>
  error instanceof ApiError &&
  (error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500);

/** 새로고침 뒤 Refresh Token 쿠키로 로그인 상태를 되살린다. 일시 장애는 로그아웃과 구분한다. */
export async function restoreSession(): Promise<RestoreResult> {
  const refreshed = await refreshAccessToken();
  if (refreshed === 'failed') return { status: 'failed' };
  if (refreshed === 'rejected') return { status: 'signedOut' };
  try {
    return { status: 'ok', session: await fetchSession() };
  } catch (error) {
    setAccessToken(null);
    return isTemporaryFailure(error) ? { status: 'failed' } : { status: 'signedOut' };
  }
}

/**
 * 로그아웃한다. 서버가 Refresh Token과 쿠키를 지워야 끝난 것이므로, 서버 요청이 실패하면 오류를 던지고 토큰도 그대로 둔다.
 * (쿠키는 HttpOnly라 브라우저 코드로 지울 수 없다. 실패한 채 화면만 바꾸면 새로고침 때 다시 로그인된다.)
 * 401은 쿠키까지 만료돼 서버에 로그인이 남아 있지 않은 경우라 로그아웃된 것으로 본다.
 */
export async function logout(): Promise<void> {
  try {
    await api.post('/api/v1/auth/admin/logout');
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 401)) throw error;
  }
  setAccessToken(null);
}
