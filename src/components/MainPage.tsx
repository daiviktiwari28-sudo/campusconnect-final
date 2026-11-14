import { useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Clock,
  GraduationCap,
  HandHelping,
  Inbox,
  Info,
  Loader2,
  LogOut,
  Package,
  Pencil,
  Phone,
  Plus,
  Search,
  Star,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import type { CampusItem, CampusRequest, ExchangeRating } from '../data/campusItems';
import type { CampusUser } from '../hooks/useAuth';
import { useCampusItems } from '../hooks/useCampusItems';
import {
  buildExchangeSummary,
  formatRemainingEditWindow,
  isRatingEditable,
  useRatings,
} from '../hooks/useRatings';
import type { AuthFeedback } from '../lib/firebase';
import { AddItemModal } from './AddItemModal';
import { DeleteConfirmModal, type DeleteTarget } from './DeleteConfirmModal';
import { NewRequestModal } from './NewRequestModal';
import { PhoneRequiredModal } from './PhoneRequiredModal';
import {
  ProfileReviewsPanel,
  type ProfileReviewCandidate,
} from './ProfileReviewsPanel';
import { RateExchangeModal, type RateModalTarget } from './RateExchangeModal';
import { StarRatingDisplay } from './StarRatingDisplay';

interface MainPageProps {
  user: CampusUser;
  userPhone: string | null;
  isAdmin: boolean;
  profileLoading: boolean;
  savingPhone: boolean;
  phoneError: string | null;
  signingOut: boolean;
  error: AuthFeedback | null;
  onSavePhone: (phone: string) => Promise<boolean>;
  onClearPhoneError: () => void;
  onSignOut: () => Promise<void>;
  onDismissError: () => void;
}

type ActiveView = 'items' | 'shared-requests' | 'my-requests' | 'profile-reviews';
type PendingGateAction =
  | { type: 'add' }
  | { type: 'request'; linkedItem: CampusItem | null }
  | { type: 'accept'; request: CampusRequest };

function getInitials(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.trim() || 'S';
  const parts = source.split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function formatTimestamp(ms: number): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(ms));
  } catch {
    return 'Recently';
  }
}

function ItemPhoto({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="aspect-[4/3] w-full bg-slate-100 border-b border-slate-200 flex flex-col items-center justify-center p-4 text-slate-400">
        <Package className="w-8 h-8 mb-1.5" aria-hidden="true" />
        <span className="text-xs font-medium text-slate-500 text-center line-clamp-1">{alt}</span>
      </div>
    );
  }

  return (
    <div className="aspect-[4/3] w-full bg-slate-100 border-b border-slate-200 overflow-hidden">
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="w-full h-full object-cover object-center"
      />
    </div>
  );
}

function RequestStatusLabel({ status }: { status: CampusRequest['status'] }) {
  if (status === 'Fulfilled') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Fulfilled</span>
      </span>
    );
  }
  if (status === 'Accepted') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
        <UserCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Accepted</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700">
      <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>Open</span>
    </span>
  );
}

