import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const REPORTS_DIR = path.join(process.cwd(), "data", "financial_reports");

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filePath: string[] }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "未登录" }, { status: 401 });
    }

    const { filePath } = await params;
    const relativePath = filePath.join("/");

    const fullPath = path.join(REPORTS_DIR, relativePath);

    const resolved = path.resolve(fullPath);
    const resolvedReports = path.resolve(REPORTS_DIR);
    if (!resolved.startsWith(resolvedReports)) {
      return NextResponse.json({ success: false, message: "非法路径" }, { status: 403 });
    }

    if (!fs.existsSync(resolved)) {
      return NextResponse.json({ success: false, message: "文件不存在" }, { status: 404 });
    }

    const stat = fs.statSync(resolved);
    if (!stat.isFile()) {
      return NextResponse.json({ success: false, message: "不是文件" }, { status: 400 });
    }

    const fileBuffer = fs.readFileSync(resolved);

    const ext = path.extname(resolved).toLowerCase();
    const contentTypeMap: Record<string, string> = {
      ".pdf": "application/pdf",
      ".txt": "text/plain; charset=utf-8",
      ".md": "text/markdown; charset=utf-8",
      ".csv": "text/csv; charset=utf-8",
    };
    const contentType = contentTypeMap[ext] || "application/octet-stream";

    const fileName = path.basename(resolved);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(fileBuffer.length),
        "Content-Disposition": `inline; filename="${encodeURIComponent(fileName)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[PDF预览] 文件读取失败:", message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
