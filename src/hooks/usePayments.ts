import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import type {
  CampusItem,
  CampusPayment,
  PaymentMethodId,
  PaymentStatus,
} from '../data/campusItems';
import type { CampusUser } from './useAuth';
import { auth, db, handleFirestoreError, isFirebaseConfigured, OperationType } from '../lib/firebase';

const PAYMENTS_COLLECTION = 'payments';

export interface ConfiguredPaymentMethod {
  id: PaymentMethodId;
  label: string;
  description: string;
}

export interface InitiatedPaymentSession {
  paymentId: string;
  transactionRef: string;
  itemId: string;
  itemTitle: string;
  amount: number;
  currency: 'INR';
  paymentMethod: PaymentMethodId;
  payerAccountRef: string;
  status: 'Pending';
  sellerId: string;
  sellerName: string;
  challengeToken: string;
}

export interface VerifiedPaymentResult {
  ok: boolean;
  status: PaymentStatus;
  paymentId: string;
  transactionRef: string;
  verificationCode?: string;
  amount: number;
  failureReason?: string | null;
  message: string;
}

function toMillis(value: unknown): number {
  return value instanceof Timestamp ? value.toMillis() : Date.now();
}

function isAllowedPaymentStatus(value: unknown): value is PaymentStatus {
  return value === 'Pending' || value === 'Successful' || value === 'Failed';
}

function isAllowedMethod(value: unknown): value is PaymentMethodId {
  return value === 'Campus UPI' || value === 'Campus Direct Pay';
}

function mapPaymentDoc(id: string, data: Record<string, unknown>): CampusPayment {
  return {
    id,
    transactionRef: typeof data.transactionRef === 'string' ? data.transactionRef : id,
    itemId: typeof data.itemId === 'string' ? data.itemId : '',
    itemTitle: typeof data.itemTitle === 'string' ? data.itemTitle : 'Campus Item',
    listingType: 'sell',
    amount: typeof data.amount === 'number' && Number.isFinite(data.amount) ? data.amount : 0,
    currency: 'INR',
    paymentMethod: isAllowedMethod(data.paymentMethod) ? data.paymentMethod : 'Campus UPI',
    payerAccountRef:
      typeof data.payerAccountRef === 'string' ? data.payerAccountRef : 'Campus Account',
    status: isAllowedPaymentStatus(data.status) ? data.status : 'Pending',
    verifiedByBackend: Boolean(data.verifiedByBackend),
    verificationCode: typeof data.verificationCode === 'string' ? data.verificationCode : '',
    failureReason: typeof data.failureReason === 'string' ? data.failureReason : null,
    buyerId: typeof data.buyerId === 'string' ? data.buyerId : '',
    buyerName: typeof data.buyerName === 'string' ? data.buyerName : 'Buyer',
    sellerId: typeof data.sellerId === 'string' ? data.sellerId : '',
    sellerName: typeof data.sellerName === 'string' ? data.sellerName : 'Seller',
    createdAtMs: toMillis(data.createdAt),
    updatedAtMs: toMillis(data.updatedAt ?? data.createdAt),
  };
}

