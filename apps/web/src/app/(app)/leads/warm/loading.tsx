import { FilterBarSkeleton, TableSkeleton } from '@/components/shared/TableSkeleton'

export default function Loading() {
  return (
    <div className="p-5">
      <div className="h-6 bg-gray-200 rounded w-48 mb-1 animate-pulse" />
      <div className="h-3 bg-gray-100 rounded w-64 mb-4 animate-pulse" />
      <FilterBarSkeleton />
      <TableSkeleton rows={10} />
    </div>
  )
}
