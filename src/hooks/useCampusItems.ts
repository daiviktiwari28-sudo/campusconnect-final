import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
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
  type CampusCategory,
  type CampusItem,
  type CampusRequest,
  type ListingType,
  type PurchaseParticipantRole,
  type RequestStatus,
} from '../data/campusItems';
import type { CampusUser } from './useAuth';
import { db, handleFirestoreError, isFirebaseConfigured, OperationType } from '../lib/firebase';

const ITEMS_COLLECTION = 'campusItems';
const REQUESTS_COLLECTION = 'campusRequests';
const BORROW_LOCKS_COLLECTION = 'borrowRequestLocks';

function isAllowedCategory(value: unknown): value is CampusCategory {
  return (
    value === 'Shared Item' ||
    value === 'Permanent Sale' ||
    value === 'Chargers & Cables' ||
    value === 'Calculators & Lab' ||
    value === 'Lab Equipment' ||
    value === 'Weather Gear' ||
    value === 'Tech Accessories'
  );
}

function isAllowedRequestStatus(value: unknown): value is RequestStatus {
  return (
    value === 'Pending' ||
    value === 'Open' ||
    value === 'Accepted' ||
    value === 'Fulfilled' ||
    value === 'Cancelled'
  );
}

function isAllowedRole(value: unknown): value is PurchaseParticipantRole {
  return value === 'borrower' || value === 'lender';
}

function toMillis(value: unknown): number {
  return value instanceof Timestamp ? value.toMillis() : Date.now();
}

function toNullableMillis(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null;
}

function getBorrowLockDocId(itemId: string, borrowerId: string): string {
  return `${itemId}_${borrowerId}`;
}

function mapBorrowRequestDoc(id: string, data: Record<string, unknown>): CampusRequest {
  const status: RequestStatus = isAllowedRequestStatus(data.status) ? data.status : 'Pending';
  const borrowerFulfilled =
    typeof data.borrowerFulfilled === 'boolean'
      ? data.borrowerFulfilled
      : status === 'Fulfilled';
  const lenderFulfilled =
    typeof data.lenderFulfilled === 'boolean'
      ? data.lenderFulfilled
      : status === 'Fulfilled';

  return {
    id,
    description: typeof data.description === 'string' ? data.description : '',
    itemId: typeof data.itemId === 'string' ? data.itemId : null,
    itemTitle: typeof data.itemTitle === 'string' ? data.itemTitle : null,
    itemPhotoUrl: typeof data.itemPhotoUrl === 'string' ? data.itemPhotoUrl : null,
    status,
    requesterId: typeof data.requesterId === 'string' ? data.requesterId : '',
    requesterName:
      typeof data.requesterName === 'string' && data.requesterName.trim()
        ? data.requesterName
        : 'Campus Student',
    requesterPhone: typeof data.requesterPhone === 'string' ? data.requesterPhone : '',
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
    acceptedById: typeof data.acceptedById === 'string' ? data.acceptedById : null,
    acceptedByName: typeof data.acceptedByName === 'string' ? data.acceptedByName : null,
    acceptedByPhone: typeof data.acceptedByPhone === 'string' ? data.acceptedByPhone : null,
    borrowerFulfilled,
    borrowerFulfilledAtMs: toNullableMillis(data.borrowerFulfilledAt),
    lenderFulfilled,
    lenderFulfilledAtMs: toNullableMillis(data.lenderFulfilledAt),
    completedAtMs: toNullableMillis(data.completedAt),
    cancelledAtMs: toNullableMillis(data.cancelledAt),
    cancelledById: typeof data.cancelledById === 'string' ? data.cancelledById : null,
    cancelledByRole: isAllowedRole(data.cancelledByRole) ? data.cancelledByRole : null,
    createdAtMs: toMillis(data.createdAt),
    updatedAtMs: toMillis(data.updatedAt ?? data.createdAt),
  };
}

