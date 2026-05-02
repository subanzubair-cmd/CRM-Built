'use client'

import { Zap } from 'lucide-react'

interface Props {
  campaignName: string
  enrollmentId: string
  onKeepRunning: () => void
  onStopDrip: () => void
}

export function DripContinuationModal({ campaignName, onKeepRunning, onStopDrip }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onKeepRunning} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-50">
            <Zap className="w-4 h-4 text-amber-500" />
          </div>
          <h2 className="text-base font-semibold text-gray-900">Active Drip Running</h2>
        </div>

        {/* Body */}
        <p className="text-sm text-gray-600 mb-1">
          This lead has an active drip sequence:{' '}
          <span className="font-semibold text-gray-900">{campaignName}</span>
        </p>
        <p className="text-sm text-gray-500 mb-6">What would you like to do?</p>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <button
            onClick={onKeepRunning}
            className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Keep Running
          </button>
          <button
            onClick={onStopDrip}
            className="w-full px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
          >
            Stop Drip
          </button>
        </div>
      </div>
    </div>
  )
}
