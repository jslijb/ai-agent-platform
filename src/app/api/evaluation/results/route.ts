import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

const REPORT_DIR = path.resolve(process.cwd(), "evaluation-reports");

export async function GET() {
  console.log("[evaluation-results] 获取评估结果");

  try {
    if (!fs.existsSync(REPORT_DIR)) {
      console.log("[evaluation-results] 报告目录不存在，返回空结果");
      return NextResponse.json({
        success: true,
        reports: [],
        latest: null,
      });
    }

    const files = fs.readdirSync(REPORT_DIR);
    const reportFiles = files
      .filter((f) => f.startsWith("eval-report-") && f.endsWith(".json"))
      .sort()
      .reverse();

    console.log(
      `[evaluation-results] 找到 ${reportFiles.length} 个评估报告`
    );

    const reports: Array<{
      filename: string;
      timestamp: string;
      totalTests: number;
      overallScore: number;
      avgHitsAtK: number;
      avgFaithfulness: number;
      avgAnswerRelevance: number;
      avgContextRelevance: number;
      avgContextRecall: number;
    }> = [];

    for (const file of reportFiles.slice(0, 10)) {
      try {
        const filePath = path.join(REPORT_DIR, file);
        const content = fs.readFileSync(filePath, "utf-8");
        const report = JSON.parse(content);

        reports.push({
          filename: file,
          timestamp: report.timestamp,
          totalTests: report.totalTests,
          overallScore: report.overallScore,
          avgHitsAtK: report.avgHitsAtK,
          avgFaithfulness: report.avgFaithfulness,
          avgAnswerRelevance: report.avgAnswerRelevance,
          avgContextRelevance: report.avgContextRelevance,
          avgContextRecall: report.avgContextRecall,
        });
      } catch (parseError) {
        console.error(
          `[evaluation-results] 解析报告文件失败: ${file}`,
          parseError
        );
      }
    }

    let latestReport = null;
    const latestPath = path.join(REPORT_DIR, "latest.json");
    if (fs.existsSync(latestPath)) {
      try {
        const latestContent = fs.readFileSync(latestPath, "utf-8");
        latestReport = JSON.parse(latestContent);
        console.log("[evaluation-results] 最新报告加载成功");
      } catch (parseError) {
        console.error(
          "[evaluation-results] 解析最新报告失败:",
          parseError
        );
      }
    }

    console.log(
      `[evaluation-results] 返回 ${reports.length} 个报告摘要`
    );

    return NextResponse.json({
      success: true,
      reports,
      latest: latestReport,
    });
  } catch (error) {
    console.error("[evaluation-results] 获取评估结果失败:", error);
    return NextResponse.json(
      { success: false, message: "获取评估结果失败" },
      { status: 500 }
    );
  }
}
