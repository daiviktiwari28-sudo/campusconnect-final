import { Pencil, Search, Star, User } from 'lucide-react';
import type { ExchangeRating, UserRatingSummary } from '../data/campusItems';
import type { PublicStudentProfile } from '../hooks/usePublicProfiles';
import { formatRemainingEditWindow, isRatingEditable } from '../hooks/useRatings';
import { formatBranchSemester } from '../lib/profileUtils';
import { StarScoreRow } from './StarRatingDisplay';

export interface ProfileReviewCandidate {
  userId: string;
  displayName: string;
}

interface ProfileReviewsPanelProps {
  selectedProfile: ProfileReviewCandidate;
  availableProfiles: ProfileReviewCandidate[];
  publicProfilesById: Record<string, PublicStudentProfile>;
  ratingSummaryByUserId: Record<string, UserRatingSummary>;
  currentUserId: string;
  searchQuery: string;
  loading: boolean;
  onSelectProfile: (userId: string, displayName: string) => void;
  onEditRating: (rating: ExchangeRating) => void;
  onOpenEditProfile: () => void;
  onClearSearch: () => void;
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

export function ProfileReviewsPanel({
  selectedProfile,
  availableProfiles,
  publicProfilesById,
  ratingSummaryByUserId,
  currentUserId,
  searchQuery,
  loading,
  onSelectProfile,
  onEditRating,
  onOpenEditProfile,
  onClearSearch,
}: ProfileReviewsPanelProps) {
  const publicInfo = publicProfilesById[selectedProfile.userId];
  const resolvedDisplayName = publicInfo?.displayName || selectedProfile.displayName;
  const academicMeta = formatBranchSemester(publicInfo?.branch, publicInfo?.semester);

  const summary = ratingSummaryByUserId[selectedProfile.userId];
  const allRatings = summary?.ratings ?? [];
  const count = summary?.count ?? 0;
  const average = summary?.averageScore ?? 0;
  const isSelf = selectedProfile.userId === currentUserId;
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredRatings = normalizedQuery
    ? allRatings.filter(
        (rating) =>
          rating.comment.toLowerCase().includes(normalizedQuery) ||
          rating.raterName.toLowerCase().includes(normalizedQuery) ||
          rating.exchangeSummary.toLowerCase().includes(normalizedQuery)
      )
    : allRatings;

  const starCounts = [5, 4, 3, 2, 1].map((starValue) => ({
    starValue,
    total: allRatings.filter((r) => r.score === starValue).length,
  }));

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 animate-pulse space-y-4">
        <div className="h-5 w-40 bg-slate-200 rounded" />
        <div className="h-8 w-64 bg-slate-200 rounded" />
        <div className="h-24 w-full bg-slate-100 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Selected Student Profile Summary Card */}
      <section
        aria-label="Public student profile and rating summary"
        className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8"
      >
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500">JDCOEM student profile</p>
            <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900">
              {resolvedDisplayName}
              {isSelf ? ' (You)' : ''}
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-700">
              {academicMeta ? academicMeta : 'Branch & semester not added yet'}
            </p>
            <p className="mt-1 text-xs sm:text-sm text-slate-500">
              Ratings come strictly from fulfilled campus exchanges · Phone numbers are never
              shown here
            </p>

            {isSelf && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={onOpenEditProfile}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Edit my profile</span>
                </button>
              </div>
            )}

