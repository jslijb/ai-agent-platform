# 调研6：文档管理执行机制（解决"空架子"问题）

> 调研日期：2026-08-12
> 用户原话："我一直觉得我们的文档管理是个空架子，只有文档，没有执行"
> 目标：把"写在 spec.md 里的门禁文字"变成"可执行、可检查、可强制"的机制

---

## 一、现状诊断：空架子的 5 个具体表现

### 1.1 文档重复，不知道哪个是"真"的

| 文档 | 出现位置（重复副本） |
|------|---------------------|
| spec.md | `docs/spec.md` + `docs/3-standards/spec.md` |
| design.md | `docs/design.md` + `docs/3-standards/design.md` |
| task.md | `docs/task.md` + `docs/3-standards/task.md` |
| REQUIREMENTS.md | `docs/REQUIREMENTS.md` + `docs/1-requirements-bugs/REQUIREMENTS.md` |
| PROJECT_STATE.md | `docs/PROJECT_STATE.md` + `docs/2-tech-interview/PROJECT_STATE.md` |
| FUNCTIONS.md | `docs/FUNCTIONS.md` + `docs/2-tech-interview/FUNCTIONS.md` |
| UPGRADE_ROADMAP.md | `docs/UPGRADE_ROADMAP.md` + `docs/2-tech-interview/UPGRADE_ROADMAP.md` |
| improvement-plan.md | `docs/improvement-plan.md` + `docs/1-requirements-bugs/improvement-plan.md` |
| pitfalls/ | `docs/pitfalls/` + `docs/1-requirements-bugs/`（混放） |

**后果**：改了一个忘了改另一个 → 文档分叉 → 谁都不知道哪个对 → 不信文档 → 空架子。

### 1.2 门禁是文字，不是命令

spec.md 3.1 写了"改代码前跑回归测试"，但：
- 没有 git hook 强制
- 没有 CI 检查
- 没有"没跑测试就 commit 不了"的硬约束
- 结果：门禁靠人自觉，等于没门禁

### 1.3 checklists/ 不知道有没有人在用

`docs/checklists/` 有 3 个清单，但没有"每次改代码前必须勾选"的机制。

### 1.4 ADR/pitfalls 写了但没人回头查

ADR-001~011 写了，但下次决策时没人翻；pitfalls 写了，但下次踩同样的坑。

### 1.5 文档新鲜度无度量

PROJECT_STATE.md "最后更新：2026-08-03"，但今天 8-12，9 天没更新，没人管。

---

## 二、根因分析

| 根因 | 表现 | 解决方向 |
|------|------|---------|
| **无单一真相源（SSOT）** | 文档重复 4 份 | 去重，明确唯一源 |
| **门禁无强制** | 文字门禁靠自觉 | git hook + CI 自动化 |
| **无新鲜度度量** | 过时文档没人管 | 健康度脚本定期跑 |
| **无闭环** | 写了不查、查了不用 | 决策必读 ADR、改码必读 pitfalls |
| **无执行清单** | 门禁不可执行 | 变成可跑的命令 |

---

## 三、解决方案：4 机制 + 1 脚本

### 机制1：单一真相源（SSOT）去重

**原则**：每个文档只有一个"真"位置，其他全删。

| 文档 | 唯一源 | 删除 |
|------|--------|------|
| spec.md | `docs/3-standards/spec.md` | `docs/spec.md` |
| design.md | `docs/3-standards/design.md` | `docs/design.md` |
| task.md | `docs/3-standards/task.md` | `docs/task.md` |
| REQUIREMENTS.md | `docs/1-requirements-bugs/REQUIREMENTS.md` | `docs/REQUIREMENTS.md` |
| PROJECT_STATE.md | `docs/2-tech-interview/PROJECT_STATE.md` | `docs/PROJECT_STATE.md` |
| FUNCTIONS.md | `docs/2-tech-interview/FUNCTIONS.md` | `docs/FUNCTIONS.md` |
| UPGRADE_ROADMAP.md | `docs/2-tech-interview/UPGRADE_ROADMAP.md` | `docs/UPGRADE_ROADMAP.md` |
| improvement-plan.md | `docs/1-requirements-bugs/improvement-plan.md` | `docs/improvement-plan.md` |
| pitfalls | `docs/pitfalls/` | `docs/1-requirements-bugs/` 中的 pitfalls 副本 |

**目录职责重新明确**：

```
docs/
├── 1-requirements-bugs/   # 需求池 + 踩坑归档（REQUIREMENTS.md + 按日期踩坑）
├── 2-tech-interview/       # 技术全景 + 面试准备（PROJECT_STATE + FUNCTIONS + UPGRADE_ROADMAP）
├── 3-standards/            # SDD 三层 + 规范（spec + design + task + checklists + versions）
├── adr/                    # 架构决策记录（唯一）
├── pitfalls/               # 踩坑归档（唯一，只追加）
├── checklists/             # 可执行检查清单（唯一）
├── v3.0-research/          # V3.0 调研（本次）
├── reference/              # 方法论/参考
├── archive/                # 历史快照
└── api/                    # API 文档
```

