import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  CAMPUS_ITEM_LIMITS,
  PAYMENT_LIMITS,
  type CampusItem,
  type PurchaseParticipantRole,
  type PurchaseRequest,
  type PurchaseRequestStatus,
} from '../data/campusItems';
import type { CampusUser } from './useAuth';
import { db, handleFirestoreError, isFirebaseConfigured, OperationType } from '../lib/firebase';

const PURCHASE_REQUESTS_COLLECTION = 'purchaseRequests';
const PURCHASE_LOCKS_COLLECTION = 'purchaseRequestLocks';
const ITEMS_COLLECTION = 'campusItems';

function toMillis(value: unknown): number {
  return value instanceof Timestamp ? value.toMillis() : Date.now();
}

function toNullableMillis(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null;
}

function isAllowedStatus(value: unknown): value is PurchaseRequestStatus {
  return value === 'Pending' || value === 'Completed' || value === 'Cancelled';
}

function isAllowedRole(value: unknown): value is PurchaseParticipantRole {
  return value === 'borrower' || value === 'lender';
}

function mapPurchaseRequestDoc(id: string, data: Record<string, unknown>): PurchaseRequest {
  const listedPrice =
    typeof data.listedPrice === 'number' && Number.isFinite(data.listedPrice)
      ? data.listedPrice
      : 0;
  const finalAmount =
    typeof data.finalAmount === 'number' && Number.isFinite(data.finalAmount)
      ? data.finalAmount
      : listedPrice;

  return {
    id,
    itemId: typeof data.itemId === 'string' ? data.itemId : '',
    itemTitle: typeof data.itemTitle === 'string' ? data.itemTitle : 'Permanent Item',
    itemPhotoUrl: typeof data.itemPhotoUrl === 'string' ? data.itemPhotoUrl : null,
    listedPrice,
    finalAmount,
    borrowerId: typeof data.borrowerId === 'string' ? data.borrowerId : '',
    borrowerName: typeof data.borrowerName === 'string' ? data.borrowerName : 'Borrower',
    borrowerPhone: typeof data.borrowerPhone === 'string' ? data.borrowerPhone : '',
    borrowerRatingAverage:
      typeof data.borrowerRatingAverage === 'number' &&
      Number.isFinite(data.borrowerRatingAverage)
        ? data.borrowerRatingAverage
        : 0,
    borrowerRatingCount:
      typeof data.borrowerRatingCount === 'number' &&
      Number.isFinite(data.borrowerRatingCount)
        ? data.borrowerRatingCount
        : 0,
    lenderId: typeof data.lenderId === 'string' ? data.lenderId : '',
    lenderName: typeof data.lenderName === 'string' ? data.lenderName : 'Lender',
    lenderPhone: typeof data.lenderPhone === 'string' ? data.lenderPhone : '',
    status: isAllowedStatus(data.status) ? data.status : 'Pending',
    borrowerConfirmed: Boolean(data.borrowerConfirmed),
    borrowerConfirmedAtMs: toNullableMillis(data.borrowerConfirmedAt),
    lenderConfirmed: Boolean(data.lenderConfirmed),
    lenderConfirmedAtMs: toNullableMillis(data.lenderConfirmedAt),
    completedAtMs: toNullableMillis(data.completedAt),
    cancelledAtMs: toNullableMillis(data.cancelledAt),
    cancelledById: typeof data.cancelledById === 'string' ? data.cancelledById : null,
    cancelledByRole: isAllowedRole(data.cancelledByRole) ? data.cancelledByRole : null,
    createdAtMs: toMillis(data.createdAt),
    updatedAtMs: toMillis(data.updatedAt ?? data.createdAt),
  };
}

function getLockDocId(itemId: string, borrowerId: string): string {
  return `${itemId}_${borrowerId}`;
}

