import { useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Package,
  Search,
  Shield,
  ShieldPlus,
  Trash2,
  UserMinus,
} from 'lucide-react';
import { formatInr, type CampusItem, type CampusRequest } from '../data/campusItems';
import type { PublicStudentProfile } from '../hooks/usePublicProfiles';
import { BOOTSTRAPPED_ADMIN_EMAIL } from '../lib/firebase';
import { formatBranchSemester } from '../lib/profileUtils';
import type { DeleteTarget } from './DeleteConfirmModal';

interface AdminDashboardPanelProps {
  currentUserId: string;
  currentUserEmail: string | null;
  items: CampusItem[];
  requests: CampusRequest[];
  publicProfiles: PublicStudentProfile[];
  publicProfilesById: Record<string, PublicStudentProfile>;
  adminUids: string[];
  adminsLoading: boolean;
  managingAdminUid: string | null;
  adminError: string | null;
  adminStatusMessage: string | null;
  deletingId: string | null;
  searchQuery: string;
  onRequestDelete: (target: DeleteTarget) => void;
  onGrantAdmin: (uid: string) => Promise<boolean>;
  onRevokeAdmin: (uid: string) => Promise<boolean>;
  onClearAdminMessages: () => void;
  onClearSearch: () => void;
}

type ModerationSection = 'items' | 'requests' | 'admins';

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

