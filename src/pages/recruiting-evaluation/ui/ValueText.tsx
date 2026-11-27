/** 값 글자. 비어 있어 '-'로 보일 때는 연한 회색으로 둬 채워진 값과 구분한다(review-design.css). */
export function ValueText({ value }: { value: string }) {
  return value === '-' ? <span className="review-empty-value">-</span> : <>{value}</>;
}
