import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listConversations, getConversationHistory, updateConversationTitle, deleteConversation } from "@/server/agents/memory";

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

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }

    const body = await request.json();
    const { conversationId, title } = body;

    if (!conversationId || !title) {
      return NextResponse.json({ success: false, error: "缺少 conversationId 或 title" }, { status: 400 });
    }

    await updateConversationTitle(conversationId, title);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[conversations] 更新标题失败:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }

    const url = new URL(request.url);
    const conversationId = url.searchParams.get("conversationId");

    if (!conversationId) {
      return NextResponse.json({ success: false, error: "缺少 conversationId" }, { status: 400 });
    }

    await deleteConversation(conversationId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[conversations] 删除失败:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
