import { useEffect, useId, useState } from 'react';
import type { KeyboardEvent } from 'react';

interface ListboxKeyboardOptions<T extends string> {
  options: readonly { value: T }[];
  value: T;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  /** 항목을 고른다. 목록 닫기와 버튼 포커스는 부르는 쪽이 한다. */
  onSelect: (value: T) => void;
}

/**
 * 드롭다운(버튼 + listbox)의 키보드 조작(C-02, N2). 포커스는 버튼에 두고 aria-activedescendant로 가리킨 항목을 바꾼다.
 *   · ↑·↓: 닫혀 있으면 열고, 열려 있으면 가리키는 항목을 옮긴다.
 *   · Enter·Space: 열려 있으면 가리킨 항목을 고른다. 닫혀 있으면 버튼 기본 동작(열기)을 둔다.
 *   · Esc: 고른 값은 그대로 두고 닫는다. 포커스는 버튼에 남는다. 바깥 창(모달)의 Esc 닫기로 넘기지 않는다.
 *   · Tab: 닫고 다음 요소로 간다.
 */
export function useListboxKeyboard<T extends string>({
  options,
  value,
  isOpen,
  setIsOpen,
  onSelect,
}: ListboxKeyboardOptions<T>) {
  const listId = useId();
  const [activeIndex, setActiveIndex] = useState(-1);
  const optionId = (index: number) => `${listId}-option-${index}`;

  // 열 때마다 지금 고른 항목을 가리킨다.
  useEffect(() => {
    if (!isOpen) return;
    setActiveIndex(
      Math.max(
        0,
        options.findIndex((option) => option.value === value),
      ),
    );
    // 여는 순간의 값만 쓴다. 열려 있는 동안 고른 값이 바뀌어도 가리키는 항목을 되돌리지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // 가리킨 항목이 목록 밖에 있으면 보이게 스크롤한다.
  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    document.getElementById(optionId(activeIndex))?.scrollIntoView?.({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeIndex]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          return;
        }
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActiveIndex((index) => Math.min(options.length - 1, Math.max(0, index + step)));
        return;
      }
      case 'Enter':
      case ' ':
        if (!isOpen) return;
        event.preventDefault();
        if (options[activeIndex]) onSelect(options[activeIndex].value);
        return;
      case 'Escape':
        if (!isOpen) return;
        event.preventDefault();
        event.stopPropagation();
        setIsOpen(false);
        return;
      case 'Tab':
        if (isOpen) setIsOpen(false);
        return;
    }
  };

  return {
    listId,
    activeIndex,
    setActiveIndex,
    optionId,
    onKeyDown,
    /** 버튼에 붙일 접근성 속성. */
    buttonProps: {
      'aria-controls': isOpen ? listId : undefined,
      'aria-activedescendant': isOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined,
    },
  };
}
