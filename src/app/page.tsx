"use client";

import { trpcReact } from "@/lib/trpc/Provider";

function GreetingDisplay() {
  const { data, isLoading, error } = trpcReact.user.greeting.useQuery({
    name: "AI Agent",
  });

  if (isLoading) return <p className="text-gray-400">Loading tRPC...</p>;
  if (error) return <p className="text-red-500">tRPC Error: {error.message}</p>;

  return (
    <div className="mt-6 px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
      <p className="text-green-700 font-mono">{data}</p>
    </div>
  );
}

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-4">AI Agent Platform</h1>
      <p className="text-lg text-gray-600">
        Built with Next.js 14, TypeScript, Tailwind CSS, tRPC, Prisma & NextAuth
      </p>
      <GreetingDisplay />
    </main>
  );
}
