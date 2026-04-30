'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2, ListOrdered } from 'lucide-react'
import { CampaignStepCard, type CampaignStep } from './CampaignStepCard'
import { StepEditor } from './StepEditor'

interface Props {
  campaignId: string
  campaignModule: 'LEADS' | 'BUYERS' | 'VENDORS' | 'SOLD'
  steps: CampaignStep[]
}

export function CampaignStepBuilder({ campaignId, campaignModule, steps }: Props) {
  const router = useRouter()
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingStep, setEditingStep] = useState<CampaignStep | null>(null)
  const [reordering, setReordering] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const handleAddNew = useCallback(() => {
    setEditingStep(null)
    setShowAddForm(true)
  }, [])

  const handleEditStep = useCallback((step: CampaignStep) => {
    setShowAddForm(true)
    setEditingStep(step)
  }, [])

  const handleCancelForm = useCallback(() => {
    setShowAddForm(false)
    setEditingStep(null)
  }, [])

  const handleSaved = useCallback(() => {
    setShowAddForm(false)
    setEditingStep(null)
    router.refresh()
  }, [router])

  const handleDelete = useCallback(
    async (stepId: string) => {
      if (!confirm('Delete this step? This cannot be undone.')) return
      setDeletingId(stepId)
      try {
        await fetch(`/api/campaigns/${campaignId}/steps/${stepId}`, {
          method: 'DELETE',
        })
        router.refresh()
      } finally {
        setDeletingId(null)
      }
    },
    [campaignId, router]
  )

  const handleToggleActive = useCallback(
    async (step: CampaignStep) => {
      setTogglingId(step.id)
      try {
        await fetch(`/api/campaigns/${campaignId}/steps/${step.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: !step.isActive }),
        })
        router.refresh()
      } finally {
        setTogglingId(null)
      }
    },
    [campaignId, router]
  )

  const handleMove = useCallback(
    async (index: number, direction: 'up' | 'down') => {
      const newSteps = [...steps]
      const targetIdx = direction === 'up' ? index - 1 : index + 1
      if (targetIdx < 0 || targetIdx >= newSteps.length) return

      ;[newSteps[index], newSteps[targetIdx]] = [newSteps[targetIdx], newSteps[index]]
      const orderedIds = newSteps.map((s) => s.id)

      setReordering(true)
      try {
        await fetch(`/api/campaigns/${campaignId}/steps`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderedIds }),
        })
        router.refresh()
      } finally {
        setReordering(false)
      }
    },
    [campaignId, steps, router]
  )

  return (
    <div className="bg-white border border-gray-200 rounded-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <ListOrdered className="w-4 h-4 text-gray-400" />
          <h3 className="text-[13px] font-semibold text-gray-900">
            Campaign Steps
          </h3>
          <span className="text-[11px] text-gray-400 font-medium">
            ({steps.length} {steps.length === 1 ? 'step' : 'steps'})
          </span>
        </div>
        <button
          onClick={handleAddNew}
          disabled={showAddForm}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Step
        </button>
      </div>

      {/* Reordering indicator */}
      {reordering && (
        <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-2 text-[12px] text-blue-600">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Reordering steps...
        </div>
      )}

      {/* Steps timeline */}
      <div className="p-4">
        {steps.length === 0 && !showAddForm ? (
          <div className="py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <ListOrdered className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-sm text-gray-500 mb-1">No steps yet</p>
            <p className="text-xs text-gray-400 mb-4">
              Add your first step to build the drip campaign sequence.
            </p>
            <button
              onClick={handleAddNew}
              className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-[13px] font-semibold rounded-lg px-4 py-2 hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add First Step
            </button>
          </div>
        ) : (
          <>
            {steps.map((step, idx) => (
              <div key={step.id}>
                <CampaignStepCard
                  step={step}
                  index={idx}
                  totalSteps={steps.length}
                  isFirst={idx === 0}
                  isLast={idx === steps.length - 1 && !showAddForm}
                  isEditing={editingStep?.id === step.id}
                  onEdit={() => handleEditStep(step)}
                  onDelete={() => handleDelete(step.id)}
                  onMoveUp={() => handleMove(idx, 'up')}
                  onMoveDown={() => handleMove(idx, 'down')}
                  onToggleActive={() => handleToggleActive(step)}
                />

                {/* Inline edit form */}
                {editingStep?.id === step.id && showAddForm && (
                  <div className="ml-14 mb-4">
                    <StepEditor
                      campaignId={campaignId}
                      campaignModule={campaignModule}
                      editingStep={editingStep}
                      onSaved={handleSaved}
                      onCancel={handleCancelForm}
                    />
                  </div>
                )}
              </div>
            ))}

            {/* Add new step form / button at the end */}
            {showAddForm && !editingStep ? (
              <div className="relative flex gap-4">
                {/* Timeline connector for the add form */}
                <div className="flex flex-col items-center w-10 flex-shrink-0">
                  {steps.length > 0 && <div className="w-0.5 h-4 bg-gray-200" />}
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-blue-50 border-2 border-blue-200 border-dashed">
                    <Plus className="w-4 h-4 text-blue-500" />
                  </div>
                </div>
                <div className="flex-1 mb-2">
                  <StepEditor
                    campaignId={campaignId}
                    campaignModule={campaignModule}
                    editingStep={null}
                    onSaved={handleSaved}
                    onCancel={handleCancelForm}
                  />
                </div>
              </div>
            ) : !showAddForm && steps.length > 0 ? (
              <div className="relative flex gap-4">
                <div className="flex flex-col items-center w-10 flex-shrink-0">
                  <div className="w-0.5 h-4 bg-gray-200" />
                  <button
                    onClick={handleAddNew}
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border-2 border-dashed border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50 transition-all"
                    title="Add another step"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 flex items-center pt-2">
                  <button
                    onClick={handleAddNew}
                    className="text-[12px] font-medium text-gray-400 hover:text-blue-600 transition-colors"
                  >
                    Add another step...
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
