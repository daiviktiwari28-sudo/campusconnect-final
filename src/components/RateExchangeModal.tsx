import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, Star, X } from 'lucide-react';
import {
  RATING_LIMITS,
  type CampusRequest,
  type ExchangeRating,
  type RatingRole,
} from '../data/campusItems';

export interface RateModalTarget {
  mode: 'create' | 'edit';
  request?: CampusRequest;
  existingRating?: ExchangeRating;
  rateeName: string;
  raterRole: RatingRole;
  exchangeSummary: string;
}

interface RateExchangeModalProps {
  target: RateModalTarget | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (score: number, comment: string) => Promise<boolean>;
}

const SCORE_LABELS: Record<number, string> = {
  1: '1 of 5 — Poor exchange',
  2: '2 of 5 — Fair exchange',
  3: '3 of 5 — Good exchange',
  4: '4 of 5 — Very good exchange',
  5: '5 of 5 — Excellent exchange',
};

export function RateExchangeModal({
  target,
  submitting,
  onClose,
  onSubmit,
}: RateExchangeModalProps) {
  const [score, setScore] = useState<number>(0);
  const [hoveredScore, setHoveredScore] = useState<number>(0);
  const [comment, setComment] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) {
      setScore(0);
      setHoveredScore(0);
      setComment('');
      setValidationError(null);
      return;
    }

    if (target.mode === 'edit' && target.existingRating) {
      setScore(target.existingRating.score);
      setComment(target.existingRating.comment);
    } else {
      setScore(0);
      setComment('');
    }
    setHoveredScore(0);
    setValidationError(null);
  }, [target]);

  useEffect(() => {
    if (!target) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [target, onClose, submitting]);

  if (!target) return null;

  const isEdit = target.mode === 'edit';
  const activeScore = hoveredScore || score;
  const trimmedComment = comment.trim();
  const rateeRoleLabel = target.raterRole === 'borrower' ? 'lender' : 'borrower';

  async function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (score < RATING_LIMITS.scoreMin || score > RATING_LIMITS.scoreMax) {
      setValidationError('Please select a star rating from 1 to 5 before submitting.');
      return;
    }

    if (trimmedComment.length > RATING_LIMITS.commentMax) {
      setValidationError(`Comment must be ${RATING_LIMITS.commentMax} characters or fewer.`);
      return;
    }

    setValidationError(null);
    const ok = await onSubmit(score, trimmedComment);
    if (ok) {
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-[1px]"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rate-exchange-dialog-title"
        className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-6 sm:p-7 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="rate-exchange-dialog-title"
              className="font-display text-xl font-bold tracking-tight text-slate-900"
            >
              {isEdit ? 'Edit your exchange rating' : 'Rate this completed exchange'}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Share feedback about this specific fulfilled handoff with{' '}
              <span className="font-medium text-slate-900">{target.rateeName}</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close rating dialog"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-3.5 text-xs sm:text-sm text-slate-700 space-y-1">
          <p>
            <span className="font-semibold text-slate-900">Completed exchange:</span>{' '}
            {target.exchangeSummary}
          </p>
          <p className="text-xs text-slate-500">
            Rating {target.rateeName} as the {rateeRoleLabel} · Visible to signed-in students
            without phone numbers.
          </p>
        </div>

        <form onSubmit={handleFormSubmit} className="mt-5 space-y-5" noValidate>
          {validationError && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
            >
              {validationError}
            </div>
          )}

          <div>
            <span className="block text-sm font-medium text-slate-900">
              How did this exchange go?
            </span>
            <div
              role="group"
              aria-label="Star rating from 1 to 5"
              className="mt-2.5 flex items-center gap-2"
              onMouseLeave={() => setHoveredScore(0)}
            >
              {[1, 2, 3, 4, 5].map((value) => {
                const isLit = value <= activeScore;
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={submitting}
                    onMouseEnter={() => setHoveredScore(value)}
                    onClick={() => {
                      setScore(value);
                      if (validationError) setValidationError(null);
                    }}
                    aria-label={`Rate ${value} ${value === 1 ? 'star' : 'stars'}`}
                    aria-pressed={score === value}
                    className={`min-w-[44px] min-h-[44px] rounded-xl border flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:opacity-50 ${
                      isLit
                        ? 'bg-amber-50 border-amber-300 text-amber-500'
                        : 'bg-white border-slate-200 text-slate-300 hover:border-slate-300'
                    }`}
                  >
                    <Star
                      className={`w-6 h-6 ${isLit ? 'fill-amber-400 text-amber-500' : 'text-slate-300'}`}
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs font-medium text-slate-600 tabular-nums">
              {activeScore > 0
                ? SCORE_LABELS[activeScore]
                : 'Select 1 to 5 stars for this completed exchange'}
            </p>
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-2">
              <label
                htmlFor="exchange-rating-comment"
                className="block text-sm font-medium text-slate-900"
              >
                Written comment <span className="font-normal text-slate-500">(optional)</span>
              </label>
              <span className="text-xs text-slate-500 tabular-nums">
                {trimmedComment.length}/{RATING_LIMITS.commentMax}
              </span>
            </div>
            <textarea
              id="exchange-rating-comment"
              rows={3}
              maxLength={RATING_LIMITS.commentMax}
              value={comment}
              onChange={(event) => {
                setComment(event.target.value);
                if (validationError) setValidationError(null);
              }}
              placeholder="e.g., Met on time outside the library and returned the calculator in great condition."
              disabled={submitting}
              className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700 disabled:bg-slate-50 resize-y"
            />
          </div>

          <div className="pt-1 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 transition-colors inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>{isEdit ? 'Saving changes...' : 'Submitting rating...'}</span>
                </>
              ) : (
                <span>{isEdit ? 'Save changes' : 'Submit rating'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
