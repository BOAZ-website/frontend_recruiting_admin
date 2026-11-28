// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { click, getBySelector, keyDown, type Rendered, render } from '@/test/dom';

import { FilterDropdown } from './FilterDropdown';
import { SelectDropdown } from './SelectDropdown';

const OPTIONS = [
  { value: 'PENDING', label: '미정' },
  { value: 'PASS', label: '합격' },
  { value: 'HOLD', label: '보류' },
] as const;
type Value = (typeof OPTIONS)[number]['value'];

let screen: Rendered;
afterEach(() => screen?.unmount());

/** 최종 평가 칸처럼 바깥에서 키 전파를 막는 행 안에 드롭다운을 둔다(C-02의 원인 재현). */
function SelectInRow({ Dropdown }: { Dropdown: 'select' | 'filter' }) {
  const [value, setValue] = useState<Value>('PENDING');
  return (
    <div onKeyDown={(event) => event.stopPropagation()}>
      {Dropdown === 'select' ? (
        <SelectDropdown ariaLabel="최종 평가" value={value} options={OPTIONS} onChange={setValue} />
      ) : (
        <FilterDropdown
          ariaLabel="최종 평가"
          title="최종 평가"
          value={value}
          options={OPTIONS}
          onChange={setValue}
        />
      )}
      <output>{value}</output>
    </div>
  );
}

const button = () => getBySelector<HTMLButtonElement>(document, 'button[aria-label="최종 평가"]');
const listbox = () => document.querySelector('[role="listbox"]');
const value = () => getBySelector(document, 'output').textContent;

describe.each(['select', 'filter'] as const)('%s 드롭다운 키보드(C-02, N2)', (kind) => {
  it('↓로 열고 ↓·↑로 옮긴 뒤 Enter로 고른다', async () => {
    screen = await render(<SelectInRow Dropdown={kind} />);
    button().focus();
    await keyDown(button(), 'ArrowDown');
    expect(button().getAttribute('aria-expanded')).toBe('true');
    expect(button().getAttribute('aria-activedescendant')).toMatch(/option-0$/);

    await keyDown(button(), 'ArrowDown');
    await keyDown(button(), 'ArrowDown');
    await keyDown(button(), 'ArrowUp');
    expect(button().getAttribute('aria-activedescendant')).toMatch(/option-1$/);
    await keyDown(button(), 'Enter');

    expect(value()).toBe('PASS');
    expect(listbox()).toBeNull();
    expect(document.activeElement).toBe(button());
  });

  it('Esc는 고른 값을 바꾸지 않고 닫으며 포커스는 버튼에 남는다', async () => {
    screen = await render(<SelectInRow Dropdown={kind} />);
    button().focus();
    await keyDown(button(), 'ArrowDown');
    await keyDown(button(), 'ArrowDown');
    const escape = await keyDown(button(), 'Escape');

    expect(listbox()).toBeNull();
    expect(value()).toBe('PENDING');
    expect(document.activeElement).toBe(button());
    // 모달의 Esc 닫기로 넘어가지 않는다.
    expect(escape.defaultPrevented).toBe(true);
  });

  it('마우스로 항목을 눌러도 고르고 닫힌다', async () => {
    screen = await render(<SelectInRow Dropdown={kind} />);
    await click(button());
    const option = [...document.querySelectorAll('[role="option"]')].find(
      (element) => element.textContent === '보류',
    )!;
    await click(option);
    expect(value()).toBe('HOLD');
    expect(listbox()).toBeNull();
  });
});
