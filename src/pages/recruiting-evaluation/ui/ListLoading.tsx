import { useEffect } from 'react';
import { LoaderCircle } from 'lucide-react';

import { ApiError } from '@/shared/api/client';

import { InvalidResponseError } from '../model/applicantResponse';

// 목록을 읽지 못했을 때 다시 읽기까지 기다리는 시간.
const RETRY_DELAY_MS = 3_000;

interface ListLoadingProps {
  /** 마지막 읽기의 오류. 다시 시도해도 안 되는 403·404는 안내를 보이고 멈추며, 나머지는 잠시 뒤 저절로 다시 읽는다. */
  error: Error | null;
  /** 지금 읽는 중인지. 읽는 동안에는 오류가 있어도 로딩 표시를 둔다. */
  isLoading: boolean;
  onRetry: () => void;
  /** 가운데에 보일 문구. 기본은 지원자 목록이다. */
  message?: string;
  /** 표시 영역의 최소 높이. 화면 전체는 50vh, 카드 안은 더 작게 준다. */
  minHeightClassName?: string;
}

/** 다시 읽어도 결과가 같은 오류의 안내. 이 오류면 저절로 다시 읽지 않는다. */
function permanentErrorMessageOf(error: Error | null): string | null {
  // 응답 모양이 맞지 않으면 다시 읽어도 같으므로 이유를 보이고 멈춘다.
  if (error instanceof InvalidResponseError) return error.message;
  if (!(error instanceof ApiError)) return null;
  if (error.status === 403) return '볼 수 있는 권한이 없습니다.';
  if (error.status === 404) return '찾을 수 없습니다. 공고나 지원서가 삭제되었을 수 있습니다.';
  return null;
}

interface ListRefreshNoticeProps {
  /** 마지막 다시 읽기의 오류. 없으면 아무것도 그리지 않는다. */
  error: Error | null;
  isLoading: boolean;
  onRetry: () => void;
}

/**
 * 이미 목록을 보여 주는 중에 다시 읽기만 실패했을 때 표 위에 두는 안내(C-03). 표·필터·스크롤은 그대로 둔다.
 * 일시 오류는 기존처럼 잠시 뒤 저절로 다시 읽고, 403·404는 다시 읽지 않고 이유를 보인다.
 */
export function ListRefreshNotice({ error, isLoading, onRetry }: ListRefreshNoticeProps) {
  const hasError = error !== null && !isLoading;
  const permanentMessage = hasError ? permanentErrorMessageOf(error) : null;

  useEffect(() => {
    if (!hasError || permanentMessage) return;
    const timer = window.setTimeout(onRetry, RETRY_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [hasError, permanentMessage, onRetry]);

  if (!error) return null;
  return (
    <div
      role={isLoading ? 'status' : 'alert'}
      className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-slate-200 bg-white px-4 py-3 text-xs text-slate-700"
    >
      <p>
        {isLoading
          ? '목록을 다시 불러오는 중입니다.'
          : (permanentMessage ??
            '목록을 새로 불러오지 못했습니다. 마지막으로 불러온 목록을 표시합니다.')}
      </p>
      {!isLoading && (
        <button type="button" onClick={onRetry} className="px-3">
          다시 불러오기
        </button>
      )}
    </div>
  );
}

/**
 * 목록·평가 결과를 읽는 동안 영역 가운데에 보이는 로딩 표시. 연결 끊김 같은 일시 오류면 오류 상자 대신 이 표시를 두고 잠시 뒤 다시 읽는다.
 * 권한 없음(403)·없음(404)은 다시 읽어도 같으니 이유를 보이고 멈춘다.
 */
export function ListLoading({
  error,
  isLoading,
  onRetry,
  message = '지원자 목록을 불러오는 중입니다.',
  minHeightClassName = 'min-h-[50vh]',
}: ListLoadingProps) {
  const hasError = error !== null && !isLoading;
  const permanentMessage = hasError ? permanentErrorMessageOf(error) : null;

  useEffect(() => {
    if (!hasError || permanentMessage) return;
    const timer = window.setTimeout(onRetry, RETRY_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [hasError, permanentMessage, onRetry]);

  if (permanentMessage) {
    return (
      <div
        role="alert"
        className={`flex ${minHeightClassName} flex-col items-center justify-center gap-3 text-sm`}
      >
        <p>{permanentMessage}</p>
        <button type="button" onClick={onRetry} className="px-4">
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div
      role="status"
      className={`flex ${minHeightClassName} flex-col items-center justify-center gap-3`}
    >
      <LoaderCircle size={28} className="animate-spin text-slate-400" aria-hidden="true" />
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  );
}
