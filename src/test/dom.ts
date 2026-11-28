/**
 * 테스트용 화면 도구. jsdom에서 React를 그리고, 입력·클릭·키 입력을 사용자처럼 보낸다.
 * 테스트 파일 맨 위에 `// @vitest-environment jsdom`을 둔다.
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export interface Rendered {
  container: HTMLElement;
  rerender: (node: ReactNode) => Promise<void>;
  unmount: () => void;
}

export async function render(node: ReactNode): Promise<Rendered> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root | null = null;
  await act(async () => {
    root = createRoot(container);
    root.render(node);
  });
  return {
    container,
    rerender: async (next) => {
      await act(async () => root?.render(next));
    },
    unmount: () => {
      act(() => root?.unmount());
      container.remove();
    },
  };
}

/** 대기 중인 Promise와 그 뒤의 렌더를 끝낸다. */
export async function flush(times = 5): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** 조건이 맞을 때까지 기다린다. 맞지 않으면 마지막 오류를 던진다. */
export async function waitFor<T>(check: () => T, timeoutMs = 2000): Promise<T> {
  const started = Date.now();
  let lastError: unknown;
  for (;;) {
    try {
      return check();
    } catch (error) {
      lastError = error;
    }
    if (Date.now() - started > timeoutMs) throw lastError;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

export async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    (element as HTMLElement).click();
  });
}

export async function keyDown(
  element: Element,
  key: string,
  init: KeyboardEventInit = {},
): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  await act(async () => {
    element.dispatchEvent(event);
  });
  return event;
}

/** React가 관리하는 입력칸에 글자를 넣는다(값 설정 + input 이벤트). */
export async function typeInto(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): Promise<void> {
  const prototype = Object.getPrototypeOf(element) as object;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** 글자가 정확히 같은 요소를 찾는다. 없으면 오류. */
export function getByText(root: ParentNode, selector: string, text: string): HTMLElement {
  const found = [...root.querySelectorAll<HTMLElement>(selector)].find(
    (element) => element.textContent?.trim() === text,
  );
  if (!found) throw new Error(`"${text}"(${selector})를 찾지 못했습니다.`);
  return found;
}

export function getBySelector<T extends Element = HTMLElement>(
  root: ParentNode,
  selector: string,
): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`${selector}를 찾지 못했습니다.`);
  return found;
}