export function AdminDashboardPanel({
  currentUserId,
  currentUserEmail,
  items,
  requests,
  publicProfiles,
  publicProfilesById,
  adminUids,
  adminsLoading,
  managingAdminUid,
  adminError,
  adminStatusMessage,
  deletingId,
  searchQuery,
  onRequestDelete,
  onGrantAdmin,
  onRevokeAdmin,
  onClearAdminMessages,
  onClearSearch,
}: AdminDashboardPanelProps) {
  const [section, setSection] = useState<ModerationSection>('items');
  const [uidInput, setUidInput] = useState('');

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const stats = useMemo(() => {
    const lendCount = items.filter((i) => i.listingType === 'lend').length;
    const sellCount = items.filter((i) => i.listingType === 'sell').length;
    const openRequests = requests.filter((r) => r.status === 'Open').length;
    return {
      totalItems: items.length,
      lendCount,
      sellCount,
      totalRequests: requests.length,
      openRequests,
      totalProfiles: publicProfiles.length,
      totalAdmins: adminUids.length + 1,
    };
  }, [items, requests, publicProfiles.length, adminUids.length]);

  const filteredItems = useMemo(() => {
    if (!normalizedQuery) return items;
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(normalizedQuery) ||
        item.description.toLowerCase().includes(normalizedQuery) ||
        item.authorName.toLowerCase().includes(normalizedQuery) ||
        item.authorId.toLowerCase().includes(normalizedQuery) ||
        item.status.toLowerCase().includes(normalizedQuery)
    );
  }, [items, normalizedQuery]);

  const filteredRequests = useMemo(() => {
    if (!normalizedQuery) return requests;
    return requests.filter(
      (req) =>
        req.description.toLowerCase().includes(normalizedQuery) ||
        req.requesterName.toLowerCase().includes(normalizedQuery) ||
        req.requesterId.toLowerCase().includes(normalizedQuery) ||
        (req.itemTitle && req.itemTitle.toLowerCase().includes(normalizedQuery)) ||
        req.status.toLowerCase().includes(normalizedQuery)
    );
  }, [requests, normalizedQuery]);

  async function handleGrantSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await onGrantAdmin(uidInput);
    if (ok) {
      setUidInput('');
    }
  }

  return (
    <div className="space-y-6">
      {/* Compact Admin Session Strip */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">
              Administrator: {currentUserEmail || currentUserId}
            </p>
            <p className="text-xs text-slate-500">
              Full moderation access across shared items, campus requests, and admin accounts.
            </p>
          </div>
        </div>
        <div className="text-xs text-slate-600 font-mono bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 shrink-0">
          Your UID: <span className="text-slate-900 font-semibold">{currentUserId}</span>
        </div>
      </div>

      {/* Unified Summary Metrics Strip */}
      <div className="bg-white border border-slate-200 rounded-2xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 divide-x divide-slate-200 overflow-hidden">
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Shared Items</p>
          <p className="mt-1.5 font-display text-2xl font-bold text-slate-900 tabular-nums">
            {stats.totalItems}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
            {stats.lendCount} lend · {stats.sellCount} permanent sale
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Campus Requests</p>
          <p className="mt-1.5 font-display text-2xl font-bold text-slate-900 tabular-nums">
            {stats.totalRequests}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
            {stats.openRequests} currently open
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Student Profiles</p>
          <p className="mt-1.5 font-display text-2xl font-bold text-slate-900 tabular-nums">
            {stats.totalProfiles}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Admin Accounts</p>
          <p className="mt-1.5 font-display text-2xl font-bold text-blue-700 tabular-nums">
            {stats.totalAdmins}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">Includes primary admin</p>
        </div>
      </div>

      {/* Section Switcher */}
      <div className="inline-flex flex-wrap items-center p-1 bg-slate-200/70 rounded-xl">
        {(
          [
            { id: 'items', label: `All Items (${filteredItems.length})` },
            { id: 'requests', label: `All Requests (${filteredRequests.length})` },
            { id: 'admins', label: `Admin Access (${adminUids.length + 1})` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSection(tab.id)}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 cursor-pointer ${
              section === tab.id
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Moderation Items List */}
      {section === 'items' && (
        filteredItems.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center max-w-xl mx-auto">
            <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
              {normalizedQuery ? (
                <Search className="w-5 h-5" aria-hidden="true" />
              ) : (
                <Package className="w-5 h-5" aria-hidden="true" />
              )}
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold text-slate-900">
              {normalizedQuery ? 'No matching items' : 'No shared items in database'}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {normalizedQuery
                ? `No items matched “${searchQuery.trim()}”.`
                : 'Real listings posted by users will appear here for moderation.'}
            </p>
            {normalizedQuery && (
              <button
                type="button"
                onClick={onClearSearch}
                className="mt-5 min-h-[40px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-200 overflow-hidden">
            {filteredItems.map((item) => {
              const authorPublic = publicProfilesById[item.authorId];
              const authorDisplay = authorPublic?.displayName || item.authorName;
              const academicMeta = formatBranchSemester(
                authorPublic?.branch,
                authorPublic?.semester
              );
              const isDeletingThis = deletingId === item.id;

              return (
                <article
                  key={item.id}
                  className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex items-start gap-4 min-w-0">
                    {item.photoUrl ? (
                      <img
                        src={item.photoUrl}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        className="w-16 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-12 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                        <Package className="w-5 h-5" aria-hidden="true" />
                      </div>
                    )}
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                        <span
                          className={
                            item.listingType === 'sell'
                              ? 'font-semibold text-emerald-700'
                              : 'font-semibold text-blue-700'
                          }
                        >
                          {item.listingType === 'sell'
                            ? `Permanent Sale · ${formatInr(item.price)}`
                            : 'Lend & Borrow'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{item.status}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{formatTimestamp(item.createdAtMs)}</span>
                      </div>
                      <h3 className="font-display text-base font-semibold text-slate-900 truncate">
                        {item.title}
                      </h3>
                      <p className="text-xs text-slate-600">
                        Posted by <span className="font-medium text-slate-900">{authorDisplay}</span>
                        {academicMeta ? ` (${academicMeta})` : ''} · {item.authorPhone}
                      </p>
                      <p className="text-[11px] font-mono text-slate-500 break-all">
                        Author UID: {item.authorId}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        onRequestDelete({
                          id: item.id,
                          title: item.title,
                          kind: 'item',
                        })
                      }
                      disabled={isDeletingThis}
                      className="min-h-[38px] px-3.5 py-2 rounded-lg border border-red-200 bg-white text-xs sm:text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
                    >
                      {isDeletingThis ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                          <span>Deleting...</span>
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                          <span>Delete item</span>
                        </>
                      )}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )
      )}

      {/* Moderation Requests List */}
      {section === 'requests' && (
        filteredRequests.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center max-w-xl mx-auto">
            <h3 className="font-display text-lg font-semibold text-slate-900">
              {normalizedQuery ? 'No matching requests' : 'No shared requests in database'}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {normalizedQuery
                ? `No requests matched “${searchQuery.trim()}”.`
                : 'Campus requests posted by students will appear here.'}
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-200 overflow-hidden">
            {filteredRequests.map((req) => {
              const isDeletingThis = deletingId === req.id;
              return (
                <article
                  key={req.id}
                  className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                      <span className="font-semibold text-slate-900">{req.status}</span>
                      {req.itemTitle && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Item: {req.itemTitle}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{formatTimestamp(req.createdAtMs)}</span>
                    </div>
                    <p className="text-sm font-medium text-slate-900">{req.description}</p>
                    <p className="text-xs text-slate-600">
                      Requester: <span className="font-medium text-slate-900">{req.requesterName}</span>{' '}
                      ({req.requesterPhone})
                      {req.acceptedByName && ` · Accepted by ${req.acceptedByName}`}
                    </p>
                    <p className="text-[11px] font-mono text-slate-500 break-all">
                      Requester UID: {req.requesterId}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      onRequestDelete({
                        id: req.id,
                        title: req.itemTitle || req.description.slice(0, 40),
                        kind: 'request',
                      })
                    }
                    disabled={isDeletingThis}
                    className="min-h-[38px] px-3.5 py-2 rounded-lg border border-red-200 bg-white text-xs sm:text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                    <span>Delete request</span>
                  </button>
                </article>
              );
            })}
          </div>
        )
      )}

      {/* Admin Access Management */}
      {section === 'admins' && (
        <div className="space-y-5">
          {adminStatusMessage && (
            <div
              role="status"
              className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 flex items-start justify-between gap-3"
            >
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{adminStatusMessage}</span>
              </div>
              <button
                type="button"
                onClick={onClearAdminMessages}
                className="text-xs font-medium text-emerald-800 hover:underline cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {adminError && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-950 flex items-start justify-between gap-3"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{adminError}</span>
              </div>
              <button
                type="button"
                onClick={onClearAdminMessages}
                className="text-xs font-medium text-red-800 hover:underline cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900">
                Grant admin access to a CampusConnect account
              </h3>
              <p className="mt-1 text-xs sm:text-sm text-slate-600 leading-relaxed">
                Primary bootstrapped admin:{' '}
                <span className="font-mono text-slate-900">{BOOTSTRAPPED_ADMIN_EMAIL}</span>. You can
                also promote any signed-in student UID (for example, your college email UID) below.
              </p>
            </div>

            <form onSubmit={handleGrantSubmit} className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label htmlFor="admin-uid-input" className="sr-only">
                  Firebase User UID
                </label>
                <input
                  id="admin-uid-input"
                  type="text"
                  list="registered-student-uids"
                  value={uidInput}
                  onChange={(event) => setUidInput(event.target.value)}
                  placeholder="Enter or select a student UID"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 font-mono focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700"
                />
                <datalist id="registered-student-uids">
                  {publicProfiles.map((profile) => (
                    <option
                      key={profile.uid}
                      value={profile.uid}
                      label={`${profile.displayName} (${profile.branch})`}
                    />
                  ))}
                </datalist>
              </div>
              <button
                type="submit"
                disabled={Boolean(managingAdminUid) || !uidInput.trim()}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                <ShieldPlus className="w-4 h-4" aria-hidden="true" />
                <span>Grant admin</span>
              </button>
            </form>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Active Admin Records
              </h3>
            </div>

            <div className="divide-y divide-slate-200">
              <div className="px-6 py-4 bg-blue-50/40 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {BOOTSTRAPPED_ADMIN_EMAIL}
                  </p>
                  <p className="text-xs text-slate-600">Primary bootstrapped administrator</p>
                </div>
                <span className="text-xs font-medium text-blue-700 whitespace-nowrap shrink-0">
                  Always active
                </span>
              </div>

              {adminsLoading ? (
                <p className="px-6 py-4 text-sm text-slate-500">Loading admin UIDs...</p>
              ) : adminUids.length === 0 ? (
                <p className="px-6 py-4 text-sm text-slate-500">
                  No additional UIDs added in <code className="font-mono text-xs">/admins</code> yet.
                </p>
              ) : (
                adminUids.map((uid) => {
                  const profile = publicProfilesById[uid];
                  const isBusy = managingAdminUid === uid;
                  return (
                    <div
                      key={uid}
                      className="px-6 py-4 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {profile?.displayName || 'Registered Admin UID'}
                        </p>
                        <p className="text-xs font-mono text-slate-500 truncate">{uid}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void onRevokeAdmin(uid)}
                        disabled={isBusy}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
                      >
                        <UserMinus className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Revoke</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
