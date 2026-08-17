# 多端前端方案调研报告

> 调研日期：2026-08-12
> 项目背景：AI Agent Platform（金融智能体），当前前端 Next.js 14 (App Router) + TypeScript
> 核心特性：流式 SSE 对话、RAG 知识库、知识图谱可视化、实时评估
>
> **补充调研**：Flutter 迁移可行性详细分析见 **`flutter-migration-feasibility-research.md`**
> 结论：不推荐 Flutter 迁移（3大致命理由：小程序缺失/SEO缺失/代码复用率0%）

---

## 一、跨端框架对比矩阵

### 1.1 平台支持矩阵

| 框架 | 安卓 | iOS | 鸿蒙NEXT | 微信小程序 | 支付宝小程序 | 钉钉小程序 | H5/Web | 桌面 |
|------|:----:|:---:|:--------:|:----------:|:----------:|:----------:|:------:|:----:|
| **React Native** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ⚠️(RN Web) | ⚠️(macOS/Windows社区) |
| **Flutter** | ✅ | ✅ | ⚠️(社区适配中) | ❌ | ❌ | ❌ | ✅ | ✅(Win/Mac/Linux) |
| **uni-app** | ✅ | ✅ | ✅(uni-app x) | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Taro** | ⚠️(RN) | ⚠️(RN) | ⚠️(harmony-hybrid) | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Capacitor** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅(PWA) | ❌ |
| **ArkTS/ArkUI** | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **KMP** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ⚠️(Compose Wasm) | ✅(Compose Desktop) |
| **.NET MAUI** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅(Win/Mac) |

> 图例：✅ 官方支持 | ⚠️ 社区/实验性支持 | ❌ 不支持

### 1.2 语言与生态对比

| 框架 | 开发语言 | 与TS/React复用度 | 组件库丰富度 | 第三方库数量 | 学习曲线(对TS团队) |
|------|---------|:---------------:|:----------:|:----------:|:----------------:|
| **React Native** | JavaScript/TS | ⭐⭐⭐⭐⭐ | 高 | 30k+(npm) | 低(1-2周) |
| **Flutter** | Dart | ⭐⭐ | 极高 | 40k+(pub.dev) | 中(3-4周) |
| **uni-app** | Vue.js/UTS | ⭐⭐ | 中(插件市场4k+) | 4k+(DCloud) | 中(2-3周，需学Vue) |
| **Taro** | React/TS | ⭐⭐⭐⭐ | 中(NutUI/Taro UI) | 5k+(npm) | 低(1-2周) |
| **Capacitor** | HTML/CSS/JS/TS | ⭐⭐⭐⭐⭐ | 取决于Web框架 | 100+(官方插件) | 极低(1周) |
| **ArkTS/ArkUI** | ArkTS | ⭐ | 低(成长中) | 3k+(ohpm) | 高(4-6周) |
| **KMP** | Kotlin | ⭐ | 中 | 8k+(KMP libs) | 高(4-8周，需学Kotlin) |
| **.NET MAUI** | C#/XAML | ⭐ | 中 | 2k+(NuGet) | 高(6-8周，需学C#) |

### 1.3 性能对比

| 框架 | 首屏加载 | 动画流畅度(60fps) | 内存占用 | 渲染方式 | 包体积 |
|------|:-------:|:----------------:|:-------:|---------|:-----:|
| **React Native** | 中(1.5-3s) | 良(New Arch) | 中(80-150MB) | 原生组件 | 8-15MB |
| **Flutter** | 快(0.8-1.5s) | 优(自绘引擎) | 高(120-200MB) | Skia自绘 | 10-20MB |
| **uni-app** | 中(2-4s) | 中(WebView)/良(原生) | 高(WebView:150MB+) | WebView+原生 | 5-15MB |
| **Taro** | 中(2-4s) | 中(WebView) | 高(WebView:150MB+) | WebView | 2-8MB |
| **Capacitor** | 慢(3-5s) | 中(WebView) | 高(150-250MB) | WebView | 5-10MB |
| **ArkTS** | 快(0.5-1s) | 优(原生) | 低(50-100MB) | 原生渲染 | 3-8MB |
| **KMP** | 快(0.5-1s) | 优(Compose) | 低(60-120MB) | 原生+Compose | 5-12MB |
| **.NET MAUI** | 中(1-2s) | 良 | 中(100-180MB) | 原生Handler | 15-30MB |

