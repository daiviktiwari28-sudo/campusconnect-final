import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  ShieldCheck,
  X,
} from 'lucide-react';
import { formatInr, type CampusItem, type PaymentMethodId } from '../data/campusItems';
import type {
  ConfiguredPaymentMethod,
  InitiatedPaymentSession,
  VerifiedPaymentResult,
} from '../hooks/usePayments';

interface PaymentModalProps {
  item: CampusItem | null;
  sellerDisplayName: string;
  defaultPayerRef: string;
  paymentMethods: ConfiguredPaymentMethod[];
  processing: boolean;
  onClose: () => void;
  onInitiatePayment: (
    item: CampusItem,
    method: PaymentMethodId,
    payerAccountRef: string
  ) => Promise<InitiatedPaymentSession | null>;
  onVerifyPayment: (
    session: InitiatedPaymentSession,
    outcome: 'confirm' | 'fail',
    confirmationRef?: string
  ) => Promise<VerifiedPaymentResult | null>;
}

export function PaymentModal({
  item,
  sellerDisplayName,
  defaultPayerRef,
  paymentMethods,
  processing,
  onClose,
  onInitiatePayment,
  onVerifyPayment,
}: PaymentModalProps) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodId>('Campus UPI');
  const [payerAccountRef, setPayerAccountRef] = useState('');
  const [confirmationRef, setConfirmationRef] = useState('');
  const [session, setSession] = useState<InitiatedPaymentSession | null>(null);
  const [result, setResult] = useState<VerifiedPaymentResult | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) {
      setSelectedMethod(paymentMethods[0]?.id ?? 'Campus UPI');
      setPayerAccountRef('');
      setConfirmationRef('');
      setSession(null);
      setResult(null);
      setLocalError(null);
      return;
    }

    setSelectedMethod(paymentMethods[0]?.id ?? 'Campus UPI');
    setPayerAccountRef(defaultPayerRef || 'student@upi');
    setConfirmationRef('');
    setSession(null);
    setResult(null);
    setLocalError(null);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !processing) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [item, defaultPayerRef, paymentMethods, processing, onClose]);

  if (!item) return null;

  async function handleInitiate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item) return;

    const trimmedRef = payerAccountRef.trim();
    if (trimmedRef.length < 3 || trimmedRef.length > 80) {
      setLocalError('Please enter your UPI ID or campus payment account reference (3–80 chars).');
      return;
    }

    setLocalError(null);
    const createdSession = await onInitiatePayment(item, selectedMethod, trimmedRef);
    if (createdSession) {
      setSession(createdSession);
      setResult(null);
    }
  }

  async function handleVerify(outcome: 'confirm' | 'fail') {
    if (!session) return;
    setLocalError(null);
    const verificationResult = await onVerifyPayment(session, outcome, confirmationRef.trim());
    if (verificationResult) {
      setResult(verificationResult);
    }
  }

  function handleRetryNewPayment() {
    setSession(null);
    setResult(null);
    setConfirmationRef('');
    setLocalError(null);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-[1px]"
      onClick={() => {
        if (!processing) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-modal-title"
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto bg-white border border-slate-200 rounded-2xl p-6 sm:p-7 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="payment-modal-title"
              className="font-display text-xl font-bold tracking-tight text-slate-900"
            >
              Buy item permanently
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Payments are verified by the CampusConnect backend before marking the item sold.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            aria-label="Close payment dialog"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Item & Amount Summary */}
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-center gap-3.5">
          {item.photoUrl && (
            <img
              src={item.photoUrl}
              alt={item.title}
              referrerPolicy="no-referrer"
              className="w-16 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 truncate">{item.title}</p>
            <p className="text-xs text-slate-600 mt-0.5 truncate">Seller: {sellerDisplayName}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Amount
            </p>
            <p className="font-display text-lg font-bold text-slate-900 tabular-nums">
              {formatInr(session?.amount ?? item.price)}
            </p>
          </div>
        </div>

        {localError && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
          >
            {localError}
          </div>
        )}

        {/* Step 3: Verification Result */}
        {result ? (
          <div className="mt-5 space-y-4">
            {result.status === 'Successful' ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2.5 text-sm text-emerald-950">
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" aria-hidden="true" />
                  <span>Payment Successful</span>
                </div>
                <p className="text-xs sm:text-sm leading-relaxed">{result.message}</p>
                <dl className="pt-2 border-t border-emerald-200/70 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-emerald-800/80">Transaction Ref</dt>
                    <dd className="font-mono font-semibold text-emerald-950 tabular-nums">
                      {result.transactionRef}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-emerald-800/80">Verified Amount</dt>
                    <dd className="font-semibold text-emerald-950 tabular-nums">
                      {formatInr(result.amount)}
                    </dd>
                  </div>
                  {result.verificationCode && (
                    <div className="sm:col-span-2">
                      <dt className="text-emerald-800/80">Backend Verification Code</dt>
                      <dd className="font-mono font-semibold text-emerald-950">
                        {result.verificationCode}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            ) : (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-2.5 text-sm text-red-950">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertCircle className="w-5 h-5 text-red-700 shrink-0" aria-hidden="true" />
                  <span>Payment Failed</span>
                </div>
                <p className="text-xs sm:text-sm leading-relaxed">
                  {result.failureReason || result.message}
                </p>
                <dl className="pt-2 border-t border-red-200/70 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-red-800/80">Transaction Ref</dt>
                    <dd className="font-mono font-semibold text-red-950 tabular-nums">
                      {result.transactionRef}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-red-800/80">Status</dt>
                    <dd className="font-semibold text-red-950">{result.status}</dd>
                  </div>
                </dl>
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-1">
              {result.status === 'Failed' && (
                <button
                  type="button"
                  onClick={handleRetryNewPayment}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-800 hover:bg-slate-50 cursor-pointer"
                >
                  Try new payment
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        ) : session ? (
          /* Step 2: Pending Transaction & Backend Verification */
          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2.5 text-sm text-amber-950">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <Clock className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
                  <span>Payment Pending Verification</span>
                </span>
                <span className="font-mono text-xs font-semibold tabular-nums">
                  {session.transactionRef}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-xs pt-1">
                <div>
                  <dt className="text-amber-800/80">Method</dt>
                  <dd className="font-medium text-amber-950">{session.paymentMethod}</dd>
                </div>
                <div>
                  <dt className="text-amber-800/80">Payer Account</dt>
                  <dd className="font-medium text-amber-950 truncate">{session.payerAccountRef}</dd>
                </div>
              </dl>
            </div>

            <div>
              <label
                htmlFor="payment-confirmation-ref"
                className="block text-sm font-medium text-slate-900"
              >
                Payment confirmation note{' '}
                <span className="font-normal text-slate-500">(optional)</span>
              </label>
              <input
                id="payment-confirmation-ref"
                type="text"
                maxLength={60}
                value={confirmationRef}
                onChange={(event) => setConfirmationRef(event.target.value)}
                placeholder="e.g., UTR / handoff note"
                disabled={processing}
                className="mt-1.5 w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700"
              />
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-600">
              <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0" aria-hidden="true" />
              <span>
                The backend validates your payment token, item availability, and amount before
                completing the sale.
              </span>
            </div>

            <div className="pt-2 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2.5">
              <button
                type="button"
                onClick={() => void handleVerify('fail')}
                disabled={processing}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-red-200 bg-white text-xs sm:text-sm font-medium text-red-700 hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50"
              >
                Simulate Failed Payment
              </button>

              <button
                type="button"
                onClick={() => void handleVerify('confirm')}
                disabled={processing}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 transition-colors inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {processing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                    <span>Verify &amp; Complete {formatInr(session.amount)}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Step 1: Choose Configured Payment Method & Initiate */
          <form onSubmit={handleInitiate} className="mt-5 space-y-5" noValidate>
            <fieldset>
              <legend className="text-sm font-medium text-slate-900">
                Select payment method
              </legend>
              <div className="mt-2 grid grid-cols-1 gap-2.5">
                {paymentMethods.map((method) => {
                  const selected = selectedMethod === method.id;
                  return (
                    <label
                      key={method.id}
                      className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${
                        selected
                          ? 'border-blue-700 bg-blue-50/50'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        value={method.id}
                        checked={selected}
                        onChange={() => setSelectedMethod(method.id)}
                        disabled={processing}
                        className="mt-1 accent-blue-700"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                          <CreditCard className="w-4 h-4 text-blue-700 shrink-0" aria-hidden="true" />
                          <span>{method.label}</span>
                        </p>
                        <p className="mt-0.5 text-xs text-slate-600">{method.description}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div>
              <label
                htmlFor="payment-payer-ref"
                className="block text-sm font-medium text-slate-900"
              >
                {selectedMethod === 'Campus UPI'
                  ? 'Your UPI ID'
                  : 'Your Campus Direct Pay reference'}
              </label>
              <input
                id="payment-payer-ref"
                type="text"
                required
                maxLength={80}
                value={payerAccountRef}
                onChange={(event) => {
                  setPayerAccountRef(event.target.value);
                  if (localError) setLocalError(null);
                }}
                placeholder={selectedMethod === 'Campus UPI' ? 'e.g., name@okaxis' : 'e.g., Roll No. / Desk Ref'}
                disabled={processing}
                className="mt-1.5 w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700"
              />
            </div>

            <div className="pt-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={processing}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={processing}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 transition-colors inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {processing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>Starting payment...</span>
                  </>
                ) : (
                  <span>Continue to pay {formatInr(item.price)}</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
