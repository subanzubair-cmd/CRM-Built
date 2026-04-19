import { FileText } from 'lucide-react'

export function DocumentsEmptyState() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-12 flex flex-col items-center justify-center text-center">
      <FileText className="w-10 h-10 text-gray-200 mb-3" />
      <p className="text-sm font-medium text-gray-500">No documents yet</p>
      <p className="text-xs text-gray-400 mt-1">Document upload coming soon</p>
    </div>
  )
}