---

## 二、各框架详细分析

### 2.1 React Native

**出品方**：Meta (Facebook)

**优势**：
- 与当前 Next.js/React 技术栈**零切换成本**，React Hooks/组件可直接复用
- TypeScript 原生支持，团队无需学新语言
- New Architecture（Fabric + TurboModules）性能大幅提升
- Expo 生态成熟，开箱即用（OTA更新、推送、相机等50+模块）
- 社区极活跃，npm 上 react-native 相关包超 3 万

**劣势**：
- **不支持鸿蒙**，华为无官方适配计划
- **不支持小程序**，国内生态缺失
- 复杂动画仍需 Native 模块桥接
- 升级历史包袱重（0.71+ New Arch 迁移成本）

**大厂案例**：Meta(Facebook/Instagram)、微软(Office)、Shopify、Pinterest、Discord

**与本项目融合度**：⭐⭐⭐⭐⭐（App端最佳选择，但缺鸿蒙和小程序）

---

### 2.2 Flutter

**出品方**：Google

**优势**：
- 一套代码覆盖安卓/iOS/Web/桌面，覆盖面最广
- Skia 自绘引擎，动画/滚动流畅度最佳
- Hot Reload 开发体验极佳
- Google 内部大规模使用，生态成熟（pub.dev 4万+包）
- 2026年社区正在推进鸿蒙适配（ohos_flutter 项目）

**劣势**：
- **Dart 语言**：团队需全新学习，与 TypeScript 差异大
- **不支持小程序**：国内微信/支付宝生态无法覆盖
- 鸿蒙适配仍为社区驱动，非官方，稳定性存疑
- Web 端性能不如原生 Web（SEO 差、首屏慢）
- 包体积偏大（引擎约 5MB 起步）

**大厂案例**：Google(Pay/Ads)、阿里(闲鱼)、腾讯(企业微信部分)、BMW、Nubank

**与本项目融合度**：⭐⭐（语言壁垒高，无法复用 React/TS 代码）

---

### 2.3 uni-app

**出品方**：DCloud（国内）

**优势**：
- **国内跨端覆盖最全**：安卓/iOS/鸿蒙NEXT/微信/支付宝/钉钉/抖音/H5，一套代码15+平台
- uni-app x（下一代）支持纯原生渲染，性能大幅提升
- 鸿蒙支持已落地（uni-app x for HarmonyOS NEXT）
- 插件市场 4000+ 插件，中文文档完善
- 条件编译：可针对不同平台写差异化代码
- 900万开发者，国内最流行的跨端框架

**劣势**：
- **Vue.js 生态**：团队需从 React 切换到 Vue，组件无法直接复用
- HBuilderX IDE 体验不如 VSCode（虽支持 CLI 创建）
- App 端复杂交互性能不如 RN/Flutter 原生渲染
- 社区质量参差，插件维护率低
- 严重依赖 DCloud 公司，开源可控性弱

**大厂案例**：美团(部分小程序)、快手(部分)、360(部分)、大量中小型应用

**与本项目融合度**：⭐⭐（小程序+鸿蒙最佳选择，但需 Vue 重写 UI）

---

### 2.4 Taro

**出品方**：京东（凹凸实验室）

**优势**：
- **React/TypeScript 技术栈**：与本项目技术栈高度一致！
- 小程序覆盖全面：微信/支付宝/百度/抖音/飞书/钉钉/QQ/快手/京东
- v3.6.24+ 支持 harmony-hybrid（鸿蒙混合模式）
- v3.2+ 支持 React Native 端（App端）
- NutUI 组件库（React版）质量不错
- 开源活跃，京东内部大规模使用

