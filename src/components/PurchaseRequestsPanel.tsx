import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Loader2,
  Lock,
  Pencil,
  Phone,
  Search,
  ShoppingBag,
  Star,
  XCircle,
} from 'lucide-react';
import {
  PAYMENT_LIMITS,
  formatInr,
  type ExchangeRating,
  type PurchaseRequest,
  type PurchaseRequestStatus,
} from '../data/campusItems';
import { formatRemainingEditWindow, isRatingEditable } from '../hooks/useRatings';

interface PurchaseRequestsPanelProps {
  requests: PurchaseRequest[];
  currentUserId: string;
  searchQuery: string;
  loading: boolean;
  updatingId: string | null;
  isBackendConfigured: boolean;
  getRatingForRequestByUser: (requestId: string, raterId: string) => ExchangeRating | undefined;
  onConfirmPayment: (req: PurchaseRequest, negotiatedFinalAmount?: number) => Promise<boolean>;
  onCancelRequest: (req: PurchaseRequest) => Promise<boolean>;
  onRatePurchase: (req: PurchaseRequest) => void;
  onEditRating: (rating: ExchangeRating) => void;
  onOpenProfileRatings: (userId: string, userName: string) => void;
  onClearSearch: () => void;
}

type StatusFilter = 'all' | 'Pending' | 'Completed' | 'Cancelled';

function formatTimestamp(ms: number): string {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(ms));
  } catch {
    return 'Recently';
  }
}

function PurchaseStatusLabel({ status }: { status: PurchaseRequestStatus }) {
  if (status === 'Completed') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Completed</span>
      </span>
    );
  }
  if (status === 'Cancelled') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Cancelled</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
      <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>Pending</span>
    </span>
  );
}

