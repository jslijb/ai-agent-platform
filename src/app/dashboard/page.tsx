import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import SignOutButton from "./SignOutButton";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const cards = [
    {
      title: "仪表板",
      desc: "查看您的数据分析",
      icon: "📊",
      color: "blue",
      href: "/dashboard/evaluation",
    },
    {
      title: "Agent",
      desc: "管理您的 AI Agent",
      icon: "🤖",
      color: "green",
      href: "/chat",
    },
    {
      title: "文档",
      desc: "管理您的文档",
      icon: "📁",
      color: "purple",
      href: "/dashboard/documents",
    },
    {
      title: "Agent 日志",
      desc: "查看对话日志和执行详情",
      icon: "📋",
      color: "amber",
      href: "/dashboard/logs",
    },
    {
      title: "Token 用量",
      desc: "查看各模型 Token 消耗",
      icon: "💰",
      color: "teal",
      href: "/dashboard/token-usage",
    },
  ];

  const colorMap: Record<string, string> = {
    blue: "hover:border-blue-400 hover:shadow-blue-100",
    green: "hover:border-green-400 hover:shadow-green-100",
    purple: "hover:border-purple-400 hover:shadow-purple-100",
    amber: "hover:border-amber-400 hover:shadow-amber-100",
    teal: "hover:border-teal-400 hover:shadow-teal-100",
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/" className="text-xl font-bold text-gray-800 hover:text-gray-600">
                AI Agent Platform
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-600">欢迎, {session.user.name}</span>
              <SignOutButton />
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
          {cards.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className={`bg-white rounded-lg shadow-md p-6 border-2 border-transparent transition-all duration-200 cursor-pointer hover:scale-[1.02] ${colorMap[card.color]}`}
            >
              <div className="text-3xl">{card.icon}</div>
              <h3 className="mt-2 text-lg font-medium text-gray-800">{card.title}</h3>
              <p className="text-gray-500 text-sm">{card.desc}</p>
            </Link>
          ))}
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