            {count > 0 ? (
              <div className="mt-5 flex flex-wrap items-center gap-3.5">
                <span className="font-display text-3xl font-bold text-slate-900 tabular-nums">
                  {average.toFixed(1)}
                </span>
                <div className="flex flex-col gap-0.5">
                  <StarScoreRow score={average} size="md" />
                  <span className="text-xs sm:text-sm text-slate-600 tabular-nums">
                    Based on {count} completed exchange {count === 1 ? 'rating' : 'ratings'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-5 flex items-center gap-2 text-sm font-medium text-slate-600">
                <Star className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                <span>No ratings yet</span>
              </div>
            )}
          </div>

          <div className="w-full lg:w-80 shrink-0 space-y-3">
            <div>
              <label
                htmlFor="profile-review-student-select"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Inspect student profile
              </label>
              <div className="relative">
                <User
                  className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <select
                  id="profile-review-student-select"
                  value={selectedProfile.userId}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    const match = availableProfiles.find((p) => p.userId === nextId);
                    if (match) {
                      const nextName =
                        publicProfilesById[match.userId]?.displayName || match.displayName;
                      onSelectProfile(match.userId, nextName);
                    }
                  }}
                  className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700 cursor-pointer"
                >
                  {availableProfiles.map((candidate) => {
                    const candidatePublic = publicProfilesById[candidate.userId];
                    const candidateName = candidatePublic?.displayName || candidate.displayName;
                    const candidateAcademic = formatBranchSemester(
                      candidatePublic?.branch,
                      candidatePublic?.semester
                    );
                    const candidateSummary = ratingSummaryByUserId[candidate.userId];
                    const scoreLabel =
                      candidateSummary && candidateSummary.count > 0
                        ? ` — ${candidateSummary.averageScore.toFixed(1)} (${candidateSummary.count})`
                        : ' — No ratings yet';
                    const selfSuffix = candidate.userId === currentUserId ? ' (You)' : '';
                    const academicSuffix = candidateAcademic ? ` · ${candidateAcademic}` : '';
                    return (
                      <option key={candidate.userId} value={candidate.userId}>
                        {candidateName}
                        {selfSuffix}
                        {academicSuffix}
                        {scoreLabel}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {!isSelf && (
              <button
                type="button"
                onClick={() => {
                  const selfPublic = publicProfilesById[currentUserId];
                  const selfProfile = availableProfiles.find((p) => p.userId === currentUserId);
                  onSelectProfile(
                    currentUserId,
                    selfPublic?.displayName || selfProfile?.displayName || 'You'
                  );
                }}
                className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
              >
                Switch back to your own profile
              </button>
            )}

            {count > 0 && (
              <div className="pt-2 border-t border-slate-100 space-y-1.5">
                {starCounts.map(({ starValue, total }) => {
                  const pct = count > 0 ? Math.round((total / count) * 100) : 0;
                  return (
                    <div
                      key={starValue}
                      className="flex items-center justify-between gap-3 text-xs text-slate-600 tabular-nums"
                    >
                      <span className="font-medium text-slate-700 inline-flex items-center gap-1">
                        <span>{starValue}</span>
                        <Star
                          className="w-3 h-3 fill-amber-400 text-amber-500"
                          aria-hidden="true"
                        />
                      </span>
                      <span className="text-slate-500">
                        {total} ({pct}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Reviews List */}
      {allRatings.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center max-w-xl mx-auto">
          <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
            <Star className="w-5 h-5" aria-hidden="true" />
          </div>
          <h3 className="mt-4 font-display text-lg font-semibold text-slate-900">
            No completed exchange ratings yet
          </h3>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            Ratings appear here after{' '}
            {isSelf ? 'you complete' : `${resolvedDisplayName} completes`} a fulfilled borrow or
            lend exchange and the other student submits feedback.
          </p>
        </div>
      ) : filteredRatings.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center max-w-xl mx-auto">
          <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
            <Search className="w-5 h-5" aria-hidden="true" />
          </div>
          <h3 className="mt-4 font-display text-lg font-semibold text-slate-900">
            No matching reviews
          </h3>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            Nothing matched “<span className="font-medium text-slate-900">{searchQuery.trim()}</span>
            ” in {isSelf ? 'your' : `${resolvedDisplayName}’s`} reviews.
          </p>
          <button
            type="button"
            onClick={onClearSearch}
            className="mt-6 min-h-[40px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Clear search
          </button>
        </div>
      ) : (
        <section
          aria-label="Exchange reviews list"
          className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-200"
        >
          {filteredRatings.map((rating) => {
            const isAuthor = rating.raterId === currentUserId;
            const editable = isAuthor && isRatingEditable(rating);
            const roleRatedLabel =
              rating.raterRole === 'borrower' ? 'Rated as Lender' : 'Rated as Borrower';
            const raterPublic = publicProfilesById[rating.raterId];
            const raterDisplayName = raterPublic?.displayName || rating.raterName;
            const raterAcademic = formatBranchSemester(
              raterPublic?.branch,
              raterPublic?.semester
            );

            return (
              <article key={rating.id} className="p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <StarScoreRow score={rating.score} />
                    <span className="text-xs font-semibold text-slate-800 tabular-nums">
                      {rating.score}/5
                    </span>
                    <span className="text-slate-300" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-xs font-medium text-slate-600">{roleRatedLabel}</span>
                  </div>

                  <span className="text-xs text-slate-500 tabular-nums">
                    Submitted {formatDateTime(rating.createdAtMs)}
                  </span>
                </div>

                {rating.comment ? (
                  <p className="mt-3 text-sm sm:text-[15px] text-slate-800 leading-relaxed">
                    {rating.comment}
                  </p>
                ) : (
                  <p className="mt-3 text-xs italic text-slate-500">
                    No written comment provided for this exchange.
                  </p>
                )}

                <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>
                      Completed exchange:{' '}
                      <span className="font-medium text-slate-700">{rating.exchangeSummary}</span>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      By{' '}
                      <button
                        type="button"
                        onClick={() => onSelectProfile(rating.raterId, raterDisplayName)}
                        className="font-medium text-blue-700 hover:underline cursor-pointer"
                      >
                        {isAuthor ? 'You' : raterDisplayName}
                      </button>
                      {raterAcademic ? ` (${raterAcademic})` : ''}
                    </span>
                    {rating.isEdited && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-medium text-slate-700 tabular-nums">
                          Updated {formatDateTime(rating.updatedAtMs)}
                        </span>
                      </>
                    )}
                  </div>

                  {editable && (
                    <button
                      type="button"
                      onClick={() => onEditRating(rating)}
                      className="min-h-[32px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Pencil className="w-3 h-3" aria-hidden="true" />
                      <span>Edit ({formatRemainingEditWindow(rating)})</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
