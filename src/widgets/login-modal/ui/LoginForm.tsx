import { useEffect, useRef, useState } from 'react';

import { login } from '@/entities/auth/api/authApi';
import type { AuthSession } from '@/entities/auth/model/types';
import { ApiError } from '@/shared/api/apiError';
import { ClearFieldButton } from '@/shared/ui/field/ClearFieldButton';
import { PasswordVisibilityButton } from '@/shared/ui/field/PasswordVisibilityButton';

/*
 * 로그인 칸. 칸 이름·밑줄은 공통 팝업 입력칸(dialogStyles)과 같은 회색이고, 로그인 버튼만 로고에 맞춘 파란색(sky)이다.
 * 입력칸은 밑줄만 있고, 누르면 밑줄 색만 짙어지고 굵기(1px)는 그대로다. 오류가 있는 칸은 누르고 있어도 빨간 밑줄을 유지한다.
 */
const LOGIN_LABEL = 'block text-sm font-medium text-slate-500';
const LOGIN_INPUT_BASE =
  'w-full border-0 border-b bg-transparent px-0 py-2 text-sm text-slate-900 outline-none transition-colors';
const LOGIN_INPUT = `${LOGIN_INPUT_BASE} border-slate-300 focus:border-slate-500`;
const LOGIN_INPUT_ERROR = `${LOGIN_INPUT_BASE} border-red-500`;

/** 입력칸 오른쪽 끝의 버튼 묶음(보기·지우기). */
const FIELD_ACTIONS = 'absolute top-1/2 right-0 flex -translate-y-1/2 items-center';

interface LoginFormProps {
  /** 로그인에 성공하면 서버가 돌려준 세션을 그대로 넘긴다. 역할 대응은 부르는 쪽(App)이 한다. */
  onLoginSuccess: (session: AuthSession) => void;
}

/**
 * 아이디·비밀번호 입력과 로그인 버튼. 로그인 화면(LoginScreen)과 로그인 창(LoginModal)이 함께 쓴다.
 * 아이디·비밀번호를 로그인 API(POST /api/v1/auth/login)로 보내고, 성공하면 세션을 넘긴다.
 * 운영진 계정과 HOST 계정 판정은 서버가 한다. 실패하면 서버가 돌려준 사유를 보인다.
 */
export function LoginForm({ onLoginSuccess }: LoginFormProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  /** 오류 종류. 'empty'면 비어 있는 칸만, 'rejected'(서버가 거절)면 비밀번호 칸을 빨갛게 표시한다. */
  const [errorKind, setErrorKind] = useState<'empty' | 'rejected' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const isUsernameInvalid = errorKind === 'empty' && !username.trim();
  const isPasswordInvalid = errorKind === 'rejected' || (errorKind === 'empty' && !password.trim());

  const clearError = () => {
    setErrorMessage('');
    setErrorKind(null);
  };

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password) {
      setErrorMessage('아이디와 비밀번호를 모두 입력해 주세요.');
      setErrorKind('empty');
      // 비어 있는 첫 칸으로 커서를 옮긴다.
      (trimmedUsername ? passwordRef : usernameRef).current?.focus();
      return;
    }
    // 공백만 있는 비밀번호는 보내지 않는다. 실제 비밀번호의 앞뒤 공백은 자르지 않고 그대로 보낸다(R-17).
    if (!password.trim()) {
      setErrorMessage('비밀번호를 입력해 주세요.');
      setErrorKind('empty');
      passwordRef.current?.focus();
      return;
    }
    clearError();
    setIsSubmitting(true);
    try {
      const session = await login({ username: trimmedUsername, password });
      onLoginSuccess(session);
    } catch (error) {
      // 서버에 닿지 못한 실패는 아이디·비밀번호 문제가 아니므로, 입력칸 오류 대신 알림창으로 알린다.
      if (error instanceof ApiError && error.code === 'NETWORK_ERROR') {
        window.alert(error.message);
      } else {
        setErrorMessage(error instanceof Error ? error.message : '로그인하지 못했습니다.');
        setErrorKind('rejected');
      }
      // 제출 중 잠긴 버튼에서 포커스가 빠져 body로 떨어지므로 비밀번호 칸으로 돌린다(R-19).
      setIsSubmitting(false);
      passwordRef.current?.focus();
      return;
    }
    setIsSubmitting(false);
  };

  return (
    <form onSubmit={(event) => void handleLogin(event)} className="space-y-6">
      <div>
        <label htmlFor="login-username" className={LOGIN_LABEL}>
          아이디
        </label>
        {/* 칸에 글자가 있으면 오른쪽 끝에 지우기 버튼이 나온다. */}
        <div className="relative">
          <input
            id="login-username"
            ref={usernameRef}
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              clearError();
            }}
            autoComplete="username"
            spellCheck={false}
            aria-invalid={isUsernameInvalid}
            aria-describedby="login-error"
            className={`${isUsernameInvalid ? LOGIN_INPUT_ERROR : LOGIN_INPUT} pr-9`}
          />
          <div className={FIELD_ACTIONS}>
            {username && (
              <ClearFieldButton
                label="아이디 지우기"
                onClear={() => {
                  setUsername('');
                  clearError();
                  usernameRef.current?.focus();
                }}
              />
            )}
          </div>
        </div>
      </div>
      <div>
        <label htmlFor="login-password" className={LOGIN_LABEL}>
          비밀번호
        </label>
        {/* 비밀번호 칸 오른쪽 끝에 보기·숨기기 버튼과 지우기 버튼을 둔다. 칸 오른쪽을 비워 글자가 버튼 아래로 들어가지 않게 한다. */}
        <div className="relative">
          <input
            id="login-password"
            ref={passwordRef}
            type={isPasswordVisible ? 'text' : 'password'}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              clearError();
            }}
            autoComplete="current-password"
            aria-invalid={isPasswordInvalid}
            aria-describedby="login-error"
            className={`${isPasswordInvalid ? LOGIN_INPUT_ERROR : LOGIN_INPUT} pr-16`}
          />
          <div className={FIELD_ACTIONS}>
            {/* 글자를 입력하면 보기·지우기 버튼이 함께 나온다. */}
            {password && (
              <>
                <PasswordVisibilityButton
                  isVisible={isPasswordVisible}
                  onToggle={() => setIsPasswordVisible((visible) => !visible)}
                  controls="login-password"
                />
                <ClearFieldButton
                  label="비밀번호 지우기"
                  onClear={() => {
                    setPassword('');
                    // 지우면 보기 상태도 숨김으로 되돌린다. 다시 입력한 비밀번호가 글자로 드러나지 않게 한다(R-18).
                    setIsPasswordVisible(false);
                    clearError();
                    passwordRef.current?.focus();
                  }}
                />
              </>
            )}
          </div>
        </div>
        {/* 오류 문구는 비밀번호 칸 바로 아래에 둔다. 자리를 늘 비워 두어 문구가 나타나도 아래 버튼이 움직이지 않는다. */}
        <p id="login-error" role="alert" className="mt-2 min-h-5 text-xs leading-5 text-red-600">
          {errorMessage}
        </p>
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="h-12 w-full cursor-pointer rounded-sm bg-sky-700 text-sm font-bold text-white transition-colors hover:bg-sky-800 active:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? '로그인 중' : '로그인'}
        </button>
      </div>
    </form>
  );
}
