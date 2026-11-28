// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { login } from '@/entities/auth/api/authApi';
import { ApiError } from '@/shared/api/apiError';
import { click, getBySelector, type Rendered, render, typeInto, waitFor } from '@/test/dom';

import { LoginForm } from './LoginForm';

vi.mock('@/entities/auth/api/authApi', () => ({ login: vi.fn() }));

let screen: Rendered;
const loginMock = vi.mocked(login);
const field = (id: string) => getBySelector<HTMLInputElement>(document, `#${id}`);
const submit = () => click(getBySelector(document, 'button[type="submit"]'));
const errorText = () => getBySelector(document, '#login-error').textContent;

beforeEach(async () => {
  loginMock.mockReset();
  screen = await render(<LoginForm onLoginSuccess={() => {}} />);
});
afterEach(() => screen.unmount());

describe('로그인 입력', () => {
  it('R-17: 공백만 있는 비밀번호는 보내지 않고 비밀번호 칸에 안내한다', async () => {
    await typeInto(field('login-username'), 'qa');
    await typeInto(field('login-password'), '   ');
    await submit();

    expect(loginMock).not.toHaveBeenCalled();
    expect(errorText()).toBe('비밀번호를 입력해 주세요.');
    expect(document.activeElement).toBe(field('login-password'));
    expect(field('login-password').getAttribute('aria-invalid')).toBe('true');
  });

  it('R-17: 실제 비밀번호의 앞뒤 공백은 자르지 않고 보낸다', async () => {
    loginMock.mockReturnValue(new Promise(() => {}));
    await typeInto(field('login-username'), ' qa ');
    await typeInto(field('login-password'), ' pw ');
    await submit();
    expect(loginMock).toHaveBeenCalledWith({ username: 'qa', password: ' pw ' });
  });

  it('R-18: 지우기 버튼으로 지우면 비밀번호 보기도 숨김으로 돌아간다', async () => {
    await typeInto(field('login-password'), 'secret');
    await click(getBySelector(document, 'button[aria-label="비밀번호 보기"]'));
    expect(field('login-password').type).toBe('text');
    await click(getBySelector(document, 'button[aria-label="비밀번호 지우기"]'));
    await typeInto(field('login-password'), 'again');
    expect(field('login-password').type).toBe('password');
  });

  it('R-19: 서버 오류 뒤 포커스를 비밀번호 칸으로 돌린다', async () => {
    loginMock.mockRejectedValue(
      new ApiError(401, 'INVALID_CREDENTIALS', '아이디 또는 비밀번호가 올바르지 않습니다.'),
    );
    await typeInto(field('login-username'), 'qa');
    await typeInto(field('login-password'), 'wrong');
    await submit();
    await waitFor(() => expect(errorText()).toBe('아이디 또는 비밀번호가 올바르지 않습니다.'));
    expect(document.activeElement).toBe(field('login-password'));
  });
});