### 机制2：git pre-commit hook 自动化门禁

创建 `.githooks/pre-commit`（或用 husky），在 commit 前检查：

| 检查项 | 命令 | 失败动作 |
|--------|------|---------|
| 改了 src/ 必须更新 FUNCTIONS.md | `git diff --name-only \| grep src/` 且未改 FUNCTIONS.md | 警告（可强制 error） |
| 改了架构必须新增 ADR | 改了 design.md 或 docker-compose.yml 且无新 ADR | 警告 |
| 文档不能有"TODO 文档"残留 | grep "TODO.*文档" docs/ | error |
| spec.md 不能有冲突标记 | grep "<<<<<<" docs/3-standards/spec.md | error |

### 机制3：文档健康度评分脚本

创建 `scripts/doc-health-check.ts`（或 .py），定期跑（CI weekly 或手动）：

| 指标 | 检查 | 阈值 |
|------|------|------|
| 新鲜度 | PROJECT_STATE.md 最后更新 ≤7 天 | >7 天扣分 |
| 重复度 | 同名文件出现在多个目录 | >0 扣分 |
| 孤洞 | spec.md 引用的文档是否存在 | 不存在扣分 |
| ADR 连续性 | ADR 编号是否连续 | 缺号扣分 |
| pitfalls 引用 | pitfalls 是否被 checklists 引用 | 未引用扣分 |
| REQUIREMENTS 状态 | 待办项是否有 stale（>30 天无进展） | stale 扣分 |

输出：`docs/health-report.json` + 控制台评分（A/B/C/D）。

### 机制4：执行清单（门禁变命令）

把 spec.md 3.1 的"代码改动门禁"变成可执行命令：

```bash
# 改代码前必跑（spec.md 3.1 门禁1）
npm run test:baseline  # 记录基线

# 改代码后必跑（门禁3）
npm run test:regression  # 红了必须先恢复

# 改架构必跑（门禁2）
npm run check:impact  # Grep 目标文件被谁引用

# 提交前必跑（综合）
npm run precommit  # = lint + typecheck + test + doc-health
```

---

## 四、落地脚本（可立即执行）

### 4.1 文档去重脚本

```powershell
# scripts/dedup-docs.ps1
# 删除重复文档，保留唯一源
$dupes = @(
    @{keep="docs\3-standards\spec.md";         drop="docs\spec.md"},
    @{keep="docs\3-standards\design.md";       drop="docs\design.md"},
    @{keep="docs\3-standards\task.md";         drop="docs\task.md"},
    @{keep="docs\1-requirements-bugs\REQUIREMENTS.md"; drop="docs\REQUIREMENTS.md"},
    @{keep="docs\2-tech-interview\PROJECT_STATE.md";   drop="docs\PROJECT_STATE.md"},
    @{keep="docs\2-tech-interview\FUNCTIONS.md";       drop="docs\FUNCTIONS.md"},
    @{keep="docs\2-tech-interview\UPGRADE_ROADMAP.md"; drop="docs\UPGRADE_ROADMAP.md"},
    @{keep="docs\1-requirements-bugs\improvement-plan.md"; drop="docs\improvement-plan.md"}
)
foreach ($d in $dupes) {
    if (Test-Path $d.drop) {
        # 先比对内容
        $keepHash = (Get-FileHash $d.keep).Hash
        $dropHash = (Get-FileHash $d.drop).Hash
        if ($keepHash -eq $dropHash) {
            Remove-Item $d.drop
            Write-Host "删除（内容相同）: $($d.drop)"
        } else {
            Write-Host "⚠️ 内容不同，需人工合并: $($d.drop) vs $($d.keep)"
        }
    }
}
```

### 4.2 文档健康度检查脚本