export function PurchaseRequestsPanel({
  requests,
  currentUserId,
  searchQuery,
  loading,
  updatingId,
  isBackendConfigured,
  getRatingForRequestByUser,
  onConfirmPayment,
  onCancelRequest,
  onRatePurchase,
  onEditRating,
  onOpenProfileRatings,
  onClearSearch,
}: PurchaseRequestsPanelProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});

  const counts = useMemo(() => {
    let pending = 0;
    let completed = 0;
    let cancelled = 0;
    for (const req of requests) {
      if (req.status === 'Pending') pending += 1;
      else if (req.status === 'Completed') completed += 1;
      else if (req.status === 'Cancelled') cancelled += 1;
    }
    return { all: requests.length, pending, completed, cancelled };
  }, [requests]);

  const filteredRequests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return requests.filter((req) => {
      if (statusFilter !== 'all' && req.status !== statusFilter) return false;
      if (!q) return true;
      return (
        req.itemTitle.toLowerCase().includes(q) ||
        req.borrowerName.toLowerCase().includes(q) ||
        req.lenderName.toLowerCase().includes(q) ||
        req.status.toLowerCase().includes(q)
      );
    });
  }, [requests, statusFilter, searchQuery]);

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="bg-white border border-slate-200 rounded-2xl p-6 animate-pulse space-y-3"
          >
            <div className="h-4 w-48 bg-slate-200 rounded" />
            <div className="h-3.5 w-72 bg-slate-100 rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Filter & Privacy Note */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Filter purchase requests by status"
          className="inline-flex flex-wrap items-center p-1 bg-slate-200/70 rounded-xl self-start"
        >
          {(
            [
              { id: 'all', label: 'All', count: counts.all },
              { id: 'Pending', label: 'Pending', count: counts.pending },
              { id: 'Completed', label: 'Completed', count: counts.completed },
              { id: 'Cancelled', label: 'Cancelled', count: counts.cancelled },
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={statusFilter === option.id}
              onClick={() => setStatusFilter(option.id)}
              className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 cursor-pointer ${
                statusFilter === option.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>{option.label}</span>
              <span className="ml-1.5 text-xs text-slate-400 tabular-nums">{option.count}</span>
            </button>
          ))}
        </div>

        <p className="text-xs text-slate-500 inline-flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
          <span>Private — visible only to the involved borrower, lender, and admin.</span>
        </p>
      </div>

      {filteredRequests.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center max-w-xl mx-auto">
          <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
            {searchQuery.trim() ? (
              <Search className="w-5 h-5" aria-hidden="true" />
            ) : (
              <ShoppingBag className="w-5 h-5" aria-hidden="true" />
            )}
          </div>
          <h2 className="mt-4 font-display text-lg font-semibold text-slate-900">
            {searchQuery.trim()
              ? 'No matching purchase requests'
              : statusFilter === 'all'
                ? 'No purchase requests yet'
                : `No ${statusFilter.toLowerCase()} purchase requests`}
          </h2>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            {searchQuery.trim()
              ? `Nothing matched “${searchQuery.trim()}”.`
              : 'When you tap Buy on a permanent-sale item or receive a buyer request on your listing, it appears privately here.'}
          </p>
          {searchQuery.trim() && (
            <button
              type="button"
              onClick={onClearSearch}
              className="mt-6 min-h-[40px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 cursor-pointer"
            >
              Clear search
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRequests.map((req) => {
            const isBorrower = req.borrowerId === currentUserId;
            const isLender = req.lenderId === currentUserId;
            const isUpdating = updatingId === req.id;
            const userConfirmed = isBorrower ? req.borrowerConfirmed : req.lenderConfirmed;
            const canEditAmount =
              req.status === 'Pending' && !req.borrowerConfirmed && !req.lenderConfirmed;
            const draftAmountValue = amountDrafts[req.id] ?? String(req.finalAmount);

            const borrowerRatingText =
              req.borrowerRatingCount > 0
                ? `${req.borrowerRatingAverage.toFixed(1)} / 5 (${req.borrowerRatingCount} ${
                    req.borrowerRatingCount === 1 ? 'review' : 'reviews'
                  })`
                : 'No ratings yet';

            const existingRating =
              req.status === 'Completed'
                ? getRatingForRequestByUser(req.id, currentUserId)
                : undefined;

            return (
              <article
                key={req.id}
                className="bg-white border border-slate-200 rounded-2xl overflow-hidden"
              >
                <div className="p-5 sm:p-6 space-y-5">
                  {/* Top Meta Row */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                      <PurchaseStatusLabel status={req.status} />
                      <span className="text-slate-300" aria-hidden="true">
                        ·
                      </span>
                      <span className="font-medium text-slate-700">
                        {isLender ? 'Incoming buyer request' : 'Outgoing purchase request'}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 tabular-nums">
                      Requested {formatTimestamp(req.createdAtMs)}
                    </span>
                  </div>

                  {/* Product & Price Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                      {req.itemPhotoUrl && (
                        <img
                          src={req.itemPhotoUrl}
                          alt={req.itemTitle}
                          referrerPolicy="no-referrer"
                          className="w-16 h-12 rounded-xl object-cover border border-slate-200 shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <h3 className="font-display text-base sm:text-lg font-semibold text-slate-900 truncate">
                          {req.itemTitle}
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                          Listed price: {formatInr(req.listedPrice)}
                          {req.finalAmount !== req.listedPrice && (
                            <>
                              {' '}
                              ·{' '}
                              <span className="font-medium text-slate-800">
                                Agreed final: {formatInr(req.finalAmount)}
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="sm:text-right shrink-0">
                      <p className="text-xs text-slate-500">
                        {req.status === 'Completed'
                          ? 'Final amount paid'
                          : req.borrowerConfirmed || req.lenderConfirmed
                            ? 'Agreed final amount'
                            : 'Listed price'}
                      </p>
                      <p className="font-display text-xl font-bold text-slate-900 tabular-nums">
                        {formatInr(req.finalAmount)}
                      </p>
                    </div>
                  </div>

                  {/* Private Contact & Rating Details */}
                  <div className="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-slate-500">Borrower details</p>
                      <p className="font-semibold text-slate-900">
                        {isBorrower ? `${req.borrowerName} (You)` : req.borrowerName}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <a
                          href={`tel:${req.borrowerPhone.replace(/[^+\d]/g, '')}`}
                          className="inline-flex items-center gap-1 text-blue-700 font-medium hover:underline tabular-nums"
                        >
                          <Phone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span>{req.borrowerPhone}</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => onOpenProfileRatings(req.borrowerId, req.borrowerName)}
                          className="inline-flex items-center gap-1 text-slate-600 hover:text-blue-700 hover:underline tabular-nums cursor-pointer"
                        >
                          <Star
                            className={`w-3.5 h-3.5 shrink-0 ${
                              req.borrowerRatingCount > 0
                                ? 'fill-amber-400 text-amber-500'
                                : 'text-slate-300'
                            }`}
                            aria-hidden="true"
                          />
                          <span>{borrowerRatingText}</span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs font-medium text-slate-500">Lender details</p>
                      <p className="font-semibold text-slate-900">
                        {isLender ? `${req.lenderName} (You)` : req.lenderName}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <a
                          href={`tel:${req.lenderPhone.replace(/[^+\d]/g, '')}`}
                          className="inline-flex items-center gap-1 text-blue-700 font-medium hover:underline tabular-nums"
                        >
                          <Phone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span>{req.lenderPhone}</span>
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Two-Party Confirmation Status & Controls (Pending) */}
                  {req.status === 'Pending' && (
                    <div className="pt-4 border-t border-slate-100 space-y-4">
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
                        <span
                          className={`inline-flex items-center gap-1.5 ${
                            req.borrowerConfirmed
                              ? 'text-emerald-700 font-semibold'
                              : 'text-slate-500'
                          }`}
                        >
                          {req.borrowerConfirmed ? (
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          ) : (
                            <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          )}
                          <span>
                            Borrower:{' '}
                            {req.borrowerConfirmed ? 'Payment made' : 'Pending confirmation'}
                          </span>
                        </span>

                        <span
                          className={`inline-flex items-center gap-1.5 ${
                            req.lenderConfirmed
                              ? 'text-emerald-700 font-semibold'
                              : 'text-slate-500'
                          }`}
                        >
                          {req.lenderConfirmed ? (
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          ) : (
                            <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          )}
                          <span>
                            Lender:{' '}
                            {req.lenderConfirmed ? 'Payment received' : 'Pending confirmation'}
                          </span>
                        </span>
                      </div>

                      {!userConfirmed ? (
                        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                          {canEditAmount ? (
                            <div className="w-full sm:max-w-[220px]">
                              <label
                                htmlFor={`purchase-final-amount-${req.id}`}
                                className="block text-xs font-medium text-slate-700 mb-1"
                              >
                                Final amount paid (₹)
                              </label>
                              <input
                                id={`purchase-final-amount-${req.id}`}
                                type="number"
                                inputMode="decimal"
                                min={PAYMENT_LIMITS.minPrice}
                                max={PAYMENT_LIMITS.maxPrice}
                                step="1"
                                value={draftAmountValue}
                                onChange={(event) =>
                                  setAmountDrafts((prev) => ({
                                    ...prev,
                                    [req.id]: event.target.value,
                                  }))
                                }
                                disabled={isUpdating}
                                className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700"
                              />
                            </div>
                          ) : (
                            <p className="text-xs text-slate-600 leading-relaxed">
                              {isBorrower ? 'Lender' : 'Borrower'} confirmed at{' '}
                              <span className="font-semibold text-slate-900 tabular-nums">
                                {formatInr(req.finalAmount)}
                              </span>
                              . Confirm to complete the purchase and unlock ratings.
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => void onCancelRequest(req)}
                              disabled={isUpdating || !isBackendConfigured}
                              className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-medium text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              Cancel request
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                const parsed = Number(draftAmountValue);
                                void onConfirmPayment(
                                  req,
                                  canEditAmount ? parsed : undefined
                                );
                              }}
                              disabled={isUpdating || !isBackendConfigured}
                              className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs sm:text-sm font-medium hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                            >
                              {isUpdating ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                                  <span>Updating...</span>
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                                  <span>
                                    {isBorrower ? 'Payment made' : 'Payment received'}
                                  </span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <p className="text-xs font-medium text-emerald-700 leading-relaxed">
                            {isBorrower
                              ? `You confirmed “Payment made” (${formatInr(req.finalAmount)}) · Waiting for ${req.lenderName} to confirm “Payment received”.`
                              : `You confirmed “Payment received” (${formatInr(req.finalAmount)}) · Waiting for ${req.borrowerName} to confirm “Payment made”.`}
                          </p>
                          <button
                            type="button"
                            onClick={() => void onCancelRequest(req)}
                            disabled={isUpdating || !isBackendConfigured}
                            className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 transition-colors shrink-0 self-start sm:self-auto cursor-pointer disabled:opacity-50"
                          >
                            Cancel request
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Ratings Section (Completed) */}
                  {req.status === 'Completed' && (isBorrower || isLender) && (
                    <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                      {!existingRating ? (
                        <>
                          <span className="text-xs font-medium text-emerald-700">
                            Completed · Both confirmations recorded
                          </span>
                          <button
                            type="button"
                            onClick={() => onRatePurchase(req)}
                            disabled={!isBackendConfigured}
                            className="min-h-[38px] px-4 py-1.5 rounded-xl bg-blue-700 text-white text-xs sm:text-sm font-medium hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 transition-colors inline-flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
                          >
                            <Star className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{isBorrower ? 'Rate lender' : 'Rate borrower'}</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-700">
                            <span className="inline-flex items-center gap-1 font-medium text-slate-900 tabular-nums">
                              <Star
                                className="w-3.5 h-3.5 fill-amber-400 text-amber-500"
                                aria-hidden="true"
                              />
                              <span>Your rating: {existingRating.score}/5</span>
                            </span>
                            {existingRating.isEdited && (
                              <span className="text-slate-500">
                                · Updated {formatTimestamp(existingRating.updatedAtMs)}
                              </span>
                            )}
                          </div>
                          {isRatingEditable(existingRating) && (
                            <button
                              type="button"
                              onClick={() => onEditRating(existingRating)}
                              title={formatRemainingEditWindow(existingRating)}
                              className="min-h-[36px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 transition-colors inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                            >
                              <Pencil className="w-3 h-3" aria-hidden="true" />
                              <span>Edit rating</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Timestamped Activity Record */}
                  <div className="pt-3.5 border-t border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 tabular-nums">
                    <span>Requested: {formatTimestamp(req.createdAtMs)}</span>
                    {req.borrowerConfirmedAtMs && (
                      <span>
                        Payment made: {formatTimestamp(req.borrowerConfirmedAtMs)}
                      </span>
                    )}
                    {req.lenderConfirmedAtMs && (
                      <span>
                        Payment received: {formatTimestamp(req.lenderConfirmedAtMs)}
                      </span>
                    )}
                    {req.completedAtMs && (
                      <span className="font-medium text-emerald-700">
                        Completed: {formatTimestamp(req.completedAtMs)}
                      </span>
                    )}
                    {req.cancelledAtMs && (
                      <span className="font-medium text-slate-600">
                        Cancelled by{' '}
                        {req.cancelledById === currentUserId
                          ? 'you'
                          : req.cancelledByRole === 'borrower'
                            ? req.borrowerName
                            : req.lenderName}
                        : {formatTimestamp(req.cancelledAtMs)}
                      </span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
