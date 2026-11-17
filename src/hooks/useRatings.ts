import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  CAMPUS_ITEM_LIMITS,
  RATING_LIMITS,
  type CampusRequest,
  type ExchangeRating,
  type RatingRole,
  type UserRatingSummary,
} from '../data/campusItems';
import { db, handleFirestoreError, isFirebaseConfigured, OperationType } from '../lib/firebase';
import type { CampusUser } from './useAuth';

const RATINGS_COLLECTION = 'exchangeRatings';

function toMillis(value: unknown): number {
  return value instanceof Timestamp ? value.toMillis() : Date.now();
}

function isAllowedRole(value: unknown): value is RatingRole {
  return value === 'borrower' || value === 'lender';
}

export function buildExchangeSummary(request: CampusRequest): string {
  const raw = request.itemTitle?.trim() || request.description.trim() || 'Completed exchange';
  if (raw.length <= RATING_LIMITS.exchangeSummaryMax) {
    return raw;
  }
  return `${raw.slice(0, RATING_LIMITS.exchangeSummaryMax - 1).trimEnd()}…`;
}

export function buildRatingDocId(requestId: string, raterId: string): string {
  return `${requestId}_${raterId}`;
}

export function isRatingEditable(rating: ExchangeRating, nowMs = Date.now()): boolean {
  return nowMs - rating.createdAtMs < RATING_LIMITS.editWindowMs;
}

export function formatRemainingEditWindow(rating: ExchangeRating, nowMs = Date.now()): string {
  const remainingMs = rating.createdAtMs + RATING_LIMITS.editWindowMs - nowMs;
  if (remainingMs <= 0) return 'Edit window closed';
  const totalMinutes = Math.ceil(remainingMs / (60 * 1000));
  if (totalMinutes < 60) {
    return `${totalMinutes}m left to edit`;
  }
  const hours = Math.floor(totalMinutes / 60);
  return `${hours}h left to edit`;
}

