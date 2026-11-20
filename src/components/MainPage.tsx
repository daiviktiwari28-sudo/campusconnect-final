import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Clock,
  GraduationCap,
  HandHelping,
  Info,
  Loader2,
  LogOut,
  Menu,
  Package,
  Plus,
  Search,
  Shield,
  ShoppingBag,
  Star,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import {
  formatInr,
  type CampusItem,
  type CampusRequest,
  type ExchangeRating,
  type ListingType,
  type PurchaseRequest,
} from '../data/campusItems';
import type { CampusUser, StudentProfile } from '../hooks/useAuth';
import { useAdmins } from '../hooks/useAdmins';
import { useCampusItems } from '../hooks/useCampusItems';
import { usePublicProfiles } from '../hooks/usePublicProfiles';
import { usePurchaseRequests } from '../hooks/usePurchaseRequests';
import {
  buildExchangeSummary,
  buildPurchaseExchangeSummary,
  useRatings,
} from '../hooks/useRatings';
import type { AuthFeedback } from '../lib/firebase';
import {
  formatBranchSemester,
  JDCOEM_BRANCHES,
  JDCOEM_SEMESTERS,
  STUDENT_PROFILE_LIMITS,
  type StudentProfileInput,
} from '../lib/profileUtils';
import { AddItemModal } from './AddItemModal';
import { AdminDashboardPanel } from './AdminDashboardPanel';
import { BorrowRequestModal } from './BorrowRequestModal';
import { BorrowRequestsPanel } from './BorrowRequestsPanel';
import { DeleteConfirmModal, type DeleteTarget } from './DeleteConfirmModal';
import {
  ProfileReviewsPanel,
  type ProfileReviewCandidate,
} from './ProfileReviewsPanel';
import { PurchaseRequestModal } from './PurchaseRequestModal';
import { PurchaseRequestsPanel } from './PurchaseRequestsPanel';
import { RateExchangeModal, type RateModalTarget } from './RateExchangeModal';
import { StarRatingDisplay } from './StarRatingDisplay';
import { StudentProfileModal } from './StudentProfileModal';

interface MainPageProps {
  user: CampusUser;
  studentProfile: StudentProfile | null;
  userPhone: string | null;
  hasCompleteProfile: boolean;
  isAdmin: boolean;
  profileLoading: boolean;
  savingProfile: boolean;
  profileError: string | null;
  signingOut: boolean;
  error: AuthFeedback | null;
  onSaveProfile: (input: StudentProfileInput) => Promise<boolean>;
  onClearProfileError: () => void;
  onSignOut: () => Promise<void>;
  onDismissError: () => void;
}

type ActiveView =
  | 'items'
  | 'borrow-requests'
  | 'purchase-requests'
  | 'profile-reviews'
  | 'admin';
type ItemListingFilter = 'all' | ListingType;
type PendingGateAction =
  | { type: 'add' }
  | { type: 'borrow'; item: CampusItem }
  | { type: 'buy'; item: CampusItem };

