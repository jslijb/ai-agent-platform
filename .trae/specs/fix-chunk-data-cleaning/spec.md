# 文档数据清洗与切片优化 Spec

## Why
当前文档处理管线完全没有数据清洗层，MinerU 解析的 Markdown 原样进入切片和向量化，导致切片以标点开头、图片标记/表格分隔行等噪声参与 embedding、512字符硬截断丢弃36%内容、incremental-embedder 中 PDF 二进制用 utf-8 解码必然失败。行业最佳实践表明，RAG 精度的 7-8 成由预处理和切片决定，而非检索算法。

## 现状分析

### 当前管线（缺失清洗层）

```
MinerU PDF解析 → 原始Markdown → 直接切片 → 512字符硬截断 → Embedding → 存储
                     ↑ 无清洗         ↑ 以标点开头    ↑ 36%内容丢失
```

### 行业最佳实践管线

```
文档解析 → 文本清洗 → 结构提取 → 智能切片 → 边界修正 → 元数据富化 → Embedding → 存储
            ↑ 新增      ↑ 新增      ↑ 优化     ↑ 新增      ↑ 新增
```

### 关键缺陷清单

| # | 缺陷 | 严重度 | 位置 |
|---|------|--------|------|
| 1 | MinerU Markdown 原样入库，图片标记/表格分隔行/重复页眉等噪声全部参与切片和向量化 | 严重 | semantic-chunker.ts |
| 2 | 切片以标点开头（如"，中国长城..."），断句边界不正确 | 严重 | semantic-chunker.ts splitLongText |
| 3 | Embedding 输入 512 字符硬截断，切片 maxChunkSize=800 导致 36% 内容丢失 | 严重 | dense-retriever.ts MAX_INPUT_CHARS |
| 4 | incremental-embedder 中 PDF 二进制用 utf-8 解码必然失败 | 严重 | incremental-embedder.ts:75 |
| 5 | 从旧切片拼接再重新切片（二次切片失真） | 严重 | incremental-embedder.ts:97-104 |
| 6 | 全半角/Unicode 标准化缺失 | 中等 | 全局 |
| 7 | BM25 分词前无预处理（标点/大小写/数字格式） | 中等 | sparse-retriever.ts |
| 8 | Token 估算粗糙（length/1.5），影响切片边界 | 中等 | semantic-chunker.ts |
| 9 | 切片元数据不完整（缺页码、段落位置、表格标记） | 低 | schema.ts |

## What Changes
- 新增文本清洗模块 `text-cleaner.ts`：在切片前对原始文本进行清洗和标准化
- 新增切片边界修正函数 `fixChunkBoundaries()`：确保切片不以标点开头或结尾
- 修改 `semantic-chunker.ts`：在切片前调用清洗模块，切片后调用边界修正
- 修改 `dense-retriever.ts`：将 `MAX_INPUT_CHARS` 从 512 提升到与 BGE-M3 模型匹配的值，改用句子边界截断
- 修改 `incremental-embedder.ts`：修复 PDF 二进制解码 bug，移除旧切片拼接 fallback
- 修改 `sparse-retriever.ts`：BM25 分词前增加预处理
- 修改 `rebuild-index.ts` 和 `rebuild-index/route.ts`：重建时也经过清洗层
- **BREAKING**：重建索引后，所有旧 Embedding 数据将被替换，检索结果可能与之前不同

## Impact
- Affected specs: agent-memory-system（L3 历史检索依赖 embedding 质量）、add-skill-system（hybridSearch 工具依赖检索质量）
- Affected code:
  - `src/server/rag/chunking/semantic-chunker.ts` — 新增清洗调用 + 边界修正
  - `src/server/rag/chunking/text-cleaner.ts` — 新增文件
  - `src/server/rag/retrieval/dense-retriever.ts` — 修改截断策略
  - `src/server/rag/streaming/incremental-embedder.ts` — 修复 bug + 移除旧切片拼接
  - `src/server/rag/retrieval/sparse-retriever.ts` — BM25 预处理
  - `scripts/rebuild-index.ts` — 重建时调用清洗
  - `src/app/api/document/rebuild-index/route.ts` — 同上

## ADDED Requirements

### Requirement: 文本清洗模块
系统 SHALL 在切片前对原始文本执行以下清洗步骤，清洗后的文本用于切片和向量化，原始文本保留在 `rawContent` 字段不变。

#### 清洗步骤（按顺序执行）

1. **控制字符去除**：移除 `\0`、`\x01`-`\x08`、零宽字符（U+200B-U+200F、U+FEFF）等不可见字符
2. **空白规范化**：连续空格/制表符合并为单个空格；连续空行合并为单个换行；CRLF 统一为 LF；行首行尾空白去除
3. **Markdown 噪声清理**：
   - 移除图片标记 `![alt](url)` → 替换为 `[图片: alt]`（保留 alt 文本作为上下文）
   - 移除纯链接 `[text](url)` → 保留 text，去除 url
   - 移除表格分隔行 `|---|---|` 模式
   - 移除水平分隔线 `---`、`***`、`___`
   - 移除 HTML 标签（`<br>`、`<div>` 等），保留内容文本
4. **重复内容去重**：检测并移除 PDF 页眉页脚重复文本（连续3行以上相同或高度相似的文本块视为页眉页脚）
5. **全半角统一**：全角数字/字母转半角（`１２３` → `123`）；全角标点保留（中文语境下全角标点是正确的）
6. **Unicode NFC 标准化**：确保相同字符的编码形式一致

#### Scenario: PDF Markdown 清洗
- **WHEN** MinerU 返回包含 `![图1](url)`、`|---|---|`、重复页眉的 Markdown
- **THEN** 清洗后图片标记变为 `[图片: 图1]`，表格分隔行被移除，重复页眉被去除