**劣势**：
- App 端（RN）体验不如纯 RN 项目，坑多
- 鸿蒙支持为 hybrid 模式（WebView 嵌套），非原生
- 跨端兼容性调试成本高，各端差异需条件编译
- 大型项目编译速度慢
- 社区规模小于 uni-app

**大厂案例**：京东(全线小程序)、网易(严选小程序)、去哪儿、贝壳

**与本项目融合度**：⭐⭐⭐⭐（小程序端最佳选择，技术栈一致）

---

### 2.5 Capacitor

**出品方**：Ionic

**优势**：
- **Web 优先**：直接包裹现有 Next.js 项目为原生 App
- TypeScript/React 代码**100% 复用**，零重写成本
- 原生 API 通过插件暴露（相机、推送、文件系统等100+）
- PWA 支持，可渐进增强
- 与任何 Web 框架兼容（React/Vue/Angular/Svelte）
- 学习成本极低，1 周可上手

**劣势**：
- **WebView 渲染**：性能不如原生，动画/滚动有卡顿
- **不支持鸿蒙**（无官方计划）
- **不支持小程序**
- 原生功能需要写 Swift/Kotlin 插件
- 包体积大（内嵌浏览器引擎）
- 不适合高性能 UI 场景

**大厂案例**：BBC(儿童应用)、GE(医疗)、众多企业内部应用

**与本项目融合度**：⭐⭐⭐⭐⭐（最快出 App 的方案，但性能和平台覆盖有限）

---

### 2.6 ArkTS / ArkUI

**出品方**：华为

**优势**：
- **鸿蒙原生**：唯一能发挥鸿蒙全部能力的方案
- 性能最优（原生渲染，内存占用最低）
- 华为官方全力支持，DevEco Studio IDE 持续迭代
- 鸿蒙 NEXT（纯血鸿蒙）不再兼容 Android APK，ArkTS 是唯一出路
- ohpm 生态快速增长（3000+ 包）

**劣势**：
- **ArkTS ≠ TypeScript**：虽语法相似，但差异显著（见下文详述）
- **仅鸿蒙**：无法覆盖安卓/iOS/小程序
- 生态仍处早期，第三方库远不如 npm/pub.dev
- DevEco Studio 稳定性和体验不如 VSCode
- 学习成本高，需全新学习声明式 UI 范式
- 团队需单独招聘或培训 ArkTS 开发者

**大厂案例**：华为(全系应用)、支付宝(鸿蒙版)、美团(鸿蒙版)、京东(鸿蒙版)

**与本项目融合度**：⭐（仅鸿蒙可用，无法复用现有代码）

---

### 2.7 KMP (Kotlin Multiplatform)

**出品方**：JetBrains

**优势**：
- 业务逻辑共享（网络层、数据层、领域层），UI 各端原生
- Kotlin 语言优秀，与 Swift 互操作性好
- Compose Multiplatform 可共享 UI（实验性）
- 后端也可用 Kotlin（Ktor），全栈统一语言

**劣势**：
- **不支持鸿蒙**、不支持小程序
- Kotlin 学习曲线陡峭（对 TS 团队）
- Compose Multiplatform 仍不成熟
- iOS 端需 Xcode 配合编译
- 社区规模小于 RN/Flutter

**大厂案例**：Netflix(部分)、VMware、Cash App(Square)、Philips

**与本项目融合度**：⭐（语言壁垒高，平台覆盖不足）

---

### 2.8 .NET MAUI

**出品方**：微软

**优势**：
- C# 全栈统一，.NET 生态强大
- 单项目多平台，Hot Reload 支持
- 微软官方长期支持

**劣势**：
- **不支持鸿蒙**、不支持小程序
- C#/XAML 学习成本极高（对 TS 团队）
- 社区萎缩（Xamarin 遗留问题），GitHub Issue 积压
- Android/iOS 平台兼容性问题多
- 微软自身产品也在转向 Web 技术（如 VS Code）

