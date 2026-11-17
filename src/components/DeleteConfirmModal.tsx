import { useEffect } from 'react';
import { Loader2, Trash2 } from 'lucide-react';

export interface DeleteTarget {
  id: string;
  title: string;
  kind: 'item' | 'request';
}

interface DeleteConfirmModalProps {
  target: DeleteTarget | null;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: (target: DeleteTarget) => Promise<void>;
}

export function DeleteConfirmModal({
  target,
  deleting,
  onCancel,
  onConfirm,
}: DeleteConfirmModalProps) {
  useEffect(() => {
    if (!target) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !deleting) {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [target, deleting, onCancel]);

  if (!target) return null;

  const isRequest = target.kind === 'request';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-[1px]"
      onClick={() => {
        if (!deleting) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-confirm-title"
        aria-describedby="delete-confirm-desc"
        className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-center justify-center shrink-0">
            <Trash2 className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2
              id="delete-confirm-title"
              className="font-display text-lg font-bold text-slate-900"
            >
              {isRequest ? 'Delete this campus request?' : 'Delete this shared item?'}
            </h2>
            <p id="delete-confirm-desc" className="mt-1.5 text-sm text-slate-600 leading-relaxed">
              {isRequest ? (
                <>
                  This will permanently remove the request{' '}
                  <span className="font-semibold text-slate-900">“{target.title}”</span> from
                  CampusConnect.
                </>
              ) : (
                <>
                  This will permanently remove{' '}
                  <span className="font-semibold text-slate-900">“{target.title}”</span> from
                  CampusConnect.
                </>
              )}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onConfirm(target)}
            disabled={deleting}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 transition-colors inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {deleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>Removing...</span>
              </>
            ) : (
              <span>{isRequest ? 'Remove request' : 'Delete item'}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