export function useRatings(user: CampusUser) {
  const [ratings, setRatings] = useState<ExchangeRating[]>([]);
  const [ratingsLoading, setRatingsLoading] = useState<boolean>(
    Boolean(db && isFirebaseConfigured)
  );
  const [submittingRating, setSubmittingRating] = useState<boolean>(false);
  const [ratingsError, setRatingsError] = useState<string | null>(null);
  const [ratingStatusMessage, setRatingStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!db || !isFirebaseConfigured || !user.uid) {
      setRatingsLoading(false);
      return;
    }

    setRatingsLoading(true);

    const ratingsQuery = query(
      collection(db, RATINGS_COLLECTION),
      where('visibility', '==', 'campus')
    );

    const unsubscribe = onSnapshot(
      ratingsQuery,
      (snapshot) => {
        const loaded: ExchangeRating[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          const scoreRaw = typeof data.score === 'number' ? Math.round(data.score) : 5;
          const score = Math.min(RATING_LIMITS.scoreMax, Math.max(RATING_LIMITS.scoreMin, scoreRaw));

          return {
            id: docSnap.id,
            requestId: typeof data.requestId === 'string' ? data.requestId : '',
            exchangeSummary:
              typeof data.exchangeSummary === 'string' && data.exchangeSummary.trim()
                ? data.exchangeSummary
                : 'Completed campus exchange',
            raterId: typeof data.raterId === 'string' ? data.raterId : '',
            raterName:
              typeof data.raterName === 'string' && data.raterName.trim()
                ? data.raterName
                : 'Campus Student',
            raterRole: isAllowedRole(data.raterRole) ? data.raterRole : 'borrower',
            rateeId: typeof data.rateeId === 'string' ? data.rateeId : '',
            rateeName:
              typeof data.rateeName === 'string' && data.rateeName.trim()
                ? data.rateeName
                : 'Campus Student',
            score,
            comment: typeof data.comment === 'string' ? data.comment : '',
            isEdited: Boolean(data.isEdited),
            createdAtMs: toMillis(data.createdAt),
            updatedAtMs: toMillis(data.updatedAt ?? data.createdAt),
          };
        });

        loaded.sort((a, b) => b.createdAtMs - a.createdAtMs);
        setRatings(loaded);
        setRatingsLoading(false);
      },
      (err) => {
        setRatingsLoading(false);
        setRatingsError('Could not load exchange ratings from Cloud Firestore right now.');
        try {
          handleFirestoreError(err, OperationType.LIST, RATINGS_COLLECTION);
        } catch {
          // Structured error logged in handleFirestoreError
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [user.uid]);

  const ratingSummaryByUserId = useMemo<Record<string, UserRatingSummary>>(() => {
    const grouped: Record<string, { displayName: string; ratings: ExchangeRating[] }> = {};

    for (const rating of ratings) {
      if (!rating.rateeId) continue;
      if (!grouped[rating.rateeId]) {
        grouped[rating.rateeId] = {
          displayName: rating.rateeName,
          ratings: [],
        };
      }
      grouped[rating.rateeId].ratings.push(rating);
    }

    const result: Record<string, UserRatingSummary> = {};
    for (const [userId, group] of Object.entries(grouped)) {
      const total = group.ratings.reduce((sum, item) => sum + item.score, 0);
      const count = group.ratings.length;
      result[userId] = {
        userId,
        displayName: group.displayName,
        averageScore: count > 0 ? total / count : 0,
        count,
        ratings: group.ratings,
      };
    }

    return result;
  }, [ratings]);

  const ratingsByRequestAndRater = useMemo<Record<string, ExchangeRating>>(() => {
    const map: Record<string, ExchangeRating> = {};
    for (const rating of ratings) {
      if (rating.requestId && rating.raterId) {
        map[buildRatingDocId(rating.requestId, rating.raterId)] = rating;
      }
    }
    return map;
  }, [ratings]);

  const getRatingForRequestByUser = useCallback(
    (requestId: string, raterId: string): ExchangeRating | undefined => {
      return ratingsByRequestAndRater[buildRatingDocId(requestId, raterId)];
    },
    [ratingsByRequestAndRater]
  );

  const submitRating = useCallback(
    async (request: CampusRequest, rawScore: number, rawComment: string): Promise<boolean> => {
      if (!db || !isFirebaseConfigured) {
        setRatingsError('Shared database is not configured.');
        return false;
      }

      if (
        request.status !== 'Fulfilled' ||
        !request.acceptedById ||
        !request.borrowerFulfilled ||
        !request.lenderFulfilled
      ) {
        setRatingsError(
          'Ratings can only be submitted after both the borrower and lender mark the exchange as Fulfilled.'
        );
        return false;
      }

      let raterRole: RatingRole;
      let rateeId: string;
      let rateeName: string;

      if (request.requesterId === user.uid) {
        raterRole = 'borrower';
        rateeId = request.acceptedById;
        rateeName = request.acceptedByName?.trim() || 'Campus Student';
      } else if (request.acceptedById === user.uid) {
        raterRole = 'lender';
        rateeId = request.requesterId;
        rateeName = request.requesterName?.trim() || 'Campus Student';
      } else {
        setRatingsError('Only the borrower and lender from this fulfilled exchange can rate each other.');
        return false;
      }

      if (rateeId === user.uid) {
        setRatingsError('You cannot rate yourself.');
        return false;
      }

      const score = Math.round(rawScore);
      if (
        !Number.isInteger(score) ||
        score < RATING_LIMITS.scoreMin ||
        score > RATING_LIMITS.scoreMax
      ) {
        setRatingsError('Please choose a star rating from 1 to 5.');
        return false;
      }

      const comment = rawComment.trim().slice(0, RATING_LIMITS.commentMax);
      const safeRaterName = (user.displayName?.trim() || 'Campus Student').slice(
        0,
        CAMPUS_ITEM_LIMITS.authorNameMax
      );
      const safeRateeName = rateeName.slice(0, CAMPUS_ITEM_LIMITS.authorNameMax);
      const exchangeSummary = buildExchangeSummary(request);
      const ratingId = buildRatingDocId(request.id, user.uid);
      const ratingRef = doc(db, RATINGS_COLLECTION, ratingId);
      const ratingPath = `${RATINGS_COLLECTION}/${ratingId}`;

      setSubmittingRating(true);
      setRatingsError(null);
      setRatingStatusMessage(null);

      try {
        const firestoreDb = db;
        await runTransaction(firestoreDb, async (transaction) => {
          const existingSnap = await transaction.get(ratingRef);
          if (existingSnap.exists()) {
            throw new Error('ALREADY_RATED');
          }

          transaction.set(ratingRef, {
            requestId: request.id,
            exchangeSummary,
            raterId: user.uid,
            raterName: safeRaterName,
            raterRole,
            rateeId,
            rateeName: safeRateeName,
            score,
            comment,
            isEdited: false,
            visibility: 'campus',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });

        setRatingStatusMessage(`Your rating for ${safeRateeName} has been published.`);
        return true;
      } catch (err) {
        if (err instanceof Error && err.message === 'ALREADY_RATED') {
          setRatingsError('You have already submitted a rating for this fulfilled exchange.');
          return false;
        }

        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.includes('Missing or insufficient permissions')) {
          setRatingsError(
            'Unable to submit this rating. Make sure the exchange is Fulfilled and you have not already rated it.'
          );
        } else {
          setRatingsError('Could not submit your rating right now. Please try again.');
        }

        try {
          handleFirestoreError(err, OperationType.CREATE, ratingPath);
        } catch {
          // Structured error logged in handleFirestoreError
        }
        return false;
      } finally {
        setSubmittingRating(false);
      }
    },
    [user.displayName, user.uid]
  );

  const updateRating = useCallback(
    async (rating: ExchangeRating, rawScore: number, rawComment: string): Promise<boolean> => {
      if (!db || !isFirebaseConfigured) {
        setRatingsError('Shared database is not configured.');
        return false;
      }

      if (rating.raterId !== user.uid) {
        setRatingsError('You can only edit your own ratings.');
        return false;
      }

      if (!isRatingEditable(rating)) {
        setRatingsError('The 24-hour edit window for this rating has expired.');
        return false;
      }

      const score = Math.round(rawScore);
      if (
        !Number.isInteger(score) ||
        score < RATING_LIMITS.scoreMin ||
        score > RATING_LIMITS.scoreMax
      ) {
        setRatingsError('Please choose a star rating from 1 to 5.');
        return false;
      }

      const comment = rawComment.trim().slice(0, RATING_LIMITS.commentMax);
      const ratingRef = doc(db, RATINGS_COLLECTION, rating.id);
      const ratingPath = `${RATINGS_COLLECTION}/${rating.id}`;

      setSubmittingRating(true);
      setRatingsError(null);
      setRatingStatusMessage(null);

      try {
        await updateDoc(ratingRef, {
          score,
          comment,
          isEdited: true,
          updatedAt: serverTimestamp(),
        });

        setRatingStatusMessage(`Your rating for ${rating.rateeName} has been updated.`);
        return true;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.includes('Missing or insufficient permissions')) {
          setRatingsError(
            'Could not update this rating. Ratings can only be edited by their author within 24 hours of submission.'
          );
        } else {
          setRatingsError('Could not update your rating right now. Please try again.');
        }

        try {
          handleFirestoreError(err, OperationType.UPDATE, ratingPath);
        } catch {
          // Structured error logged in handleFirestoreError
        }
        return false;
      } finally {
        setSubmittingRating(false);
      }
    },
    [user.uid]
  );

  const clearRatingsError = useCallback(() => {
    setRatingsError(null);
  }, []);

  const clearRatingStatusMessage = useCallback(() => {
    setRatingStatusMessage(null);
  }, []);

  return {
    ratings,
    ratingsLoading,
    submittingRating,
    ratingsError,
    ratingStatusMessage,
    ratingSummaryByUserId,
    getRatingForRequestByUser,
    submitRating,
    updateRating,
    clearRatingsError,
    clearRatingStatusMessage,
  };
}