**大厂案例**：少数传统企业应用，新项目采用率低

**与本项目融合度**：⭐（完全不适用，排除）

---

## 三、鸿蒙特殊考量

### 3.1 ArkTS 与 TypeScript 的关键差异

| 维度 | TypeScript | ArkTS | 影响 |
|------|-----------|-------|------|
| 类型系统 | 结构化类型 | 名义化类型（更严格） | 接口定义方式不同 |
| 空安全 | 可选（strictNullChecks） | 强制（非空断言!） | 必须显式处理null |
| 装饰器 | 实验性（TC39 Stage 3） | 核心语法（@Component/@Entry） | UI声明式写法不同 |
| 状态管理 | React Hooks/外部库 | @State/@Prop/@Link 装饰器 | 完全不同的响应式模型 |
| 泛型 | 完整支持 | 有限支持 | 复杂类型需简化 |
| 模块系统 | ES Modules | ESM（有差异） | 导入导出需适配 |
| 异步 | async/await + Promise | async/await（部分限制） | 回调模式有差异 |
| 运行时 | V8/Node.js | 方舟编译器（AOT） | 性能更好但调试不同 |

**结论**：ArkTS 语法约 60% 与 TS 相似，但 UI 层（ArkUI 声明式）完全不同。**不能直接复用 React 组件**，业务逻辑（纯 TS 函数/类型）可部分移植但需大量适配。

### 3.2 鸿蒙 NEXT（纯血鸿蒙）影响

- **不再兼容 Android APK**：鸿蒙 NEXT 5.0 起完全移除 Android 兼容层
- **必须使用 ArkTS 开发**：Flutter/RN 等方案无法直接运行
- **应用市场上架**：必须通过华为 AppGallery 审核
  - 需要华为开发者账号（企业认证）
  - 应用需通过安全审查、隐私合规
  - 需提供软件著作权（部分类目）
  - 审核周期 3-7 个工作日

### 3.3 DevEco Studio 开发体验

- 基于 IntelliJ IDEA，Java/Kotlin 开发者友好
- 对前端开发者体验一般（不如 VSCode）
- 模拟器性能尚可，真机调试需华为设备
- 预览器（Previewer）支持实时预览
- 2026 年版本已支持 C/C++ 和 ArkTS 混合开发

### 3.4 与现有 Node.js/TS 生态的兼容性

| 能否复用 | 内容 | 说明 |
|---------|------|------|
| ❌ 不能 | React 组件 | ArkUI 声明式 UI 完全不同 |
| ❌ 不能 | npm 包 | 方舟运行时不兼容 Node.js |
| ⚠️ 部分可以 | 纯 TS 类型定义 | 需手动移植，去掉不兼容语法 |
| ⚠️ 部分可以 | 业务逻辑函数 | 需去掉 DOM 依赖，适配 ArkTS 语法 |
| ✅ 可以 | API 接口定义 | HTTP 请求逻辑可重写（用 @ohos.net.http） |
| ✅ 可以 | 后端 API | 完全不受影响，鸿蒙端只是新客户端 |

---

## 四、推荐方案

### 4.1 方案对比

| 方案 | 描述 | 开发效率 | 性能 | 平台覆盖 | 维护成本 | 与Next.js融合 |
|------|------|:-------:|:----:|:-------:|:-------:|:------------:|
| A | 一套代码多端(uni-app) | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| B | Web优先+原生壳(Capacitor) | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| C | 各端独立开发(原生) | ⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐ | ⭐ |
| **D** | **混合方案** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |

### 4.2 🏆 推荐方案D：混合方案

**为什么选混合方案？**

1. **没有"银弹"**：没有任何单一框架能同时覆盖安卓/iOS/鸿蒙/小程序，且保持与 Next.js 的高复用度
2. **团队技能匹配**：团队核心技能是 TypeScript + React，应最大化复用
3. **项目特性决定**：金融智能体的核心是流式 SSE 对话，各端 UI 交互差异大，强行统一反而降低体验
4. **维护成本可控**：按端分框架，每端选最优工具，长期维护反而更轻松

