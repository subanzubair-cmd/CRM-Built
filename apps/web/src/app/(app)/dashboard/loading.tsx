export default function Loading() {
  return (
    <div className="animate-pulse">
      {/* Header */}
      <div className="h-6 bg-gray-200 rounded w-36 mb-1" />
      <div className="h-3 bg-gray-100 rounded w-48 mb-5" />

      {/* Row 1: 4 Primary KPI Cards */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-white border border-gray-200 rounded-xl p-4 border-l-4 border-l-gray-200"
          >
            <div className="h-2.5 bg-gray-100 rounded w-24 mb-3" />
            <div className="h-8 bg-gray-200 rounded w-12 mb-2" />
            <div className="h-3 bg-gray-100 rounded w-28" />
          </div>
        ))}
      </div>

      {/* Row 2: 3 Secondary KPI Cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="bg-white border border-gray-200 rounded-xl p-4"
          >
            <div className="h-2.5 bg-gray-100 rounded w-20 mb-3" />
            <div className="h-7 bg-gray-200 rounded w-10" />
          </div>
        ))}
      </div>

      {/* Row 3: 3 Needs Attention alert cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="h-4 bg-red-100 rounded w-32 mb-2" />
          <div className="h-7 bg-red-100 rounded w-10 mb-2" />
          <div className="h-3 bg-red-100 rounded w-28" />
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="h-4 bg-amber-100 rounded w-28 mb-2" />
          <div className="h-7 bg-amber-100 rounded w-10 mb-2" />
          <div className="h-3 bg-amber-100 rounded w-24" />
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="h-4 bg-blue-100 rounded w-30 mb-2" />
          <div className="h-7 bg-blue-100 rounded w-10 mb-2" />
          <div className="h-3 bg-blue-100 rounded w-26" />
        </div>
      </div>

      {/* Row 4: 2 Charts */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* Conversion Trend skeleton */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="h-4 bg-gray-100 rounded w-40 mb-3" />
          <div className="flex items-end gap-2 h-28">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex-1">
                <div
                  className="w-full bg-gray-100 rounded-t"
                  style={{
                    height: `${20 + Math.random() * 60}%`,
                  }}
                />
              </div>
            ))}
          </div>
        </div>
        {/* Top Sources skeleton */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="h-4 bg-gray-100 rounded w-32 mb-3" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i}>
                <div className="flex justify-between mb-1">
                  <div className="h-3 bg-gray-100 rounded w-20" />
                  <div className="h-3 bg-gray-100 rounded w-12" />
                </div>
                <div className="h-2 bg-gray-100 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 5: Abandoned Leads + Stats (3fr 2fr) */}
      <div
        className="grid gap-3 mb-4"
        style={{ gridTemplateColumns: '3fr 2fr' }}
      >
        {/* Abandoned table skeleton */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="h-4 bg-gray-100 rounded w-32 mb-3" />
          <div className="space-y-2">
            {/* Header row */}
            <div className="flex gap-4 pb-2 border-b border-gray-100">
              <div className="h-3 bg-gray-100 rounded w-20" />
              <div className="h-3 bg-gray-100 rounded w-14 ml-auto" />
              <div className="h-3 bg-gray-100 rounded w-14" />
              <div className="h-3 bg-gray-100 rounded w-14" />
            </div>
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex gap-4 py-1.5">
                <div className="h-3 bg-gray-100 rounded w-24" />
                <div className="h-3 bg-gray-100 rounded w-8 ml-auto" />
                <div className="h-3 bg-gray-100 rounded w-8" />
                <div className="h-3 bg-gray-100 rounded w-8" />
              </div>
            ))}
          </div>
        </div>

        {/* Call Stats + Goals skeleton */}
        <div className="flex flex-col gap-3">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="h-4 bg-gray-100 rounded w-32 mb-3" />
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="text-center">
                  <div className="h-6 bg-gray-200 rounded w-10 mx-auto mb-1" />
                  <div className="h-2.5 bg-gray-100 rounded w-14 mx-auto" />
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex-1">
            <div className="h-4 bg-gray-100 rounded w-28 mb-3" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i}>
                  <div className="flex justify-between mb-1">
                    <div className="h-3 bg-gray-100 rounded w-16" />
                    <div className="h-3 bg-gray-100 rounded w-20" />
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Row 6: Tasks Due Today */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="h-4 bg-gray-100 rounded w-28" />
          <div className="h-3 bg-gray-100 rounded w-24" />
        </div>
        <div className="divide-y divide-gray-100">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-2.5">
              <div className="min-w-0 flex-1">
                <div className="h-4 bg-gray-100 rounded w-48 mb-1" />
                <div className="h-3 bg-gray-50 rounded w-32" />
              </div>
              <div className="h-3 bg-gray-100 rounded w-14 ml-3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