export function MainPage({
  user,
  userPhone,
  isAdmin,
  profileLoading,
  savingPhone,
  phoneError,
  signingOut,
  error,
  onSavePhone,
  onClearPhoneError,
  onSignOut,
  onDismissError,
}: MainPageProps) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>('items');
  const [searchQuery, setSearchQuery] = useState('');
  const [inlinePhoneInput, setInlinePhoneInput] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isNewRequestModalOpen, setIsNewRequestModalOpen] = useState(false);
  const [linkedRequestItem, setLinkedRequestItem] = useState<CampusItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [pendingGateAction, setPendingGateAction] = useState<PendingGateAction | null>(null);
  const [rateTarget, setRateTarget] = useState<RateModalTarget | null>(null);
  const [profileRatingTarget, setProfileRatingTarget] =
    useState<ProfileReviewCandidate | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const {
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
    clearItemsError,
    clearStatusMessage,
    dismissNewRequestAlert,
  } = useCampusItems(user, userPhone, isAdmin);

  const {
    ratings,
    ratingsLoading,
    submittingRating,
    ratingsError,
    ratingStatusMessage,
    ratingSummaryByUserId,
    getRatingForRequestByUser,
    submitRating,
    updateRating,
    clearRatingsError,
    clearRatingStatusMessage,
  } = useRatings(user);

  const hasPhone = Boolean(userPhone && userPhone.trim().length >= 7);
  const displayName = user.displayName?.trim() || user.email || 'Campus Student';
  const initials = getInitials(user.displayName, user.email);
  const showAvatarImage = Boolean(user.photoURL && !avatarFailed);
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredAllItems = useMemo(() => {
    if (!normalizedQuery) return allItems;
    return allItems.filter(
      (item) =>
        item.title.toLowerCase().includes(normalizedQuery) ||
        item.description.toLowerCase().includes(normalizedQuery) ||
        item.authorName.toLowerCase().includes(normalizedQuery)
    );
  }, [allItems, normalizedQuery]);

  const filteredSharedRequests = useMemo(() => {
    if (!normalizedQuery) return sharedRequests;
    return sharedRequests.filter(
      (req) =>
        req.description.toLowerCase().includes(normalizedQuery) ||
        req.requesterName.toLowerCase().includes(normalizedQuery) ||
        (req.itemTitle && req.itemTitle.toLowerCase().includes(normalizedQuery)) ||
        (req.acceptedByName && req.acceptedByName.toLowerCase().includes(normalizedQuery))
    );
  }, [sharedRequests, normalizedQuery]);

  const filteredMyRequests = useMemo(() => {
    if (!normalizedQuery) return myRequests;
    return myRequests.filter(
      (req) =>
        req.description.toLowerCase().includes(normalizedQuery) ||
        (req.itemTitle && req.itemTitle.toLowerCase().includes(normalizedQuery)) ||
        (req.acceptedByName && req.acceptedByName.toLowerCase().includes(normalizedQuery))
    );
  }, [myRequests, normalizedQuery]);

  const availableProfiles = useMemo<ProfileReviewCandidate[]>(() => {
    const byId = new Map<string, ProfileReviewCandidate>();
    byId.set(user.uid, { userId: user.uid, displayName });

    const addCandidate = (id: string | null | undefined, name: string | null | undefined) => {
      if (!id || !name?.trim()) return;
      if (!byId.has(id)) {
        byId.set(id, { userId: id, displayName: name.trim() });
      }
    };

    for (const item of allItems) {
      addCandidate(item.authorId, item.authorName);
    }
    for (const req of sharedRequests) {
      addCandidate(req.requesterId, req.requesterName);
      addCandidate(req.acceptedById, req.acceptedByName);
    }
    for (const rating of ratings) {
      addCandidate(rating.rateeId, rating.rateeName);
      addCandidate(rating.raterId, rating.raterName);
    }
    if (profileRatingTarget) {
      addCandidate(profileRatingTarget.userId, profileRatingTarget.displayName);
    }

    return Array.from(byId.values());
  }, [allItems, displayName, profileRatingTarget, ratings, sharedRequests, user.uid]);

  const selectedProfile: ProfileReviewCandidate = profileRatingTarget ?? {
    userId: user.uid,
    displayName,
  };

  function handleClearSearch() {
    setSearchQuery('');
    searchInputRef.current?.focus();
  }

  function handleOpenAddItem() {
    if (!hasPhone) {
      onClearPhoneError();
      setPendingGateAction({ type: 'add' });
      return;
    }
    setIsAddModalOpen(true);
  }

  function handleOpenNewRequest(linkedItem: CampusItem | null = null) {
    if (!hasPhone) {
      onClearPhoneError();
      setPendingGateAction({ type: 'request', linkedItem });
      return;
    }
    setLinkedRequestItem(linkedItem);
    setIsNewRequestModalOpen(true);
  }

  async function handleAcceptRequestClick(req: CampusRequest) {
    if (!hasPhone) {
      onClearPhoneError();
      setPendingGateAction({ type: 'accept', request: req });
      return;
    }
    await acceptRequest(req);
  }

  async function handleInlinePhoneSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await onSavePhone(inlinePhoneInput);
    if (saved) {
      setInlinePhoneInput('');
    }
  }

  async function handleModalPhoneSave(rawPhone: string): Promise<boolean> {
    const saved = await onSavePhone(rawPhone);
    if (saved) {
      const nextAction = pendingGateAction;
      setPendingGateAction(null);
      if (nextAction?.type === 'add') {
        setIsAddModalOpen(true);
      } else if (nextAction?.type === 'request') {
        setLinkedRequestItem(nextAction.linkedItem);
        setIsNewRequestModalOpen(true);
      } else if (nextAction?.type === 'accept') {
        await acceptRequest(nextAction.request);
      }
    }
    return saved;
  }

  async function handleConfirmDelete(target: DeleteTarget) {
    const match = allItems.find((i) => i.id === target.id);
    if (!match) return;
    const ok = await deleteItem(match);
    if (ok) {
      setDeleteTarget(null);
    }
  }

  function handleOpenProfileRatings(userId: string, userName: string) {
    setProfileRatingTarget({ userId, displayName: userName });
    setActiveView('profile-reviews');
    setSearchQuery('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleOpenCreateRating(req: CampusRequest) {
    if (req.status !== 'Fulfilled' || !req.acceptedById) return;
    const isBorrower = req.requesterId === user.uid;
    setRateTarget({
      mode: 'create',
      request: req,
      rateeName: isBorrower
        ? req.acceptedByName || 'Lender'
        : req.requesterName || 'Borrower',
      raterRole: isBorrower ? 'borrower' : 'lender',
      exchangeSummary: buildExchangeSummary(req),
    });
  }

  function handleOpenEditRating(rating: ExchangeRating) {
    setRateTarget({
      mode: 'edit',
      existingRating: rating,
      rateeName: rating.rateeName,
      raterRole: rating.raterRole,
      exchangeSummary: rating.exchangeSummary,
    });
  }

  async function handleRateSubmit(score: number, comment: string): Promise<boolean> {
    if (!rateTarget) return false;
    if (rateTarget.mode === 'create' && rateTarget.request) {
      return submitRating(rateTarget.request, score, comment);
    }
    if (rateTarget.mode === 'edit' && rateTarget.existingRating) {
      return updateRating(rateTarget.existingRating, score, comment);
    }
    return false;
  }

  function renderRequestCards(requests: CampusRequest[], emptyForAllView: boolean) {
    if (requests.length === 0 && !normalizedQuery) {
      return (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center max-w-xl mx-auto mt-6">
          <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
            <Inbox className="w-5 h-5" aria-hidden="true" />
          </div>
          <h2 className="mt-4 font-display text-lg font-semibold text-slate-900">
            {emptyForAllView
              ? 'No campus requests posted yet'
              : 'You haven’t created any requests yet'}
          </h2>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            {emptyForAllView
              ? 'When any signed-in student posts an Open request, it appears here immediately so others can accept and fulfill it.'
              : 'Need to borrow a charger, calculator, or umbrella? Create an Open request so fellow students can help.'}
          </p>
          <button
            type="button"
            onClick={() => handleOpenNewRequest(null)}
            className="mt-6 min-h-[42px] px-5 py-2 rounded-xl bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 inline-flex items-center gap-2 cursor-pointer"
          >
            <HandHelping className="w-4 h-4" aria-hidden="true" />
            <span>New request</span>
          </button>
        </div>
      );
    }

    if (requests.length === 0 && normalizedQuery) {
      return (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center max-w-xl mx-auto mt-6">
          <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
            <Search className="w-5 h-5" aria-hidden="true" />
          </div>
          <h2 className="mt-4 font-display text-lg font-semibold text-slate-900">
            No matching requests
          </h2>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            Nothing matched “
            <span className="font-medium text-slate-900">{searchQuery.trim()}</span>”.
          </p>
          <button
            type="button"
            onClick={handleClearSearch}
            className="mt-6 min-h-[40px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Clear search
          </button>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {requests.map((req) => {
          const isRequester = req.requesterId === user.uid;
          const isAccepter = req.acceptedById === user.uid;
          const isUpdating = updatingRequestId === req.id;
          const canAccept = req.status === 'Open' && !isRequester;
          const canFulfill = req.status === 'Accepted' && (isRequester || isAccepter);

          return (
            <article
              key={req.id}
              className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between"
            >
              <div>
                {req.itemPhotoUrl && req.itemTitle && (
                  <div className="flex items-center gap-3 p-3.5 bg-slate-50 border-b border-slate-200">
                    <img
                      src={req.itemPhotoUrl}
                      alt={req.itemTitle}
                      referrerPolicy="no-referrer"
                      className="w-12 h-9 rounded-md object-cover border border-slate-200 shrink-0"
                    />
                    <span className="text-xs font-medium text-slate-700 truncate">
                      Item: {req.itemTitle}
                    </span>
                  </div>
                )}

                <div className="p-5">
                  <div className="flex items-center justify-between gap-2">
                    <RequestStatusLabel status={req.status} />
                    <span className="text-xs text-slate-400 tabular-nums">
                      {formatTimestamp(req.createdAtMs)}
                    </span>
                  </div>

                  <p className="mt-3 text-sm sm:text-[15px] text-slate-900 font-medium leading-relaxed">
                    {req.description}
                  </p>

                  <div className="mt-4 pt-3.5 border-t border-slate-100 space-y-2.5 text-xs text-slate-600">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p>
                          Requested by{' '}
                          <span className="font-semibold text-slate-900">
                            {isRequester ? 'You' : req.requesterName}
                          </span>
                        </p>
                        <StarRatingDisplay
                          userId={req.requesterId}
                          userName={isRequester ? displayName : req.requesterName}
                          summary={ratingSummaryByUserId[req.requesterId]}
                          onOpenProfile={handleOpenProfileRatings}
                          compact
                        />
                      </div>
                      {req.requesterPhone && (
                        <a
                          href={`tel:${req.requesterPhone.replace(/[^+\d]/g, '')}`}
                          className="inline-flex items-center gap-1 text-blue-700 font-medium hover:underline shrink-0 pt-0.5"
                        >
                          <Phone className="w-3 h-3" aria-hidden="true" />
                          <span>{req.requesterPhone}</span>
                        </a>
                      )}
                    </div>

                    {req.acceptedById && req.acceptedByName && (
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p>
                            Accepted by{' '}
                            <span className="font-semibold text-slate-900">
                              {isAccepter ? 'You' : req.acceptedByName}
                            </span>
                          </p>
                          <StarRatingDisplay
                            userId={req.acceptedById}
                            userName={isAccepter ? displayName : req.acceptedByName}
                            summary={ratingSummaryByUserId[req.acceptedById]}
                            onOpenProfile={handleOpenProfileRatings}
                            compact
                          />
                        </div>
                        {req.acceptedByPhone && (
                          <a
                            href={`tel:${req.acceptedByPhone.replace(/[^+\d]/g, '')}`}
                            className="inline-flex items-center gap-1 text-blue-700 font-medium hover:underline shrink-0 pt-0.5"
                          >
                            <Phone className="w-3 h-3" aria-hidden="true" />
                            <span>{req.acceptedByPhone}</span>
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="px-5 py-3.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between gap-3">
                {canAccept ? (
                  <button
                    type="button"
                    onClick={() => void handleAcceptRequestClick(req)}
                    disabled={isUpdating || !isBackendConfigured}
                    className="w-full min-h-[38px] px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-medium hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    {isUpdating ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                        <span>Accepting...</span>
                      </>
                    ) : (
                      <span>Accept request</span>
                    )}
                  </button>
                ) : canFulfill ? (
                  <button
                    type="button"
                    onClick={() => void fulfillRequest(req)}
                    disabled={isUpdating || !isBackendConfigured}
                    className="w-full min-h-[38px] px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-medium hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    {isUpdating ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                        <span>Updating...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Mark Fulfilled</span>
                      </>
                    )}
                  </button>
                ) : req.status === 'Open' ? (
                  <span className="text-xs text-slate-500">
                    Waiting for another student to accept
                  </span>
                ) : req.status === 'Accepted' ? (
                  <span className="text-xs text-slate-600">
                    Accepted by {req.acceptedByName} · Handover in progress
                  </span>
                ) : (isRequester || isAccepter) && req.acceptedById ? (
                  (() => {
                    const existingRating = getRatingForRequestByUser(req.id, user.uid);
                    if (!existingRating) {
                      return (
                        <div className="w-full flex items-center justify-between gap-3">
                          <span className="text-xs font-medium text-emerald-700">
                            Fulfilled · Handover complete
                          </span>
                          <button
                            type="button"
                            onClick={() => handleOpenCreateRating(req)}
                            disabled={!isBackendConfigured}
                            className="min-h-[34px] px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-medium hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 transition-colors inline-flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
                          >
                            <Star className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{isRequester ? 'Rate lender' : 'Rate borrower'}</span>
                          </button>
                        </div>
                      );
                    }

                    const editable = isRatingEditable(existingRating);
                    return (
                      <div className="w-full flex flex-wrap items-center justify-between gap-2">
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
                        {editable && (
                          <button
                            type="button"
                            onClick={() => handleOpenEditRating(existingRating)}
                            title={formatRemainingEditWindow(existingRating)}
                            className="min-h-[32px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors inline-flex items-center gap-1 shrink-0 cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" aria-hidden="true" />
                            <span>Edit rating</span>
                          </button>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <span className="text-xs font-medium text-emerald-700">
                    Fulfilled · Handover complete
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Bar Contract: Brand — Signed-In Student & Confirmed Phone — Sign Out */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4 sm:gap-8">
          <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
            <div className="w-8 h-8 rounded-lg bg-blue-700 text-white flex items-center justify-center">
              <GraduationCap className="w-4 h-4" aria-hidden="true" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight text-slate-900">
              CampusConnect
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-2.5 min-w-0">
            {showAvatarImage ? (
              <img
                src={user.photoURL!}
                alt={displayName}
                referrerPolicy="no-referrer"
                onError={() => setAvatarFailed(true)}
                className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
              />
            ) : (
              <div
                aria-hidden="true"
                className="w-8 h-8 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-xs font-semibold flex items-center justify-center shrink-0"
              >
                {initials}
              </div>
            )}
            <div className="min-w-0 flex items-center gap-2 text-sm">
              <span className="font-medium text-slate-800 truncate max-w-[160px]">
                {displayName}
              </span>
              <span className="text-slate-300" aria-hidden="true">
                ·
              </span>
              <StarRatingDisplay
                userId={user.uid}
                userName={displayName}
                summary={ratingSummaryByUserId[user.uid]}
                onOpenProfile={handleOpenProfileRatings}
                compact
              />
              {hasPhone && (
                <>
                  <span className="text-slate-300" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-xs text-slate-500 whitespace-nowrap">{userPhone}</span>
                </>
              )}
              {isAdmin && (
                <>
                  <span className="text-slate-300" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-xs font-medium text-blue-700 whitespace-nowrap">Admin</span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onSignOut}
            disabled={signingOut}
            className="min-h-[40px] px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-150 inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {signingOut ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>Signing out...</span>
              </>
            ) : (
              <>
                <LogOut className="w-4 h-4" aria-hidden="true" />
                <span>Sign out</span>
              </>
            )}
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1200px] mx-auto px-4 sm:px-8 py-8 sm:py-10">
        {!isBackendConfigured && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 flex items-start gap-3"
          >
            <Info className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-semibold">Shared database is not configured</p>
              <p className="mt-1 leading-relaxed">
                Add valid Firebase project settings to{' '}
                <code className="font-mono text-xs bg-amber-100 px-1.5 py-0.5 rounded">
                  firebase-applet-config.json
                </code>{' '}
                and deploy{' '}
                <code className="font-mono text-xs bg-amber-100 px-1.5 py-0.5 rounded">
                  firestore.rules
                </code>{' '}
                to sync items and requests across signed-in users.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 flex items-start gap-3"
          >
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold">{error.title}</p>
              <p className="mt-0.5 opacity-90">{error.message}</p>
            </div>
            <button
              type="button"
              onClick={onDismissError}
              aria-label="Dismiss authentication error"
              className="p-1 rounded-md text-red-700 hover:bg-red-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {newRequestAlert && (
          <div
            role="status"
            className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <Bell className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" aria-hidden="true" />
              <p className="min-w-0 leading-relaxed">
                <span className="font-semibold">New request from {newRequestAlert.requesterName}:</span>{' '}
                “{newRequestAlert.description}”
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setActiveView('shared-requests');
                  dismissNewRequestAlert();
                }}
                className="min-h-[34px] px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-medium hover:bg-blue-800 transition-colors cursor-pointer"
              >
                View Shared Requests
              </button>
              <button
                type="button"
                onClick={dismissNewRequestAlert}
                aria-label="Dismiss new request alert"
                className="p-1 rounded-md text-blue-800 hover:bg-blue-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {(statusMessage || ratingStatusMessage) && (
          <div
            role="status"
            className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 flex items-start gap-3"
          >
            <CheckCircle2
              className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <p className="flex-1 min-w-0 leading-relaxed">
              {ratingStatusMessage || statusMessage}
            </p>
            <button
              type="button"
              onClick={() => {
                clearStatusMessage();
                clearRatingStatusMessage();
              }}
              aria-label="Dismiss confirmation"
              className="p-1 rounded-md text-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {(itemsError || ratingsError) && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-950 flex items-start gap-3"
          >
            <AlertCircle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="flex-1 min-w-0 leading-relaxed">{ratingsError || itemsError}</p>
            <button
              type="button"
              onClick={() => {
                clearItemsError();
                clearRatingsError();
              }}
              aria-label="Dismiss error"
              className="p-1 rounded-md text-red-800 hover:bg-red-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Welcoming Header */}
        <section className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="max-w-2xl">
              <h1 className="font-display text-[clamp(1.75rem,3.2vw,2.5rem)] font-bold tracking-tight text-slate-900 text-balance">
                Welcome to CampusConnect
              </h1>
              <p className="mt-2.5 text-base sm:text-[17px] text-slate-600 leading-relaxed">
                Borrow everyday items you forgot or share spare essentials with fellow students.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between lg:justify-end gap-3 pt-4 lg:pt-0 border-t lg:border-t-0 border-slate-100 shrink-0">
              <div className="flex sm:hidden items-center gap-2.5 min-w-0 w-full pb-2">
                {showAvatarImage ? (
                  <img
                    src={user.photoURL!}
                    alt={displayName}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarFailed(true)}
                    className="w-9 h-9 rounded-full object-cover border border-slate-200 shrink-0"
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className="w-9 h-9 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-xs font-semibold flex items-center justify-center shrink-0"
                  >
                    {initials}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{displayName}</p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <StarRatingDisplay
                      userId={user.uid}
                      userName={displayName}
                      summary={ratingSummaryByUserId[user.uid]}
                      onOpenProfile={handleOpenProfileRatings}
                      compact
                    />
                    {hasPhone && (
                      <>
                        <span className="text-slate-300 text-xs" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-xs text-slate-500 truncate">{userPhone}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleOpenNewRequest(null)}
                disabled={!isBackendConfigured}
                className="min-h-[44px] px-4 py-2.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-800 text-sm font-medium hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 transition-colors duration-150 inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                <HandHelping className="w-4 h-4" aria-hidden="true" />
                <span>New request</span>
              </button>

              <button
                type="button"
                onClick={handleOpenAddItem}
                disabled={!isBackendConfigured}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 transition-colors duration-150 inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>Add item</span>
              </button>
            </div>
          </div>
        </section>

        {/* Post-Login Phone Number Prompt Banner */}
        {!profileLoading && !hasPhone && isBackendConfigured && (
          <section
            aria-label="Phone number verification"
            className="mt-6 bg-amber-50 border border-amber-200 rounded-2xl p-5 sm:p-6"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
              <div className="flex items-start gap-3.5 max-w-2xl">
                <div className="w-10 h-10 rounded-xl bg-white border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
                  <Phone className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900">
                    Enter your phone number to add, request, or accept items
                  </h2>
                  <p className="mt-1 text-sm text-slate-700 leading-relaxed">
                    You can browse shared items and requests now. Saving your phone number is
                    required before posting or accepting so students can confirm pickups.
                  </p>
                </div>
              </div>

              <form
                onSubmit={handleInlinePhoneSubmit}
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0 w-full lg:w-auto"
                noValidate
              >
                <label htmlFor="inline-phone-input" className="sr-only">
                  Phone number
                </label>
                <input
                  id="inline-phone-input"
                  type="tel"
                  autoComplete="tel"
                  required
                  value={inlinePhoneInput}
                  onChange={(event) => {
                    setInlinePhoneInput(event.target.value);
                    if (phoneError) onClearPhoneError();
                  }}
                  placeholder="e.g., (555) 234-5678"
                  disabled={savingPhone}
                  className="min-h-[44px] sm:w-56 px-3.5 py-2 rounded-xl border border-amber-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700"
                />
                <button
                  type="submit"
                  disabled={savingPhone}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-60"
                >
                  {savingPhone ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save phone number</span>
                  )}
                </button>
              </form>
            </div>

            {phoneError && !pendingGateAction && (
              <p role="alert" className="mt-3 text-sm font-medium text-red-700">
                {phoneError}
              </p>
            )}
          </section>
        )}

        {/* Search Bar + View Switcher */}
        <section className="mt-8" aria-label="Search and filter shared items and requests">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div
              role="tablist"
              aria-label="CampusConnect views"
              className="inline-flex flex-wrap items-center p-1 bg-slate-200/70 rounded-xl self-start"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeView === 'items'}
                onClick={() => setActiveView('items')}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                  activeView === 'items'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Shared Items{' '}
                <span className="ml-1 text-xs text-slate-500 tabular-nums">
                  ({allItems.length})
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeView === 'shared-requests'}
                onClick={() => setActiveView('shared-requests')}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                  activeView === 'shared-requests'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Shared Requests{' '}
                <span className="ml-1 text-xs text-slate-500 tabular-nums">
                  ({sharedRequests.length})
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeView === 'my-requests'}
                onClick={() => setActiveView('my-requests')}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                  activeView === 'my-requests'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                My Requests{' '}
                <span className="ml-1 text-xs text-slate-500 tabular-nums">
                  ({myRequests.length})
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeView === 'profile-reviews'}
                onClick={() => setActiveView('profile-reviews')}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                  activeView === 'profile-reviews'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Profile Reviews{' '}
                <span className="ml-1 text-xs text-slate-500 tabular-nums">
                  ({ratings.length})
                </span>
              </button>
            </div>

            <div className="relative flex-1 max-w-xl w-full">
              <label htmlFor="campus-search" className="sr-only">
                Search shared items, requests, or profile reviews
              </label>
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                ref={searchInputRef}
                id="campus-search"
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={
                  activeView === 'items'
                    ? 'Search shared items by name, note, or student...'
                    : activeView === 'profile-reviews'
                      ? 'Search reviews by comment, author, or exchange...'
                      : 'Search requests by description, student, or status...'
                }
                className="w-full min-h-[44px] pl-10 pr-20 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700"
              />
              {searchQuery.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors inline-flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Clear</span>
                </button>
              )}
            </div>
          </div>

          <p className="mt-3 text-xs sm:text-sm text-slate-500">
            {activeView === 'items'
              ? 'Shared items posted by students across devices · Live updates enabled'
              : activeView === 'shared-requests'
                ? 'Shared requests from all signed-in users · Accept an Open request to help a student'
                : activeView === 'my-requests'
                  ? 'Requests created by you · Track Open, Accepted, and Fulfilled status'
                  : 'Public exchange ratings and comments visible to all signed-in students'}
          </p>
        </section>

        {/* Active View Content */}
        <section className="mt-5" aria-label="CampusConnect community list">
          {activeView === 'profile-reviews' ? (
            <ProfileReviewsPanel
              selectedProfile={selectedProfile}
              availableProfiles={availableProfiles}
              ratingSummaryByUserId={ratingSummaryByUserId}
              currentUserId={user.uid}
              searchQuery={searchQuery}
              loading={ratingsLoading}
              onSelectProfile={(id, name) => setProfileRatingTarget({ userId: id, displayName: name })}
              onEditRating={handleOpenEditRating}
              onClearSearch={handleClearSearch}
            />
          ) : loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="bg-white border border-slate-200 rounded-xl overflow-hidden animate-pulse"
                >
                  <div className="aspect-[4/3] w-full bg-slate-200" />
                  <div className="p-5 space-y-3">
                    <div className="h-3 w-32 bg-slate-200 rounded" />
                    <div className="h-5 w-3/4 bg-slate-200 rounded" />
                    <div className="h-3.5 w-full bg-slate-100 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : activeView === 'shared-requests' ? (
            renderRequestCards(filteredSharedRequests, true)
          ) : activeView === 'my-requests' ? (
            renderRequestCards(filteredMyRequests, false)
          ) : filteredAllItems.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center max-w-xl mx-auto mt-6">
              <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
                <Search className="w-5 h-5" aria-hidden="true" />
              </div>
              <h2 className="mt-4 font-display text-lg font-semibold text-slate-900">
                No matching items found
              </h2>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Nothing matched “
                <span className="font-medium text-slate-900">{searchQuery.trim()}</span>”. Try a
                different item name or reset your search.
              </p>
              <button
                type="button"
                onClick={handleClearSearch}
                className="mt-6 min-h-[40px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Clear search
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredAllItems.map((item) => {
                const isOwner = !item.isStarter && item.authorId === user.uid;
                const canDelete = !item.isStarter && (isOwner || isAdmin);
                const isDeletingThis = deletingId === item.id;

                return (
                  <article
                    key={item.id}
                    className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between transition-colors duration-150 hover:border-slate-300"
                  >
                    <div>
                      <ItemPhoto src={item.photoUrl} alt={item.title} />

                      <div className="p-5">
                        <p className="text-xs font-medium text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-blue-700">{item.category}</span>
                          <span aria-hidden="true">·</span>
                          <span>{item.status}</span>
                          {isOwner && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-slate-700">Your item</span>
                            </>
                          )}
                        </p>

                        <h2 className="mt-2 font-display text-lg font-semibold text-slate-900 leading-snug">
                          {item.title}
                        </h2>

                        <p className="mt-2 text-sm text-slate-600 leading-relaxed line-clamp-3">
                          {item.description}
                        </p>
                      </div>
                    </div>

                    <div className="px-5 py-3.5 border-t border-slate-100 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-700 truncate">
                          {isOwner ? 'Added by You' : `Added by ${item.authorName}`}
                        </p>
                        <StarRatingDisplay
                          userId={item.authorId}
                          userName={isOwner ? displayName : item.authorName}
                          summary={ratingSummaryByUserId[item.authorId]}
                          onOpenProfile={handleOpenProfileRatings}
                        />
                        <p className="text-xs text-slate-500 flex items-center gap-1 truncate mt-0.5">
                          <Phone className="w-3 h-3 shrink-0" aria-hidden="true" />
                          <span>{item.authorPhone}</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {!isOwner && (
                          <button
                            type="button"
                            onClick={() => handleOpenNewRequest(item)}
                            disabled={!isBackendConfigured}
                            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs font-medium hover:bg-blue-100 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            Request
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteTarget({
                                id: item.id,
                                title: item.title,
                                kind: 'item',
                              })
                            }
                            disabled={isDeletingThis}
                            aria-label={`Delete ${item.title}`}
                            className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Delete</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <PhoneRequiredModal
        isOpen={Boolean(pendingGateAction)}
        reason={pendingGateAction?.type ?? null}
        savingPhone={savingPhone}
        phoneError={phoneError}
        onClose={() => setPendingGateAction(null)}
        onSavePhone={handleModalPhoneSave}
        onClearError={onClearPhoneError}
      />

      <AddItemModal
        isOpen={isAddModalOpen}
        submitting={submittingItem}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={addItem}
      />

      <NewRequestModal
        isOpen={isNewRequestModalOpen}
        linkedItem={linkedRequestItem}
        submitting={submittingRequest}
        onClose={() => {
          setIsNewRequestModalOpen(false);
          setLinkedRequestItem(null);
        }}
        onSubmit={createRequest}
      />

      <DeleteConfirmModal
        target={deleteTarget}
        deleting={Boolean(deleteTarget && deletingId === deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />

      <RateExchangeModal
        target={rateTarget}
        submitting={submittingRating}
        onClose={() => setRateTarget(null)}
        onSubmit={handleRateSubmit}
      />
    </div>
  );
}
