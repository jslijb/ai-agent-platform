# Tasks

- [x] Task 1: 创建文本清洗模块 `text-cleaner.ts`
  - [x] SubTask 1.1: 实现 `cleanText()` 函数：控制字符去除、空白规范化、Markdown 噪声清理、重复内容去重、全半角统一、Unicode NFC 标准化
  - [x] SubTask 1.2: 实现 `fixChunkBoundaries()` 函数：开头标点修正、结尾不完整修正、空切片过滤
  - [x] SubTask 1.3: 编写清洗模块的单元测试，覆盖 PDF Markdown 清洗、控制字符去除、边界修正等场景
- [x] Task 2: 修改 `semantic-chunker.ts` 集成清洗层
  - [x] SubTask 2.1: 在 `chunkDocument()` 入口调用 `cleanText()` 清洗原始文本
  - [x] SubTask 2.2: 在切片生成后调用 `fixChunkBoundaries()` 修正边界
  - [x] SubTask 2.3: 确保 `rawContent` 存储原始未清洗文本，`chunkText` 使用清洗后文本
- [x] Task 3: 修改 `dense-retriever.ts` 截断策略
  - [x] SubTask 3.1: 将 `MAX_INPUT_CHARS` 从 512 提升到 2000
  - [x] SubTask 3.2: 实现句子边界截断逻辑（优先句号→逗号→硬切）
- [x] Task 4: 修复 `incremental-embedder.ts` 的 PDF 处理 bug
  - [x] SubTask 4.1: PDF 文件使用 Buffer 直接传给 chunkDocument，而非 utf-8 解码
  - [x] SubTask 4.2: 移除旧切片拼接 fallback，改为从 rawContent 获取原始文本
  - [x] SubTask 4.3: 最终降级时标记文档为 failed 而非用文件名作为内容
- [x] Task 5: 修改 `sparse-retriever.ts` BM25 预处理
  - [x] SubTask 5.1: 分词前去除标点、英文小写、数字格式统一（数字逗号优先移除）
- [x] Task 6: 修改重建索引脚本调用清洗层
  - [x] SubTask 6.1: 修改 `scripts/rebuild-index.ts`，重建时先清洗 rawContent 再切片
  - [x] SubTask 6.2: 修改 `src/app/api/document/rebuild-index/route.ts`，同上
- [x] Task 7: 验证测试
  - [x] SubTask 7.1: 验证清洗后切片不再以标点开头
  - [x] SubTask 7.2: 验证 Embedding 输入不再硬截断（800字符切片完整参与 embedding）
  - [x] SubTask 7.3: 验证 incremental-embedder PDF 更新流程正常工作
  - [x] SubTask 7.4: 验证重建索引后数据质量提升

# Task Dependencies
- [Task 2] 依赖 [Task 1]（切片器集成依赖清洗模块）
- [Task 6] 依赖 [Task 1] 和 [Task 2]（重建索引依赖清洗层完整集成）
- [Task 7] 依赖 [Task 1-6] 全部完成
- [Task 3]、[Task 4]、[Task 5] 可并行执行

# 测试结果
- text-cleaner 单元测试: 11/11 PASSED
- dense-retriever 截断测试: 5/5 PASSED
- sparse-retriever BM25预处理测试: 8/8 PASSED
- config 环境变量解析测试(TS): 9/9 PASSED
- config 环境变量解析测试(Python): 26/26 PASSED
- semantic-chunker 集成测试: 3/3 PASSED
- 业务测试套件(中国长城/格力电器/五粮液): 8/8 PASSED
- 综合测试: 36/36 PASSED

# 额外修复的 Bug
- text-cleaner.ts: 水平分隔线正则 `[*-_]` 修正为 `[-*_]`（避免 ASCII 范围误匹配）
- text-cleaner.ts: step3 Markdown噪声清理后增加 `\n{3,}` → `\n\n` 重新规范化
- sparse-retriever.ts: preprocessForBM25 数字逗号移除顺序修正（先移数字逗号再移标点）