#### Scenario: 控制字符去除
- **WHEN** 文本包含零宽字符 U+200B 或控制字符 \x00
- **THEN** 这些字符被移除，不影响可见文本内容

#### Scenario: 原始文本保留
- **WHEN** 清洗后的文本用于切片
- **THEN** 数据库中 `rawContent` 字段仍保留原始未清洗文本，`chunkText` 使用清洗后的文本

### Requirement: 切片边界修正
系统 SHALL 在切片生成后执行边界修正，确保切片不以标点符号开头或以不完整内容结尾。

#### 修正规则

1. **开头标点修正**：如果切片以 `，。、；：！？、）》」』】` 等标点开头，将开头的标点移回上一个切片的末尾（如果存在上一个切片），否则直接去除
2. **结尾不完整修正**：如果切片以 `（（《「『【` 等左括号结尾（表示内容被截断），将左括号移到下一个切片的开头，或去除
3. **空切片过滤**：修正后如果切片为空或仅含空白，跳过该切片

#### Scenario: 以逗号开头的切片
- **WHEN** 切片内容为 `"，中国长城立足国家战略需求..."`
- **THEN** 修正后为 `"中国长城立足国家战略需求..."`，逗号被移回上一个切片末尾或去除

#### Scenario: 以左括号结尾的切片
- **WHEN** 切片内容为 `"...公司（"`
- **THEN** 修正后为 `"...公司"`，左括号移到下一个切片开头或去除

### Requirement: Embedding 输入截断优化
系统 SHALL 将 Embedding 输入的最大长度从 512 字符提升到与 BGE-M3 模型能力匹配的值，并改用句子边界截断。

#### 截断策略
- `MAX_INPUT_CHARS` 从 512 提升到 2000（约 670 tokens，BGE-M3 支持 8192 tokens，2000 字符是质量与效率的平衡点）
- 截断时在最近的句子边界（句号、问号、叹号）处截断，而非硬切
- 如果前 2000 字符内无句子边界，在最近的逗号/分号处截断
- 如果连逗号都没有，才硬切

#### Scenario: 长切片的智能截断
- **WHEN** 切片长度为 800 字符，embedding 输入上限为 2000 字符
- **THEN** 完整切片内容全部参与 embedding 生成，无截断

#### Scenario: 超长切片的句子边界截断
- **WHEN** 切片长度超过 2000 字符
- **THEN** 在 2000 字符内最近的句子边界处截断

### Requirement: incremental-embedder PDF 处理修复
系统 SHALL 修复 incremental-embedder 中 PDF 二进制解码 bug，并移除旧切片拼接 fallback。

#### 修复方案
1. **PDF 文件处理**：当文件为 PDF 时，应将 `fileBuffer`（Buffer 类型）直接传给 `chunkDocument`，而非 `fileBuffer.toString("utf-8")`
2. **移除旧切片拼接 fallback**：当本地文件不存在时，从数据库 `rawContent` 字段获取原始文本（而非从旧切片拼接）
3. **最终降级**：当 `rawContent` 也不存在时，标记文档状态为 `failed`，错误信息说明原因，而非用文件名作为内容

#### Scenario: PDF 文件更新触发重新切片
- **WHEN** PDF 文档内容更新触发 incremental-embedder
- **THEN** 使用 Buffer 直接传给 chunkDocument，正确走 MinerU 解析路径

#### Scenario: 本地文件丢失但有 rawContent
- **WHEN** 本地文件不存在但数据库有 rawContent
- **THEN** 使用 rawContent 重新切片，而非从旧切片拼接

### Requirement: BM25 分词预处理
系统 SHALL 在 BM25 分词前对文本进行预处理，提升关键词检索精度。

#### 预处理步骤
1. 去除标点符号（中文标点和英文标点）
2. 英文统一小写
3. 数字格式统一（去除千分位逗号：`1,234.56` → `1234.56`）

#### Scenario: BM25 分词预处理
- **WHEN** 切片文本包含 `"营收1,234.56万元"` 进入 BM25 索引
- **THEN** 分词前预处理为 `"营收1234.56万元"`，分词结果包含 `"营收"`、`"1234.56"`、`"万元"`

### Requirement: 重建索引时调用清洗层
系统 SHALL 在重建索引时对 rawContent 执行清洗后再切片，确保重建后的数据质量优于重建前。

#### Scenario: 全量重建索引
- **WHEN** 调用 rebuild-index API 重建所有文档索引
- **THEN** 每个文档的 rawContent 先经过文本清洗，再切片、生成 embedding、存储

## MODIFIED Requirements

### Requirement: chunkDocument 函数
原：直接对原始文本切片
改：先调用 `cleanText()` 清洗，再切片，再调用 `fixChunkBoundaries()` 修正边界

### Requirement: generateEmbedding 函数
原：512 字符硬截断
改：2000 字符句子边界截断

### Requirement: embedDocument 函数（incremental-embedder.ts）
原：PDF 用 utf-8 解码 + 旧切片拼接 fallback
改：PDF 用 Buffer 直接传入 + rawContent fallback + 失败时标记文档为 failed

## REMOVED Requirements

### Requirement: MAX_INPUT_CHARS = 512
**Reason**: 512 字符硬截断导致 36% 内容丢失，改为 2000 字符句子边界截断
**Migration**: 无需迁移，重建索引后自动生效

### Requirement: 从旧切片拼接内容作为 fallback
**Reason**: 二次切片失真严重，改为从 rawContent 获取原始文本
**Migration**: 无需迁移，rawContent 已存在于 Document 表中