export function usePayments(user: CampusUser) {
  const [buyerPayments, setBuyerPayments] = useState<CampusPayment[]>([]);
  const [sellerPayments, setSellerPayments] = useState<CampusPayment[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<ConfiguredPaymentMethod[]>([
    {
      id: 'Campus UPI',
      label: 'Campus UPI',
      description: 'Pay using your college or personal UPI ID and verify transaction reference.',
    },
    {
      id: 'Campus Direct Pay',
      label: 'Campus Direct Pay',
      description: 'Confirm direct campus settlement with backend transaction verification.',
    },
  ]);
  const [paymentsLoading, setPaymentsLoading] = useState<boolean>(
    Boolean(db && isFirebaseConfigured)
  );
  const [processingPayment, setProcessingPayment] = useState<boolean>(false);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);
  const [paymentStatusMessage, setPaymentStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/payments/methods')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { methods?: ConfiguredPaymentMethod[] } | null) => {
        if (active && data && Array.isArray(data.methods) && data.methods.length > 0) {
          setPaymentMethods(data.methods);
        }
      })
      .catch(() => {
        // Fallback configured methods already populated
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!db || !isFirebaseConfigured || !user.uid) {
      setPaymentsLoading(false);
      return;
    }

    setPaymentsLoading(true);
    let buyerLoaded = false;
    let sellerLoaded = false;

    const finishIfReady = () => {
      if (buyerLoaded && sellerLoaded) {
        setPaymentsLoading(false);
      }
    };

    const buyerQuery = query(
      collection(db, PAYMENTS_COLLECTION),
      where('buyerId', '==', user.uid)
    );
    const sellerQuery = query(
      collection(db, PAYMENTS_COLLECTION),
      where('sellerId', '==', user.uid)
    );

    const unsubBuyer = onSnapshot(
      buyerQuery,
      (snapshot) => {
        setBuyerPayments(snapshot.docs.map((d) => mapPaymentDoc(d.id, d.data())));
        buyerLoaded = true;
        finishIfReady();
      },
      (err) => {
        buyerLoaded = true;
        finishIfReady();
        try {
          handleFirestoreError(err, OperationType.LIST, PAYMENTS_COLLECTION);
        } catch {
          // Logged in handleFirestoreError
        }
      }
    );

    const unsubSeller = onSnapshot(
      sellerQuery,
      (snapshot) => {
        setSellerPayments(snapshot.docs.map((d) => mapPaymentDoc(d.id, d.data())));
        sellerLoaded = true;
        finishIfReady();
      },
      (err) => {
        sellerLoaded = true;
        finishIfReady();
        try {
          handleFirestoreError(err, OperationType.LIST, PAYMENTS_COLLECTION);
        } catch {
          // Logged in handleFirestoreError
        }
      }
    );

    return () => {
      unsubBuyer();
      unsubSeller();
    };
  }, [user.uid]);

  const payments = useMemo<CampusPayment[]>(() => {
    const byId = new Map<string, CampusPayment>();
    for (const p of buyerPayments) byId.set(p.id, p);
    for (const p of sellerPayments) byId.set(p.id, p);
    return Array.from(byId.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [buyerPayments, sellerPayments]);

  const initiatePayment = useCallback(
    async (
      item: CampusItem,
      paymentMethod: PaymentMethodId,
      payerAccountRef: string
    ): Promise<InitiatedPaymentSession | null> => {
      if (!auth?.currentUser) {
        setPaymentsError('Please sign in again before starting a payment.');
        return null;
      }

      setProcessingPayment(true);
      setPaymentsError(null);
      setPaymentStatusMessage(null);

      try {
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch('/api/payments/initiate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            itemId: item.id,
            paymentMethod,
            payerAccountRef,
          }),
        });

        const payload = (await res.json()) as InitiatedPaymentSession & { error?: string };
        if (!res.ok) {
          setPaymentsError(payload.error || 'Could not initiate payment.');
          return null;
        }

        return payload;
      } catch {
        setPaymentsError('Unable to reach payment verification server. Please try again.');
        return null;
      } finally {
        setProcessingPayment(false);
      }
    },
    []
  );

  const verifyPayment = useCallback(
    async (
      session: InitiatedPaymentSession,
      outcome: 'confirm' | 'fail' = 'confirm',
      confirmationRef = ''
    ): Promise<VerifiedPaymentResult | null> => {
      if (!auth?.currentUser) {
        setPaymentsError('Please sign in again to verify payment.');
        return null;
      }

      setProcessingPayment(true);
      setPaymentsError(null);
      setPaymentStatusMessage(null);

      try {
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch('/api/payments/verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            paymentId: session.paymentId,
            itemId: session.itemId,
            challengeToken: session.challengeToken,
            outcome,
            confirmationRef,
          }),
        });

        const payload = (await res.json()) as VerifiedPaymentResult & { error?: string };
        if (!res.ok) {
          setPaymentsError(payload.error || 'Backend payment verification failed.');
          return null;
        }

        if (payload.status === 'Successful') {
          setPaymentStatusMessage(
            `Payment successful (${payload.transactionRef})! “${session.itemTitle}” is now yours.`
          );
        } else {
          setPaymentsError(
            payload.failureReason || payload.message || 'Payment verification failed.'
          );
        }

        return payload;
      } catch {
        setPaymentsError('Could not complete backend payment verification. Please check history.');
        return null;
      } finally {
        setProcessingPayment(false);
      }
    },
    []
  );

  const clearPaymentsError = useCallback(() => {
    setPaymentsError(null);
  }, []);

  const clearPaymentStatusMessage = useCallback(() => {
    setPaymentStatusMessage(null);
  }, []);

  return {
    payments,
    paymentMethods,
    paymentsLoading,
    processingPayment,
    paymentsError,
    paymentStatusMessage,
    initiatePayment,
    verifyPayment,
    clearPaymentsError,
    clearPaymentStatusMessage,
  };
}
