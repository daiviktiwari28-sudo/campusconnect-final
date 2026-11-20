import { useEffect } from 'react';
import { Loader2, Lock, Phone, Send, Star, X } from 'lucide-react';
import { formatInr, type CampusItem } from '../data/campusItems';

interface PurchaseRequestModalProps {
  item: CampusItem | null;
  sellerDisplayName: string;
  borrowerName: string;
  borrowerPhone: string;
  borrowerRatingAverage: number;
  borrowerRatingCount: number;
  submitting: boolean;
  onClose: () => void;
  onConfirmSend: (item: CampusItem) => Promise<boolean>;
}

export function PurchaseRequestModal({
  item,
  sellerDisplayName,
  borrowerName,
  borrowerPhone,
  borrowerRatingAverage,
  borrowerRatingCount,
  submitting,
  onClose,
  onConfirmSend,
}: PurchaseRequestModalProps) {
  useEffect(() => {
    if (!item) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [item, submitting, onClose]);

  if (!item) return null;

  const ratingLabel =
    borrowerRatingCount > 0
      ? `${borrowerRatingAverage.toFixed(1)} / 5 (${borrowerRatingCount} ${
          borrowerRatingCount === 1 ? 'review' : 'reviews'
        })`
      : 'No ratings yet';

  async function handleSubmit() {
    if (!item) return;
    const ok = await onConfirmSend(item);
    if (ok) {
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-[1px]"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="purchase-request-modal-title"
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto bg-white border border-slate-200 rounded-2xl p-6 sm:p-7 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="purchase-request-modal-title"
              className="font-display text-xl font-bold tracking-tight text-slate-900"
            >
              Send purchase request
            </h2>
            <p className="mt-1 text-sm text-slate-600 leading-relaxed">
              Send your details privately to{' '}
              <span className="font-medium text-slate-900">{sellerDisplayName}</span> so you can
              contact each other, negotiate if needed, and settle payment independently.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close purchase request dialog"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Item & Listed Price */}
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2.5">
          <div className="flex items-center gap-3.5">
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
              <p className="text-xs text-slate-600 mt-0.5 truncate">
                Listed by {sellerDisplayName}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-medium text-slate-500">Listed price</p>
              <p className="font-display text-lg font-bold text-slate-900 tabular-nums">
                {formatInr(item.price)}
              </p>
            </div>
          </div>
          {item.description && (
            <p className="text-xs text-slate-600 leading-relaxed pt-2 border-t border-slate-200/70">
              {item.description}
            </p>
          )}
        </div>

        {/* Details Shared with Lender */}
        <div className="mt-5 pt-4 border-t border-slate-100 space-y-3">
          <p className="text-xs font-semibold text-slate-700">
            Included in your request to {sellerDisplayName}
          </p>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Your name</dt>
              <dd className="mt-0.5 font-medium text-slate-900 truncate">{borrowerName}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Your phone number</dt>
              <dd className="mt-0.5 font-medium text-slate-900 inline-flex items-center gap-1.5 tabular-nums">
                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                <span>{borrowerPhone}</span>
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-500">Your profile rating</dt>
              <dd className="mt-0.5 font-medium text-slate-900 inline-flex items-center gap-1.5 tabular-nums">
                <Star
                  className={`w-3.5 h-3.5 shrink-0 ${
                    borrowerRatingCount > 0
                      ? 'fill-amber-400 text-amber-500'
                      : 'text-slate-300'
                  }`}
                  aria-hidden="true"
                />
                <span>{ratingLabel}</span>
              </dd>
            </div>
          </dl>
        </div>

        <div className="mt-5 pt-4 border-t border-slate-100 flex items-start gap-2.5 text-xs text-slate-600 leading-relaxed">
          <Lock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
          <p>
            Private to you and {sellerDisplayName}. After payment is settled independently, you will
            confirm <span className="font-medium text-slate-800">Payment made</span> and the lender
            will confirm <span className="font-medium text-slate-800">Payment received</span> to
            complete the purchase. Either person can cancel before completion.
          </p>
        </div>

        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 transition-colors inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>Sending request...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" aria-hidden="true" />
                <span>Send Purchase Request</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
