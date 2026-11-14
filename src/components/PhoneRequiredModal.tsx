import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, Loader2, Phone, X } from 'lucide-react';

interface PhoneRequiredModalProps {
  isOpen: boolean;
  reason: 'add' | 'request' | 'accept' | null;
  savingPhone: boolean;
  phoneError: string | null;
  onClose: () => void;
  onSavePhone: (phone: string) => Promise<boolean>;
  onClearError: () => void;
}

export function PhoneRequiredModal({
  isOpen,
  reason,
  savingPhone,
  phoneError,
  onClose,
  onSavePhone,
  onClearError,
}: PhoneRequiredModalProps) {
  const [phoneInput, setPhoneInput] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setPhoneInput('');
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !savingPhone) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, savingPhone]);

  if (!isOpen) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSavePhone(phoneInput);
  }

  const reasonCopy =
    reason === 'add'
      ? 'Enter your phone number before sharing an item so borrowers can confirm who they are picking it up from.'
      : reason === 'accept'
        ? 'Enter your phone number before accepting a request so the requester can coordinate pickup with you.'
        : 'Enter your phone number before posting a request so students who accept can confirm with you.';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-[1px]"
      onClick={() => {
        if (!savingPhone) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="phone-required-title"
        className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center shrink-0">
              <Phone className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="phone-required-title"
                className="font-display text-lg font-bold text-slate-900"
              >
                Phone number required
              </h2>
              <p className="mt-1 text-sm text-slate-600 leading-relaxed">{reasonCopy}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={savingPhone}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
          {phoneError && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
              <p>{phoneError}</p>
            </div>
          )}

          <div>
            <label
              htmlFor="modal-phone-input"
              className="block text-sm font-medium text-slate-900"
            >
              Your phone number
            </label>
            <input
              id="modal-phone-input"
              type="tel"
              autoComplete="tel"
              required
              autoFocus
              value={phoneInput}
              onChange={(event) => {
                setPhoneInput(event.target.value);
                if (phoneError) onClearError();
              }}
              placeholder="e.g., (555) 234-5678"
              disabled={savingPhone}
              className="mt-1.5 w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700 disabled:bg-slate-50"
            />
          </div>

          <div className="pt-1 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={savingPhone}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingPhone}
              className="min-h-[42px] px-5 py-2 rounded-xl bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {savingPhone ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save & Continue</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
