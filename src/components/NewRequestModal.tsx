import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, Phone, X } from 'lucide-react';
import { CAMPUS_ITEM_LIMITS, type CampusItem } from '../data/campusItems';

interface NewRequestModalProps {
  isOpen: boolean;
  linkedItem: CampusItem | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (description: string, linkedItem?: CampusItem | null) => Promise<boolean>;
}

export function NewRequestModal({
  isOpen,
  linkedItem,
  submitting,
  onClose,
  onSubmit,
}: NewRequestModalProps) {
  const [description, setDescription] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setDescription('');
      setValidationError(null);
      return;
    }

    if (linkedItem) {
      setDescription(`Looking to borrow "${linkedItem.title}" on campus.`);
    } else {
      setDescription('');
    }
    setValidationError(null);
  }, [isOpen, linkedItem]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, submitting]);

  if (!isOpen) return null;

  const trimmedDescription = description.trim();

  async function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (trimmedDescription.length < CAMPUS_ITEM_LIMITS.requestDescriptionMin) {
      setValidationError(
        `Please describe what you need (${CAMPUS_ITEM_LIMITS.requestDescriptionMin} or more characters).`
      );
      return;
    }

    if (trimmedDescription.length > CAMPUS_ITEM_LIMITS.requestDescriptionMax) {
      setValidationError(
        `Description must be ${CAMPUS_ITEM_LIMITS.requestDescriptionMax} characters or fewer.`
      );
      return;
    }

    setValidationError(null);
    const saved = await onSubmit(trimmedDescription, linkedItem);
    if (saved) {
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
        aria-labelledby="new-request-dialog-title"
        className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-6 sm:p-7 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="new-request-dialog-title"
              className="font-display text-xl font-bold tracking-tight text-slate-900"
            >
              {linkedItem ? 'Request this item' : 'Create a campus request'}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              All signed-in students will see your Open request and can accept it to help out.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close dialog"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {linkedItem && (
          <div className="mt-5 flex items-center gap-3.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <img
              src={linkedItem.photoUrl}
              alt={linkedItem.title}
              referrerPolicy="no-referrer"
              className="w-16 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">{linkedItem.title}</p>
              <p className="text-xs text-slate-600 flex items-center gap-1.5 mt-0.5 truncate">
                <span>Shared by {linkedItem.authorName}</span>
                <span aria-hidden="true">·</span>
                <Phone className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>{linkedItem.authorPhone}</span>
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleFormSubmit} className="mt-5 space-y-4" noValidate>
          {validationError && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
            >
              {validationError}
            </div>
          )}

          <div>
            <div className="flex items-baseline justify-between gap-2">
              <label
                htmlFor="campus-request-description"
                className="block text-sm font-medium text-slate-900"
              >
                What do you need?
              </label>
              <span className="text-xs text-slate-500 tabular-nums">
                {trimmedDescription.length}/{CAMPUS_ITEM_LIMITS.requestDescriptionMax}
              </span>
            </div>
            <textarea
              id="campus-request-description"
              required
              autoFocus
              rows={3}
              maxLength={CAMPUS_ITEM_LIMITS.requestDescriptionMax}
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                if (validationError) setValidationError(null);
              }}
              placeholder="e.g., Forgot my USB-C laptop charger — need to borrow one near the Science Library until 4 PM."
              disabled={submitting}
              className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700 disabled:bg-slate-50 resize-y"
            />
          </div>

          <div className="pt-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 transition-colors inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>Posting request...</span>
                </>
              ) : (
                <span>Post Open Request</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