**具体分工**：

| 端 | 推荐框架 | 为什么 |
|----|---------|-------|
| **Web (当前)** | Next.js 14 | 已有，继续维护 |
| **微信/支付宝/钉钉小程序** | **Taro 4** | React/TS 技术栈一致，小程序覆盖最全，可复用 Hooks/Utils/Types |
| **安卓/iOS App** | **Capacitor** (短期) → **React Native** (长期) | Capacitor 最快出 MVP（直接包 Next.js）；RN 长期性能更好 |
| **鸿蒙 App** | **ArkTS/ArkUI** | 纯血鸿蒙唯一选择，无替代方案 |

**为什么不选其他方案？**

- **方案A (uni-app)**：需从 React 切换到 Vue，现有 50+ 组件全部重写，投入产出比差。且 uni-app 的 App 端性能不如 RN
- **方案B (Capacitor 全包)**：不支持鸿蒙和小程序，国内市场覆盖严重不足
- **方案C (全原生)**：开发成本 4-5 倍，小团队无法承受

---

## 五、与当前 Next.js 项目的融合

### 5.1 架构分层

```
┌─────────────────────────────────────────────────┐
│                   表现层 (UI)                     │
│  Next.js │ Taro小程序 │ Capacitor/RN │ ArkUI     │  ← 各端独立
├─────────────────────────────────────────────────┤
│                   逻辑层 (Shared)                 │
│  Hooks │ Utils │ Types │ Constants │ Validators  │  ← 抽取为共享包
├─────────────────────────────────────────────────┤
│                   API层 (Backend)                 │
│  FastAPI Route Handlers → REST/SSE API           │  ← 统一后端
├─────────────────────────────────────────────────┤
│                   数据层 (Infra)                   │
│  PostgreSQL │ Redis │ pgvector │ Neo4j            │  ← 不变
└─────────────────────────────────────────────────┘
```

### 5.2 API 层复用

**当前**：Next.js Route Handlers → FastAPI 后端

**多端适配**：
- FastAPI 后端已经是独立微服务，各端直接调用同一 API
- SSE 流式接口：各端均支持 EventSource / fetch stream
- 认证：JWT 机制不变，各端存储 token 方式不同（小程序用 storage，App 用 Keychain/Keystore）
- 需新增：API 版本管理（v1/v2），避免 Web 端变更影响移动端

