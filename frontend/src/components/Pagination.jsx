export default function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-center gap-1 mt-6">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50 transition-colors"
      >
        上一页
      </button>
      {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
        let pageNum
        if (totalPages <= 7) {
          pageNum = i + 1
        } else if (page <= 4) {
          pageNum = i + 1
        } else if (page >= totalPages - 3) {
          pageNum = totalPages - 6 + i
        } else {
          pageNum = page - 3 + i
        }
        return (
          <button
            key={pageNum}
            onClick={() => onPageChange(pageNum)}
            className={`w-9 h-9 text-sm rounded-lg transition-colors ${
              pageNum === page
                ? 'bg-indigo-600 text-white'
                : 'border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {pageNum}
          </button>
        )
      })}
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50 transition-colors"
      >
        下一页
      </button>
    </div>
  )
}
