import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createTeam, addTeamMember, removeTeamMember } from "@/server/agents/memory";
import { db } from "@/server/db/client";
import { teams, teamMembers } from "@/server/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id || "default-user";

    const memberOf = await db
      .select({ teamId: teamMembers.teamId, role: teamMembers.role })
      .from(teamMembers)
      .where(eq(teamMembers.userId, userId));

    const teamIds = memberOf.map((m) => m.teamId);
    if (teamIds.length === 0) {
      return NextResponse.json({ success: true, teams: [] });
    }

    const teamList = await db
      .select()
      .from(teams)
      .where(eq(teams.id, teamIds[0]));

    for (let i = 1; i < teamIds.length; i++) {
      const more = await db
        .select()
        .from(teams)
        .where(eq(teams.id, teamIds[i]));
      teamList.push(...more);
    }

    const result = await Promise.all(
      teamList.map(async (t) => {
        const members = await db
          .select({ userId: teamMembers.userId, role: teamMembers.role })
          .from(teamMembers)
          .where(eq(teamMembers.teamId, t.id));
        return {
          id: t.id,
          name: t.name,
          description: t.description,
          leaderId: t.leaderId,
          createdAt: t.createdAt,
          members,
          myRole: memberOf.find((m) => m.teamId === t.id)?.role || "member",
        };
      })
    );

    return NextResponse.json({ success: true, teams: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[teams] 获取失败:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }

    const body = await request.json();
    const { name, description } = body;

    if (!name) {
      return NextResponse.json({ success: false, error: "团队名称不能为空" }, { status: 400 });
    }

    const teamId = await createTeam(name, session.user.id, description);
    return NextResponse.json({ success: true, teamId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[teams] 创建失败:", message);
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
    const { teamId, userId: targetUserId, action } = body;

    if (!teamId || !targetUserId || !action) {
      return NextResponse.json({ success: false, error: "缺少必要参数" }, { status: 400 });
    }

    if (action === "add") {
      await addTeamMember(teamId, targetUserId);
    } else if (action === "remove") {
      await removeTeamMember(teamId, targetUserId);
    } else {
      return NextResponse.json({ success: false, error: "无效操作" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[teams] 操作失败:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
