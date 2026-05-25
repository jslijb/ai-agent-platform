## Day 6 任务清单：多模态 RAG + 答案溯源


---

### 第 1 步：安装多模态相关依赖

```bash
npm install llamaindex @llamaindex/liteparse pdf-parse sharp
```

- `llamaindex`：LlamaIndex TypeScript 核心库
- `@llamaindex/liteparse`：LiteParse 本地 PDF 解析（图文混排、表格提取）
- `sharp`：图像处理（用于处理从 PDF 中提取的图片）

> 第一步已完成，无需理会。

---

### 第 2 步：实现图文混排 PDF 解析器

**提示词（后续放入 Trae）**：
```
在 /app/server/rag/multimodal/pdf-parser.ts 中，实现：
- 函数 parsePDFWithImages(buffer: Buffer): Promise<{ text: string, images: Buffer[], tables: any[] }>
- 使用 @llamaindex/liteparse 解析 PDF，提取文本块、图片位置和表格
- 对于图片，使用 sharp 裁剪并转为 Base64 供 VLM 分析（可选）
- 返回结构化结果，保留页面顺序和元素位置
```

---

### 第 3 步：实现表格提取与结构化

**提示词**：
```
在 /app/server/rag/multimodal/table-extractor.ts 中，实现：
- 函数 extractTablesFromPDF(buffer: Buffer): Promise<Array<{ pageNum: number, html: string, markdown: string }>>
- 使用 @llamaindex/liteparse 或自定义规则识别表格区域
- 将表格转换为 Markdown 和 HTML 两种格式
- 存储时保留表格的原始上下文（前后文本）
```

---

### 第 4 步：实现视觉内容描述（可选，VLM集成）

**提示词**：
```
在 /app/server/rag/multimodal/image-caption.ts 中，实现：
- 函数 describeImage(imageBase64: string): Promise<string>
- 调用阿里百炼的多模态模型（如 qwen-vl-max）生成图片描述
- 将描述文本作为补充内容存入文档块，便于纯文本检索
- 如果模型不支持，可返回空字符串或使用 OCR 文本
```

---

### 第 5 步：实现答案溯源模块

**提示词**：
```
在 /app/server/rag/citation/source-tracker.ts 中，实现：
- 在索引阶段，为每个 chunk 存储元数据：docId, fileName, pageNum, paragraphIndex
- 在检索阶段，保留每个检索结果对应的元数据
- 函数 buildCitation(result: { text: string, metadata: any }): string
- 返回格式：[来源: 《{fileName}》第{pageNum}页]
```

**在 /app/server/rag/citation/citation-injector.ts 中，实现**：
```
- 函数 injectCitations(answer: string, citations: string[]): string
- 将引用标注插入到答案中的合适位置（通过后处理或引导 LLM 生成）
- 更可靠的方式：在生成 prompt 中要求 LLM 输出 JSON，包含答案文本和引用的对应关系
```

---

### 第 6 步：修改文档上传和检索流程

**修改 `/app/api/document/upload/route.ts`**：
- 调用 `parsePDFWithImages` 获取文本、图片、表格
- 为每个文本块（包括表格描述、图片描述）生成 embedding
- 存储元数据（pageNum, fileName, 元素类型）

**修改 `/app/api/rag/search/route.ts`**：
- 在检索返回结果时，附带上每个结果的 `sourceMetadata`
- 最终返回结构：
  ```json
  {
    "results": [
      { "text": "...", "score": 0.92, "source": { "fileName": "report.pdf", "pageNum": 5 } }
    ]
  }
  ```

---

### 第 7 步：生成带引用的答案 API

**创建 `/app/api/rag/answer-with-citation/route.ts`**：

**提示词**：
```
创建 POST 接口，接收 { query: string }。
流程：
1. 调用 /api/rag/search 获取 top-3 相关块及其元数据
2. 构造 prompt：基于以下文档片段回答问题，并在每个关键事实后标注 [来源: 文档名, 页码]
3. 调用阿里百炼模型生成答案
4. 返回 { answer: "带有引用的文本", citations: [...] }
```

---

### 第 8 步：验收测试

1. 准备一份包含图片和表格的 PDF（可从网上下载财报样例）。
2. 上传文档：
   ```bash
   curl -F "file=@sample.pdf" http://localhost:3000/api/document/upload
   ```
3. 查询一个涉及表格数据的问题，例如"2024年营收是多少？"
4. 观察返回结果是否包含表格数据（而非"无法解析"）。
5. 调用带引用的接口：
   ```bash
   curl -X POST http://localhost:3000/api/rag/answer-with-citation -H "Content-Type: application/json" -d '{"query":"营收增长趋势"}'
   ```
6. 验证答案中是否包含类似 `[来源: sample.pdf, 第3页]` 的标记。

---

### 验收标准（Day 6 完成标志）

- [ ] PDF 上传后，能成功提取文本、图片位置和表格内容
- [ ] 对于表格数据，检索能返回结构化的 Markdown 表格或清晰的文本描述
- [ ] 返回的检索结果包含准确的页码和文件名元数据
- [ ] 带引用的答案中，每个关键数据都能追溯到具体的文档和页码
- [ ] 整个流程无报错，响应时间在可接受范围（含 VLM 调用可能稍慢）

---
