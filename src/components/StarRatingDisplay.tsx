import { Star } from 'lucide-react';
import type { UserRatingSummary } from '../data/campusItems';

interface StarRatingDisplayProps {
  userId: string;
  userName: string;
  summary: UserRatingSummary | undefined;
  onOpenProfile: (userId: string, userName: string) => void;
  compact?: boolean;
}

export function StarRatingDisplay({
  userId,
  userName,
  summary,
  onOpenProfile,
  compact = false,
}: StarRatingDisplayProps) {
  const count = summary?.count ?? 0;
  const average = summary?.averageScore ?? 0;
  const hasRatings = count > 0;

  const ariaLabel = hasRatings
    ? `View public ratings for ${userName}: ${average.toFixed(1)} out of 5 from ${count} ${count === 1 ? 'rating' : 'ratings'}`
    : `View public ratings for ${userName}: No ratings yet`;

  return (
    <button
      type="button"
      onClick={() => onOpenProfile(userId, userName)}
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 rounded py-0.5 transition-colors cursor-pointer text-left whitespace-nowrap shrink-0"
    >
      <Star
        className={`w-3.5 h-3.5 shrink-0 ${
          hasRatings ? 'fill-amber-400 text-amber-500' : 'text-slate-400'
        }`}
        aria-hidden="true"
      />
      {hasRatings ? (
        <span className="inline-flex items-center gap-1 tabular-nums">
          <span className="font-semibold text-slate-800">{average.toFixed(1)}</span>
          <span className="text-slate-500">
            {compact ? `(${count})` : `(${count} ${count === 1 ? 'rating' : 'ratings'})`}
          </span>
        </span>
      ) : (
        <span className="text-slate-500">No ratings yet</span>
      )}
    </button>
  );
}

export function StarScoreRow({ score, size = 'sm' }: { score: number; size?: 'sm' | 'md' }) {
  const iconClass = size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5';
  const rounded = Math.round(score);

  return (
    <div
      className="inline-flex items-center gap-0.5"
      aria-label={`${score.toFixed(score % 1 === 0 ? 0 : 1)} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          className={`${iconClass} ${
            value <= rounded ? 'fill-amber-400 text-amber-500' : 'text-slate-300'
          }`}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
