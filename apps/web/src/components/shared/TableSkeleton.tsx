export function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden animate-pulse">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-100">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3 bg-gray-200 rounded flex-1" style={{ maxWidth: i === 0 ? 200 : 120 }} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-gray-50">
          <div className="h-3.5 bg-gray-100 rounded w-48" />
          <div className="h-3 bg-gray-100 rounded w-28" />
          <div className="h-5 bg-gray-100 rounded-full w-20" />
          <div className="h-3 bg-gray-100 rounded w-24" />
          <div className="h-3 bg-gray-100 rounded w-16 ml-auto" />
        </div>
      ))}
    </div>
  )
}

export function FilterBarSkeleton() {
  return (
    <div className="flex items-center gap-3 animate-pulse mb-4">
      <div className="h-8 bg-gray-200 rounded-lg w-64" />
      <div className="h-8 bg-gray-200 rounded-lg w-32" />
      <div className="h-8 bg-gray-200 rounded-lg w-32" />
      <div className="h-8 bg-gray-200 rounded-lg w-20 ml-auto" />
    </div>
  )
}

export function StatCardSkeleton() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse">
      <div className="h-3 bg-gray-200 rounded w-24 mb-3" />
      <div className="h-8 bg-gray-200 rounded w-16" />
    </div>
  )
}

export function DetailPageSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-5 py-4 mb-5">
        <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
        <div className="flex items-center justify-between">
          <div>
            <div className="h-6 bg-gray-200 rounded w-64 mb-2" />
            <div className="h-3 bg-gray-100 rounded w-40" />
          </div>
          <div className="flex gap-2">
            <div className="h-8 bg-gray-200 rounded-lg w-28" />
            <div className="h-8 bg-gray-200 rounded-lg w-28" />
          </div>
        </div>
      </div>
      {/* Tabs */}
      <div className="flex gap-6 px-5 mb-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-4 bg-gray-200 rounded w-16" />
        ))}
      </div>
      {/* Content */}
      <div className="px-5 grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <div className="h-48 bg-gray-100 rounded-xl" />
          <div className="h-32 bg-gray-100 rounded-xl" />
        </div>
        <div className="space-y-4">
          <div className="h-40 bg-gray-100 rounded-xl" />
          <div className="h-28 bg-gray-100 rounded-xl" />
        </div>
      </div>
    </div>
  )
}
