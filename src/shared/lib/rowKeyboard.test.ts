import type { KeyboardEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { openRowOnKey } from './rowKeyboard';

const eventOf = (key: string, onRow = true) => {
  const row = {};
  return {
    key,
    target: onRow ? row : {},
    currentTarget: row,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent<HTMLElement>;
};

describe('R-14 행 열기 키', () => {
  it('행에 포커스가 있으면 Enter와 Space로 연다', () => {
    const open = vi.fn();
    const space = eventOf(' ');
    openRowOnKey(open)(eventOf('Enter'));
    openRowOnKey(open)(space);
    expect(open).toHaveBeenCalledTimes(2);
    expect(space.preventDefault).toHaveBeenCalled();
  });

  it('행 안의 드롭다운·버튼에서 누른 키나 다른 키로는 열지 않는다', () => {
    const open = vi.fn();
    openRowOnKey(open)(eventOf('Enter', false));
    openRowOnKey(open)(eventOf(' ', false));
    openRowOnKey(open)(eventOf('a'));
    expect(open).not.toHaveBeenCalled();
  });
});
