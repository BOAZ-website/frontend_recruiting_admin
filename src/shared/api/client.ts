/**
 * 백엔드 API 클라이언트. 화면은 이 파일의 api·ApiError만 가져다 쓴다.
 *   · 서버 주소는 VITE_API_BASE_URL이다.
 *   · 로그인 응답의 Access Token을 메모리에만 두고 Authorization 헤더로 보낸다.
 *   · 401이 오면 Refresh Token 쿠키(admin_refresh_token)로 한 번 재발급받아 다시 보낸다.
 * 백엔드 응답은 { status, data, error_code, message } 모양이고, 이 파일이 data만 꺼내 돌려준다.
 */
import { ApiError, type HttpMethod } from './apiError';

export { ApiError, type HttpMethod };

const REQUEST_TIMEOUT_MS = 10_000;
const NETWORK_ERROR_MESSAGE = '서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.';
const REFRESH_PATH = '/api/v1/auth/admin/refresh';
// 401이 와도 재발급하지 않고 그대로 돌려주는 요청(아이디·비밀번호 틀림, 쿠키 만료). 로그아웃은 토큰이 필요해 재발급 뒤 다시 보낸다.
const NO_RETRY_PATHS = ['/api/v1/auth/admin/login', REFRESH_PATH];
// 재발급에서 쿠키가 거절됐다고 보는 상태 코드. 그 밖의 실패는 일시적인 것으로 본다.
const REJECTED_REFRESH_STATUSES = [400, 401, 403, 404];

interface ApiRequest {
  method: HttpMethod;
  path: string;
  body?: unknown;
}

interface ApiEnvelope<T> {
  data: T;
}

let accessToken: string | null = null;
// 로그인·로그아웃으로 토큰 주인이 바뀔 때마다 올린다. 그 전에 시작한 재발급·재전송이 새 사람의 토큰을 덮거나
// 새 사람 이름으로 실행되지 않게 비교한다. 재발급으로 같은 사람의 토큰이 바뀔 때는 올리지 않는다.
let tokenGeneration = 0;
// 동시에 여러 요청이 401을 받아도 재발급은 한 번만 한다.
let refreshing: Promise<RefreshResult> | null = null;
// 재발급마저 실패하면(쿠키 만료 등) 로그인 화면으로 돌려보낸다. App이 등록한다.
let onSessionExpired: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
  tokenGeneration += 1;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

function apiBaseUrl(): string {
  const value = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (!value) throw new ApiError(0, 'NO_API_BASE_URL', '서버 주소(VITE_API_BASE_URL)가 없습니다.');
  return value.replace(/\/+$/, '');
}

/** 서버 오류 응답 본문에서 오류 코드와 문구를 읽는다. 형식이 다르면 상태 코드로 기본 문구를 만든다. */
async function toApiError(response: Response): Promise<ApiError> {
  const fallback = `요청을 처리하지 못했습니다. (${response.status})`;
  try {
    const data = (await response.json()) as { error_code?: unknown; message?: unknown };
    return new ApiError(
      response.status,
      typeof data.error_code === 'string' ? data.error_code : 'HTTP_ERROR',
      typeof data.message === 'string' ? data.message : fallback,
    );
  } catch {
    return new ApiError(response.status, 'HTTP_ERROR', fallback);
  }
}