function getInitials(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.trim() || 'S';
  const parts = source.split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
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

export function MainPage({
  user,
  studentProfile,
  userPhone,
  hasCompleteProfile,
  isAdmin,
  profileLoading,
  savingProfile,
  profileError,
  signingOut,
  error,
  onSaveProfile,
  onClearProfileError,
  onSignOut,
  onDismissError,
}: MainPageProps) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>('items');
  const [itemListingFilter, setItemListingFilter] = useState<ItemListingFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [inlineNameInput, setInlineNameInput] = useState(
    studentProfile?.displayName || user.displayName || ''
  );
  const [inlineBranchInput, setInlineBranchInput] = useState(studentProfile?.branch || '');
  const [inlineSemesterInput, setInlineSemesterInput] = useState(studentProfile?.semester || '');
  const [inlinePhoneInput, setInlinePhoneInput] = useState(
    studentProfile?.phoneNumber || userPhone || ''
  );
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [borrowItemTarget, setBorrowItemTarget] = useState<CampusItem | null>(null);
  const [buyItemTarget, setBuyItemTarget] = useState<CampusItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [pendingGateAction, setPendingGateAction] = useState<PendingGateAction | null>(null);
  const [rateTarget, setRateTarget] = useState<RateModalTarget | null>(null);
  const [profileRatingTarget, setProfileRatingTarget] =
    useState<ProfileReviewCandidate | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInlineNameInput(studentProfile?.displayName || user.displayName || '');
    setInlineBranchInput(studentProfile?.branch || '');
    setInlineSemesterInput(studentProfile?.semester || '');
    setInlinePhoneInput(studentProfile?.phoneNumber || userPhone || '');
  }, [
    studentProfile?.displayName,
    studentProfile?.branch,
    studentProfile?.semester,
    studentProfile?.phoneNumber,
    user.displayName,
    userPhone,
  ]);

  useEffect(() => {
    if (!isAdmin && activeView === 'admin') {
      setActiveView('items');
    }
  }, [activeView, isAdmin]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileNavOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileNavOpen]);

  const hasPhone = Boolean(userPhone && userPhone.trim().length >= 7);
  const displayName =
    studentProfile?.displayName?.trim() || user.displayName?.trim() || user.email || 'Campus Student';

  const {
    allItems,
    borrowRequests,
    pendingBorrowRequests,
    allAdminRequests,
    isBackendConfigured,
    loading,
    borrowRequestsLoading,
    submittingItem,
    submittingRequest,
    updatingRequestId,
    deletingId,
    itemsError,
    statusMessage,
    incomingBorrowAlert,
    addItem,
    deleteItem,
    createBorrowRequest,
    fulfillRequest,
    cancelBorrowRequest,
    deleteRequest,
    clearItemsError,
    clearStatusMessage,
    dismissIncomingBorrowAlert,
  } = useCampusItems(user, displayName, userPhone, isAdmin);

  const {
    adminUids,
    adminsLoading,
    managingAdminUid,
    adminError,
    adminStatusMessage,
    grantAdmin,
    revokeAdmin,
    clearAdminMessages,
  } = useAdmins(isAdmin);

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
  } = useRatings(user, displayName);

  const { publicProfiles, publicProfilesById } = usePublicProfiles(user);

  const {
    purchaseRequests,
    pendingPurchaseRequests,
    allAdminPurchaseRequests,
    purchaseRequestsLoading,
    submittingPurchaseRequest,
    updatingPurchaseId,
    purchaseError,
    purchaseStatusMessage,
    incomingPurchaseAlert,
    createPurchaseRequest,
    confirmPurchasePayment,
    cancelPurchaseRequest,
    clearPurchaseError,
    clearPurchaseStatusMessage,
    dismissIncomingPurchaseAlert,
  } = usePurchaseRequests(user, displayName, userPhone, isAdmin);

  const myAcademicMeta = formatBranchSemester(studentProfile?.branch, studentProfile?.semester);
  const initials = getInitials(displayName, user.email);
  const showAvatarImage = Boolean(user.photoURL && !avatarFailed);
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const initialProfileFormValues: StudentProfileInput = {
    displayName: studentProfile?.displayName || user.displayName || '',
    branch: studentProfile?.branch || '',
    semester: studentProfile?.semester || '',
    phoneNumber: studentProfile?.phoneNumber || userPhone || '',
  };

  const filteredAllItems = useMemo(() => {
    return allItems.filter((item) => {
      if (itemListingFilter !== 'all' && item.listingType !== itemListingFilter) {
        return false;
      }
      if (!normalizedQuery) return true;
      const authorPublic = publicProfilesById[item.authorId];
      const authorDisplay = (authorPublic?.displayName || item.authorName).toLowerCase();
      const listingWords = item.listingType === 'sell' ? 'sell sale buy permanent' : 'lend borrow';
      return (
        item.title.toLowerCase().includes(normalizedQuery) ||
        authorDisplay.includes(normalizedQuery) ||
        listingWords.includes(normalizedQuery) ||
        (item.listingType === 'sell' && String(item.price).includes(normalizedQuery))
      );
    });
  }, [allItems, itemListingFilter, normalizedQuery, publicProfilesById]);

  const availableProfiles = useMemo<ProfileReviewCandidate[]>(() => {
    const byId = new Map<string, ProfileReviewCandidate>();
    byId.set(user.uid, { userId: user.uid, displayName });

    const addCandidate = (id: string | null | undefined, name: string | null | undefined) => {
      if (!id || !name?.trim()) return;
      if (!byId.has(id)) {
        byId.set(id, { userId: id, displayName: name.trim() });
      }
    };

    for (const profile of publicProfiles) {
      addCandidate(profile.uid, profile.displayName);
    }
    for (const item of allItems) {
      addCandidate(item.authorId, item.authorName);
    }
    for (const req of borrowRequests) {
      addCandidate(req.requesterId, req.requesterName);
      addCandidate(req.acceptedById, req.acceptedByName);
    }
    for (const req of purchaseRequests) {
      addCandidate(req.borrowerId, req.borrowerName);
      addCandidate(req.lenderId, req.lenderName);
    }
    for (const rating of ratings) {
      addCandidate(rating.rateeId, rating.rateeName);
      addCandidate(rating.raterId, rating.raterName);
    }
    if (profileRatingTarget) {
      addCandidate(profileRatingTarget.userId, profileRatingTarget.displayName);
    }

    return Array.from(byId.values());
  }, [
    allItems,
    borrowRequests,
    displayName,
    profileRatingTarget,
    publicProfiles,
    purchaseRequests,
    ratings,
    user.uid,
  ]);

  const selectedProfile: ProfileReviewCandidate = profileRatingTarget ?? {
    userId: user.uid,
    displayName,
  };

  function handleClearSearch() {
    setSearchQuery('');
    searchInputRef.current?.focus();
  }

  function handleSelectView(view: ActiveView) {
    setActiveView(view);
    setMobileNavOpen(false);
  }

  function handleOpenAddItem() {
    if (!hasCompleteProfile) {
      onClearProfileError();
      setPendingGateAction({ type: 'add' });
      return;
    }
    setIsAddModalOpen(true);
  }

  function handleOpenBorrowItem(item: CampusItem) {
    if (!hasCompleteProfile) {
      onClearProfileError();
      setPendingGateAction({ type: 'borrow', item });
      return;
    }
    const existingPending = pendingBorrowRequests.find(
      (req) => req.itemId === item.id && req.requesterId === user.uid
    );
    if (existingPending) {
      handleSelectView('borrow-requests');
      return;
    }
    clearItemsError();
    setBorrowItemTarget(item);
  }

  function handleOpenBuyItem(item: CampusItem) {
    if (!hasCompleteProfile) {
      onClearProfileError();
      setPendingGateAction({ type: 'buy', item });
      return;
    }
    const existingPending = pendingPurchaseRequests.find(
      (req) => req.itemId === item.id && req.borrowerId === user.uid
    );
    if (existingPending) {
      handleSelectView('purchase-requests');
      return;
    }
    clearPurchaseError();
    setBuyItemTarget(item);
  }

  async function handleInlineProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSaveProfile({
      displayName: inlineNameInput,
      branch: inlineBranchInput,
      semester: inlineSemesterInput,
      phoneNumber: inlinePhoneInput,
    });
  }

  async function handleModalProfileSave(input: StudentProfileInput): Promise<boolean> {
    const saved = await onSaveProfile(input);
    if (saved) {
      if (isEditProfileOpen) {
        setIsEditProfileOpen(false);
      }
      const nextAction = pendingGateAction;
      setPendingGateAction(null);
      if (nextAction?.type === 'add') {
        setIsAddModalOpen(true);
      } else if (nextAction?.type === 'borrow') {
        const existingPending = pendingBorrowRequests.find(
          (req) => req.itemId === nextAction.item.id && req.requesterId === user.uid
        );
        if (existingPending) {
          handleSelectView('borrow-requests');
        } else {
          clearItemsError();
          setBorrowItemTarget(nextAction.item);
        }
      } else if (nextAction?.type === 'buy') {
        const existingPending = pendingPurchaseRequests.find(
          (req) => req.itemId === nextAction.item.id && req.borrowerId === user.uid
        );
        if (existingPending) {
          handleSelectView('purchase-requests');
        } else {
          clearPurchaseError();
          setBuyItemTarget(nextAction.item);
        }
      }
    }
    return saved;
  }

  async function handleConfirmDelete(target: DeleteTarget) {
    if (target.kind === 'request') {
      const matchReq =
        allAdminRequests.find((r) => r.id === target.id) ||
        borrowRequests.find((r) => r.id === target.id);
      if (!matchReq) {
        setDeleteTarget(null);
        return;
      }
      await deleteRequest(matchReq);
      setDeleteTarget(null);
      return;
    }

    const match = allItems.find((i) => i.id === target.id);
    if (!match) {
      setDeleteTarget(null);
      return;
    }
    await deleteItem(match);
    setDeleteTarget(null);
  }

  function handleOpenProfileRatings(userId: string, userName: string) {
    const publicMatch = publicProfilesById[userId];
    setProfileRatingTarget({
      userId,
      displayName: publicMatch?.displayName || userName,
    });
    setActiveView('profile-reviews');
    setMobileNavOpen(false);
    setSearchQuery('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleOpenCreateBorrowRating(req: CampusRequest) {
    if (
      req.status !== 'Fulfilled' ||
      !req.acceptedById ||
      !req.borrowerFulfilled ||
      !req.lenderFulfilled
    ) {
      return;
    }
    const isBorrower = req.requesterId === user.uid;
    const rateeId = isBorrower ? req.acceptedById : req.requesterId;
    const rateePublic = publicProfilesById[rateeId];
    const summary = buildExchangeSummary(req);
    const borrowerDisplay =
      publicProfilesById[req.requesterId]?.displayName || req.requesterName || 'Borrower';
    const lenderDisplay =
      publicProfilesById[req.acceptedById]?.displayName || req.acceptedByName || 'Lender';

    setRateTarget({
      mode: 'create',
      exchange: {
        id: req.id,
        summary,
        borrowerId: req.requesterId,
        borrowerName: borrowerDisplay,
        lenderId: req.acceptedById,
        lenderName: lenderDisplay,
        kind: 'borrow',
      },
      rateeName: rateePublic?.displayName || (isBorrower ? lenderDisplay : borrowerDisplay),
      raterRole: isBorrower ? 'borrower' : 'lender',
      exchangeSummary: summary,
    });
  }

  function handleOpenCreatePurchaseRating(req: PurchaseRequest) {
    if (req.status !== 'Completed' || !req.borrowerConfirmed || !req.lenderConfirmed) {
      return;
    }
    const isBorrower = req.borrowerId === user.uid;
    const rateeId = isBorrower ? req.lenderId : req.borrowerId;
    const rateePublic = publicProfilesById[rateeId];
    const summary = buildPurchaseExchangeSummary(req);
    const borrowerDisplay =
      publicProfilesById[req.borrowerId]?.displayName || req.borrowerName || 'Borrower';
    const lenderDisplay =
      publicProfilesById[req.lenderId]?.displayName || req.lenderName || 'Lender';

    setRateTarget({
      mode: 'create',
      exchange: {
        id: req.id,
        summary,
        borrowerId: req.borrowerId,
        borrowerName: borrowerDisplay,
        lenderId: req.lenderId,
        lenderName: lenderDisplay,
        kind: 'purchase',
      },
      rateeName: rateePublic?.displayName || (isBorrower ? lenderDisplay : borrowerDisplay),
      raterRole: isBorrower ? 'borrower' : 'lender',
      exchangeSummary: summary,
    });
  }

  function handleOpenEditRating(rating: ExchangeRating) {
    setRateTarget({
      mode: 'edit',
      existingRating: rating,
      rateeName: publicProfilesById[rating.rateeId]?.displayName || rating.rateeName,
      raterRole: rating.raterRole,
      exchangeSummary: rating.exchangeSummary,
    });
  }

  async function handleRateSubmit(score: number, comment: string): Promise<boolean> {
    if (!rateTarget) return false;
    if (rateTarget.mode === 'create' && rateTarget.exchange) {
      return submitRating(rateTarget.exchange, score, comment);
    }
    if (rateTarget.mode === 'edit' && rateTarget.existingRating) {
      return updateRating(rateTarget.existingRating, score, comment);
    }
    return false;
  }

  const sectionHeaderMeta: Record<ActiveView, { title: string; subtitle: string }> = {
    items: {
      title: 'Shared Items',
      subtitle: 'Borrow everyday essentials or buy permanent-sale items from JDCOEM students.',
    },
    'borrow-requests': {
      title: 'Borrow Requests',
      subtitle:
        'Private lending & borrowing requests — contact each other directly and both confirm once returned.',
    },
    'purchase-requests': {
      title: 'Purchase Requests',
      subtitle:
        'Private permanent-item purchase requests — contact each other directly and both confirm once payment is settled.',
    },
    'profile-reviews': {
      title: 'Profile Reviews',
      subtitle: 'Public student profiles and verified exchange ratings across JDCOEM.',
    },
    admin: {
      title: 'Admin Dashboard',
      subtitle:
        'Moderate shared items and private requests across campus and manage administrator access.',
    },
  };

  const activeSectionMeta = sectionHeaderMeta[activeView];
  const isItemsPrimaryView = activeView === 'items';

  const navGroups: Array<{
    label: string;
    items: Array<{
      id: ActiveView;
      label: string;
      count?: number;
      icon: typeof Package;
    }>;
  }> = [
    {
      label: 'Campus Exchange',
      items: [
        { id: 'items', label: 'Shared Items', count: allItems.length, icon: Package },
        {
          id: 'borrow-requests',
          label: 'Borrow Requests',
          count: pendingBorrowRequests.length,
          icon: HandHelping,
        },
        {
          id: 'purchase-requests',
          label: 'Purchase Requests',
          count: pendingPurchaseRequests.length,
          icon: ShoppingBag,
        },
      ],
    },
    {
      label: 'Account & Trust',
      items: [
        { id: 'profile-reviews', label: 'Profile Reviews', count: ratings.length, icon: Star },
      ],
    },
    ...(isAdmin
      ? [
          {
            label: 'Moderation',
            items: [{ id: 'admin' as ActiveView, label: 'Admin Dashboard', icon: Shield }],
          },
        ]
      : []),
  ];

  const flatNavItems = navGroups.flatMap((group) => group.items);

  function renderSidebarNavigation() {
    return (
      <nav
        aria-label="CampusConnect navigation"
        className="flex-1 overflow-y-auto px-3 py-5 space-y-6"
      >
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="px-3 mb-2 text-xs font-semibold text-slate-400">{group.label}</p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => handleSelectView(item.id)}
                    className={`w-full min-h-[40px] px-3 py-2 rounded-xl text-sm flex items-center justify-between gap-2 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 cursor-pointer ${
                      isActive
                        ? 'bg-blue-50 text-blue-800 font-semibold'
                        : 'text-slate-600 font-medium hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? 'text-blue-700' : 'text-slate-400'
                        }`}
                        aria-hidden="true"
                      />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {typeof item.count === 'number' && (
                      <span
                        className={`text-xs tabular-nums shrink-0 ${
                          isActive ? 'text-blue-700 font-semibold' : 'text-slate-400'
                        }`}
                      >
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    );
  }

  function renderSidebarAccountBlock() {
    return (
      <div className="border-t border-slate-200 p-4 bg-white shrink-0 space-y-3">
        <div className="flex items-start gap-3 min-w-0">
          {showAvatarImage ? (
            <img
              src={user.photoURL!}
              alt={displayName}
              referrerPolicy="no-referrer"
              onError={() => setAvatarFailed(true)}
              className="w-9 h-9 rounded-full object-cover border border-slate-200 shrink-0 mt-0.5"
            />
          ) : (
            <div
              aria-hidden="true"
              className="w-9 h-9 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5"
            >
              {initials}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 truncate">{displayName}</p>
            {myAcademicMeta && (
              <p className="text-xs text-slate-500 truncate mt-0.5">{myAcademicMeta}</p>
            )}
            <div className="mt-1">
              <StarRatingDisplay
                userId={user.uid}
                userName={displayName}
                summary={ratingSummaryByUserId[user.uid]}
                onOpenProfile={handleOpenProfileRatings}
                compact
              />
            </div>
            {hasPhone && (
              <p className="mt-1 text-xs text-slate-500 truncate tabular-nums">{userPhone}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              onClearProfileError();
              setMobileNavOpen(false);
              setIsEditProfileOpen(true);
            }}
            disabled={!isBackendConfigured}
            className="min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <UserRound className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>My profile</span>
          </button>

          <button
            type="button"
            onClick={onSignOut}
            disabled={signingOut}
            className="min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            {signingOut ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />
                <span>Signing out</span>
              </>
            ) : (
              <>
                <LogOut className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Sign out</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:left-0 bg-white border-r border-slate-200 z-30">
        <div className="h-16 px-5 border-b border-slate-100 flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-blue-700 text-white flex items-center justify-center shrink-0">
            <GraduationCap className="w-4 h-4" aria-hidden="true" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight text-slate-900">
            CampusConnect
          </span>
        </div>

        {renderSidebarNavigation()}
        {renderSidebarAccountBlock()}
      </aside>

      {/* Mobile & Tablet Compact Top Bar */}
      <header className="lg:hidden sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="h-14 px-4 sm:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={mobileNavOpen}
              className="min-h-[40px] min-w-[40px] -ml-1.5 rounded-lg text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 inline-flex items-center justify-center cursor-pointer"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>
            <div className="flex items-center gap-2 whitespace-nowrap">
              <div className="w-7 h-7 rounded-lg bg-blue-700 text-white flex items-center justify-center shrink-0">
                <GraduationCap className="w-4 h-4" aria-hidden="true" />
              </div>
              <span className="font-display text-base font-bold tracking-tight text-slate-900">
                CampusConnect
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                onClearProfileError();
                setIsEditProfileOpen(true);
              }}
              disabled={!isBackendConfigured}
              aria-label="My profile"
              className="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:opacity-50 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <UserRound className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">My profile</span>
            </button>

            <button
              type="button"
              onClick={onSignOut}
              disabled={signingOut}
              aria-label="Sign out"
              className="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:opacity-60 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              {signingOut ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <LogOut className="w-4 h-4" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">{signingOut ? 'Signing out...' : 'Sign out'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile & Tablet Slide-Over Navigation Drawer */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex"
          role="dialog"
          aria-modal="true"
          aria-label="CampusConnect navigation menu"
        >
          <div
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-[1px]"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] h-full bg-white border-r border-slate-200 flex flex-col shadow-xl">
            <div className="h-14 px-4 border-b border-slate-100 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-700 text-white flex items-center justify-center">
                  <GraduationCap className="w-4 h-4" aria-hidden="true" />
                </div>
                <span className="font-display text-base font-bold tracking-tight text-slate-900">
                  CampusConnect
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation menu"
                className="min-h-[36px] min-w-[36px] rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 inline-flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {renderSidebarNavigation()}
            {renderSidebarAccountBlock()}
          </div>
        </div>
      )}

      {/* Workspace Main Content */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        <main className="flex-1 w-full max-w-[1160px] mx-auto px-4 sm:px-8 py-6 sm:py-8">
          {/* Mobile Quick View Switcher */}
          <div
            role="tablist"
            aria-label="CampusConnect sections"
            className="lg:hidden mb-5 -mx-4 px-4 sm:-mx-8 sm:px-8 overflow-x-auto"
          >
            <div className="inline-flex items-center gap-1.5 pb-1">
              {flatNavItems.map((item) => {
                const isActive = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => handleSelectView(item.id)}
                    className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-blue-700 text-white'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>{item.label}</span>
                    {typeof item.count === 'number' && (
                      <span
                        className={`ml-1.5 text-xs tabular-nums ${
                          isActive ? 'text-blue-100' : 'text-slate-400'
                        }`}
                      >
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

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

          {incomingBorrowAlert && (
            <div
              role="status"
              className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <Bell className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" aria-hidden="true" />
                <p className="min-w-0 leading-relaxed">
                  <span className="font-semibold">
                    New borrow request from {incomingBorrowAlert.requesterName}:
                  </span>{' '}
                  “{incomingBorrowAlert.itemTitle || incomingBorrowAlert.description}”
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    handleSelectView('borrow-requests');
                    dismissIncomingBorrowAlert();
                  }}
                  className="min-h-[34px] px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-medium hover:bg-blue-800 transition-colors cursor-pointer"
                >
                  View Borrow Requests
                </button>
                <button
                  type="button"
                  onClick={dismissIncomingBorrowAlert}
                  aria-label="Dismiss borrow request alert"
                  className="p-1 rounded-md text-blue-800 hover:bg-blue-100 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          {incomingPurchaseAlert && (
            <div
              role="status"
              className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <ShoppingBag
                  className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <p className="min-w-0 leading-relaxed">
                  <span className="font-semibold">
                    New purchase request from {incomingPurchaseAlert.borrowerName}:
                  </span>{' '}
                  “{incomingPurchaseAlert.itemTitle}” ({formatInr(incomingPurchaseAlert.listedPrice)}
                  )
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    handleSelectView('purchase-requests');
                    dismissIncomingPurchaseAlert();
                  }}
                  className="min-h-[34px] px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-medium hover:bg-emerald-800 transition-colors cursor-pointer"
                >
                  View Purchase Requests
                </button>
                <button
                  type="button"
                  onClick={dismissIncomingPurchaseAlert}
                  aria-label="Dismiss purchase request alert"
                  className="p-1 rounded-md text-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          {(statusMessage || ratingStatusMessage || purchaseStatusMessage) && (
            <div
              role="status"
              className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 flex items-start gap-3"
            >
              <CheckCircle2
                className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <p className="flex-1 min-w-0 leading-relaxed">
                {purchaseStatusMessage || ratingStatusMessage || statusMessage}
              </p>
              <button
                type="button"
                onClick={() => {
                  clearStatusMessage();
                  clearRatingStatusMessage();
                  clearPurchaseStatusMessage();
                }}
                aria-label="Dismiss confirmation"
                className="p-1 rounded-md text-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          )}

          {(itemsError || ratingsError || purchaseError) && (
            <div
              role="alert"
              className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-950 flex items-start gap-3"
            >
              <AlertCircle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
              <p className="flex-1 min-w-0 leading-relaxed">
                {purchaseError || ratingsError || itemsError}
              </p>
              <button
                type="button"
                onClick={() => {
                  clearItemsError();
                  clearRatingsError();
                  clearPurchaseError();
                }}
                aria-label="Dismiss error"
                className="p-1 rounded-md text-red-800 hover:bg-red-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          )}

          {/* Contextual Section Header */}
          <header className="pb-6 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="min-w-0 max-w-2xl">
              <h1 className="font-display text-2xl sm:text-[28px] font-bold tracking-tight text-slate-900 leading-tight">
                {activeSectionMeta.title}
              </h1>
              <p className="mt-1.5 text-sm sm:text-[15px] text-slate-600 leading-relaxed">
                {activeSectionMeta.subtitle}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleOpenAddItem}
                disabled={!isBackendConfigured}
                className={`min-h-[42px] px-4 py-2 rounded-xl text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 transition-colors duration-150 inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 ${
                  isItemsPrimaryView
                    ? 'bg-blue-700 text-white hover:bg-blue-800'
                    : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>Add item</span>
              </button>
            </div>
          </header>

          {/* Post-Login Student Profile Onboarding Banner */}
          {!profileLoading && !hasCompleteProfile && isBackendConfigured && (
            <section
              aria-label="Student profile setup"
              className="mt-6 bg-amber-50 border border-amber-200 rounded-2xl p-5 sm:p-6"
            >
              <div className="flex items-start gap-3.5 max-w-3xl">
                <div className="w-10 h-10 rounded-xl bg-white border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
                  <UserRound className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900">
                    Set up your JDCOEM student profile to list, borrow, or buy items
                  </h2>
                  <p className="mt-1 text-sm text-slate-700 leading-relaxed">
                    You can browse shared items now. Saving your name, branch, semester number, and
                    phone number is required before listing or sending a private request so the
                    other student can contact you.
                  </p>
                </div>
              </div>

              <form
                onSubmit={handleInlineProfileSubmit}
                className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
                noValidate
              >
                <div>
                  <label
                    htmlFor="inline-profile-name"
                    className="block text-xs font-medium text-slate-800 mb-1"
                  >
                    Full name
                  </label>
                  <input
                    id="inline-profile-name"
                    type="text"
                    required
                    maxLength={STUDENT_PROFILE_LIMITS.displayNameMax}
                    value={inlineNameInput}
                    onChange={(event) => {
                      setInlineNameInput(event.target.value);
                      if (profileError) onClearProfileError();
                    }}
                    placeholder="Your full name"
                    disabled={savingProfile}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-amber-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700"
                  />
                </div>

                <div>
                  <label
                    htmlFor="inline-profile-branch"
                    className="block text-xs font-medium text-slate-800 mb-1"
                  >
                    Branch
                  </label>
                  <input
                    id="inline-profile-branch"
                    type="text"
                    list="inline-jdcoem-branch-list"
                    required
                    maxLength={STUDENT_PROFILE_LIMITS.branchMax}
                    value={inlineBranchInput}
                    onChange={(event) => {
                      setInlineBranchInput(event.target.value);
                      if (profileError) onClearProfileError();
                    }}
                    placeholder="e.g., CSE"
                    disabled={savingProfile}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-amber-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700"
                  />
                  <datalist id="inline-jdcoem-branch-list">
                    {JDCOEM_BRANCHES.map((branchOption) => (
                      <option key={branchOption} value={branchOption} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label
                    htmlFor="inline-profile-semester"
                    className="block text-xs font-medium text-slate-800 mb-1"
                  >
                    Semester no.
                  </label>
                  <select
                    id="inline-profile-semester"
                    required
                    value={inlineSemesterInput}
                    onChange={(event) => {
                      setInlineSemesterInput(event.target.value);
                      if (profileError) onClearProfileError();
                    }}
                    disabled={savingProfile}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-amber-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700 cursor-pointer"
                  >
                    <option value="">Select sem</option>
                    {JDCOEM_SEMESTERS.map((semOption) => (
                      <option key={semOption} value={semOption}>
                        {semOption}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="inline-profile-phone"
                    className="block text-xs font-medium text-slate-800 mb-1"
                  >
                    Phone number
                  </label>
                  <input
                    id="inline-profile-phone"
                    type="tel"
                    autoComplete="tel"
                    required
                    maxLength={STUDENT_PROFILE_LIMITS.phoneMax}
                    value={inlinePhoneInput}
                    onChange={(event) => {
                      setInlinePhoneInput(event.target.value);
                      if (profileError) onClearProfileError();
                    }}
                    placeholder="e.g., 9876543210"
                    disabled={savingProfile}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-amber-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingProfile}
                  className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-60"
                >
                  {savingProfile ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save profile</span>
                  )}
                </button>
              </form>

              {profileError && !pendingGateAction && !isEditProfileOpen && (
                <p role="alert" className="mt-3 text-sm font-medium text-red-700">
                  {profileError}
                </p>
              )}
            </section>
          )}

          {/* Search & Listing Filter Toolbar */}
          <section
            className="mt-6 flex flex-col md:flex-row md:items-center justify-between gap-3.5"
            aria-label="Search and filter"
          >
            <div className="relative flex-1 max-w-lg w-full">
              <label htmlFor="campus-search" className="sr-only">
                Search shared items, requests, or reviews
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
                    ? 'Search items by name, lister, lend/sale, or price...'
                    : activeView === 'borrow-requests'
                      ? 'Search borrow requests by item, student, or status...'
                      : activeView === 'purchase-requests'
                        ? 'Search purchase requests by item, student, or status...'
                        : activeView === 'profile-reviews'
                          ? 'Search reviews by comment, author, or exchange...'
                          : 'Filter items or requests by title, student name, or UID...'
                }
                className="w-full min-h-[42px] pl-10 pr-20 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700"
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

            {activeView === 'items' && (
              <div
                role="group"
                aria-label="Filter items by listing type"
                className="inline-flex items-center p-1 bg-slate-200/70 rounded-xl self-start md:self-auto"
              >
                {(
                  [
                    { id: 'all', label: 'All Items' },
                    { id: 'lend', label: 'Lend & Borrow' },
                    { id: 'sell', label: 'Permanent Sale' },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={itemListingFilter === option.id}
                    onClick={() => setItemListingFilter(option.id)}
                    className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
                      itemListingFilter === option.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Active View Content */}
          <section className="mt-6" aria-label="CampusConnect community list">
            {activeView === 'admin' && isAdmin ? (
              <AdminDashboardPanel
                currentUserId={user.uid}
                currentUserEmail={user.email}
                items={allItems}
                requests={allAdminRequests}
                purchaseRequests={allAdminPurchaseRequests}
                publicProfiles={publicProfiles}
                publicProfilesById={publicProfilesById}
                adminUids={adminUids}
                adminsLoading={adminsLoading}
                managingAdminUid={managingAdminUid}
                adminError={adminError}
                adminStatusMessage={adminStatusMessage}
                deletingId={deletingId}
                searchQuery={searchQuery}
                onRequestDelete={setDeleteTarget}
                onGrantAdmin={grantAdmin}
                onRevokeAdmin={revokeAdmin}
                onClearAdminMessages={clearAdminMessages}
                onClearSearch={handleClearSearch}
              />
            ) : activeView === 'profile-reviews' ? (
              <ProfileReviewsPanel
                selectedProfile={selectedProfile}
                availableProfiles={availableProfiles}
                publicProfilesById={publicProfilesById}
                ratingSummaryByUserId={ratingSummaryByUserId}
                currentUserId={user.uid}
                searchQuery={searchQuery}
                loading={ratingsLoading}
                onSelectProfile={(id, name) =>
                  setProfileRatingTarget({ userId: id, displayName: name })
                }
                onEditRating={handleOpenEditRating}
                onOpenEditProfile={() => {
                  onClearProfileError();
                  setIsEditProfileOpen(true);
                }}
                onClearSearch={handleClearSearch}
              />
            ) : activeView === 'borrow-requests' ? (
              <BorrowRequestsPanel
                requests={borrowRequests}
                currentUserId={user.uid}
                searchQuery={searchQuery}
                loading={borrowRequestsLoading}
                updatingId={updatingRequestId}
                isBackendConfigured={isBackendConfigured}
                getRatingForRequestByUser={getRatingForRequestByUser}
                onConfirmFulfilled={fulfillRequest}
                onCancelRequest={cancelBorrowRequest}
                onRateExchange={handleOpenCreateBorrowRating}
                onEditRating={handleOpenEditRating}
                onOpenProfileRatings={handleOpenProfileRatings}
                onClearSearch={handleClearSearch}
              />
            ) : activeView === 'purchase-requests' ? (
              <PurchaseRequestsPanel
                requests={purchaseRequests}
                currentUserId={user.uid}
                searchQuery={searchQuery}
                loading={purchaseRequestsLoading}
                updatingId={updatingPurchaseId}
                isBackendConfigured={isBackendConfigured}
                getRatingForRequestByUser={getRatingForRequestByUser}
                onConfirmPayment={confirmPurchasePayment}
                onCancelRequest={cancelPurchaseRequest}
                onRatePurchase={handleOpenCreatePurchaseRating}
                onEditRating={handleOpenEditRating}
                onOpenProfileRatings={handleOpenProfileRatings}
                onClearSearch={handleClearSearch}
              />
            ) : loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={index}
                    className="bg-white border border-slate-200 rounded-2xl overflow-hidden animate-pulse"
                  >
                    <div className="aspect-[4/3] w-full bg-slate-200" />
                    <div className="p-6 space-y-3">
                      <div className="h-5 w-3/4 bg-slate-200 rounded" />
                      <div className="h-3.5 w-1/2 bg-slate-100 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredAllItems.length === 0 ? (
              allItems.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center max-w-xl mx-auto mt-6">
                  <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center mx-auto">
                    <Package className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <h2 className="mt-4 font-display text-lg font-semibold text-slate-900">
                    No items listed yet
                  </h2>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                    Real listings shared by JDCOEM students appear here. Share an item for lending
                    or list one for permanent sale to get started.
                  </p>
                  <button
                    type="button"
                    onClick={handleOpenAddItem}
                    disabled={!isBackendConfigured}
                    className="mt-6 min-h-[42px] px-5 py-2 rounded-xl bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    <span>Add item</span>
                  </button>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center max-w-xl mx-auto mt-6">
                  <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
                    <Search className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <h2 className="mt-4 font-display text-lg font-semibold text-slate-900">
                    No matching items found
                  </h2>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                    {normalizedQuery ? (
                      <>
                        Nothing matched “
                        <span className="font-medium text-slate-900">{searchQuery.trim()}</span>”.
                        Try clearing your search or switching listing filters.
                      </>
                    ) : (
                      'No items have been listed under this filter yet.'
                    )}
                  </p>
                  <div className="mt-6 flex items-center justify-center gap-3">
                    {normalizedQuery && (
                      <button
                        type="button"
                        onClick={handleClearSearch}
                        className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 cursor-pointer"
                      >
                        Clear search
                      </button>
                    )}
                    {itemListingFilter !== 'all' && (
                      <button
                        type="button"
                        onClick={() => setItemListingFilter('all')}
                        className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 cursor-pointer"
                      >
                        Show all items
                      </button>
                    )}
                  </div>
                </div>
              )
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredAllItems.map((item) => {
                  const isOwner = item.authorId === user.uid;
                  const canDelete = isOwner || isAdmin;
                  const isDeletingThis = deletingId === item.id;
                  const isPermanentSale = item.listingType === 'sell';
                  const isSold = item.status === 'Sold';
                  const authorPublic = publicProfilesById[item.authorId];
                  const authorDisplay = authorPublic?.displayName || item.authorName;

                  const myPendingPurchaseAsBorrower =
                    isPermanentSale && !isOwner
                      ? pendingPurchaseRequests.find(
                          (req) => req.itemId === item.id && req.borrowerId === user.uid
                        )
                      : undefined;

                  const myPendingBorrowAsBorrower =
                    !isPermanentSale && !isOwner
                      ? pendingBorrowRequests.find(
                          (req) => req.itemId === item.id && req.requesterId === user.uid
                        )
                      : undefined;

                  return (
                    <article
                      key={item.id}
                      className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col justify-between transition-colors duration-150 hover:border-slate-300"
                    >
                      <div>
                        <ItemPhoto src={item.photoUrl} alt={item.title} />

                        <div className="p-5 sm:p-6">
                          <div className="flex items-start justify-between gap-3">
                            <h2 className="font-display text-lg font-semibold text-slate-900 leading-snug">
                              {item.title}
                            </h2>
                            {isPermanentSale && (
                              <span className="font-display text-base font-bold text-emerald-700 tabular-nums shrink-0">
                                {formatInr(item.price)}
                              </span>
                            )}
                          </div>

                          <p className="mt-2 text-sm text-slate-600 truncate">
                            Listed by{' '}
                            <span className="font-medium text-slate-900">
                              {isOwner ? 'You' : authorDisplay}
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="px-5 sm:px-6 py-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          {isPermanentSale && isSold && (
                            <span className="text-xs font-semibold text-slate-500">Sold</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {!isOwner &&
                            isPermanentSale &&
                            !isSold &&
                            !myPendingPurchaseAsBorrower && (
                              <button
                                type="button"
                                onClick={() => handleOpenBuyItem(item)}
                                disabled={!isBackendConfigured}
                                className="min-h-[38px] px-4 py-1.5 rounded-xl bg-emerald-700 text-white text-xs sm:text-sm font-medium hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                              >
                                <ShoppingBag className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                <span>Buy</span>
                              </button>
                            )}

                          {!isOwner &&
                            isPermanentSale &&
                            !isSold &&
                            myPendingPurchaseAsBorrower && (
                              <button
                                type="button"
                                onClick={() => handleSelectView('purchase-requests')}
                                className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-xs font-medium hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                              >
                                <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                <span>Pending</span>
                              </button>
                            )}

                          {!isOwner &&
                            !isPermanentSale &&
                            !isSold &&
                            !myPendingBorrowAsBorrower && (
                              <button
                                type="button"
                                onClick={() => handleOpenBorrowItem(item)}
                                disabled={!isBackendConfigured}
                                className="min-h-[38px] px-4 py-1.5 rounded-xl bg-blue-700 text-white text-xs sm:text-sm font-medium hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                              >
                                <HandHelping className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                <span>Borrow</span>
                              </button>
                            )}

                          {!isOwner &&
                            !isPermanentSale &&
                            !isSold &&
                            myPendingBorrowAsBorrower && (
                              <button
                                type="button"
                                onClick={() => handleSelectView('borrow-requests')}
                                className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-xs font-medium hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                              >
                                <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                <span>Pending</span>
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
                              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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
      </div>

      <StudentProfileModal
        isOpen={Boolean(pendingGateAction) || isEditProfileOpen}
        mode={isEditProfileOpen && !pendingGateAction ? 'edit' : 'complete'}
        reason={pendingGateAction?.type ?? null}
        initialProfile={initialProfileFormValues}
        savingProfile={savingProfile}
        profileError={profileError}
        onClose={() => {
          setPendingGateAction(null);
          setIsEditProfileOpen(false);
        }}
        onSaveProfile={handleModalProfileSave}
        onClearError={onClearProfileError}
      />

      <AddItemModal
        isOpen={isAddModalOpen}
        submitting={submittingItem}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={addItem}
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

      <BorrowRequestModal
        item={borrowItemTarget}
        lenderDisplayName={
          borrowItemTarget
            ? publicProfilesById[borrowItemTarget.authorId]?.displayName ||
              borrowItemTarget.authorName
            : ''
        }
        borrowerName={displayName}
        borrowerPhone={userPhone || ''}
        borrowerRatingAverage={ratingSummaryByUserId[user.uid]?.averageScore ?? 0}
        borrowerRatingCount={ratingSummaryByUserId[user.uid]?.count ?? 0}
        submitting={submittingRequest}
        onClose={() => setBorrowItemTarget(null)}
        onConfirmSend={(targetItem, note) =>
          createBorrowRequest(
            targetItem,
            note,
            ratingSummaryByUserId[user.uid]?.averageScore ?? 0,
            ratingSummaryByUserId[user.uid]?.count ?? 0
          )
        }
      />

      <PurchaseRequestModal
        item={buyItemTarget}
        sellerDisplayName={
          buyItemTarget
            ? publicProfilesById[buyItemTarget.authorId]?.displayName || buyItemTarget.authorName
            : ''
        }
        borrowerName={displayName}
        borrowerPhone={userPhone || ''}
        borrowerRatingAverage={ratingSummaryByUserId[user.uid]?.averageScore ?? 0}
        borrowerRatingCount={ratingSummaryByUserId[user.uid]?.count ?? 0}
        submitting={submittingPurchaseRequest}
        onClose={() => setBuyItemTarget(null)}
        onConfirmSend={(targetItem) =>
          createPurchaseRequest(
            targetItem,
            ratingSummaryByUserId[user.uid]?.averageScore ?? 0,
            ratingSummaryByUserId[user.uid]?.count ?? 0
          )
        }
      />
    </div>
  );
}
