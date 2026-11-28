import { isAnswerEmpty } from '../model/applicantList';
import type { ApplicantAnswerDto, TableLayout } from '../model/types';

interface ApplicantAnswerListProps {
  answers: ApplicantAnswerDto[];
}

type TableAnswer = Record<string, string | string[] | null>;

/**
 * 표 답변 한 칸의 글. 여러 개 고르는 문항이면 고른 항목을 한 줄에 하나씩 둔다(칸은 줄바꿈을 그대로 보인다).
 * 쉼표로 이으면 쉼표가 든 항목과 여러 항목을 구별할 수 없다.
 */
function tableCellText(value: string | string[] | null): string {
  if (Array.isArray(value)) return value.length ? value.join('\n') : '-';
  return value ?? '-';
}

const isChosen = (value: string | string[] | null | undefined, column: string): boolean =>
  Array.isArray(value) ? value.includes(column) : value === column;

/**
 * 지원자가 본 모양 그대로의 표(줄 × 칸). 칸마다 지원서 입력처럼 라디오 버튼(여러 개 고르는 문항은 체크박스)을 두고
 * 고른 칸만 채운다.
 * 문항 목록에 없는 줄 이름이 답에 있으면(문항이 바뀐 경우) 버리지 않고 아래에 덧붙인다.
 */
function AnswerGrid({ layout, answer }: { layout: TableLayout; answer: TableAnswer }) {
  const rows = [...layout.rows, ...Object.keys(answer).filter((row) => !layout.rows.includes(row))];
  return (
    <div className="review-answer-grid-scroll">
      <table className="review-answer-table review-answer-grid">
        <thead>
          <tr>
            <td />
            {layout.columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row}>
              <th scope="row">{row}</th>
              {layout.columns.map((column) => (
                <td key={column}>
                  <span
                    className={`review-choice-mark ${layout.multiple ? 'is-checkbox' : ''}`}
                    data-checked={isChosen(answer[row], column)}
                    aria-hidden="true"
                  />
                  {isChosen(answer[row], column) && <span className="sr-only">선택</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 지원서 문항과 답변. 서버가 준 순서(order_num 오름차순)대로 그린다. label은 위의 작은 보조 글씨, content는 질문 제목이다.
 * TEXT는 줄바꿈을 살린 문단, TABLE은 지원자가 본 표 그대로(줄 × 칸, 고른 칸에 체크) 그린다.
 * 표의 줄·칸 목록을 얻지 못했으면 줄 이름·답 두 칸 표로 그린다. 개인 평가 화면과 지원서 상세 창이 함께 쓴다.
 */
export function ApplicantAnswerList({ answers }: ApplicantAnswerListProps) {
  return (
    <>
      {answers.map((answer) => (
        <section className="review-question" key={answer.question_id}>
          {/* 답이 빈 문항은 제목을 남기고 옆에 '미작성'만 둔다. 답변 자리는 그리지 않아 빈 높이가 생기지 않는다(V-13). */}
          <div
            className={`review-question-title ${isAnswerEmpty(answer.answer) ? 'is-empty' : ''}`}
          >
            {answer.label && <span>{answer.label}</span>}
            <h2>
              {answer.content}
              {isAnswerEmpty(answer.answer) && (
                <span className="review-answer-unwritten">미작성</span>
              )}
            </h2>
          </div>
          {isAnswerEmpty(answer.answer) ? null : answer.type === 'TABLE' &&
            answer.answer &&
            typeof answer.answer === 'object' ? (
            answer.table_layout ? (
              <AnswerGrid layout={answer.table_layout} answer={answer.answer} />
            ) : (
              <table className="review-answer-table">
                <tbody>
                  {Object.entries(answer.answer).map(([key, value]) => (
                    <tr key={key}>
                      <th scope="row">{key}</th>
                      <td>{tableCellText(value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : (
            <p className="review-answer">{String(answer.answer ?? '')}</p>
          )}
        </section>
      ))}
      {!answers.length && (
        <p className="review-answer review-answers-empty">제출된 답변이 없습니다.</p>
      )}
    </>
  );
}
