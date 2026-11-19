import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Receipt,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { formatInr, type CampusPayment, type PaymentStatus } from '../data/campusItems';

interface TransactionsPanelProps {
  payments: CampusPayment[];
  currentUserId: string;
  searchQuery: string;
  loading: boolean;
  onClearSearch: () => void;
}

type RoleFilter = 'all' | 'purchases' | 'sales';

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

function PaymentStatusLabel({ status }: { status: PaymentStatus }) {
  if (status === 'Successful') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Successful</span>
      </span>
    );
  }
  if (status === 'Failed') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Failed</span>
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

export function TransactionsPanel({
  payments,
  currentUserId,
  searchQuery,
  loading,
  onClearSearch,
}: TransactionsPanelProps) {
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');

  const stats = useMemo(() => {
    let successful = 0;
    let pending = 0;
    let failed = 0;
    let totalVolume = 0;

    for (const p of payments) {
      if (p.status === 'Successful') {
        successful += 1;
        totalVolume += p.amount;
      } else if (p.status === 'Pending') {
        pending += 1;
      } else if (p.status === 'Failed') {
        failed += 1;
      }
    }

    return {
      total: payments.length,
      successful,
      pending,
      failed,
      totalVolume,
    };
  }, [payments]);

  const filteredPayments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return payments.filter((p) => {
      if (roleFilter === 'purchases' && p.buyerId !== currentUserId) return false;
      if (roleFilter === 'sales' && p.sellerId !== currentUserId) return false;

      if (!q) return true;
      return (
        p.itemTitle.toLowerCase().includes(q) ||
        p.transactionRef.toLowerCase().includes(q) ||
        p.buyerName.toLowerCase().includes(q) ||
        p.sellerName.toLowerCase().includes(q) ||
        p.paymentMethod.toLowerCase().includes(q) ||
        p.payerAccountRef.toLowerCase().includes(q) ||
        p.status.toLowerCase().includes(q) ||
        (p.failureReason && p.failureReason.toLowerCase().includes(q))
      );
    });
  }, [payments, roleFilter, currentUserId, searchQuery]);

  if (loading) {
    return (
      <div className="space-y-3 mt-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="bg-white border border-slate-200 rounded-xl p-5 animate-pulse space-y-3"
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
      {/* Unified Summary Metrics Strip */}
      <div className="bg-white border border-slate-200 rounded-2xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 divide-x divide-slate-200 overflow-hidden">
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Total Transactions</p>
          <p className="mt-1.5 font-display text-2xl font-bold text-slate-900 tabular-nums">
            {stats.total}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Successful Payments</p>
          <p className="mt-1.5 font-display text-2xl font-bold text-emerald-700 tabular-nums">
            {stats.successful}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
            {formatInr(stats.totalVolume)} verified
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Pending</p>
          <p className="mt-1.5 font-display text-2xl font-bold text-amber-700 tabular-nums">
            {stats.pending}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Failed</p>
          <p className="mt-1.5 font-display text-2xl font-bold text-red-700 tabular-nums">
            {stats.failed}
          </p>
        </div>
      </div>

      {/* Role Filter & Security Note */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex items-center p-1 bg-slate-200/70 rounded-xl self-start">
          {(
            [
              { id: 'all', label: 'All Activity' },
              { id: 'purchases', label: 'Purchases' },
              { id: 'sales', label: 'Sales' },
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setRoleFilter(option.id)}
              className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 cursor-pointer ${
                roleFilter === option.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <p className="text-xs text-slate-500 inline-flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0" aria-hidden="true" />
          <span>Every payment status is verified and committed on the backend server.</span>
        </p>
      </div>

      {/* Transaction History Ledger */}
      {filteredPayments.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center max-w-xl mx-auto">
          <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
            {searchQuery.trim() ? (
              <Search className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Receipt className="w-5 h-5" aria-hidden="true" />
            )}
          </div>
          <h2 className="mt-4 font-display text-lg font-semibold text-slate-900">
            {searchQuery.trim() ? 'No matching transactions' : 'No payment transactions yet'}
          </h2>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            {searchQuery.trim()
              ? `No payment records matched “${searchQuery.trim()}”.`
              : 'When you buy or sell a permanent-sale item on CampusConnect, your verified payment receipt and status history will appear here.'}
          </p>
          {searchQuery.trim() && (
            <button
              type="button"
              onClick={onClearSearch}
              className="mt-6 min-h-[40px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Clear search
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-200 overflow-hidden">
          {filteredPayments.map((payment) => {
            const isBuyer = payment.buyerId === currentUserId;
            return (
              <article
                key={payment.id}
                className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors"
              >
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <PaymentStatusLabel status={payment.status} />
                    <span className="text-slate-300" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-mono text-xs font-medium text-slate-700 tabular-nums">
                      {payment.transactionRef}
                    </span>
                    <span className="text-slate-300" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-xs text-slate-500 tabular-nums">
                      {formatTimestamp(payment.updatedAtMs)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {isBuyer ? (
                      <ArrowUpRight
                        className="w-4 h-4 text-slate-500 shrink-0"
                        aria-hidden="true"
                      />
                    ) : (
                      <ArrowDownLeft
                        className="w-4 h-4 text-emerald-700 shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    <h3 className="font-display text-base font-semibold text-slate-900 truncate">
                      {payment.itemTitle}
                    </h3>
                  </div>

                  <p className="text-xs sm:text-sm text-slate-600">
                    {isBuyer
                      ? `Purchased from ${payment.sellerName}`
                      : `Sold to ${payment.buyerName}`}{' '}
                    <span className="text-slate-300" aria-hidden="true">
                      ·
                    </span>{' '}
                    <span>{payment.paymentMethod}</span>{' '}
                    <span className="text-slate-300" aria-hidden="true">
                      ·
                    </span>{' '}
                    <span className="text-slate-700">{payment.payerAccountRef}</span>
                  </p>

                  {payment.verifiedByBackend && payment.status === 'Successful' && (
                    <p className="text-xs text-emerald-800 font-mono">
                      Backend verified
                      {payment.verificationCode ? ` · Code ${payment.verificationCode}` : ''}
                    </p>
                  )}

                  {payment.status === 'Failed' && payment.failureReason && (
                    <p className="text-xs text-red-700">{payment.failureReason}</p>
                  )}
                </div>

                <div className="sm:text-right shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100 flex sm:flex-col items-center sm:items-end justify-between gap-1">
                  <p className="font-display text-lg font-bold text-slate-900 tabular-nums">
                    {formatInr(payment.amount)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {isBuyer ? 'Outgoing purchase' : 'Incoming sale'}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
