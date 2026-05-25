import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import SignOutButton from "./SignOutButton";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <span className="text-xl font-bold text-gray-800">AI Agent Platform</span>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-600">欢迎, {session.user.name}</span>
              <SignOutButton />
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="text-3xl font-bold text-blue-600">📊</div>
            <h3 className="mt-2 text-lg font-medium text-gray-800">仪表板</h3>
            <p className="text-gray-500 text-sm">查看您的数据分析</p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="text-3xl font-bold text-green-600">🤖</div>
            <h3 className="mt-2 text-lg font-medium text-gray-800">Agent</h3>
            <p className="text-gray-500 text-sm">管理您的 AI Agent</p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="text-3xl font-bold text-purple-600">📁</div>
            <h3 className="mt-2 text-lg font-medium text-gray-800">文档</h3>
            <p className="text-gray-500 text-sm">管理您的文档</p>
          </div>
        </div>

        <div className="mt-8 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">个人信息</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-gray-600">用户名</span>
              <span className="font-medium">{session.user.name}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-gray-600">邮箱</span>
              <span className="font-medium">{session.user.email}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-gray-600">用户ID</span>
              <span className="font-medium text-sm text-gray-500">{session.user.id}</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
