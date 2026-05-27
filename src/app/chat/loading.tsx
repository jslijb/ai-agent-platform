export default function ChatLoading() {
  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <nav className="bg-white shadow-sm px-6 py-3 flex justify-between items-center shrink-0">
        <div className="flex items-center space-x-4">
          <div className="h-6 w-40 bg-gray-200 rounded animate-pulse" />
          <span className="text-gray-400">|</span>
          <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="flex items-center space-x-4">
          <div className="h-4 w-12 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-12 bg-gray-200 rounded animate-pulse" />
        </div>
      </nav>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto text-center mt-20">
          <div className="inline-block w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mb-4" />
          <p className="text-sm text-gray-400">页面加载中...</p>
        </div>
      </div>

      <div className="shrink-0 border-t bg-white px-4 py-4">
        <div className="max-w-3xl mx-auto flex gap-3">
          <div className="flex-1 h-10 bg-gray-100 rounded-lg animate-pulse" />
          <div className="w-20 h-10 bg-gray-200 rounded-lg animate-pulse" />
        </div>
      </div>
    </div>
  );
}
