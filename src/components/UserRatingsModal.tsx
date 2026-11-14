import { useEffect } from 'react';
import { Pencil, Star, X } from 'lucide-react';
import type { ExchangeRating, UserRatingSummary } from '../data/campusItems';
import { formatRemainingEditWindow, isRatingEditable } from '../hooks/useRatings';
import { StarScoreRow } from './StarRatingDisplay';

export interface ProfileRatingTarget {
  userId: string;
  displayName: string;
}

interface UserRatingsModalProps {
  profile: ProfileRatingTarget | null;
  summary: UserRatingSummary | undefined;
  currentUserId: string;
  onClose: () => void;
  onSelectUser: (userId: string, displayName: string) => void;
  onEditRating: (rating: ExchangeRating) => void;
}

function formatDateTime(ms: number): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(ms));
  } catch {
    return 'Recently';
  }
}

export function UserRatingsModal({
  profile,
  summary,
  currentUserId,
  onClose,
  onSelectUser,
  onEditRating,
}: UserRatingsModalProps) {
  useEffect(() => {
    if (!profile) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [profile, onClose]);

  if (!profile) return null;

  const isSelf = profile.userId === currentUserId;
  const ratings = summary?.ratings ?? [];
  const count = summary?.count ?? 0;
  const average = summary?.averageScore ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-ratings-dialog-title"
        className="w-full max-w-xl max-h-[88vh] flex flex-col bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="p-6 pb-5 border-b border-slate-200 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500">Public exchange profile</p>
            <h2
              id="user-ratings-dialog-title"
              className="mt-1 font-display text-xl font-bold tracking-tight text-slate-900 truncate"
            >
              {profile.displayName}
              {isSelf ? ' (You)' : ''}
            </h2>

            {count > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="font-display text-2xl font-bold text-slate-900 tabular-nums">
                  {average.toFixed(1)}
                </span>
                <StarScoreRow score={average} size="md" />
                <span className="text-sm text-slate-600 tabular-nums">
                  ({count} {count === 1 ? 'completed exchange rating' : 'completed exchange ratings'})
                </span>
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                <Star className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                <span>No ratings yet</span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile ratings dialog"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {ratings.length === 0 ? (
            <div className="text-center py-8 px-4">
              <p className="font-display text-base font-semibold text-slate-900">
                No completed exchange ratings yet
              </p>
              <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
                Ratings appear here after {isSelf ? 'you complete' : `${profile.displayName} completes`}{' '}
                a fulfilled borrow or lend exchange and the other student leaves feedback.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-200">
              {ratings.map((rating) => {
                const isAuthor = rating.raterId === currentUserId;
                const editable = isAuthor && isRatingEditable(rating);
                const roleRatedLabel =
                  rating.raterRole === 'borrower' ? 'Rated as Lender' : 'Rated as Borrower';

                return (
                  <li key={rating.id} className="py-5 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <StarScoreRow score={rating.score} />
                        <span className="text-xs font-semibold text-slate-800 tabular-nums">
                          {rating.score}/5
                        </span>
                        <span className="text-slate-300" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-xs text-slate-600">{roleRatedLabel}</span>
                      </div>

                      <span className="text-xs text-slate-500 tabular-nums">
                        {formatDateTime(rating.createdAtMs)}
                      </span>
                    </div>

                    {rating.comment ? (
                      <p className="mt-2.5 text-sm text-slate-800 leading-relaxed">
                        {rating.comment}
                      </p>
                    ) : (
                      <p className="mt-2.5 text-xs italic text-slate-500">
                        No written comment provided for this exchange.
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span>
                          Exchange:{' '}
                          <span className="font-medium text-slate-700">
                            {rating.exchangeSummary}
                          </span>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          By{' '}
                          <button
                            type="button"
                            onClick={() => onSelectUser(rating.raterId, rating.raterName)}
                            className="font-medium text-blue-700 hover:underline cursor-pointer"
                          >
                            {isAuthor ? 'You' : rating.raterName}
                          </button>
                        </span>
                        {rating.isEdited && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-slate-600 tabular-nums">
                              Updated {formatDateTime(rating.updatedAtMs)}
                            </span>
                          </>
                        )}
                      </div>

                      {editable && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onEditRating(rating);
                          }}
                          className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline cursor-pointer"
                        >
                          <Pencil className="w-3 h-3" aria-hidden="true" />
                          <span>Edit ({formatRemainingEditWindow(rating)})</span>
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