```typescript
// scripts/doc-health-check.ts
import { glob } from 'glob';
import { readFileSync, statSync } from 'fs';
import { join } from 'path';

interface HealthIssue {
  level: 'error' | 'warn';
  rule: string;
  detail: string;
}

const issues: HealthIssue[] = [];
const now = Date.now();
const DAY = 86400000;

// 1. 新鲜度：PROJECT_STATE.md ≤7 天
const statePath = 'docs/2-tech-interview/PROJECT_STATE.md';
const stateMtime = statSync(statePath).mtimeMs;
if ((now - stateMtime) / DAY > 7) {
  issues.push({ level: 'warn', rule: 'freshness', detail: `PROJECT_STATE.md ${(Math.round((now-stateMtime)/DAY))} 天未更新` });
}

// 2. 重复度：同名文件不能出现在多个目录
const dupes = [
  ['docs/spec.md', 'docs/3-standards/spec.md'],
  ['docs/design.md', 'docs/3-standards/design.md'],
  ['docs/task.md', 'docs/3-standards/task.md'],
  ['docs/REQUIREMENTS.md', 'docs/1-requirements-bugs/REQUIREMENTS.md'],
  ['docs/PROJECT_STATE.md', 'docs/2-tech-interview/PROJECT_STATE.md'],
];
for (const [a, b] of dupes) {
  try {
    readFileSync(a); readFileSync(b);
    issues.push({ level: 'error', rule: 'duplication', detail: `${a} 与 ${b} 重复` });
  } catch {}
}

// 3. ADR 连续性
const adrFiles = await glob('docs/adr/*.md');
const adrNums = adrFiles.map(f => parseInt(f.match(/(\d+)/)?.[1] || '0')).sort((a,b)=>a-b);
for (let i = 1; i <= Math.max(...adrNums); i++) {
  if (!adrNums.includes(i)) {
    issues.push({ level: 'warn', rule: 'adr-gap', detail: `ADR-${String(i).padStart(3,'0')} 缺失` });
  }
}

// 输出
const errors = issues.filter(i => i.level === 'error');
const warns = issues.filter(i => i.level === 'warn');
console.log(`文档健康度: ${errors.length === 0 ? (warns.length === 0 ? 'A' : 'B') : 'D'}`);
console.log(`Errors: ${errors.length}, Warns: ${warns.length}`);
issues.forEach(i => console.log(`[${i.level}] ${i.rule}: ${i.detail}`));
process.exit(errors.length > 0 ? 1 : 0);
```

### 4.3 pre-commit hook

```bash
# .githooks/pre-commit
#!/bin/sh
echo "=== 文档门禁检查 ==="

# 1. 改了 src/ 必须更新 FUNCTIONS.md
if git diff --cached --name-only | grep -q "^src/"; then
  if ! git diff --cached --name-only | grep -q "FUNCTIONS.md"; then
    echo "⚠️ 改了 src/ 但没更新 FUNCTIONS.md（spec.md 3.1 门禁6）"
  fi
fi

# 2. 改了架构必须新增 ADR
if git diff --cached --name-only | grep -qE "(design\.md|docker-compose\.yml)"; then
  if ! git diff --cached --name-only | grep -q "docs/adr/"; then
    echo "⚠️ 改了架构但无新 ADR（spec.md 3.2 门禁3）"
  fi
fi

# 3. 文档不能有冲突标记
if git diff --cached --name-only | grep -q "\.md$"; then
  if git diff --cached | grep -qE "^(<<<<<<<|=======|>>>>>>>)"; then
    echo "❌ 文档有 git 冲突标记未解决"
    exit 1
  fi
fi

# 4. 文档健康度
npx tsx scripts/doc-health-check.ts || echo "⚠️ 文档健康度检查有 error"

echo "=== 门禁检查完成 ==="
```

---

## 五、落地步骤（立即可执行）

| 步骤 | 命令 | 耗时 | 责任 |
|------|------|------|------|
| 1. 比对重复文档 | `scripts/dedup-docs.ps1 -dryRun` | 5 分钟 | 开发 |
| 2. 人工合并分叉文档 | 逐个比对，合并内容 | 30 分钟 | 开发 |
| 3. 删除重复副本 | `scripts/dedup-docs.ps1` | 5 分钟 | 开发 |
| 4. 写健康度脚本 | 创建 `scripts/doc-health-check.ts` | 30 分钟 | 开发 |
| 5. 配置 git hook | `git config core.hooksPath .githooks` | 5 分钟 | 开发 |
| 6. 跑一次健康度 | `npx tsx scripts/doc-health-check.ts` | 1 分钟 | 开发 |
| 7. 修复 error 项 | 按报告修 | 视情况 | 开发 |
| 8. 加 CI weekly | `.github/workflows/doc-health.yml` | 15 分钟 | 开发 |
| 9. 更新 spec.md | 把门禁指向脚本 | 10 分钟 | 开发 |
| 10. 验证闭环 | 改一个文件，看 hook 是否触发 | 5 分钟 | 开发 |

**总耗时**：约 2 小时，文档管理从"空架子"变成"可执行"。

---

## 六、闭环验证标准

| 验证项 | 标准 |
|--------|------|
| 去重 | 同名文档只出现在一个目录 |
| 门禁 | commit 时 hook 触发，有提示 |
| 健康度 | `doc-health-check` 输出 A 或 B |
| 新鲜度 | PROJECT_STATE.md ≤7 天更新 |
| ADR | 改架构时新增 ADR |
| pitfalls | 踩坑时追加，checklists 引用 |

**用户体感**：改代码时被提醒更新文档 → 文档不再滞后 → 文档可信 → 愿意读 → 不是空架子。

---

## 七、与 V3.0 的关系

文档管理执行机制是 V3.0 的**前置条件**——大版本升级如果文档是空架子，13 周后必然失控。建议在 V3.0-alpha 前先完成本报告第五节的 10 步落地（2 小时）。

对应需求 ID：**R040**（文档管理执行机制落地）