async function send({ method, path, body }: ApiRequest): Promise<Response> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  // 재발급 요청에는 Access Token을 붙이지 않는다. 백엔드는 만료된 토큰이 붙은 요청을 재발급 전에 401로 막는다.
  if (accessToken && path !== REFRESH_PATH) headers.Authorization = `Bearer ${accessToken}`;
  try {
    return await fetch(`${apiBaseUrl()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      // Refresh Token 쿠키를 주고받는다.
      credentials: 'include',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, 'NETWORK_ERROR', NETWORK_ERROR_MESSAGE);
  }
}

async function readData<T>(response: Response): Promise<T> {
  if (!response.ok) throw await toApiError(response);
  const text = await response.text();
  if (!text) return undefined as T;
  return (JSON.parse(text) as ApiEnvelope<T>).data;
}

/** Access Token(JWT)의 sub에 든 운영진 계정 id. 읽지 못하면 null. */
export function adminIdOfToken(token: string): number | null {
  try {
    const payload = token.split('.')[1] ?? '';
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const id = Number((JSON.parse(json) as { sub?: unknown }).sub);
    return Number.isInteger(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * 재발급 결과. rejected는 서버가 쿠키를 거절한 것(로그인이 정말 끝남),
 * failed는 연결 끊김·시간 초과·서버 오류처럼 다시 시도하면 될 수도 있는 실패다.
 */
export type RefreshResult = 'ok' | 'rejected' | 'failed';

/**
 * Refresh Token 쿠키로 Access Token을 다시 받는다.
 * 새로고침 직후 로그인 상태를 되살릴 때도 쓴다.
 */
export function refreshAccessToken(): Promise<RefreshResult> {
  refreshing ??= (async () => {
    const generation = tokenGeneration;
    try {
      const response = await send({ method: 'POST', path: REFRESH_PATH });
      // 쿠키가 거절된 응답만 로그아웃으로 본다. 5xx·429(요청 수 제한)·408 등은 다시 시도하면 될 수 있다.
      if (!response.ok && !REJECTED_REFRESH_STATUSES.includes(response.status)) return 'failed';
      if (!response.ok) {
        if (generation === tokenGeneration) accessToken = null;
        return 'rejected';
      }
      const data = await readData<{ access_token: string }>(response);
      // 응답을 기다리는 사이 로그아웃·다른 계정 로그인이 있었으면 받은 토큰을 버린다.
      if (generation !== tokenGeneration) return 'rejected';
      accessToken = data.access_token;
      return 'ok';
    } catch {
      // 연결 끊김·시간 초과. 토큰은 그대로 두어 다음 요청에서 다시 재발급을 시도한다.
      return 'failed';
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function apiRequest<T = unknown>(request: ApiRequest): Promise<T> {
  // 요청을 보낸 시점의 토큰 주인을 기록한다. 응답을 기다리는 사이 다른 계정으로 로그인해도 이전 계정 요청을 다시 보내지 않게.
  const generation = tokenGeneration;
  const previousAdminId = accessToken ? adminIdOfToken(accessToken) : null;
  const response = await send(request);
  // 토큰이 없거나 만료됐으면 쿠키로 재발급해 다시 보낸다. 쿠키가 거절되면 로그인 화면으로 돌려보낸다.
  if (response.status === 401 && !NO_RETRY_PATHS.includes(request.path)) {
    if (generation !== tokenGeneration) return readData<T>(response);
    const result = await refreshAccessToken();
    // 그 사이 로그아웃·다른 계정 로그인이 있었으면 다시 보내지 않는다(다른 계정 이름으로 저장되지 않게).
    if (generation !== tokenGeneration) return readData<T>(response);
    // 잠깐 연결이 안 된 것이면 로그아웃하지 않는다. 화면은 입력을 둔 채 오류만 알린다.
    if (result === 'failed') throw new ApiError(0, 'NETWORK_ERROR', NETWORK_ERROR_MESSAGE);
    const isSameAdmin =
      previousAdminId === null ||
      (accessToken !== null && adminIdOfToken(accessToken) === previousAdminId);
    // 쿠키는 브라우저 전체에 하나라, 다른 탭에서 다른 계정으로 로그인했으면 그 계정의 토큰이 온다.
    // 이 탭의 요청을 그 계정 이름으로 보내지 않고 로그인 화면으로 돌려보낸다.
    if (result === 'ok' && isSameAdmin) return readData<T>(await send(request));
    // 토큰을 비워 세대를 올린다. 같은 때 실패한 다른 요청은 위 세대 비교에서 멈춰, 안내가 한 번만 뜬다.
    setAccessToken(null);
    onSessionExpired?.();
  }
  return readData<T>(response);
}

export const api = {
  get: <T>(path: string) => apiRequest<T>({ method: 'GET', path }),
  post: <T>(path: string, body?: unknown) => apiRequest<T>({ method: 'POST', path, body }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>({ method: 'PUT', path, body }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>({ method: 'PATCH', path, body }),
};