export function useCampusItems(
  user: CampusUser,
  displayName: string,
  userPhone: string | null,
  isAdmin: boolean
) {
  const [sharedItems, setSharedItems] = useState<CampusItem[]>([]);
  const [borrowerRequests, setBorrowerRequests] = useState<CampusRequest[]>([]);
  const [lenderRequests, setLenderRequests] = useState<CampusRequest[]>([]);
  const [allAdminRequests, setAllAdminRequests] = useState<CampusRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(db && isFirebaseConfigured));
  const [borrowRequestsLoading, setBorrowRequestsLoading] = useState<boolean>(
    Boolean(db && isFirebaseConfigured)
  );
  const [submittingItem, setSubmittingItem] = useState<boolean>(false);
  const [submittingRequest, setSubmittingRequest] = useState<boolean>(false);
  const [updatingRequestId, setUpdatingRequestId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [incomingBorrowAlert, setIncomingBorrowAlert] = useState<CampusRequest | null>(null);

  const initialLenderLoadRef = useRef<boolean>(true);
  const knownLenderRequestIdsRef = useRef<Set<string>>(new Set());

  const isBackendConfigured = Boolean(db && isFirebaseConfigured);

  useEffect(() => {
    if (!db || !isFirebaseConfigured || !user.uid) {
      setLoading(false);
      setBorrowRequestsLoading(false);
      return;
    }

    setLoading(true);
    setBorrowRequestsLoading(true);
    initialLenderLoadRef.current = true;
    knownLenderRequestIdsRef.current = new Set();

    let borrowerLoaded = false;
    let lenderLoaded = false;

    const finishRequestsIfReady = () => {
      if (borrowerLoaded && lenderLoaded) {
        setBorrowRequestsLoading(false);
      }
    };

    const itemsQuery = query(
      collection(db, ITEMS_COLLECTION),
      where('visibility', '==', 'campus')
    );

    const unsubscribeItems = onSnapshot(
      itemsQuery,
      (snapshot) => {
        const loaded: CampusItem[] = snapshot.docs
          .filter((docSnap) => {
            const authorId = docSnap.data().authorId;
            return (
              typeof authorId === 'string' &&
              authorId.trim().length > 0 &&
              !authorId.startsWith('starter-')
            );
          })
          .map((docSnap) => {
            const data = docSnap.data();
            const listingType: ListingType = data.listingType === 'sell' ? 'sell' : 'lend';
            const price =
              listingType === 'sell' &&
              typeof data.price === 'number' &&
              Number.isFinite(data.price)
                ? data.price
                : 0;
            return {
              id: docSnap.id,
              title: typeof data.title === 'string' ? data.title : 'Shared item',
              description: typeof data.description === 'string' ? data.description : '',
              photoUrl: typeof data.photoUrl === 'string' ? data.photoUrl : '',
              category: isAllowedCategory(data.category)
                ? data.category
                : listingType === 'sell'
                  ? 'Permanent Sale'
                  : 'Shared Item',
              listingType,
              price,
              status: data.status === 'Sold' ? 'Sold' : 'Available',
              soldToId: typeof data.soldToId === 'string' ? data.soldToId : null,
              soldToName: typeof data.soldToName === 'string' ? data.soldToName : null,
              paymentId: typeof data.paymentId === 'string' ? data.paymentId : null,
              authorId: typeof data.authorId === 'string' ? data.authorId : '',
              authorName:
                typeof data.authorName === 'string' && data.authorName.trim()
                  ? data.authorName
                  : 'Campus Student',
              authorPhone:
                typeof data.authorPhone === 'string' ? data.authorPhone : 'Phone confirmed',
              createdAtMs: toMillis(data.createdAt),
              updatedAtMs: toMillis(data.updatedAt ?? data.createdAt),
            };
          });

        loaded.sort((a, b) => b.createdAtMs - a.createdAtMs);
        setSharedItems(loaded);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        setItemsError(
          'Could not sync shared items from Cloud Firestore right now. Please check your connection or permissions.'
        );
        try {
          handleFirestoreError(err, OperationType.LIST, ITEMS_COLLECTION);
        } catch {
          // Structured error logged in handleFirestoreError
        }
      }
    );

    const borrowerQuery = query(
      collection(db, REQUESTS_COLLECTION),
      where('requesterId', '==', user.uid)
    );
    const lenderQuery = query(
      collection(db, REQUESTS_COLLECTION),
      where('acceptedById', '==', user.uid)
    );

    const unsubBorrower = onSnapshot(
      borrowerQuery,
      (snapshot) => {
        setBorrowerRequests(snapshot.docs.map((d) => mapBorrowRequestDoc(d.id, d.data())));
        borrowerLoaded = true;
        finishRequestsIfReady();
      },
      (err) => {
        borrowerLoaded = true;
        finishRequestsIfReady();
        try {
          handleFirestoreError(err, OperationType.LIST, REQUESTS_COLLECTION);
        } catch {
          // Structured error logged in handleFirestoreError
        }
      }
    );

    const unsubLender = onSnapshot(
      lenderQuery,
      (snapshot) => {
        const mapped = snapshot.docs.map((d) => mapBorrowRequestDoc(d.id, d.data()));
        if (initialLenderLoadRef.current) {
          knownLenderRequestIdsRef.current = new Set(mapped.map((r) => r.id));
          initialLenderLoadRef.current = false;
        } else {
          const newestIncoming = mapped.find(
            (r) => r.status === 'Pending' && !knownLenderRequestIdsRef.current.has(r.id)
          );
          if (newestIncoming) {
            setIncomingBorrowAlert(newestIncoming);
          }
          for (const r of mapped) {
            knownLenderRequestIdsRef.current.add(r.id);
          }
        }
        setLenderRequests(mapped);
        lenderLoaded = true;
        finishRequestsIfReady();
      },
      (err) => {
        lenderLoaded = true;
        finishRequestsIfReady();
        try {
          handleFirestoreError(err, OperationType.LIST, REQUESTS_COLLECTION);
        } catch {
          // Structured error logged in handleFirestoreError
        }
      }
    );

    return () => {
      unsubscribeItems();
      unsubBorrower();
      unsubLender();
    };
  }, [user.uid]);

  useEffect(() => {
    if (!db || !isFirebaseConfigured || !user.uid || !isAdmin) {
      setAllAdminRequests([]);
      return;
    }

    const adminQuery = query(collection(db, REQUESTS_COLLECTION));
    const unsubscribe = onSnapshot(
      adminQuery,
      (snapshot) => {
        const mapped = snapshot.docs
          .map((d) => mapBorrowRequestDoc(d.id, d.data()))
          .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
        setAllAdminRequests(mapped);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, REQUESTS_COLLECTION);
        } catch {
          // Structured error logged in handleFirestoreError
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [isAdmin, user.uid]);

  const allItems = useMemo(() => {
    return sharedItems;
  }, [sharedItems]);

  const borrowRequests = useMemo<CampusRequest[]>(() => {
    const byId = new Map<string, CampusRequest>();
    for (const req of borrowerRequests) byId.set(req.id, req);
    for (const req of lenderRequests) byId.set(req.id, req);
    return Array.from(byId.values()).sort((a, b) => {
      const aActive = a.status === 'Pending' || a.status === 'Accepted';
      const bActive = b.status === 'Pending' || b.status === 'Accepted';
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      return b.updatedAtMs - a.updatedAtMs;
    });
  }, [borrowerRequests, lenderRequests]);

  const pendingBorrowRequests = useMemo(
    () =>
      borrowRequests.filter(
        (req) => req.status === 'Pending' || req.status === 'Accepted'
      ),
    [borrowRequests]
  );

  const addItem = useCallback(
    async (
      rawTitle: string,
      photoUrl: string,
      rawDescription = '',
      listingType: ListingType = 'lend',
      rawPrice = 0
    ): Promise<boolean> => {
      const normalizedPhone = userPhone?.trim() || '';
      if (normalizedPhone.length < CAMPUS_ITEM_LIMITS.phoneMin) {
        setItemsError('Please complete your student profile before adding an item.');
        return false;
      }

      if (!db || !isFirebaseConfigured) {
        setItemsError(
          'Shared database is not configured. Connect Firebase in firebase-applet-config.json to share items across devices.'
        );
        return false;
      }

      const title = rawTitle.trim();
      const trimmedDesc = rawDescription.trim();
      const description =
        listingType === 'sell'
          ? trimmedDesc
          : trimmedDesc || 'Available to borrow on campus. Contact me to arrange pickup.';

      if (
        title.length < CAMPUS_ITEM_LIMITS.titleMin ||
        title.length > CAMPUS_ITEM_LIMITS.titleMax
      ) {
        setItemsError(
          `Item name must be between ${CAMPUS_ITEM_LIMITS.titleMin} and ${CAMPUS_ITEM_LIMITS.titleMax} characters.`
        );
        return false;
      }

      if (
        listingType === 'sell' &&
        description.length < CAMPUS_ITEM_LIMITS.sellDescriptionMin
      ) {
        setItemsError(
          `Please add a short description (${CAMPUS_ITEM_LIMITS.sellDescriptionMin}+ characters) for permanent sale items.`
        );
        return false;
      }

      const numericPrice =
        listingType === 'sell' ? Math.round(Number(rawPrice) * 100) / 100 : 0;
      if (
        listingType === 'sell' &&
        (!Number.isFinite(numericPrice) ||
          numericPrice < PAYMENT_LIMITS.minPrice ||
          numericPrice > PAYMENT_LIMITS.maxPrice)
      ) {
        setItemsError(
          `Enter a valid selling price between ₹${PAYMENT_LIMITS.minPrice} and ₹${PAYMENT_LIMITS.maxPrice}.`
        );
        return false;
      }

      if (!photoUrl || photoUrl.length < 20 || photoUrl.length > 250000) {
        setItemsError('Please provide a valid photo of the item.');
        return false;
      }

      setSubmittingItem(true);
      setItemsError(null);
      setStatusMessage(null);

      try {
        const safeAuthorName = (
          displayName.trim() ||
          user.displayName?.trim() ||
          'Campus Student'
        ).slice(0, CAMPUS_ITEM_LIMITS.authorNameMax);
        const safePhone = normalizedPhone.slice(0, CAMPUS_ITEM_LIMITS.phoneMax);

        await addDoc(collection(db, ITEMS_COLLECTION), {
          title,
          description: description.slice(0, CAMPUS_ITEM_LIMITS.descriptionMax),
          photoUrl,
          category: listingType === 'sell' ? 'Permanent Sale' : 'Shared Item',
          listingType,
          price: numericPrice,
          status: 'Available',
          soldToId: null,
          soldToName: null,
          paymentId: null,
          visibility: 'campus',
          authorId: user.uid,
          authorName: safeAuthorName,
          authorPhone: safePhone,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        setStatusMessage(
          listingType === 'sell'
            ? `“${title}” is now listed for permanent sale at ₹${numericPrice}.`
            : `“${title}” is now shared for lending and borrowing.`
        );
        return true;
      } catch (err) {
        setItemsError(
          'Could not save your item to the shared database. Please verify your connection and try again.'
        );
        try {
          handleFirestoreError(err, OperationType.CREATE, ITEMS_COLLECTION);
        } catch {
          // Structured error logged in handleFirestoreError
        }
        return false;
      } finally {
        setSubmittingItem(false);
      }
    },
    [displayName, user.displayName, user.uid, userPhone]
  );

  const deleteItem = useCallback(
    async (item: CampusItem): Promise<boolean> => {
      if (item.authorId !== user.uid && !isAdmin) {
        setItemsError('Only the item creator or an authorized administrator can delete this item.');
        return false;
      }

      if (!db || !isFirebaseConfigured) {
        setItemsError('Shared database is not configured.');
        return false;
      }

      setDeletingId(item.id);
      setItemsError(null);
      setStatusMessage(null);
      const itemPath = `${ITEMS_COLLECTION}/${item.id}`;

      try {
        await deleteDoc(doc(db, ITEMS_COLLECTION, item.id));
        setStatusMessage(`Removed “${item.title}” from CampusConnect.`);
        return true;
      } catch (err) {
        const errCode =
          typeof err === 'object' && err !== null && 'code' in err
            ? String((err as { code?: unknown }).code)
            : '';
        setItemsError(
          errCode === 'permission-denied'
            ? 'You do not have permission to delete this item. Only the student who shared it or an authorized admin can delete it.'
            : 'Could not delete this item right now. Please try again.'
        );
        try {
          handleFirestoreError(err, OperationType.DELETE, itemPath);
        } catch {
          // Structured error logged in handleFirestoreError
        }
        return false;
      } finally {
        setDeletingId(null);
      }
    },
    [isAdmin, user.uid]
  );

  const createBorrowRequest = useCallback(
    async (
      item: CampusItem,
      rawNote: string,
      borrowerRatingAverage: number,
      borrowerRatingCount: number
    ): Promise<boolean> => {
      if (!db || !isFirebaseConfigured) {
        setItemsError('Shared database is not configured.');
        return false;
      }

      if (item.listingType !== 'lend') {
        setItemsError('Borrow requests are only available for lending items.');
        return false;
      }

      if (item.status !== 'Available') {
        setItemsError('This item is not currently available to borrow.');
        return false;
      }

      if (item.authorId === user.uid) {
        setItemsError('You cannot send a borrow request for your own listing.');
        return false;
      }

      const trimmedPhone = (userPhone || '').trim();
      if (
        trimmedPhone.length < CAMPUS_ITEM_LIMITS.phoneMin ||
        trimmedPhone.length > CAMPUS_ITEM_LIMITS.phoneMax
      ) {
        setItemsError('Please save your phone number in your student profile first.');
        return false;
      }

      const existingPending = borrowerRequests.find(
        (req) => req.itemId === item.id && (req.status === 'Pending' || req.status === 'Accepted')
      );
      if (existingPending) {
        setItemsError('You already have a pending borrow request for this item.');
        return false;
      }

      const safeBorrowerName = (
        displayName.trim() ||
        user.displayName?.trim() ||
        'Campus Student'
      ).slice(0, CAMPUS_ITEM_LIMITS.authorNameMax);
      const safeLenderName = (item.authorName.trim() || 'Lender').slice(
        0,
        CAMPUS_ITEM_LIMITS.authorNameMax
      );
      const description = (
        rawNote.trim() || `Request to borrow ${item.title}`
      ).slice(0, CAMPUS_ITEM_LIMITS.requestDescriptionMax);
      const clampedRatingAvg = Math.max(
        0,
        Math.min(5, Math.round(borrowerRatingAverage * 100) / 100)
      );
      const clampedRatingCount = Math.max(0, Math.min(100000, Math.floor(borrowerRatingCount)));

      setSubmittingRequest(true);
      setItemsError(null);
      setStatusMessage(null);

      try {
        const requestRef = doc(collection(db, REQUESTS_COLLECTION));
        const lockRef = doc(db, BORROW_LOCKS_COLLECTION, getBorrowLockDocId(item.id, user.uid));
        const batch = writeBatch(db);

        batch.set(requestRef, {
          description,
          itemId: item.id,
          itemTitle: item.title.trim().slice(0, CAMPUS_ITEM_LIMITS.titleMax),
          itemPhotoUrl: item.photoUrl || null,
          status: 'Pending',
          visibility: 'private',
          requesterId: user.uid,
          requesterName: safeBorrowerName,
          requesterPhone: trimmedPhone.slice(0, CAMPUS_ITEM_LIMITS.phoneMax),
          borrowerRatingAverage: clampedRatingAvg,
          borrowerRatingCount: clampedRatingCount,
          acceptedById: item.authorId,
          acceptedByName: safeLenderName,
          acceptedByPhone: item.authorPhone,
          borrowerFulfilled: false,
          borrowerFulfilledAt: null,
          lenderFulfilled: false,
          lenderFulfilledAt: null,
          completedAt: null,
          cancelledAt: null,
          cancelledById: null,
          cancelledByRole: null,
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

        setStatusMessage(
          `Borrow request sent privately to ${safeLenderName} for “${item.title}”. Contact each other to arrange pickup and return, then both confirm.`
        );
        return true;
      } catch (err) {
        try {
          handleFirestoreError(err, OperationType.CREATE, REQUESTS_COLLECTION);
        } catch {
          // Structured error logged in handleFirestoreError
        }
        const code =
          typeof err === 'object' && err !== null && 'code' in err
            ? String((err as { code?: unknown }).code)
            : '';
        if (code === 'permission-denied') {
          setItemsError(
            'Could not send borrow request. You may already have a pending request for this item, or the item is no longer available.'
          );
        } else {
          setItemsError('Could not send your borrow request right now. Please try again.');
        }
        return false;
      } finally {
        setSubmittingRequest(false);
      }
    },
    [borrowerRequests, displayName, user.displayName, user.uid, userPhone]
  );

  const fulfillRequest = useCallback(
    async (request: CampusRequest): Promise<boolean> => {
      if (request.status !== 'Pending' && request.status !== 'Accepted') {
        setItemsError('Only active borrow requests can be marked fulfilled.');
        return false;
      }

      if (request.requesterId !== user.uid && request.acceptedById !== user.uid) {
        setItemsError(
          'Only the borrower or the lender from this exchange can confirm fulfillment.'
        );
        return false;
      }

      if (!db || !isFirebaseConfigured) {
        setItemsError('Shared database is not configured.');
        return false;
      }

      const firestoreDb = db;
      setUpdatingRequestId(request.id);
      setItemsError(null);
      setStatusMessage(null);
      const reqRef = doc(firestoreDb, REQUESTS_COLLECTION, request.id);
      const lockRef = request.itemId
        ? doc(
            firestoreDb,
            BORROW_LOCKS_COLLECTION,
            getBorrowLockDocId(request.itemId, request.requesterId)
          )
        : null;
      const reqPath = `${REQUESTS_COLLECTION}/${request.id}`;

      try {
        const outcome = await runTransaction(firestoreDb, async (transaction) => {
          const latestSnap = await transaction.get(reqRef);
          const lockSnap = lockRef ? await transaction.get(lockRef) : null;

          if (!latestSnap.exists()) {
            throw new Error('REQUEST_NOT_FOUND');
          }

          const data = latestSnap.data();
          if (data.status !== 'Pending' && data.status !== 'Accepted') {
            throw new Error('NOT_ACTIVE');
          }

          const isBorrower = data.requesterId === user.uid;
          const isLender = data.acceptedById === user.uid;
          if (!isBorrower && !isLender) {
            throw new Error('UNAUTHORIZED');
          }

          const prevBorrowerFulfilled = data.borrowerFulfilled === true;
          const prevLenderFulfilled = data.lenderFulfilled === true;

          if ((isBorrower && prevBorrowerFulfilled) || (isLender && prevLenderFulfilled)) {
            return { fulfilled: false, alreadyConfirmed: true, isBorrower };
          }

          const otherConfirmed = isBorrower ? prevLenderFulfilled : prevBorrowerFulfilled;

          if (data.status === 'Pending') {
            if (!otherConfirmed) {
              if (isBorrower) {
                transaction.update(reqRef, {
                  borrowerFulfilled: true,
                  borrowerFulfilledAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                });
              } else {
                transaction.update(reqRef, {
                  lenderFulfilled: true,
                  lenderFulfilledAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                });
              }
              return { fulfilled: false, alreadyConfirmed: false, isBorrower };
            }

            if (isBorrower) {
              transaction.update(reqRef, {
                borrowerFulfilled: true,
                borrowerFulfilledAt: serverTimestamp(),
                status: 'Fulfilled',
                completedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            } else {
              transaction.update(reqRef, {
                lenderFulfilled: true,
                lenderFulfilledAt: serverTimestamp(),
                status: 'Fulfilled',
                completedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            }

            if (lockRef && lockSnap?.exists()) {
              transaction.delete(lockRef);
            }

            return { fulfilled: true, alreadyConfirmed: false, isBorrower };
          }

          // Legacy Accepted request path
          const nextStatus: RequestStatus = otherConfirmed ? 'Fulfilled' : 'Accepted';
          if (isBorrower) {
            transaction.update(reqRef, {
              borrowerFulfilled: true,
              status: nextStatus,
              updatedAt: serverTimestamp(),
            });
          } else {
            transaction.update(reqRef, {
              lenderFulfilled: true,
              status: nextStatus,
              updatedAt: serverTimestamp(),
            });
          }

          return { fulfilled: nextStatus === 'Fulfilled', alreadyConfirmed: false, isBorrower };
        });

        if (outcome.alreadyConfirmed) {
          return true;
        }

        if (outcome.fulfilled) {
          setStatusMessage(
            'Both borrower and lender confirmed! Borrow exchange is now Fulfilled and ratings are unlocked.'
          );
        } else if (outcome.isBorrower) {
          setStatusMessage(
            `Recorded “Item returned” for “${request.itemTitle || 'this item'}”. Waiting for ${
              request.acceptedByName || 'the lender'
            } to confirm “Return received”.`
          );
        } else {
          setStatusMessage(
            `Recorded “Return received” for “${request.itemTitle || 'this item'}”. Waiting for ${
              request.requesterName
            } to confirm “Item returned”.`
          );
        }
        return true;
      } catch (err) {
        if (err instanceof Error && err.message === 'REQUEST_NOT_FOUND') {
          setItemsError('This borrow request is no longer available.');
          return false;
        }
        if (err instanceof Error && err.message === 'NOT_ACTIVE') {
          setItemsError('This borrow request has already been fulfilled or cancelled.');
          return false;
        }
        if (err instanceof Error && err.message === 'UNAUTHORIZED') {
          setItemsError('Only the borrower or lender can confirm fulfillment.');
          return false;
        }

        setItemsError('Could not update borrow confirmation right now. Please try again.');
        try {
          handleFirestoreError(err, OperationType.UPDATE, reqPath);
        } catch {
          // Structured error logged in handleFirestoreError
        }
        return false;
      } finally {
        setUpdatingRequestId(null);
      }
    },
    [user.uid]
  );

  const cancelBorrowRequest = useCallback(
    async (request: CampusRequest): Promise<boolean> => {
      if (!db || !isFirebaseConfigured) {
        setItemsError('Shared database is not configured.');
        return false;
      }

      if (request.status !== 'Pending' && request.status !== 'Accepted') {
        setItemsError('Only pending borrow requests can be cancelled.');
        return false;
      }

      if (request.requesterId !== user.uid && request.acceptedById !== user.uid) {
        setItemsError('Only the involved borrower and lender can cancel this borrow request.');
        return false;
      }

      const firestoreDb = db;
      setUpdatingRequestId(request.id);
      setItemsError(null);
      setStatusMessage(null);
      const reqRef = doc(firestoreDb, REQUESTS_COLLECTION, request.id);
      const lockRef = request.itemId
        ? doc(
            firestoreDb,
            BORROW_LOCKS_COLLECTION,
            getBorrowLockDocId(request.itemId, request.requesterId)
          )
        : null;
      const reqPath = `${REQUESTS_COLLECTION}/${request.id}`;

      try {
        await runTransaction(firestoreDb, async (transaction) => {
          const latestSnap = await transaction.get(reqRef);
          const lockSnap = lockRef ? await transaction.get(lockRef) : null;

          if (!latestSnap.exists()) {
            throw new Error('REQUEST_NOT_FOUND');
          }

          const data = latestSnap.data();
          if (data.status !== 'Pending' && data.status !== 'Accepted') {
            throw new Error('NOT_ACTIVE');
          }

          const isBorrower = data.requesterId === user.uid;
          const isLender = data.acceptedById === user.uid;
          if (!isBorrower && !isLender) {
            throw new Error('UNAUTHORIZED');
          }

          if (data.status === 'Pending') {
            transaction.update(reqRef, {
              status: 'Cancelled',
              cancelledAt: serverTimestamp(),
              cancelledById: user.uid,
              cancelledByRole: isBorrower ? 'borrower' : 'lender',
              updatedAt: serverTimestamp(),
            });
          } else {
            transaction.update(reqRef, {
              status: 'Cancelled',
              updatedAt: serverTimestamp(),
            });
          }

          if (lockRef && lockSnap?.exists()) {
            transaction.delete(lockRef);
          }
        });

        setStatusMessage(
          `Borrow request for “${request.itemTitle || 'this item'}” has been cancelled.`
        );
        return true;
      } catch (err) {
        if (err instanceof Error && err.message === 'NOT_ACTIVE') {
          setItemsError('This borrow request has already been fulfilled or cancelled.');
          return false;
        }
        setItemsError('Could not cancel this borrow request right now. Please try again.');
        try {
          handleFirestoreError(err, OperationType.UPDATE, reqPath);
        } catch {
          // Structured error logged in handleFirestoreError
        }
        return false;
      } finally {
        setUpdatingRequestId(null);
      }
    },
    [user.uid]
  );

  const deleteRequest = useCallback(
    async (request: CampusRequest): Promise<boolean> => {
      if (request.requesterId !== user.uid && !isAdmin) {
        setItemsError(
          'Only the request creator or an authorized administrator can delete this request.'
        );
        return false;
      }

      if (!db || !isFirebaseConfigured) {
        setItemsError('Shared database is not configured.');
        return false;
      }

      const firestoreDb = db;
      setDeletingId(request.id);
      setItemsError(null);
      setStatusMessage(null);
      const reqRef = doc(firestoreDb, REQUESTS_COLLECTION, request.id);
      const lockRef = request.itemId
        ? doc(
            firestoreDb,
            BORROW_LOCKS_COLLECTION,
            getBorrowLockDocId(request.itemId, request.requesterId)
          )
        : null;
      const reqPath = `${REQUESTS_COLLECTION}/${request.id}`;

      try {
        await runTransaction(firestoreDb, async (transaction) => {
          const lockSnap = lockRef ? await transaction.get(lockRef) : null;
          transaction.delete(reqRef);
          if (lockRef && lockSnap?.exists()) {
            transaction.delete(lockRef);
          }
        });
        setStatusMessage('Removed the borrow request.');
        return true;
      } catch (err) {
        const errCode =
          typeof err === 'object' && err !== null && 'code' in err
            ? String((err as { code?: unknown }).code)
            : '';
        setItemsError(
          errCode === 'permission-denied'
            ? 'You do not have permission to delete this request.'
            : 'Could not delete this request right now. Please try again.'
        );
        try {
          handleFirestoreError(err, OperationType.DELETE, reqPath);
        } catch {
          // Structured error logged in handleFirestoreError
        }
        return false;
      } finally {
        setDeletingId(null);
      }
    },
    [isAdmin, user.uid]
  );

  const clearItemsError = useCallback(() => {
    setItemsError(null);
  }, []);

  const clearStatusMessage = useCallback(() => {
    setStatusMessage(null);
  }, []);

  const dismissIncomingBorrowAlert = useCallback(() => {
    setIncomingBorrowAlert(null);
  }, []);

  return {
    allItems,
    borrowRequests,
    pendingBorrowRequests,
    allAdminRequests,
    isBackendConfigured,
    loading,
    borrowRequestsLoading,
    submittingItem,
    submittingRequest,
    updatingRequestId,
    deletingId,
    itemsError,
    statusMessage,
    incomingBorrowAlert,
    addItem,
    deleteItem,
    createBorrowRequest,
    fulfillRequest,
    cancelBorrowRequest,
    deleteRequest,
    clearItemsError,
    clearStatusMessage,
    dismissIncomingBorrowAlert,
  };
}
