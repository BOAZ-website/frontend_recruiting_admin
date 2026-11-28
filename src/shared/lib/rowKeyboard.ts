import type { KeyboardEvent } from 'react';

/**
 * 누르면 열리는 표 행의 키보드 처리(R-14). 행에 포커스가 있을 때 Enter와 Space로 연다.
 * 행 안의 드롭다운·버튼에서 누른 키는 그 요소가 처리하도록 건드리지 않는다. Space로 화면이 스크롤되지 않게 막는다.
 */
export const openRowOnKey =
  (open: () => void) =>
  (event: KeyboardEvent<HTMLElement>): void => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    open();
  };
