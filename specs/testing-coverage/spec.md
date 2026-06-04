# 测试覆盖 Spec

> 本文档合并自原 `.trae/specs` 中的两个独立 spec：
> - `design-agent-tool-test`（Agent 多工具联合查询测试设计）
> - `integration-test-cross-module`（跨模块集成测试）
>
> 合并原因：工具测试设计定义了 14 个高复杂度测试 query，集成测试在此基础上构建 17 条集成路径 99 个测试用例，两者是测试覆盖的上下层关系。

---

## 一、Agent 多工具联合查询测试设计

详见 [tool-test.md](./tool-test.md)

核心内容：
- 14 个高复杂度测试 query（A类6 + B类6 + C类2）
- 覆盖单公司多工具、双公司对比、三公司综合查询
- 测试报告格式（包含修复循环）

---

## 二、跨模块集成测试

详见 [integration-test.md](./integration-test.md)

核心内容：
- 依赖 11 个 spec 的 174 个单元测试项
- 17 条集成路径，99 个测试用例（基于真实数据）
- 回归测试 + 变异测试
