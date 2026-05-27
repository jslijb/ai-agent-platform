import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listConversations, getConversationHistory } from "@/server/agents/memory";

export async function GET(request: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id || "default-user";

    const url = new URL(request.url);
    const conversationId = url.searchParams.get("conversationId");

    if (conversationId) {
      const history = await getConversationHistory(conversationId);
      if (!history) {
        return NextResponse.json({ success: false, error: "会话不存在" }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        conversation: {
          id: history.id,
          title: history.title,
          messages: history.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt,
          })),
        },
      });
    }

    const conversations = await listConversations(userId);
    return NextResponse.json({
      success: true,
      conversations: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        createdAt: c.createdAt,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[conversations] 获取失败:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
