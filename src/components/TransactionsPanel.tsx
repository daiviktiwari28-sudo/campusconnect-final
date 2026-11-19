import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Receipt, Search } from 'lucide-react';
import { formatInr, type CompletedTransactionItem } from '../data/campusItems';

interface TransactionsPanelProps {
  transactions: CompletedTransactionItem[];
  searchQuery: string;
  loading: boolean;
  onClearSearch: () => void;
}

type RoleFilter = 'all' | 'purchases' | 'sales';

function formatCompletedDateTime(ms: number): string {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(ms));
  } catch {
    return 'Recently';
  }
}

export function TransactionsPanel({
  transactions,
  searchQuery,
  loading,
  onClearSearch,
}: TransactionsPanelProps) {
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');

  const filteredTransactions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (roleFilter === 'purchases' && tx.role !== 'buyer') return false;
      if (roleFilter === 'sales' && tx.role !== 'seller') return false;

      if (!q) return true;
      return (
        tx.itemTitle.toLowerCase().includes(q) ||
        tx.counterpartyName.toLowerCase().includes(q) ||
        String(tx.finalAmount).includes(q)
      );
    });
  }, [transactions, roleFilter, searchQuery]);

  if (loading) {
    return (
      <div className="space-y-3 mt-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="bg-white border border-slate-200 rounded-2xl p-5 animate-pulse space-y-3"
          >
            <div className="h-4 w-48 bg-slate-200 rounded" />
            <div className="h-3.5 w-64 bg-slate-100 rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Role Filter */}
      <div className="flex items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Filter completed transactions"
          className="inline-flex items-center p-1 bg-slate-200/70 rounded-xl"
        >
          {(
            [
              { id: 'all', label: 'All Completed' },
              { id: 'purchases', label: 'Purchased' },
              { id: 'sales', label: 'Sold' },
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={roleFilter === option.id}
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

        <p className="text-xs text-slate-500 tabular-nums">
          {filteredTransactions.length}{' '}
          {filteredTransactions.length === 1 ? 'completed transaction' : 'completed transactions'}
        </p>
      </div>

      {/* Completed Transactions Essentials List */}
      {filteredTransactions.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center max-w-xl mx-auto">
          <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
            {searchQuery.trim() ? (
              <Search className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Receipt className="w-5 h-5" aria-hidden="true" />
            )}
          </div>
          <h2 className="mt-4 font-display text-lg font-semibold text-slate-900">
            {searchQuery.trim() ? 'No matching transactions' : 'No completed transactions yet'}
          </h2>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            {searchQuery.trim()
              ? `Nothing matched “${searchQuery.trim()}”.`
              : 'Completed permanent-item purchases appear here once both the borrower and lender confirm payment.'}
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
        <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-200 overflow-hidden">
          {filteredTransactions.map((tx) => {
            const isBuyer = tx.role === 'buyer';
            return (
              <article
                key={tx.id}
                className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors"
              >
                <div className="min-w-0 space-y-1">
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
                      {tx.itemTitle}
                    </h3>
                  </div>

                  <p className="text-sm text-slate-600">
                    {isBuyer
                      ? `Purchased from ${tx.counterpartyName}`
                      : `Sold to ${tx.counterpartyName}`}
                  </p>

                  <p className="text-xs text-slate-500 tabular-nums">
                    Completed {formatCompletedDateTime(tx.completedAtMs)}
                  </p>
                </div>

                <div className="sm:text-right shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100 flex sm:flex-col items-center sm:items-end justify-between gap-1">
                  <p className="font-display text-lg font-bold text-slate-900 tabular-nums">
                    {formatInr(tx.finalAmount)}
                  </p>
                  <p className="text-xs text-slate-500">Final amount paid</p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
