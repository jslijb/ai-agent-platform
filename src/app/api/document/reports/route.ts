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
      const relativePath = path.relative(REPORTS_DIR, fullPath).replace(/\\/g, "/");
      files.push({
        name: entry.name,
        path: relativePath,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        category: category || "其他",
      });
    }
  }

  return files;
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "未登录" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));
    const search = searchParams.get("search") || "";
    const category = searchParams.get("category") || "all";

    const allFiles = scanDirectory(REPORTS_DIR, "");

    const categories: Record<string, number> = {};
    for (const f of allFiles) {
      categories[f.category] = (categories[f.category] || 0) + 1;
    }

    let filtered = allFiles;
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((f) => f.name.toLowerCase().includes(q));
    }
    if (category !== "all") {
      filtered = filtered.filter((f) => f.category === category);
    }

    filtered.sort((a, b) => a.name.localeCompare(b.name));

    const total = filtered.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const paged = filtered.slice(start, start + pageSize);

    return NextResponse.json({
      success: true,
      totalFiles: allFiles.length,
      filteredTotal: total,
      page,
      pageSize,
      totalPages,
      categories,
      files: paged,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[财报扫描] 失败:", message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