export function usePurchaseRequests(
  user: CampusUser,
  displayName: string,
  userPhone: string | null,
  isAdmin: boolean
) {
  const [borrowerRequests, setBorrowerRequests] = useState<PurchaseRequest[]>([]);
  const [lenderRequests, setLenderRequests] = useState<PurchaseRequest[]>([]);
  const [allAdminPurchaseRequests, setAllAdminPurchaseRequests] = useState<PurchaseRequest[]>([]);
  const [purchaseRequestsLoading, setPurchaseRequestsLoading] = useState<boolean>(
    Boolean(db && isFirebaseConfigured)
  );
  const [submittingPurchaseRequest, setSubmittingPurchaseRequest] = useState<boolean>(false);
  const [updatingPurchaseId, setUpdatingPurchaseId] = useState<string | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [purchaseStatusMessage, setPurchaseStatusMessage] = useState<string | null>(null);
  const [incomingPurchaseAlert, setIncomingPurchaseAlert] = useState<PurchaseRequest | null>(null);

  const initialLenderLoadRef = useRef<boolean>(true);
  const knownLenderRequestIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!db || !isFirebaseConfigured || !user.uid) {
      setPurchaseRequestsLoading(false);
      return;
    }

    setPurchaseRequestsLoading(true);
    initialLenderLoadRef.current = true;
    knownLenderRequestIdsRef.current = new Set();

    let borrowerLoaded = false;
    let lenderLoaded = false;

    const finishIfReady = () => {
      if (borrowerLoaded && lenderLoaded) {
        setPurchaseRequestsLoading(false);
      }
    };

    const borrowerQuery = query(
      collection(db, PURCHASE_REQUESTS_COLLECTION),
      where('borrowerId', '==', user.uid)
    );
    const lenderQuery = query(
      collection(db, PURCHASE_REQUESTS_COLLECTION),
      where('lenderId', '==', user.uid)
    );

    const unsubBorrower = onSnapshot(
      borrowerQuery,
      (snapshot) => {
        setBorrowerRequests(snapshot.docs.map((d) => mapPurchaseRequestDoc(d.id, d.data())));
        borrowerLoaded = true;
        finishIfReady();
      },
      (err) => {
        borrowerLoaded = true;
        finishIfReady();
        try {
          handleFirestoreError(err, OperationType.LIST, PURCHASE_REQUESTS_COLLECTION);
        } catch {
          // Logged by handleFirestoreError
        }
      }
    );

    const unsubLender = onSnapshot(
      lenderQuery,
      (snapshot) => {
        const mapped = snapshot.docs.map((d) => mapPurchaseRequestDoc(d.id, d.data()));
        if (initialLenderLoadRef.current) {
          knownLenderRequestIdsRef.current = new Set(mapped.map((r) => r.id));
          initialLenderLoadRef.current = false;
        } else {
          const newestIncoming = mapped.find(
            (r) => r.status === 'Pending' && !knownLenderRequestIdsRef.current.has(r.id)
          );
          if (newestIncoming) {
            setIncomingPurchaseAlert(newestIncoming);
          }
          for (const r of mapped) {
            knownLenderRequestIdsRef.current.add(r.id);
          }
        }
        setLenderRequests(mapped);
        lenderLoaded = true;
        finishIfReady();
      },
      (err) => {
        lenderLoaded = true;
        finishIfReady();
        try {
          handleFirestoreError(err, OperationType.LIST, PURCHASE_REQUESTS_COLLECTION);
        } catch {
          // Logged by handleFirestoreError
        }
      }
    );

    return () => {
      unsubBorrower();
      unsubLender();
    };
  }, [user.uid]);

  useEffect(() => {
    if (!db || !isFirebaseConfigured || !user.uid || !isAdmin) {
      setAllAdminPurchaseRequests([]);
      return;
    }

    const adminQuery = query(collection(db, PURCHASE_REQUESTS_COLLECTION));
    const unsubscribe = onSnapshot(
      adminQuery,
      (snapshot) => {
        const mapped = snapshot.docs
          .map((d) => mapPurchaseRequestDoc(d.id, d.data()))
          .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
        setAllAdminPurchaseRequests(mapped);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, PURCHASE_REQUESTS_COLLECTION);
        } catch {
          // Logged by handleFirestoreError
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [isAdmin, user.uid]);

  const purchaseRequests = useMemo<PurchaseRequest[]>(() => {
    const byId = new Map<string, PurchaseRequest>();
    for (const req of borrowerRequests) byId.set(req.id, req);
    for (const req of lenderRequests) byId.set(req.id, req);
    return Array.from(byId.values()).sort((a, b) => {
      if (a.status === 'Pending' && b.status !== 'Pending') return -1;
      if (a.status !== 'Pending' && b.status === 'Pending') return 1;
      return b.updatedAtMs - a.updatedAtMs;
    });
  }, [borrowerRequests, lenderRequests]);

  const pendingPurchaseRequests = useMemo(
    () => purchaseRequests.filter((req) => req.status === 'Pending'),
    [purchaseRequests]
  );

  const createPurchaseRequest = useCallback(
    async (
      item: CampusItem,
      borrowerRatingAverage: number,
      borrowerRatingCount: number
    ): Promise<boolean> => {
      if (!db || !isFirebaseConfigured) {
        setPurchaseError('Shared database is not configured.');
        return false;
      }

      if (item.listingType !== 'sell') {
        setPurchaseError('Purchase requests are only available for permanent-sale items.');
        return false;
      }

      if (item.status !== 'Available') {
        setPurchaseError('This item is no longer available for purchase.');
        return false;
      }

      if (item.authorId === user.uid) {
        setPurchaseError('You cannot send a purchase request for your own listing.');
        return false;
      }

      const trimmedPhone = (userPhone || '').trim();
      if (
        trimmedPhone.length < CAMPUS_ITEM_LIMITS.phoneMin ||
        trimmedPhone.length > CAMPUS_ITEM_LIMITS.phoneMax
      ) {
        setPurchaseError('Please save your phone number in your student profile first.');
        return false;
      }

      const existingPending = borrowerRequests.find(
        (req) => req.itemId === item.id && req.status === 'Pending'
      );
      if (existingPending) {
        setPurchaseError('You already have a pending purchase request for this item.');
        return false;
      }

      const safeBorrowerName =
        displayName.trim().slice(0, CAMPUS_ITEM_LIMITS.authorNameMax) || 'Campus Student';
      const safeLenderName =
        item.authorName.trim().slice(0, CAMPUS_ITEM_LIMITS.authorNameMax) || 'Lender';
      const clampedRatingAvg = Math.max(
        0,
        Math.min(5, Math.round(borrowerRatingAverage * 100) / 100)
      );
      const clampedRatingCount = Math.max(0, Math.min(100000, Math.floor(borrowerRatingCount)));

      setSubmittingPurchaseRequest(true);
      setPurchaseError(null);
      setPurchaseStatusMessage(null);

      try {
        const requestRef = doc(collection(db, PURCHASE_REQUESTS_COLLECTION));
        const lockRef = doc(db, PURCHASE_LOCKS_COLLECTION, getLockDocId(item.id, user.uid));
        const batch = writeBatch(db);

        batch.set(requestRef, {
          itemId: item.id,
          itemTitle: item.title.trim().slice(0, CAMPUS_ITEM_LIMITS.titleMax),
          itemPhotoUrl: item.photoUrl || null,
          listedPrice: item.price,
          finalAmount: item.price,
          borrowerId: user.uid,
          borrowerName: safeBorrowerName,
          borrowerPhone: trimmedPhone,
          borrowerRatingAverage: clampedRatingAvg,
          borrowerRatingCount: clampedRatingCount,
          lenderId: item.authorId,
          lenderName: safeLenderName,
          lenderPhone: item.authorPhone,
          status: 'Pending',
          borrowerConfirmed: false,
          borrowerConfirmedAt: null,
          lenderConfirmed: false,
          lenderConfirmedAt: null,
          completedAt: null,
          cancelledAt: null,
          cancelledById: null,
          cancelledByRole: null,
          visibility: 'private',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        batch.set(lockRef, {
          requestId: requestRef.id,
          itemId: item.id,
          borrowerId: user.uid,
          lenderId: item.authorId,
          createdAt: serverTimestamp(),
        });

        await batch.commit();

        setPurchaseStatusMessage(
          `Purchase request sent privately to ${safeLenderName} for “${item.title}”. Contact each other to settle payment, then both confirm.`
        );
        return true;
      } catch (err) {
        try {
          handleFirestoreError(err, OperationType.CREATE, PURCHASE_REQUESTS_COLLECTION);
        } catch {
          // Logged by handleFirestoreError
        }
        const code =
          typeof err === 'object' && err !== null && 'code' in err
            ? String((err as { code?: unknown }).code)
            : '';
        if (code === 'permission-denied') {
          setPurchaseError(
            'Could not send purchase request. You may already have a pending request for this item, or the item is no longer available.'
          );
        } else {
          setPurchaseError('Could not send purchase request right now. Please try again.');
        }
        return false;
      } finally {
        setSubmittingPurchaseRequest(false);
      }
    },
    [borrowerRequests, displayName, user.uid, userPhone]
  );

  const confirmPurchasePayment = useCallback(
    async (req: PurchaseRequest, negotiatedFinalAmount?: number): Promise<boolean> => {
      if (!db || !isFirebaseConfigured) {
        setPurchaseError('Shared database is not configured.');
        return false;
      }

      if (req.status !== 'Pending') {
        setPurchaseError('This purchase request is no longer pending.');
        return false;
      }

      if (req.borrowerId !== user.uid && req.lenderId !== user.uid) {
        setPurchaseError('Only the involved borrower and lender can confirm this request.');
        return false;
      }

      if (typeof negotiatedFinalAmount === 'number') {
        if (
          !Number.isFinite(negotiatedFinalAmount) ||
          negotiatedFinalAmount < PAYMENT_LIMITS.minPrice ||
          negotiatedFinalAmount > PAYMENT_LIMITS.maxPrice
        ) {
          setPurchaseError(
            `Please enter a valid final amount between ₹${PAYMENT_LIMITS.minPrice} and ₹${PAYMENT_LIMITS.maxPrice}.`
          );
          return false;
        }
      }

      const firestoreDb = db;
      setUpdatingPurchaseId(req.id);
      setPurchaseError(null);
      setPurchaseStatusMessage(null);

      try {
        const requestRef = doc(firestoreDb, PURCHASE_REQUESTS_COLLECTION, req.id);
        const itemRef = doc(firestoreDb, ITEMS_COLLECTION, req.itemId);
        const lockRef = doc(
          firestoreDb,
          PURCHASE_LOCKS_COLLECTION,
          getLockDocId(req.itemId, req.borrowerId)
        );

        const outcome = await runTransaction(firestoreDb, async (transaction) => {
          // Read all involved documents before any writes
          const [requestSnap, itemSnap, lockSnap] = await Promise.all([
            transaction.get(requestRef),
            transaction.get(itemRef),
            transaction.get(lockRef),
          ]);

          if (!requestSnap.exists()) {
            throw new Error('REQUEST_NOT_FOUND');
          }

          const data = requestSnap.data();
          if (data.status !== 'Pending') {
            throw new Error('NOT_PENDING');
          }

          const isBorrower = data.borrowerId === user.uid;
          const isLender = data.lenderId === user.uid;
          if (!isBorrower && !isLender) {
            throw new Error('UNAUTHORIZED');
          }

          const prevBorrowerConfirmed = data.borrowerConfirmed === true;
          const prevLenderConfirmed = data.lenderConfirmed === true;

          if ((isBorrower && prevBorrowerConfirmed) || (isLender && prevLenderConfirmed)) {
            return { completed: false, alreadyConfirmed: true, isBorrower };
          }

          const otherConfirmed = isBorrower ? prevLenderConfirmed : prevBorrowerConfirmed;

          if (!otherConfirmed) {
            const currentFinal =
              typeof data.finalAmount === 'number' && Number.isFinite(data.finalAmount)
                ? data.finalAmount
                : req.finalAmount;
            const agreedAmount =
              typeof negotiatedFinalAmount === 'number'
                ? Math.round(negotiatedFinalAmount * 100) / 100
                : currentFinal;

            if (isBorrower) {
              transaction.update(requestRef, {
                borrowerConfirmed: true,
                borrowerConfirmedAt: serverTimestamp(),
                finalAmount: agreedAmount,
                updatedAt: serverTimestamp(),
              });
            } else {
              transaction.update(requestRef, {
                lenderConfirmed: true,
                lenderConfirmedAt: serverTimestamp(),
                finalAmount: agreedAmount,
                updatedAt: serverTimestamp(),
              });
            }

            return { completed: false, alreadyConfirmed: false, isBorrower };
          }

          // Second & final confirmation: complete purchase request, mark item Sold if still available, release lock
          if (isBorrower) {
            transaction.update(requestRef, {
              borrowerConfirmed: true,
              borrowerConfirmedAt: serverTimestamp(),
              status: 'Completed',
              completedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else {
            transaction.update(requestRef, {
              lenderConfirmed: true,
              lenderConfirmedAt: serverTimestamp(),
              status: 'Completed',
              completedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }

          if (itemSnap.exists()) {
            const itemData = itemSnap.data();
            if (
              itemData.listingType === 'sell' &&
              itemData.status === 'Available' &&
              itemData.authorId === data.lenderId
            ) {
              transaction.update(itemRef, {
                status: 'Sold',
                soldToId: data.borrowerId,
                soldToName: data.borrowerName,
                paymentId: req.id,
                updatedAt: serverTimestamp(),
              });
            }
          }

          if (lockSnap.exists()) {
            transaction.delete(lockRef);
          }

          return { completed: true, alreadyConfirmed: false, isBorrower };
        });

        if (outcome.alreadyConfirmed) {
          return true;
        }

        if (outcome.completed) {
          setPurchaseStatusMessage(
            `Purchase completed! Both confirmations are recorded for “${req.itemTitle}” and ratings are now unlocked.`
          );
        } else if (outcome.isBorrower) {
          setPurchaseStatusMessage(
            `Marked “Payment made” for “${req.itemTitle}”. Waiting for ${req.lenderName} to confirm “Payment received”.`
          );
        } else {
          setPurchaseStatusMessage(
            `Marked “Payment received” for “${req.itemTitle}”. Waiting for ${req.borrowerName} to confirm “Payment made”.`
          );
        }

        return true;
      } catch (err) {
        if (err instanceof Error && err.message === 'REQUEST_NOT_FOUND') {
          setPurchaseError('This purchase request is no longer available.');
          return false;
        }
        if (err instanceof Error && err.message === 'NOT_PENDING') {
          setPurchaseError('This purchase request has already been completed or cancelled.');
          return false;
        }
        if (err instanceof Error && err.message === 'UNAUTHORIZED') {
          setPurchaseError('Only the involved borrower and lender can confirm this request.');
          return false;
        }

        try {
          handleFirestoreError(err, OperationType.UPDATE, `${PURCHASE_REQUESTS_COLLECTION}/${req.id}`);
        } catch {
          // Logged by handleFirestoreError
        }
        setPurchaseError('Could not update purchase confirmation right now. Please try again.');
        return false;
      } finally {
        setUpdatingPurchaseId(null);
      }
    },
    [user.uid]
  );

  const cancelPurchaseRequest = useCallback(
    async (req: PurchaseRequest): Promise<boolean> => {
      if (!db || !isFirebaseConfigured) {
        setPurchaseError('Shared database is not configured.');
        return false;
      }

      if (req.status !== 'Pending') {
        setPurchaseError('Only pending purchase requests can be cancelled.');
        return false;
      }

      if (req.borrowerId !== user.uid && req.lenderId !== user.uid) {
        setPurchaseError('Only the involved borrower and lender can cancel this request.');
        return false;
      }

      const firestoreDb = db;
      setUpdatingPurchaseId(req.id);
      setPurchaseError(null);
      setPurchaseStatusMessage(null);

      try {
        const requestRef = doc(firestoreDb, PURCHASE_REQUESTS_COLLECTION, req.id);
        const lockRef = doc(
          firestoreDb,
          PURCHASE_LOCKS_COLLECTION,
          getLockDocId(req.itemId, req.borrowerId)
        );

        await runTransaction(firestoreDb, async (transaction) => {
          const [requestSnap, lockSnap] = await Promise.all([
            transaction.get(requestRef),
            transaction.get(lockRef),
          ]);

          if (!requestSnap.exists()) {
            throw new Error('REQUEST_NOT_FOUND');
          }

          const data = requestSnap.data();
          if (data.status !== 'Pending') {
            throw new Error('NOT_PENDING');
          }

          const isBorrower = data.borrowerId === user.uid;
          const isLender = data.lenderId === user.uid;
          if (!isBorrower && !isLender) {
            throw new Error('UNAUTHORIZED');
          }

          transaction.update(requestRef, {
            status: 'Cancelled',
            cancelledAt: serverTimestamp(),
            cancelledById: user.uid,
            cancelledByRole: isBorrower ? 'borrower' : 'lender',
            updatedAt: serverTimestamp(),
          });

          if (lockSnap.exists()) {
            transaction.delete(lockRef);
          }
        });

        setPurchaseStatusMessage(`Purchase request for “${req.itemTitle}” has been cancelled.`);
        return true;
      } catch (err) {
        if (err instanceof Error && err.message === 'NOT_PENDING') {
          setPurchaseError('This purchase request is already completed or cancelled.');
          return false;
        }
        try {
          handleFirestoreError(err, OperationType.UPDATE, `${PURCHASE_REQUESTS_COLLECTION}/${req.id}`);
        } catch {
          // Logged by handleFirestoreError
        }
        setPurchaseError('Could not cancel this purchase request right now. Please try again.');
        return false;
      } finally {
        setUpdatingPurchaseId(null);
      }
    },
    [user.uid]
  );

  const clearPurchaseError = useCallback(() => {
    setPurchaseError(null);
  }, []);

  const clearPurchaseStatusMessage = useCallback(() => {
    setPurchaseStatusMessage(null);
  }, []);

  const dismissIncomingPurchaseAlert = useCallback(() => {
    setIncomingPurchaseAlert(null);
  }, []);

  return {
    purchaseRequests,
    pendingPurchaseRequests,
    allAdminPurchaseRequests,
    purchaseRequestsLoading,
    submittingPurchaseRequest,
    updatingPurchaseId,
    purchaseError,
    purchaseStatusMessage,
    incomingPurchaseAlert,
    createPurchaseRequest,
    confirmPurchasePayment,
    cancelPurchaseRequest,
    clearPurchaseError,
    clearPurchaseStatusMessage,
    dismissIncomingPurchaseAlert,
  };
}
