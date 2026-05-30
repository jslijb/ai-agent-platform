import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/server/db/client";
import { documents } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "未登录" }, { status: 401 });
    }

    const { documentId } = await params;

    const docRows = await db
      .select({
        fileName: documents.fileName,
        fileKey: documents.fileKey,
        rawContent: documents.rawContent,
      })
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    if (!docRows.length) {
      return NextResponse.json({ success: false, message: "文档不存在" }, { status: 404 });
    }

    const doc = docRows[0];
    const uploadDir = process.env.UPLOAD_DIR || "uploads";
    const filePath = path.join(uploadDir, doc.fileKey);

    if (fs.existsSync(filePath)) {
      const fileBuffer = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const contentTypeMap: Record<string, string> = {
        ".pdf": "application/pdf",
        ".txt": "text/plain; charset=utf-8",
        ".md": "text/markdown; charset=utf-8",
        ".csv": "text/csv; charset=utf-8",
      };
      const contentType = contentTypeMap[ext] || "application/octet-stream";
      const fileName = doc.fileName || path.basename(filePath);

      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(fileBuffer.length),
          "Content-Disposition": `inline; filename="${encodeURIComponent(fileName)}"`,
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    if (doc.rawContent) {
      const fileName = doc.fileName || "document.txt";
      return new NextResponse(doc.rawContent, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Length": String(Buffer.byteLength(doc.rawContent, "utf-8")),
          "Content-Disposition": `inline; filename="${encodeURIComponent(fileName)}"`,
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    return NextResponse.json({ success: false, message: "文件内容不可用" }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[文档预览] 文件读取失败:", message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
