import { useCallback, useEffect, useMemo, useState } from 'react';
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
} from 'firebase/firestore';
import {
  CAMPUS_ITEM_LIMITS,
  PAYMENT_LIMITS,
  type CampusCategory,
  type CampusItem,
  type CampusRequest,
  type ListingType,
  type RequestStatus,
} from '../data/campusItems';
import type { CampusUser } from './useAuth';
import { db, handleFirestoreError, isFirebaseConfigured, OperationType } from '../lib/firebase';

const ITEMS_COLLECTION = 'campusItems';
const REQUESTS_COLLECTION = 'campusRequests';

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
  return value === 'Open' || value === 'Accepted' || value === 'Fulfilled';
}

function toMillis(value: unknown): number {
  return value instanceof Timestamp ? value.toMillis() : Date.now();
}

export interface NewRequestAlert {
  id: string;
  requesterName: string;
  description: string;
}

export function useCampusItems(user: CampusUser, userPhone: string | null, isAdmin: boolean) {
  const [sharedItems, setSharedItems] = useState<CampusItem[]>([]);
  const [sharedRequests, setSharedRequests] = useState<CampusRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(db && isFirebaseConfigured));
  const [submittingItem, setSubmittingItem] = useState<boolean>(false);
  const [submittingRequest, setSubmittingRequest] = useState<boolean>(false);
  const [updatingRequestId, setUpdatingRequestId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [newRequestAlert, setNewRequestAlert] = useState<NewRequestAlert | null>(null);

  const isBackendConfigured = Boolean(db && isFirebaseConfigured);

  useEffect(() => {
    if (!db || !isFirebaseConfigured || !user.uid) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let itemsLoaded = false;
    let requestsLoaded = false;

    const markReadyIfDone = () => {
      if (itemsLoaded && requestsLoaded) {
        setLoading(false);
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
              listingType === 'sell' && typeof data.price === 'number' && Number.isFinite(data.price)
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
        itemsLoaded = true;
        markReadyIfDone();
      },
      (err) => {
        itemsLoaded = true;
        markReadyIfDone();
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

    const requestsQuery = query(
      collection(db, REQUESTS_COLLECTION),
      where('visibility', '==', 'campus')
    );

    const unsubscribeRequests = onSnapshot(
      requestsQuery,
      (snapshot) => {
        const wasAlreadyLoaded = requestsLoaded;

        if (wasAlreadyLoaded) {
          const addedOpenFromOthers = snapshot
            .docChanges()
            .filter((change) => change.type === 'added')
            .map((change) => ({
              id: change.doc.id,
              data: change.doc.data(),
            }))
            .filter(
              ({ data }) =>
                data.status === 'Open' &&
                typeof data.requesterId === 'string' &&
                data.requesterId !== user.uid
            );

          if (addedOpenFromOthers.length > 0) {
            const latest = addedOpenFromOthers[addedOpenFromOthers.length - 1];
            setNewRequestAlert({
              id: latest.id,
              requesterName:
                typeof latest.data.requesterName === 'string' && latest.data.requesterName.trim()
                  ? latest.data.requesterName
                  : 'A fellow student',
              description:
                typeof latest.data.description === 'string' ? latest.data.description : 'New request',
            });
          }
        }

        const loaded: CampusRequest[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          const status = isAllowedRequestStatus(data.status) ? data.status : 'Open';
          const borrowerFulfilled =
            typeof data.borrowerFulfilled === 'boolean'
              ? data.borrowerFulfilled
              : status === 'Fulfilled';
          const lenderFulfilled =
            typeof data.lenderFulfilled === 'boolean'
              ? data.lenderFulfilled
              : status === 'Fulfilled';

          return {
            id: docSnap.id,
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
            requesterPhone:
              typeof data.requesterPhone === 'string' ? data.requesterPhone : '',
            acceptedById: typeof data.acceptedById === 'string' ? data.acceptedById : null,
            acceptedByName: typeof data.acceptedByName === 'string' ? data.acceptedByName : null,
            acceptedByPhone: typeof data.acceptedByPhone === 'string' ? data.acceptedByPhone : null,
            borrowerFulfilled,
            lenderFulfilled,
            createdAtMs: toMillis(data.createdAt),
            updatedAtMs: toMillis(data.updatedAt ?? data.createdAt),
          };
        });

        loaded.sort((a, b) => b.createdAtMs - a.createdAtMs);
        setSharedRequests(loaded);
        requestsLoaded = true;
        markReadyIfDone();
      },
      (err) => {
        requestsLoaded = true;
        markReadyIfDone();
        setItemsError(
          'Could not sync shared requests from Cloud Firestore right now. Please check your connection or permissions.'
        );
        try {
          handleFirestoreError(err, OperationType.LIST, REQUESTS_COLLECTION);
        } catch {
          // Structured error logged in handleFirestoreError
        }
      }
    );

    return () => {
      unsubscribeItems();
      unsubscribeRequests();
    };
  }, [user.uid]);

  const allItems = useMemo(() => {
    return sharedItems;
  }, [sharedItems]);

  const myRequests = useMemo(() => {
    return sharedRequests.filter((req) => req.requesterId === user.uid);
  }, [sharedRequests, user.uid]);

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
        const safeAuthorName = (user.displayName?.trim() || 'Campus Student').slice(
          0,
          CAMPUS_ITEM_LIMITS.authorNameMax
        );
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
    [user.displayName, user.uid, userPhone]
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

  const createRequest = useCallback(
    async (rawDescription: string, linkedItem?: CampusItem | null): Promise<boolean> => {
      const normalizedPhone = userPhone?.trim() || '';
      if (normalizedPhone.length < CAMPUS_ITEM_LIMITS.phoneMin) {
        setItemsError('Please complete your student profile before creating a request.');
        return false;
      }

      if (!db || !isFirebaseConfigured) {
        setItemsError(
          'Shared database is not configured. Connect Firebase in firebase-applet-config.json to post requests.'
        );
        return false;
      }

      const description = rawDescription.trim();
      if (
        description.length < CAMPUS_ITEM_LIMITS.requestDescriptionMin ||
        description.length > CAMPUS_ITEM_LIMITS.requestDescriptionMax
      ) {
        setItemsError(
          `Request description must be between ${CAMPUS_ITEM_LIMITS.requestDescriptionMin} and ${CAMPUS_ITEM_LIMITS.requestDescriptionMax} characters.`
        );
        return false;
      }

      setSubmittingRequest(true);
      setItemsError(null);
      setStatusMessage(null);

      try {
        const safeRequesterName = (user.displayName?.trim() || 'Campus Student').slice(
          0,
          CAMPUS_ITEM_LIMITS.authorNameMax
        );
        const safeRequesterPhone = normalizedPhone.slice(0, CAMPUS_ITEM_LIMITS.phoneMax);

        await addDoc(collection(db, REQUESTS_COLLECTION), {
          description,
          itemId: linkedItem ? linkedItem.id.slice(0, 128) : null,
          itemTitle: linkedItem ? linkedItem.title.slice(0, CAMPUS_ITEM_LIMITS.titleMax) : null,
          itemPhotoUrl: linkedItem ? linkedItem.photoUrl.slice(0, 250000) : null,
          status: 'Open',
          visibility: 'campus',
          requesterId: user.uid,
          requesterName: safeRequesterName,
          requesterPhone: safeRequesterPhone,
          acceptedById: null,
          acceptedByName: null,
          acceptedByPhone: null,
          borrowerFulfilled: false,
          lenderFulfilled: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        setStatusMessage('Your Open request is now live for all signed-in students.');
        return true;
      } catch (err) {
        setItemsError('Could not post your request right now. Please try again.');
        try {
          handleFirestoreError(err, OperationType.CREATE, REQUESTS_COLLECTION);
        } catch {
          // Structured error logged in handleFirestoreError
        }
        return false;
      } finally {
        setSubmittingRequest(false);
      }
    },
    [user.displayName, user.uid, userPhone]
  );

  const acceptRequest = useCallback(
    async (request: CampusRequest): Promise<boolean> => {
      const normalizedPhone = userPhone?.trim() || '';
      if (normalizedPhone.length < CAMPUS_ITEM_LIMITS.phoneMin) {
        setItemsError('Please complete your student profile before accepting a request.');
        return false;
      }

      if (request.requesterId === user.uid) {
        setItemsError('You cannot accept your own request.');
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
      const reqPath = `${REQUESTS_COLLECTION}/${request.id}`;

      try {
        const safeAccepterName = (user.displayName?.trim() || 'Campus Student').slice(
          0,
          CAMPUS_ITEM_LIMITS.authorNameMax
        );
        const safeAccepterPhone = normalizedPhone.slice(0, CAMPUS_ITEM_LIMITS.phoneMax);

        await runTransaction(firestoreDb, async (transaction) => {
          const latestSnap = await transaction.get(reqRef);
          if (!latestSnap.exists()) {
            throw new Error('REQUEST_NOT_FOUND');
          }

          const data = latestSnap.data();
          if (data.status !== 'Open' || data.acceptedById !== null) {
            throw new Error('ALREADY_ACCEPTED');
          }

          if (data.requesterId === user.uid) {
            throw new Error('SELF_ACCEPT');
          }

          transaction.update(reqRef, {
            status: 'Accepted',
            acceptedById: user.uid,
            acceptedByName: safeAccepterName,
            acceptedByPhone: safeAccepterPhone,
            borrowerFulfilled: false,
            lenderFulfilled: false,
            updatedAt: serverTimestamp(),
          });
        });

        setStatusMessage(
          `Request accepted! ${request.requesterName} can now see your name and phone number.`
        );
        return true;
      } catch (err) {
        if (err instanceof Error && err.message === 'ALREADY_ACCEPTED') {
          setItemsError('This request has already been accepted by another student.');
          return false;
        }
        if (err instanceof Error && err.message === 'REQUEST_NOT_FOUND') {
          setItemsError('This request is no longer available.');
          return false;
        }
        if (err instanceof Error && err.message === 'SELF_ACCEPT') {
          setItemsError('You cannot accept your own request.');
          return false;
        }

        const errMsg = err instanceof Error ? err.message : String(err);
        if (
          errMsg.includes('Missing or insufficient permissions') ||
          errMsg.includes('aborted') ||
          errMsg.includes('FAILED_PRECONDITION')
        ) {
          setItemsError(
            'Another student may have just accepted this request, or your session lacks permission.'
          );
        } else {
          setItemsError('Could not accept this request right now. Please try again.');
        }

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
    [user.displayName, user.uid, userPhone]
  );

  const fulfillRequest = useCallback(
    async (request: CampusRequest): Promise<boolean> => {
      if (request.status !== 'Accepted') {
        setItemsError('Only accepted requests can be marked fulfilled.');
        return false;
      }

      if (request.requesterId !== user.uid && request.acceptedById !== user.uid) {
        setItemsError(
          'Only the borrower or the lender from this exchange can mark it fulfilled.'
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
      const reqPath = `${REQUESTS_COLLECTION}/${request.id}`;

      try {
        const resultStatus = await runTransaction(firestoreDb, async (transaction) => {
          const latestSnap = await transaction.get(reqRef);
          if (!latestSnap.exists()) {
            throw new Error('REQUEST_NOT_FOUND');
          }

          const data = latestSnap.data();
          if (data.status !== 'Accepted') {
            throw new Error('NOT_ACCEPTED');
          }

          const isBorrower = data.requesterId === user.uid;
          const isLender = data.acceptedById === user.uid;
          if (!isBorrower && !isLender) {
            throw new Error('UNAUTHORIZED');
          }

          const prevBorrowerFulfilled = data.borrowerFulfilled === true;
          const prevLenderFulfilled = data.lenderFulfilled === true;

          if ((isBorrower && prevBorrowerFulfilled) || (isLender && prevLenderFulfilled)) {
            throw new Error('ALREADY_CONFIRMED');
          }

          const nextBorrowerFulfilled = isBorrower ? true : prevBorrowerFulfilled;
          const nextLenderFulfilled = isLender ? true : prevLenderFulfilled;
          const nextStatus: RequestStatus =
            nextBorrowerFulfilled && nextLenderFulfilled ? 'Fulfilled' : 'Accepted';

          transaction.update(reqRef, {
            borrowerFulfilled: nextBorrowerFulfilled,
            lenderFulfilled: nextLenderFulfilled,
            status: nextStatus,
            updatedAt: serverTimestamp(),
          });

          return nextStatus;
        });

        setStatusMessage(
          resultStatus === 'Fulfilled'
            ? 'Both borrower and lender confirmed! Exchange is now Fulfilled and ratings are unlocked.'
            : 'Your fulfillment is recorded. Once the other student also presses Mark Fulfilled, ratings will unlock.'
        );
        return true;
      } catch (err) {
        if (err instanceof Error && err.message === 'ALREADY_CONFIRMED') {
          setItemsError('You have already pressed Mark Fulfilled for this exchange.');
          return false;
        }
        if (err instanceof Error && err.message === 'REQUEST_NOT_FOUND') {
          setItemsError('This request is no longer available.');
          return false;
        }
        if (err instanceof Error && err.message === 'NOT_ACCEPTED') {
          setItemsError('This exchange is no longer in Accepted status.');
          return false;
        }
        if (err instanceof Error && err.message === 'UNAUTHORIZED') {
          setItemsError('Only the borrower or lender can confirm fulfillment.');
          return false;
        }

        setItemsError('Could not mark this request as fulfilled right now. Please try again.');
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
        setItemsError('Only the request creator or an authorized administrator can delete this request.');
        return false;
      }

      if (!db || !isFirebaseConfigured) {
        setItemsError('Shared database is not configured.');
        return false;
      }

      setDeletingId(request.id);
      setItemsError(null);
      setStatusMessage(null);
      const reqPath = `${REQUESTS_COLLECTION}/${request.id}`;

      try {
        await deleteDoc(doc(db, REQUESTS_COLLECTION, request.id));
        setStatusMessage('Removed the campus request.');
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

  const dismissNewRequestAlert = useCallback(() => {
    setNewRequestAlert(null);
  }, []);

  return {
    allItems,
    sharedRequests,
    myRequests,
    isBackendConfigured,
    loading,
    submittingItem,
    submittingRequest,
    updatingRequestId,
    deletingId,
    itemsError,
    statusMessage,
    newRequestAlert,
    addItem,
    deleteItem,
    createRequest,
    acceptRequest,
    fulfillRequest,
    deleteRequest,
    clearItemsError,
    clearStatusMessage,
    dismissNewRequestAlert,
  };
}
