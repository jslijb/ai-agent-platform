import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const REPORTS_DIR = path.join(process.cwd(), "data", "financial_reports");

interface ReportFile {
  name: string;
  path: string;
  size: number;
  modifiedAt: string;
  category: string;
}

function scanDirectory(dir: string, category: string): ReportFile[] {
  if (!fs.existsSync(dir)) return [];

  const files: ReportFile[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...scanDirectory(fullPath, entry.name));
    } else if (entry.name.endsWith(".pdf")) {
      const stat = fs.statSync(fullPath);
      files.push({
        name: entry.name,
        path: fullPath.replace(/\\/g, "/"),
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        category: category || "其他",
      });
    }
  }

  return files;
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "未登录" }, { status: 401 });
    }

    const files = scanDirectory(REPORTS_DIR, "");
    const categories: Record<string, number> = {};
    for (const f of files) {
      categories[f.category] = (categories[f.category] || 0) + 1;
    }

    return NextResponse.json({
      success: true,
      totalFiles: files.length,
      categories,
      files: files.slice(0, 500),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[财报扫描] 失败:", message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
