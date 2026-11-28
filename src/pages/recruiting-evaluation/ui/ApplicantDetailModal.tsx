import { useRef } from 'react';
import { X } from 'lucide-react';

import { useDialogKeyboard } from '@/shared/lib/useDialogKeyboard';

import { applicantInfoFields, displayValue } from '../model/applicantList';
import type { ApplicantAnswerDto, ApplicantEvaluationDto } from '../model/types';
import { ApplicantAnswersSection } from './ApplicantAnswersSection';
import { ValueText } from './ValueText';

interface ApplicantDetailModalProps {
  applicant: ApplicantEvaluationDto;
  fetchAnswers: (applicantIdKey: string) => Promise<ApplicantAnswerDto[]>;
  onClose: () => void;
  /** 지원서가 없어졌을 때(404) 창을 닫고 목록을 다시 읽는다. */
  onMissing: () => void;
  /** 제출 완료 지원서를 개인 평가 화면에서 연다. 없거나 DRAFT면 버튼을 두지 않는다(합격자 부원 등록은 조회만). */
  onEvaluate?: (applicantId: number) => void;
  /** false면 인적사항만 보이고 답변은 뺀다. 평가 화면에서 크게 볼 때 이름을 눌러 열 때 쓴다. */
  withAnswers?: boolean;
}

/** 지원서 상세(APP-06). 기본 정보와 답변을 보여 주는 조회 전용 창이다. 전체 지원 현황과 합격자 부원 등록이 쓴다. */
export function ApplicantDetailModal({
  applicant,
  fetchAnswers,
  onClose,
  onMissing,
  onEvaluate,
  withAnswers = true,
}: ApplicantDetailModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // 바깥 배경에서 누르기 시작해 바깥에서 뗐을 때만 닫는다. 창 안에서 글자를 끌어 선택하다 바깥에서 떼도 닫히지 않는다.
  const isBackdropPressRef = useRef(false);
  useDialogKeyboard(panelRef, onClose);
  const titleId = `applicant-detail-${applicant.id}`;

  const infoFields = applicantInfoFields(applicant);

  return (
    <div
      className="evaluation-detail-overlay fixed inset-0 z-60 flex items-center justify-center p-4"
      onMouseDown={(event) => {
        isBackdropPressRef.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (isBackdropPressRef.current && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // 인적사항만 띄울 때는 답변이 없어 창을 조금 좁게 둔다.
        // 답변 창은 기본 너비(48rem)를 두되, 줄바꿈되지 않는 표(min-content)가 더 넓으면 그만큼 넓힌다. 글은 줄바꿈되어 너비에 영향이 없다.
        className={`evaluation-detail flex max-h-[90vh] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white ${withAnswers ? 'w-min max-w-full min-w-[min(48rem,100%)]' : 'w-full max-w-[640px]'}`}
      >
        <div className="evaluation-detail-header flex items-center justify-between">
          <h2 id={titleId} className="text-[21px] font-bold">
            {displayValue(applicant.name)}
          </h2>
          <button
            type="button"
            aria-label="지원서 상세 닫기"
            onClick={onClose}
            className="review-close-button"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="overflow-y-auto px-[24px] pt-[12px] pb-4">
          {/* 답변이 없으면 인적사항이 마지막이라 아래 구분선을 두지 않는다. */}
          <dl className={`review-meta ${withAnswers ? '' : 'is-last'}`}>
            {infoFields.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  <ValueText value={value} />
                </dd>
              </div>
            ))}
          </dl>
          {withAnswers && (
            <ApplicantAnswersSection
              applicantId={applicant.id}
              fetchAnswers={fetchAnswers}
              missingAction={{ label: '닫고 목록 새로고침', onClick: onMissing }}
              deniedAction={{ label: '상세 닫기', onClick: onClose }}
            />
          )}
        </div>

        {onEvaluate && applicant.status === 'SUBMITTED' && (
          <div className="flex justify-end border-t border-slate-200 px-[24px] py-3">
            <button
              type="button"
              onClick={() => onEvaluate(applicant.id)}
              className="review-link-button text-[15px]"
            >
              {/* 아이콘(svg)에는 밑줄이 그어지지 않아 화살표를 글자로 쓴다. */}
              평가 →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
