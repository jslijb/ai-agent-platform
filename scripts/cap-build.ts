import { readFileSync, writeFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";

const ROOT = process.cwd();
const NEXT_CONFIG_PATH = join(ROOT, "next.config.js");
const OUT_DIR = join(ROOT, "out");

function modifyConfigForExport(): string {
  const original = readFileSync(NEXT_CONFIG_PATH, "utf-8");
  let modified = original.replace(
    "const OUTPUT_MODE = 'standalone'",
    "const OUTPUT_MODE = 'export'"
  );
  if (!modified.includes("OUTPUT_MODE = 'export'")) {
    throw new Error("[cap-build] next.config.js 未找到 OUTPUT_MODE 常量，无法切换 export 模式");
  }
  writeFileSync(NEXT_CONFIG_PATH, modified, "utf-8");
  console.log("[cap-build] next.config.js: OUTPUT_MODE standalone → export");
  return original;
}

function restoreConfig(original: string): void {
  writeFileSync(NEXT_CONFIG_PATH, original, "utf-8");
  console.log("[cap-build] next.config.js: restored to standalone");
}

function run(cmd: string, label: string): boolean {
  console.log(`[cap-build] ${label}: ${cmd}`);
  try {
    execSync(cmd, { stdio: "inherit", cwd: ROOT, timeout: 300000 });
    return true;
  } catch (err) {
    console.error(`[cap-build] ${label} failed: ${err}`);
    return false;
  }
}

function main(): void {
  const platform = process.argv[2] || "web";

  console.log(`[cap-build] Building Capacitor app for: ${platform}`);
  console.log("[cap-build] Note: API routes will be excluded from static export.");
  console.log("[cap-build] The native app will call APIs from the remote server via NEXT_PUBLIC_API_URL.");

  const originalConfig = modifyConfigForExport();

  try {
    const buildOk = run("npx next build", "Next.js static export");

    if (!buildOk || !existsSync(OUT_DIR)) {
      console.error("[cap-build] Static export failed. This is expected if pages use server-side features.");
      console.error("[cap-build] Fix: Ensure all pages use 'use client' or generateStaticParams.");
      console.error("[cap-build] API routes are automatically excluded from export.");
      process.exit(1);
    }

    if (platform === "android" || platform === "ios") {
      if (!existsSync(join(ROOT, platform))) {
        run(`npx cap add ${platform}`, `Add ${platform} platform`);
      }
      run("npx cap sync", "Capacitor sync");
      run(`npx cap open ${platform}`, `Open ${platform} in IDE`);
    } else {
      console.log("[cap-build] Web build complete. Output in 'out/' directory.");
      console.log("[cap-build] To build for Android: npx tsx scripts/cap-build.ts android");
      console.log("[cap-build] To build for iOS: npx tsx scripts/cap-build.ts ios");
    }
  } finally {
    restoreConfig(originalConfig);
  }

  console.log("[cap-build] Done!");
}

main();