```typescript
// 共享 API 客户端示例
// packages/shared-api/src/client.ts
export class ApiClient {
  constructor(private baseUrl: string, private getToken: () => Promise<string>) {}

  async *streamChat(message: string): AsyncGenerator<string> {
    const token = await this.getToken();
    const response = await fetch(`${this.baseUrl}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    // SSE 解析逻辑 - 各端通用
  }
}
```

### 5.3 业务逻辑共享

**抽取为 Monorepo 共享包**：

```
packages/
├── shared-types/      # TypeScript 类型定义（API 响应、领域模型）
├── shared-utils/      # 纯函数工具（格式化、验证、计算）
├── shared-hooks/      # React Hooks（Taro/RN/Next.js 可复用）
├── shared-api/        # API 客户端（HTTP/SSE 封装）
└── shared-constants/  # 常量、枚举、配置
```

**复用度估算**：

| 层次 | Taro小程序 | Capacitor/RN | ArkTS |
|------|:---------:|:-----------:|:-----:|
| 类型定义 | 90% | 90% | 30%（需手动移植） |
| 工具函数 | 80% | 80% | 20%（需去掉 DOM 依赖） |
| React Hooks | 70% | 70% | 0% |
| API 客户端 | 60% | 60% | 20%（需用 @ohos.net.http 重写） |
| UI 组件 | 10% | 80%(Capacitor) | 0% |

### 5.4 UI 组件适配

| 策略 | 适用端 | 说明 |
|------|-------|------|
| **直接复用** | Capacitor | Next.js 页面直接在 WebView 运行 |
| **Taro 组件重写** | Taro 小程序 | 用 Taro 组件库重写，保持设计一致性 |
| **RN 组件重写** | React Native | 用 RN 组件库重写，保持交互一致性 |
| **ArkUI 重写** | 鸿蒙 | 用 ArkUI 声明式语法重写 |
| **设计系统统一** | 全端 | 抽取 Design Token（颜色/间距/字体），各端实现 |

### 5.5 状态管理统一

| 端 | 状态管理方案 | 与 Next.js 的关系 |
|----|-----------|-----------------|
| Next.js | Zustand (当前) | 基准 |
| Taro | Zustand | 直接复用（Taro 支持 React 状态管理） |
| Capacitor | Zustand | 直接复用（同一 WebView 环境） |
| React Native | Zustand | 直接复用（React 生态通用） |
| ArkTS | @State/@Link | 无法复用，需用 ArkUI 原生状态管理 |

---

## 六、实施路线图

### 6.1 优先级排序

| 优先级 | 端 | 框架 | 为什么先做 | 预计工期 |
|:------:|----|------|----------|:-------:|
| **P0** | 微信小程序 | Taro 4 | 用户量最大、获客成本最低、金融场景刚需 | 4-6 周 |
| **P1** | 安卓/iOS MVP | Capacitor | 最快出 App（直接包现有 Web），验证移动端需求 | 1-2 周 |
| **P2** | 安卓/iOS 正式版 | React Native | Capacitor 验证后，如需更好性能则迁移 | 6-8 周 |
| **P3** | 鸿蒙 App | ArkTS | 鸿蒙市场份额增长中，但非紧急 | 8-12 周 |
| **P4** | 支付宝/钉钉小程序 | Taro 4 | Taro 已支持，增量开发成本低 | 2-3 周 |

**为什么先做小程序？**
1. 微信小程序是金融场景的**标配入口**，用户无需安装 App
2. Taro 与 React/TS 技术栈一致，团队学习成本最低
3. 小程序审核快（1-3天），迭代速度快
4. 可以快速验证多端架构（共享包抽取、API 适配）

### 6.2 详细工作量估算

#### P0：微信小程序（Taro 4）—— 4-6 周

| 阶段 | 工作内容 | 工期 |
|------|---------|:----:|
| 基础搭建 | Taro 项目初始化、共享包抽取、API 适配层 | 1 周 |
| 核心功能 | 对话页面（SSE流式）、知识库列表、历史记录 | 2 周 |
| 适配优化 | 小程序特有交互（下拉刷新、分享、订阅消息） | 1 周 |
| 测试上线 | 真机调试、性能优化、微信审核 | 1-2 周 |

**团队要求**：1 名前端（React/TS 熟练）+ 0.5 名后端（API 适配）

#### P1：安卓/iOS MVP（Capacitor）—— 1-2 周

| 阶段 | 工作内容 | 工期 |
|------|---------|:----:|
| 集成 | Capacitor 接入 Next.js 项目、原生平台配置 | 2-3 天 |
| 适配 | 移动端响应式布局、原生 API 调用（推送/相机） | 3-5 天 |
| 打包 | 签名、图标、启动屏、应用商店素材 | 2-3 天 |

**团队要求**：1 名前端（Next.js 熟练），无需新技能

#### P2：安卓/iOS 正式版（React Native）—— 6-8 周

| 阶段 | 工作内容 | 工期 |
|------|---------|:----:|
| 项目搭建 | RN + Expo 初始化、导航、状态管理 | 1 周 |
| 核心页面 | 对话、知识库、设置等 5-8 个核心页面 | 3 周 |
| 原生功能 | 推送通知、生物识别、文件操作 | 1 周 |
| 性能优化 | 列表优化、图片缓存、包体积优化 | 1 周 |
| 测试上线 | E2E 测试、商店审核 | 1-2 周 |

**团队要求**：1-2 名前端（需学 RN + Expo），1 名原生开发（处理原生模块）

#### P3：鸿蒙 App（ArkTS）—— 8-12 周

| 阶段 | 工作内容 | 工期 |
|------|---------|:----:|
| 学习准备 | ArkTS/ArkUI 学习、DevEco Studio 熟悉 | 2 周 |
| 项目搭建 | 鸿蒙项目初始化、HTTP/SSE 适配 | 1 周 |
| 核心页面 | 对话（SSE）、知识库、设置 | 4 周 |
| 鸿蒙特有 | 元服务、卡片、分布式能力 | 2 周 |
| 测试上架 | 真机测试、AppGallery 审核 | 1-3 周 |

**团队要求**：1 名专职鸿蒙开发（需新招或培训），学习曲线陡峭

### 6.3 团队技能要求总览

| 技能 | 当前团队 | 需新增/培训 |
|------|---------|-----------|
| TypeScript/React | ✅ 已有 | - |
| Next.js | ✅ 已有 | - |
| Taro (React) | ⚠️ 需学习 | 1-2 周培训，难度低 |
| Capacitor | ⚠️ 需学习 | 1 周培训，难度极低 |
| React Native | ⚠️ 需学习 | 2-3 周培训，难度中 |
| ArkTS/ArkUI | ❌ 缺失 | 需新招1人或4-6周培训 |
| Vue.js (uni-app) | ❌ 缺失 | 如选 uni-app 需 2-3 周培训 |
| Dart (Flutter) | ❌ 缺失 | 如选 Flutter 需 3-4 周培训 |

### 6.4 持续维护成本

| 端 | 框架 | 月维护工时 | 说明 |
|----|------|:---------:|------|
| Web | Next.js | 40h | 当前基线 |
| 微信小程序 | Taro | 20h | Taro 版本升级 + 小程序 API 更新 |
| 安卓/iOS | Capacitor/RN | 30h | 原生 SDK 更新 + RN 版本升级 |
| 鸿蒙 | ArkTS | 30h | 鸿蒙 API 快速迭代，适配成本高 |
| 支付宝/钉钉 | Taro | 8h | 增量维护，成本低 |
| **合计** | | **~128h/月** | 约 0.8 人月 |

---

## 七、风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|:----:|:----:|---------|
| 鸿蒙 API 频繁变更 | 高 | 高 | 锁定 API 版本，关注华为 Changelog |
| Taro 跨端兼容 bug | 中 | 中 | 充分条件编译，各端独立测试 |
| Capacitor 性能不足 | 中 | 中 | 仅作 MVP，验证后迁移 RN |
| 共享包抽象过度 | 中 | 低 | 按需抽取，不过度设计 |
| 多端 UI 不一致 | 高 | 中 | 统一 Design Token + 视觉走查 |
| SSE 在小程序端限制 | 中 | 高 | 微信小程序支持 SSE（需验证），否则降级轮询 |

---

## 八、决策总结

### 一句话结论

> **小程序用 Taro（React/TS 一致），App 用 Capacitor 快出 MVP 后转 RN（性能），鸿蒙用 ArkTS（唯一选择），后端 API 统一复用。**

### 核心决策逻辑

1. **最大化技术栈复用** → Taro (React/TS) 而非 uni-app (Vue)
2. **最快验证移动端** → Capacitor 包 Next.js 而非从零写 RN
3. **鸿蒙无替代** → ArkTS 是唯一选项，必须独立开发
4. **后端不变** → FastAPI 微服务架构天然支持多端

### 不推荐的选择及原因

| 不推荐 | 原因 |
|--------|------|
| Flutter | Dart 语言壁垒高，无法复用 React/TS 代码，不支持小程序 |
| uni-app | Vue 生态，现有 React 组件全部作废，App 端性能不如 RN |
| KMP | Kotlin 学习成本高，不支持鸿蒙和小程序 |
| .NET MAUI | C# 学习成本极高，社区萎缩，完全不适用 |
| 全原生 | 开发成本 4-5 倍，小团队无法承受 |

---

*本报告基于 2026 年 8 月各框架最新版本状态编写，框架迭代快，建议每季度复盘。*