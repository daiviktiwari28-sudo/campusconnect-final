import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, Loader2, UserRound, X } from 'lucide-react';
import {
  JDCOEM_BRANCHES,
  JDCOEM_SEMESTERS,
  STUDENT_PROFILE_LIMITS,
  type StudentProfileInput,
} from '../lib/profileUtils';

interface StudentProfileModalProps {
  isOpen: boolean;
  mode: 'complete' | 'edit';
  reason: 'add' | 'borrow' | 'buy' | null;
  initialProfile: StudentProfileInput;
  savingProfile: boolean;
  profileError: string | null;
  onClose: () => void;
  onSaveProfile: (input: StudentProfileInput) => Promise<boolean>;
  onClearError: () => void;
}

export function StudentProfileModal({
  isOpen,
  mode,
  reason,
  initialProfile,
  savingProfile,
  profileError,
  onClose,
  onSaveProfile,
  onClearError,
}: StudentProfileModalProps) {
  const [displayName, setDisplayName] = useState(initialProfile.displayName);
  const [branch, setBranch] = useState(initialProfile.branch);
  const [semester, setSemester] = useState(initialProfile.semester);
  const [phoneNumber, setPhoneNumber] = useState(initialProfile.phoneNumber);

  useEffect(() => {
    if (!isOpen) return;
    setDisplayName(initialProfile.displayName);
    setBranch(initialProfile.branch);
    setSemester(initialProfile.semester);
    setPhoneNumber(initialProfile.phoneNumber);
  }, [
    isOpen,
    initialProfile.displayName,
    initialProfile.branch,
    initialProfile.semester,
    initialProfile.phoneNumber,
  ]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !savingProfile) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, savingProfile]);

  if (!isOpen) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSaveProfile({
      displayName,
      branch,
      semester,
      phoneNumber,
    });
  }

  const subtitle =
    mode === 'edit'
      ? 'Update your student name, branch, semester, and pickup phone number.'
      : reason === 'add'
        ? 'Complete your student profile (name, branch, semester, and phone number) before listing an item.'
        : reason === 'buy'
          ? 'Complete your student profile (name, branch, semester, and phone number) before sending a purchase request.'
          : 'Complete your student profile (name, branch, semester, and phone number) before sending a borrow request.';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-[1px]"
      onClick={() => {
        if (!savingProfile) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-profile-modal-title"
        className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-lg max-h-[92vh] overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center shrink-0">
              <UserRound className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="student-profile-modal-title"
                className="font-display text-lg font-bold text-slate-900"
              >
                {mode === 'edit' ? 'Edit student profile' : 'Complete your student profile'}
              </h2>
              <p className="mt-1 text-sm text-slate-600 leading-relaxed">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={savingProfile}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
          {profileError && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
              <p>{profileError}</p>
            </div>
          )}

          <div>
            <label
              htmlFor="modal-profile-name"
              className="block text-sm font-medium text-slate-900"
            >
              Full name
            </label>
            <input
              id="modal-profile-name"
              type="text"
              required
              autoFocus
              maxLength={STUDENT_PROFILE_LIMITS.displayNameMax}
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value);
                if (profileError) onClearError();
              }}
              placeholder="e.g., Aarav Sharma"
              disabled={savingProfile}
              className="mt-1.5 w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700 disabled:bg-slate-50"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label
                htmlFor="modal-profile-branch"
                className="block text-sm font-medium text-slate-900"
              >
                Branch
              </label>
              <input
                id="modal-profile-branch"
                type="text"
                list="jdcoem-branch-list"
                required
                maxLength={STUDENT_PROFILE_LIMITS.branchMax}
                value={branch}
                onChange={(event) => {
                  setBranch(event.target.value);
                  if (profileError) onClearError();
                }}
                placeholder="e.g., CSE"
                disabled={savingProfile}
                className="mt-1.5 w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700 disabled:bg-slate-50"
              />
              <datalist id="jdcoem-branch-list">
                {JDCOEM_BRANCHES.map((branchOption) => (
                  <option key={branchOption} value={branchOption} />
                ))}
              </datalist>
            </div>

            <div>
              <label
                htmlFor="modal-profile-semester"
                className="block text-sm font-medium text-slate-900"
              >
                Semester no.
              </label>
              <select
                id="modal-profile-semester"
                required
                value={semester}
                onChange={(event) => {
                  setSemester(event.target.value);
                  if (profileError) onClearError();
                }}
                disabled={savingProfile}
                className="mt-1.5 w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700 disabled:bg-slate-50 cursor-pointer"
              >
                <option value="">Select sem</option>
                {JDCOEM_SEMESTERS.map((semOption) => (
                  <option key={semOption} value={semOption}>
                    {semOption}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="modal-profile-phone"
              className="block text-sm font-medium text-slate-900"
            >
              Phone number
            </label>
            <input
              id="modal-profile-phone"
              type="tel"
              autoComplete="tel"
              required
              maxLength={STUDENT_PROFILE_LIMITS.phoneMax}
              value={phoneNumber}
              onChange={(event) => {
                setPhoneNumber(event.target.value);
                if (profileError) onClearError();
              }}
              placeholder="e.g., 9876543210"
              disabled={savingProfile}
              className="mt-1.5 w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700 disabled:bg-slate-50"
            />
            <p className="mt-1 text-xs text-slate-500">
              Shared privately only with the involved student when a borrow or purchase request is
              sent—never displayed publicly on item cards or reviews.
            </p>
          </div>

          <div className="pt-1 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={savingProfile}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingProfile}
              className="min-h-[42px] px-5 py-2 rounded-xl bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {savingProfile ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>{mode === 'edit' ? 'Save profile' : 'Save & Continue'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
