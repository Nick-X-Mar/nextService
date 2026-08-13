'use client'

import { useState, useEffect } from 'react'
import Icon from '@/components/ui/Icon'
import type { WalletTransaction } from '@/types/payments'

interface WalletSectionProps {
  clientId: string
}

const reasonLabels: Record<string, string> = {
  cancellation_refund: 'Επιστροφή ακύρωσης',
  manual_credit: 'Πίστωση',
  payment_applied: 'Χρέωση πληρωμής',
}

export default function WalletSection({ clientId }: WalletSectionProps) {
  const [points, setPoints] = useState<number>(0)
  const [transactions, setTransactions] = useState<WalletTransaction[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [loading, setLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    const fetchBalance = async () => {
      try {
        const res = await fetch(`/api/wallet/balance/?clientId=${clientId}`)
        const data = await res.json()
        if (data.success) setPoints(data.points)
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    }
    fetchBalance()
  }, [clientId])

  const loadTransactions = async () => {
    if (transactions.length > 0) {
      setShowHistory(!showHistory)
      return
    }
    setHistoryLoading(true)
    setShowHistory(true)
    try {
      const res = await fetch(`/api/wallet/transactions/?clientId=${clientId}`)
      const data = await res.json()
      if (data.success) setTransactions(data.transactions)
    } catch {
      // silent
    } finally {
      setHistoryLoading(false)
    }
  }

  if (loading) return null

  return (
    <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 overflow-hidden">
      {/* Header */}
      <div className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-tertiary-container flex items-center justify-center">
          <Icon name="account_balance_wallet" className="text-tertiary" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-on-surface">Πορτοφόλι</h3>
          <p className="text-xs text-on-surface-variant">1 πόντος = 1€</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-on-surface">{points}</p>
          <p className="text-xs text-on-surface-variant">πόντοι</p>
        </div>
      </div>

      {/* History toggle */}
      {(points > 0 || transactions.length > 0) && (
        <>
          <button
            onClick={loadTransactions}
            className="w-full px-4 py-3 flex items-center justify-between border-t border-outline-variant/10 hover:bg-surface-container transition-colors"
          >
            <span className="text-xs font-bold text-on-surface-variant">Ιστορικό κινήσεων</span>
            <Icon
              name={showHistory ? 'expand_less' : 'expand_more'}
              size="sm"
              className="text-on-surface-variant"
            />
          </button>

          {showHistory && (
            <div className="border-t border-outline-variant/10">
              {historyLoading && (
                <div className="flex justify-center py-4">
                  <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                </div>
              )}

              {!historyLoading && transactions.length === 0 && (
                <p className="text-xs text-on-surface-variant text-center py-4">
                  Δεν υπάρχουν κινήσεις
                </p>
              )}

              {!historyLoading && transactions.length > 0 && (
                <div className="divide-y divide-outline-variant/10">
                  {transactions.map((tx) => (
                    <div key={tx.transactionId} className="px-4 py-3 flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        tx.type === 'credit' ? 'bg-green-100' : 'bg-red-100'
                      }`}>
                        <Icon
                          name={tx.type === 'credit' ? 'add' : 'remove'}
                          size="sm"
                          className={tx.type === 'credit' ? 'text-green-700' : 'text-red-700'}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-on-surface truncate">
                          {reasonLabels[tx.reason] || tx.reason}
                        </p>
                        <p className="text-xs text-on-surface-variant">
                          {new Date(tx.createdAt).toLocaleDateString('el-GR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric'
                          })}
                        </p>
                      </div>
                      <span className={`text-sm font-bold ${
                        tx.type === 'credit' ? 'text-green-700' : 'text-red-700'
                      }`}>
                        {tx.type === 'credit' ? '+' : '-'}{tx.points}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
