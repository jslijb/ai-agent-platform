import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import SignOutButton from "./SignOutButton";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const isAdmin = session.user.role === "admin";

  const adminCards = [
    {
      title: "智能对话",
      desc: "RAG 问答、量化分析、合规检查",
      icon: "🤖",
      color: "blue",
      href: "/chat",
    },
    {
      title: "文档管理",
      desc: "上传、解析、切片、预览",
      icon: "📁",
      color: "green",
      href: "/dashboard/documents",
    },
    {
      title: "RAG 评估",
      desc: "检索质量与答案评估",
      icon: "📊",
      color: "amber",
      href: "/dashboard/evaluation",
    },
    {
      title: "Agent 评估",
      desc: "Agent 性能指标监控",
      icon: "🤖",
      color: "indigo",
      href: "/dashboard/agent-evaluation",
    },
    {
      title: "Agent 日志",
      desc: "对话日志与执行详情",
      icon: "📋",
      color: "purple",
      href: "/dashboard/logs",
    },
  ];

  const userCards = [
    {
      title: "Token 用量",
      desc: "模型消耗统计",
      icon: "💰",
      color: "teal",
      href: "/dashboard/token-usage",
    },
    {
      title: "记忆管理",
      desc: "用户画像、记忆片段、团队",
      icon: "🧠",
      color: "rose",
      href: "/dashboard/memories",
    },
  ];

  const userCards = [
    {
      title: "智能对话",
      desc: "RAG 问答、量化分析",
      icon: "🤖",
      color: "blue",
      href: "/chat",
    },
    {
      title: "文档管理",
      desc: "上传、解析、预览",
      icon: "📁",
      color: "green",
      href: "/dashboard/documents",
    },
    {
      title: "Token 用量",
      desc: "查看各模型 Token 消耗",
      icon: "💰",
      color: "teal",
      href: "/dashboard/token-usage",
    },
    {
      title: "记忆管理",
      desc: "用户画像、记忆片段",
      icon: "🧠",
      color: "rose",
      href: "/dashboard/memories",
    },
  ];

  const cards = isAdmin ? [...adminCards, ...userCards] : userCards;

  const colorMap: Record<string, string> = {
    blue: "hover:border-blue-400 hover:shadow-blue-100",
    green: "hover:border-green-400 hover:shadow-green-100",
    purple: "hover:border-purple-400 hover:shadow-purple-100",
    amber: "hover:border-amber-400 hover:shadow-amber-100",
    indigo: "hover:border-indigo-400 hover:shadow-indigo-100",
    teal: "hover:border-teal-400 hover:shadow-teal-100",
    rose: "hover:border-rose-400 hover:shadow-rose-100",
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
              <Link href="/chat" className="text-gray-600 hover:text-gray-900 text-sm">
                智能对话
              </Link>
              <Link href="/dashboard/documents" className="text-gray-600 hover:text-gray-900 text-sm">
                文档管理
              </Link>
              <Link href="/dashboard/evaluation" className="text-gray-600 hover:text-gray-900 text-sm">
                RAG 评估
              </Link>
              <Link href="/dashboard/agent-evaluation" className="text-gray-600 hover:text-gray-900 text-sm">
                Agent 评估
              </Link>
              <Link href="/dashboard/logs" className="text-gray-600 hover:text-gray-900 text-sm">
                Agent 日志
              </Link>
              <Link href="/dashboard/token-usage" className="text-gray-600 hover:text-gray-900 text-sm">
                Token 用量
              </Link>
              <span className="text-gray-400">|</span>
              <span className="text-gray-600 text-sm">欢迎, {session.user.name}</span>
              <SignOutButton />
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6">
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
