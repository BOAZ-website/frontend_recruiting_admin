// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { isScrolledOut } from './isScrolledOut';

const rect = (top: number, height: number) =>
  ({ top, bottom: top + height, left: 0, right: 100, width: 100, height }) as DOMRect;

afterEach(() => document.body.replaceChildren());

function setup(buttonTop: number) {
  const scroller = document.createElement('div');
  scroller.style.overflowY = 'auto';
  const button = document.createElement('button');
  scroller.append(button);
  document.body.append(scroller);
  scroller.getBoundingClientRect = () => rect(200, 300);
  button.getBoundingClientRect = () => rect(buttonTop, 30);
  return button;
}

describe('V-14 버튼이 스크롤 영역 밖으로 나갔는지', () => {
  it('스크롤 영역 위로 완전히 나가면 true', () => {
    expect(isScrolledOut(setup(160))).toBe(true);
  });

  it('조금이라도 보이면 false', () => {
    expect(isScrolledOut(setup(185))).toBe(false);
    expect(isScrolledOut(setup(300))).toBe(false);
  });

  it('크기가 없는 요소는 판단하지 않는다', () => {
    const button = setup(0);
    button.getBoundingClientRect = () =>
      ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }) as DOMRect;
    expect(isScrolledOut(button)).toBe(false);
  });
});
