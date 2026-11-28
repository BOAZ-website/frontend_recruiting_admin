type Box = { top: number; bottom: number; left: number; right: number };

/**
 * 요소가 자신을 잘라 내는 바깥 영역(스크롤 영역 등)이나 화면 밖으로 완전히 나갔는지. 조금이라도 보이면 false.
 * 크기가 없는 요소(아직 그려지지 않았거나 숨김)는 판단하지 않고 false다.
 */
export function isScrolledOut(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const isOutside = (box: Box) =>
    rect.bottom <= box.top ||
    rect.top >= box.bottom ||
    rect.right <= box.left ||
    rect.left >= box.right;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(parent);
    const clips = /auto|scroll|hidden|clip/.test(`${overflowX} ${overflowY}`);
    if (clips && isOutside(parent.getBoundingClientRect())) return true;
  }
  return isOutside({ top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth });
}
