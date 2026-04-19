export default function DispoLoading() {
  return (
    <div className="flex h-[calc(100vh-120px)] gap-0 -mx-5 -mb-5 animate-pulse">
      {/* Left panel skeleton */}
      <div className="w-72 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200">
          <div className="h-4 bg-gray-200 rounded w-32 mb-1" />
          <div className="h-3 bg-gray-100 rounded w-20" />
        </div>
        <div className="flex-1 p-3 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-lg" />
          ))}
        </div>
      </div>
      {/* Right panel skeleton */}
      <div className="flex-1 bg-gray-50 flex items-center justify-center">
        <div className="text-sm text-gray-400">Loading dispo workspace…</div>
      </div>
    </div>
  )
}
