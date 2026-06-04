# **1. 组件定位**

## **1.1 核心职责**

本组件负责优化AI Agent的工具调用架构，参考金融行业最佳实践（ai-trading-claude、FinGPT）重新设计6组49工具体系，通过Skill路由编排、工具分组路由、动态工具检索、工具描述增强、调用流程校验和金融视觉文档分析，构建"Query → Skill选择 → Tool编排执行"的分层决策体系，并支持"截图/图片上传 → 视觉解析 → 结构化提取 → Skill编排执行"的视觉行动链路，解决LLM在大量工具面前选择困惑、复杂多工具协作query无法完成的问题，同时赋予Agent对金融文档截图的结构化数据提取和图表识别能力。视觉分析采用双引擎策略：PaddleOCR-VL-1.6 MCP Server（本地Docker，免费无限量，文档结构化SOTA 96.3%）为主力引擎，失败时降级到百炼云端视觉模型（qwen3.5-plus，100W token额度，仅PaddleOCR不可用时紧急降级）。

## **1.2 核心输入**

1. 用户通过前端发起的金融分析查询请求（如"五粮液2025年资产负债率是多少？结合近30日成交量变化分析其偿债能力。"）
2. Agent运行时LLM输出的Skill选择指令（JSON格式）
3. Agent运行时LLM输出的工具调用指令（JSON格式）
4. 工具注册表中所有已注册工具的元信息（名称、描述、参数定义）
5. Skill注册表中所有已注册Skill的元信息（名称、描述、编排步骤、关联工具）
6. 工具执行后返回的结果数据
7. Skill编排步骤间传递的上下文数据
8. 用户通过前端上传的金融文档截图/图片（研报图表截图、K线/技术图表截图、财务报表图片）
9. 用户通过剪贴板粘贴的截图（Ctrl+V）

## **1.3 核心输出**

1. 按金融投研工作流阶段分组的6组工具集及其路由规则
2. 根据用户query语义匹配的Skill及其编排执行结果
3. 根据用户query语义动态检索出的相关工具子集
4. 增强后的工具描述（含when_to_use、when_not_to_use、example_calls）
5. 增强后的Skill描述（含适用场景、编排步骤概要）
6. 工具调用校验结果（通过/拒绝/修正建议）
7. 最终整合后的Agent回答
8. 研报截图的结构化数据提取结果（JSON格式）
9. K线/技术图表截图的量化交易信号识别结果
10. 财报图片的财务指标自动计算结果（含原始字段值和计算比率）

## **1.4 职责边界**

1. 不负责修改LLM模型本身的能力（模型推理能力、知识截止日期等不变）
2. 不负责修改具体工具的业务逻辑（各工具的内部实现不变）
3. 不负责修改前端UI或API接口路径（API Route的请求/响应格式不变）
4. 不负责替换现有百炼LLM调用链路（callBailian/callWithFallback的调用方式不变）
5. 不负责修改现有SkillRegistry的核心注册接口（仅做整合和扩展）
6. 不负责引入OmniParser/ShowUI/UFO³等GUI自动化模型（经调研不适用金融场景）
7. 不负责实现通用OCR引擎（复用PaddleOCR-VL-1.6 MCP Server和MinerU能力）
8. 不负责图片存储和持久化管理（图片仅在当次请求处理生命周期内有效）

# **2. 领域术语**

**工具分组（Tool Group）**
: 按金融投研工作流的自然阶段将工具划分为逻辑组，每组包含5-12个功能相近的工具。工具分组按"数据获取"和"数据分析"两类职责区分，命名采用"动词+名词"camelCase规范。如"行情数据组"包含getStockHistory、getStockRealtime等市场数据获取工具。

**主组归属制**
: 每个工具有且仅有一个主组归属，不可跨组重复注册。Skill可跨组编排（引用不同组的工具），路由Agent匹配Skill后自动加载Skill涉及的所有组的工具。

**路由Agent（Router Agent）**
: 顶层Agent，首先判断用户query需要哪个Skill，在无法匹配Skill时退化为判断需要哪个工具组。分类结果决定后续执行路径。

**子Agent（Sub Agent）**
: 对应特定工具组的Agent实例，只能看到本组内的工具描述，负责执行具体的工具调用。

**Skill**
: 复合能力单元，由多个Tool按编排流程组合而成，代表一种业务能力。如"偿债能力分析"Skill = getStockFinancial + getValuationMetrics + 计算偿债比率。Skill定义了Tool的调用顺序、数据流转和条件分支逻辑。

**Skill编排（Skill Orchestration）**
: Skill内部定义的Tool调用序列执行过程，包含调用顺序控制、上下文传递、条件分支判断和错误恢复处理。

**Skill路由（Skill Routing）**
: 顶层路由Agent首先根据用户query语义匹配最合适的Skill，而非直接选择Tool。将LLM的决策层次从"Query → Tool"提升为"Query → Skill → Tool"。

**Skill与Tool关系**
: Tool是原子级别的单一操作，Skill是复合能力由多个Tool组合而成。Skill是Tool的上层抽象，一个Skill可包含来自不同分组的多个Tool。

**动态工具检索（Dynamic Tool Retrieval）**
: 根据用户query的语义向量，从全量工具向量索引中召回最相关的top-K个工具，仅将这K个工具的描述传给LLM。

**动态Skill检索（Dynamic Skill Retrieval）**
: 根据用户query的语义向量，从Skill向量索引中召回最相关的top-K个Skill，优先在Skill级别进行匹配，再加载其下的Tool。

**工具向量索引（Tool Vector Index）**
: 为每个工具建立的向量索引，索引内容包含工具名称、描述、典型使用场景的embedding向量。

**Skill向量索引（Skill Vector Index）**
: 为每个Skill建立的向量索引，索引内容包含Skill名称、描述、适用场景、关联工具的embedding向量。

**增强工具描述（Enhanced Tool Description）**
: 在原有name+description+parameters基础上，新增when_to_use、when_not_to_use、example_calls字段的结构化描述模板。

**增强Skill描述（Enhanced Skill Description）**
: 在Skill基础描述上，新增适用场景描述、编排步骤概要、典型query示例的结构化描述模板，供路由Agent和动态检索使用。

**工具调用校验（Tool Call Validation）**
: LLM输出工具调用指令后，执行前的中间校验层，校验工具名存在性、必填参数齐全性、参数类型正确性、参数值合理性。

**Skill上下文传递（Skill Context Passing）**
: Skill编排过程中，前一个Tool的输出作为后一个Tool的输入的机制。支持显式字段映射和自动类型转换。

**Skill条件分支（Skill Conditional Branch）**
: Skill编排过程中，根据中间结果决定后续调用路径的机制。如查到多个实体时需要用户选择，或根据数据可用性选择不同分析路径。

**Skill错误恢复（Skill Error Recovery）**
: Skill编排过程中，某个Tool调用失败时，Skill决定重试或换用备选Tool的机制。包含重试策略和备选路径定义。

**ReAct模式**
: 推理-行动循环模式，LLM先推理需要什么，再执行工具调用，根据结果继续推理，直到得出最终答案。

**工具调用次数上限（Max Tool Calls）**
: 单次Agent运行中允许的工具调用总次数上限，超过后强制终止并输出"无法完成请求"。

**行情数据组（Market Data Group）**
: 获取A股市场原始数据的工具组，包含getStockHistory、getStockRealtime、getStockList、getTradeCalendar、getIndustry、getConcept、getTickData、getMinuteData、getIndexData、getFundFlow共10个工具，职责为"数据获取"。

**基本面数据组（Fundamental Data Group）**
: 获取财务报表、估值、公司基本面数据的工具组，包含getStockFinancial、getFinancialReport、getValuationMetrics、getCompanyProfile、getDividendHistory、getEarningsCalendar、getInsiderTrading、getShareholderStructure共8个工具，职责为"数据获取"。

**技术分析组（Technical Analysis Group）**
: 计算技术指标和量化信号的工具组，包含calculateMA、calculateMACD、calculateRSI、calculateBollinger、calculateKDJ、calculateVWAP、calculateSharpeRatio、calculateMaxDrawdown、calculateVolatility、calculateCorrelation共10个工具，职责为"数据分析"。

**风控合规组（Risk & Compliance Group）**
: 风险评估、合规检查、交易限制的工具组，包含checkTradeCompliance、checkPositionLimit、checkRestrictedStock、getComplianceReport、calculateVaR、calculateStressTest、checkRiskLimits、generateRiskReport共8个工具，职责为"数据分析"。

**模拟交易组（Paper Trading Group）**
: 模拟账户和交易操作的工具组，包含createPaperAccount、getAccount、placeOrder、getPositions、getOrderHistory、getTradeHistory共6个工具，职责为"数据获取+操作执行"。

**知识与文档组（Knowledge & Documents Group）**
: RAG检索、文档分析、视觉分析的工具组，包含hybridSearch、parsePDF、extractFinancialData、generateResearchReport、summarizeDocument、analyzeImage、extractFromScreenshot共7个工具，职责为"数据获取+分析"。

**投研分析类Skill**
: 基于金融投研工作流的分析型Skill，包含technical-analysis（技术面综合分析）、fundamental-analysis（基本面综合分析）、debt-solvency-analysis（偿债能力分析）、valuation-analysis（估值分析）、investment-thesis（投资论点生成）、sector-rotation（板块轮动分析）、stock-comparison（股票对比分析）、sentiment-analysis（市场情绪分析）。

**风控合规类Skill**
: 风险与合规相关Skill，包含compliance-check（合规检查）、risk-assessment（风险评估）。

**综合诊断类Skill**
: 多维度综合分析Skill，包含comprehensive-diagnosis（综合诊断）。

**视觉分析类Skill**
: 金融视觉文档分析Skill，包含screenshot-to-structured-data（研报截图结构化提取）、chart-pattern-recognition（K线图表形态识别）、financial-statement-ocr（财报OCR指标计算）。

**金融视觉文档分析（Agentic Vision-to-Action for Finance）**
: 用户上传金融文档截图/图片，通过双引擎视觉分析策略（PaddleOCR-VL-1.6 MCP Server为主力引擎，百炼云端qwen3.5-plus为降级引擎）和MinerU VLM引擎解析图片内容，提取结构化金融数据或识别图表形态，最终形成可执行的Skill编排流程。实现"截图→引擎选择→解析→结构化→行动"的自动化链路。

**Vision模型（VISION_MODEL）**
: 百炼云端多模态视觉语言模型（qwen3.5-plus），可对图片进行描述、识别、结构化信息提取。项目中image-caption.ts已有调用逻辑，通过DashScope OpenAI兼容接口调用，作为视觉分析的降级引擎（仅PaddleOCR不可用时紧急降级，100W token额度约58次图片分析）。

**PaddleOCR-VL-1.6 MCP Server**
: PaddleOCR官方提供的MCP Server实现（位于PaddlePaddle/PaddleOCR仓库的mcp_server/目录），支持文档图片的OCR文字识别和结构化提取。作为MCP Tool注册到项目现有MCP工具体系（src/server/mcp/tools/），通过stdio或SSE协议通信，Docker容器部署，作为视觉分析的主力引擎（文档结构化准确率96.3%，OmniDocBench SOTA，免费无限量，CPU推理15-30秒/页）。

**双引擎视觉分析策略**
: 视觉分析采用本地MCP Server+云端模型的双引擎架构：PaddleOCR-VL-1.6 MCP Server为主力引擎优先调用（本地Docker免费无限量，文档结构化SOTA），当PaddleOCR容器未启动、超时或返回错误时，自动降级到百炼云端qwen3.5-plus模型进行图片分析（100W token额度，仅紧急降级使用）。通过VISION_FALLBACK_ENABLED环境变量控制降级策略是否启用。

**MinerU VLM引擎**
: 开源PDF/图片文档结构化解析引擎（65.7k stars），支持VLM+OCR双引擎，可将图片/PDF转换为结构化Markdown/JSON。项目已通过parsePDFWithMinerU集成MinerU API。

**图片上传组件（Image Upload Component）**
: 前端组件，支持拖拽、粘贴（Ctrl+V）、选择文件三种方式上传图片，提供图片预览和结果展示。

# **3. 角色与边界**

## **3.1 核心角色**

- **终端用户**：通过浏览器发起金融分析查询，期望Agent准确调用多个工具完成复杂分析；通过上传金融文档截图/图片，期望Agent自动提取结构化数据、识别图表形态或计算财务指标
- **运维人员**：配置工具分组规则、Skill编排定义、调整动态检索参数（top-K值）、维护工具/Skill向量索引；配置PADDLEOCR_MCP_ENABLED、VISION_MODEL、VISION_FALLBACK_ENABLED等环境变量和MinerU API参数
- **Skill开发者**：定义新的Skill编排逻辑，声明Skill包含的Tool序列和执行规则；定义投研分析类Skill（technical-analysis、fundamental-analysis、debt-solvency-analysis、valuation-analysis、investment-thesis、sector-rotation、stock-comparison、sentiment-analysis）和金融视觉Skill

## **3.2 外部系统**

- **百炼LLM API**：大语言模型服务，接收含工具描述的prompt，返回工具调用指令或文本回答
- **ToolRegistry**：现有工具注册中心，存储所有已注册工具的name、description、parameters、execute
- **SkillRegistry**：现有Skill注册中心，存储多步骤编排Skill的name、description、triggerKeywords、steps
- **Python数据服务（data_service）**：提供getStockHistory、getStockFinancial等市场数据获取能力
- **RAG检索服务（hybridSearch）**：提供知识库文档检索能力
- **Vision模型服务（qwen3.5-plus）**：百炼云端多模态视觉语言模型服务，提供图片描述、图表识别、内容提取能力，通过DashScope OpenAI兼容接口（DASHSCOPE_API_KEY）调用，作为视觉分析降级引擎（仅PaddleOCR不可用时紧急降级）
- **PaddleOCR-VL-1.6 MCP Server**：PaddleOCR官方MCP Server实现，提供文档图片OCR文字识别和结构化提取能力，作为MCP Tool注册到项目MCP工具体系，通过stdio/SSE协议通信，Docker容器部署，作为视觉分析主力引擎（文档结构化SOTA 96.3%，免费无限量）
- **MinerU API**：文档结构化解析服务，支持VLM+OCR双引擎，将图片/PDF转换为结构化Markdown/JSON，通过MINERU_API_KEY调用

## **3.3 交互上下文**

```plantuml
@startuml
left to right direction

actor "终端用户" as User
actor "运维人员" as Admin
actor "Skill开发者" as Dev

rectangle "Agent工具路由优化组件" as System {
}

system "百炼LLM API" as LLM
system "ToolRegistry\n(全量工具注册)" as ToolReg
system "SkillRegistry\n(Skill编排)" as SkillReg
system "Python数据服务" as DataService
system "RAG检索服务" as RAG
system "Vision模型服务\n(qwen3.5-plus)" as Vision
system "PaddleOCR-VL-1.6\nMCP Server" as PaddleOCR
system "MinerU API" as MinerU

User --> System : 金融分析query / 金融文档截图
System --> LLM : 含Skill/工具描述的prompt
LLM --> System : Skill选择/工具调用指令
System --> SkillReg : 匹配Skill/执行Skill编排
System --> ToolReg : 查询工具定义/执行工具
System --> DataService : 调用市场数据工具
System --> RAG : 调用hybridSearch
System --> PaddleOCR : 调用OCR/结构化提取(主力引擎)
PaddleOCR --> System : 返回OCR解析结果
System --> Vision : 降级调用图片描述/图表识别(PaddleOCR失败时)
Vision --> System : 返回视觉分析结果
System --> MinerU : 调用文档结构化解析
Admin --> System : 配置工具分组/Skill编排/检索参数/环境变量
Dev --> System : 定义Skill编排逻辑/投研分析Skill/金融视觉Skill
System --> User : 最终整合回答/结构化数据提取结果
@enduml
```

# **4. DFX约束**

## **4.1 性能**

1. Skill路由决策时间不超过500ms（不含LLM推理时间）
2. 工具分组路由决策时间不超过500ms（不含LLM推理时间）
3. 动态Skill检索（向量召回）时间不超过200ms
4. 动态工具检索（向量召回）时间不超过200ms
5. 工具调用校验时间不超过50ms
6. Skill编排执行中，步骤间上下文传递延迟不超过10ms
7. 优化后的Agent在处理复杂多工具协作query时，所需迭代轮次比当前平铺模式减少至少40%
8. systemPrompt中工具描述部分的token数量比当前平铺模式减少至少50%
9. PaddleOCR-VL-1.6 MCP Server单张图片OCR解析时间不超过30秒（主力引擎，CPU推理15-30秒/页）
10. Vision模型（qwen3.5-plus）图片描述响应时间不超过30秒（降级引擎，单张图片）
11. 双引擎降级切换时间不超过5秒（从PaddleOCR失败到Vision调用开始）
12. MinerU VLM引擎单张图片结构化解析时间不超过60秒
13. 金融视觉Skill整体执行时间不超过90秒（从图片上传到结构化结果输出）
14. 图片上传大小限制为10MB，支持JPG/PNG/BMP/WebP格式

## **4.2 可靠性**

1. Skill路由准确率不低于85%（路由到包含正确Skill的结果）
2. 工具分组路由准确率不低于85%（路由到包含正确工具的组）
3. 动态Skill检索召回率不低于90%（正确Skill出现在top-K结果中）
4. 动态工具检索召回率不低于90%（正确工具出现在top-K结果中）
5. 工具调用校验误拒率不超过5%（正确调用被误判为错误的比例）
6. 优化后的Agent对复杂query的完成率不低于80%（在maxIterations内得出完整答案）
7. Skill编排成功率不低于95%（已匹配Skill的编排步骤全部执行完成的比例）
8. MinerU VLM引擎解析成功率不低于90%（图片/PDF成功输出结构化结果的比例）
9. PaddleOCR-VL-1.6 MCP Server OCR解析成功率不低于95%（主力引擎，图片成功返回识别文本的比例）
10. Vision模型（qwen3.5-plus）图片描述成功率不低于90%（降级引擎，图片成功返回描述文本的比例）
11. 双引擎降级成功率不低于98%（PaddleOCR失败后Vision成功接替的比例）
12. extractFinancialData财务字段提取准确率不低于80%（14个标准字段中正确提取的比例）

## **4.3 安全性**

1. Skill路由不得绕过现有的权限控制和数据隔离机制
2. 工具分组路由不得绕过现有的权限控制和数据隔离机制
3. 动态Skill检索不得泄露Skill内部编排逻辑或敏感配置
4. 动态工具检索不得泄露工具内部实现细节或敏感配置
5. 工具调用校验不得执行任何未在ToolRegistry中注册的工具
6. Skill编排只能调用已声明关联的Tool，不得动态调用未声明的Tool
7. 上传图片必须经过格式和大小校验，禁止上传非图片格式文件
8. 上传图片内容不得包含恶意代码（如图片隐写攻击），需进行基本安全检测
9. PADDLEOCR_MCP_ENABLED、VISION_MODEL、VISION_FALLBACK_ENABLED、DASHSCOPE_API_KEY、MINERU_API_KEY等敏感配置不得暴露在前端或日志中
10. PaddleOCR-VL-1.6 MCP Server容器必须以非root用户运行，禁止容器内提权
11. PaddleOCR MCP Server通信必须限制在本项目内部网络，禁止外部直接访问

## **4.4 可维护性**

1. 工具分组配置应支持热更新，无需重启服务
2. Skill编排定义应支持热更新，无需重启服务
3. 新增工具时只需声明所属分组和增强描述，无需修改路由逻辑
4. 新增Skill时只需在SkillRegistry注册编排定义，无需修改路由逻辑
5. 工具向量索引应支持增量更新，无需全量重建
6. Skill向量索引应支持增量更新，无需全量重建
7. 所有关键决策点（Skill路由结果、工具路由结果、检索结果、校验结果、编排步骤执行结果）应有可观测日志
8. PaddleOCR-VL-1.6 MCP Server调用应有完整日志记录（MCP工具名、输入大小、解析时间、输出大小，主力引擎）
9. Vision模型（qwen3.5-plus）调用应有完整日志记录（模型名、图片大小、响应时间、token消耗，降级引擎）
10. 双引擎降级事件应有明确日志记录（降级触发原因、源引擎PaddleOCR-VL-1.6、目标引擎qwen3.5-plus、切换耗时）
11. MinerU API调用应有完整日志记录（解析模式、输入大小、解析时间、输出大小）
12. 金融视觉Skill执行应有端到端日志链路（图片上传→引擎选择→解析→提取→计算全流程）
13. PaddleOCR MCP Server容器健康状态应可监控（CPU/内存占用、进程存活）

## **4.5 兼容性**

1. 优化后的Agent必须向后兼容现有ToolRegistry和SkillRegistry的注册接口
2. 现有的所有工具（49个）必须继续正常工作
3. 现有的Skill编排机制（SkillRegistry + executeSkill）必须继续正常工作
4. API接口（/api/agent/run、/api/agent/stream）的请求/响应格式不变
5. 现有的reflection-node（反思评估）机制必须继续正常工作
6. Skill路由为可选启用，关闭后应完全退化为原有工具分组路由模式
7. 启用VISION_MODEL（qwen3.5-plus）后，现有image-caption.ts的调用方式不变，仅作为降级引擎启用已有关键路径
8. PaddleOCR-VL-1.6 MCP Server作为MCP Tool注册，必须与项目现有MCP工具体系（src/server/mcp/tools/）的注册机制完全兼容
9. 金融视觉功能必须向后兼容现有文档上传和RAG流程（现有PDF上传→解析→chunk→检索链路不受影响）
10. 双引擎降级策略为可选启用（VISION_FALLBACK_ENABLED=false时禁用降级，仅使用PaddleOCR主力引擎）
11. 新增工具分组不得影响现有工具分组的路由规则和分组配置
12. 工具命名规范（动词+名词camelCase）变更时，需同时支持旧命名别名，确保过渡期兼容

# **5. 核心能力**

## **5.1 Skill路由与编排**

### **5.1.1 业务规则**

1. **Skill优先路由规则**：系统必须提供顶层路由Agent，优先根据用户query的语义匹配最合适的Skill，而非直接选择Tool

   a. 验收条件：When 用户提交query"分析五粮液的偿债能力", the 路由Agent shall 优先匹配到"debt-solvency-analysis"Skill，而非直接路由到单独的getStockFinancial工具

2. **Skill匹配降级规则**：当路由Agent无法匹配任何Skill时，应降级到工具分组路由模式

   a. 验收条件：If 路由Agent无法匹配任何Skill（如query为"五粮液今日股价"这类简单查询）, the 路由模块 shall 降级使用工具分组路由，直接路由到"行情数据组"

3. **Skill编排执行规则**：Skill确定后，由Skill内部的编排逻辑按步骤调用对应的Tool序列

   a. 验收条件：When 路由Agent匹配到"debt-solvency-analysis"Skill, the 编排引擎 shall 按Skill定义的步骤依次执行getStockFinancial → getValuationMetrics → 计算偿债比率，并完成上下文传递

4. **Skill上下文传递规则**：Skill编排中，前一个Tool的输出必须可作为后一个Tool的输入

   a. 验收条件：When "debt-solvency-analysis"Skill执行, the 编排引擎 shall 将getStockFinancial返回的财务数据传递给后续计算步骤作为输入参数

5. **Skill条件分支规则**：Skill编排中，必须支持根据中间结果决定后续调用路径

   a. 验收条件：When Skill执行中getStockFinancial返回多个实体结果, the 编排引擎 shall 暂停并要求用户选择目标实体，再继续后续步骤

6. **Skill错误恢复规则**：Skill编排中，某个Tool调用失败时，Skill必须决定重试或换用备选Tool

   a. 验收条件：When "debt-solvency-analysis"Skill中getStockFinancial调用失败, the 编排引擎 shall 按Skill定义的错误恢复策略换用备选工具getFinancialReport获取财务数据

7. **Skill可复用规则**：同一Skill必须可被不同Agent复用

   a. 验收条件：When "compliance-check"Skill被风控Agent和交易Agent同时引用, the SkillRegistry shall 确保两个Agent各自独立执行该Skill，互不干扰

8. **Skill与工具分组关系规则**：Skill可作为工具分组的上层抽象，一个Skill可包含来自不同分组的多个Tool

   a. 验收条件：When 查看"debt-solvency-analysis"Skill的定义, the Skill shall 包含来自"基本面数据组"的getStockFinancial、getValuationMetrics和来自"技术分析组"的计算偿债比率工具

9. **Skill描述增强规则**：每个Skill的描述必须包含适用场景、编排步骤概要、典型query示例

   a. 验收条件：When 查看"debt-solvency-analysis"Skill的增强描述, the 描述 shall 包含适用场景"用户需要分析企业偿债能力时"、编排步骤概要"获取财务数据→获取估值指标→计算偿债比率"、典型query示例"分析XX公司的偿债能力"

10. **Skill编排步骤校验规则**：Skill编排执行前，必须校验所有步骤引用的Tool在ToolRegistry中已注册

    a. 验收条件：When Skill编排定义中引用了不存在的Tool "unknown_tool", the 编排引擎 shall 拒绝执行该Skill并返回"Skill编排步骤引用了未注册的工具：unknown_tool"

11. **Skill跨组工具自动加载规则**：路由Agent匹配Skill后，必须自动加载Skill涉及的所有工具组的工具

    a. 验收条件：When 路由Agent匹配到"debt-solvency-analysis"Skill（涉及基本面数据组和技术分析组）, the 路由模块 shall 自动加载两个组的全部工具描述到子Agent的可用工具集

12. **禁止项**：禁止Skill编排中执行未在Skill定义中声明的Tool

    a. 验收条件：When Skill编排执行过程中, the 编排引擎 shall 仅执行Skill定义中声明的Tool序列，不得动态添加未声明的Tool调用

### **5.1.2 交互流程**

```plantuml
@startuml
actor "用户" as User
participant "路由Agent" as Router
participant "Skill编排引擎" as Orchestrator
participant "SkillRegistry" as SkillReg
system "百炼LLM" as LLM
system "ToolRegistry" as ToolReg

User -> Router : "分析五粮液的偿债能力"
Router -> LLM : Skill路由分类请求(含Skill描述)
LLM --> Router : 匹配Skill: "debt-solvency-analysis"
Router -> SkillReg : 获取"debt-solvency-analysis"编排定义
SkillReg --> Router : 编排步骤[getStockFinancial, getValuationMetrics, 计算偿债比率]
Router -> Orchestrator : 启动Skill编排执行

Orchestrator -> ToolReg : 执行Step1: getStockFinancial
ToolReg --> Orchestrator : 财务数据

Orchestrator -> ToolReg : 执行Step2: getValuationMetrics(传入股票代码上下文)
ToolReg --> Orchestrator : 估值指标数据

Orchestrator -> Orchestrator : Step3: 计算偿债比率(传入前两步数据)

Orchestrator --> User : 整合回答：偿债能力分析报告
@enduml
```

### **5.1.3 异常场景**

1. **Skill路由匹配失败**

   a. 触发条件：路由Agent无法将query匹配到任何已知Skill

   b. 系统行为：降级到工具分组路由模式，记录降级事件日志

   c. 用户感知：用户仍能获得回答，路由直接在工具分组层级工作

2. **Skill编排步骤引用未注册Tool**

   a. 触发条件：Skill定义中的某个步骤引用了ToolRegistry中不存在的Tool

   b. 系统行为：拒绝执行该Skill，记录错误日志，尝试降级到工具分组路由

   c. 用户感知：Agent尝试通过工具分组路由模式完成请求

3. **Skill编排中间步骤失败**

   a. 触发条件：Skill编排中某个Tool调用执行失败

   b. 系统行为：按Skill定义的错误恢复策略处理（重试或换用备选Tool），若恢复策略也失败则终止该Skill，记录错误日志

   c. 用户感知：Agent尝试自动恢复或降级处理，可能给出部分结果

4. **Skill编排条件分支等待用户输入**

   a. 触发条件：条件分支判断需要用户选择（如多个实体匹配）

   b. 系统行为：暂停编排执行，向用户展示选项列表等待选择

   c. 用户感知：用户需要从选项中选择后，分析继续进行

5. **Skill编排超时**

   a. 触发条件：Skill编排执行总时间超过配置的超时上限

   b. 系统行为：终止Skill编排，返回已完成的步骤结果和超时提示

   c. 用户感知：获得部分分析结果，提示请求过于复杂可简化重试

## **5.2 工具分组与路由Agent**

### **5.2.1 业务规则**

1. **工具分组规则**：系统必须将所有已注册工具按金融投研工作流自然阶段划分为6个逻辑组，每组工具按"数据获取"和"数据分析"两类职责区分

   a. 验收条件：When 系统初始化工具分组配置, the 工具分组模块 shall 将49个工具划分为以下6个分组：
   - **行情数据组（Market Data）**（10个工具，职责：数据获取）：getStockHistory、getStockRealtime、getStockList、getTradeCalendar、getIndustry、getConcept、getTickData、getMinuteData、getIndexData、getFundFlow
   - **基本面数据组（Fundamental Data）**（8个工具，职责：数据获取）：getStockFinancial、getFinancialReport、getValuationMetrics、getCompanyProfile、getDividendHistory、getEarningsCalendar、getInsiderTrading、getShareholderStructure
   - **技术分析组（Technical Analysis）**（10个工具，职责：数据分析）：calculateMA、calculateMACD、calculateRSI、calculateBollinger、calculateKDJ、calculateVWAP、calculateSharpeRatio、calculateMaxDrawdown、calculateVolatility、calculateCorrelation
   - **风控合规组（Risk & Compliance）**（8个工具，职责：数据分析）：checkTradeCompliance、checkPositionLimit、checkRestrictedStock、getComplianceReport、calculateVaR、calculateStressTest、checkRiskLimits、generateRiskReport
   - **模拟交易组（Paper Trading）**（6个工具，职责：数据获取+操作执行）：createPaperAccount、getAccount、placeOrder、getPositions、getOrderHistory、getTradeHistory
   - **知识与文档组（Knowledge & Documents）**（7个工具，职责：数据获取+分析）：hybridSearch、parsePDF、extractFinancialData、generateResearchReport、summarizeDocument、analyzeImage、extractFromScreenshot

2. **主组归属规则**：每个工具有且仅有一个主组归属，不可跨组重复注册

   a. 验收条件：When 工具分组配置完成, the 工具分组模块 shall 确保每个工具只出现在一个分组中，不存在跨组重复的工具

3. **分组工具数量规则**：每个工具组的工具数量应控制在5-12个之间，超过时需进一步拆分子组

   a. 验收条件：When 工具分组配置完成, the 工具分组模块 shall 确保每个分组的工具数量在5-12个范围内

4. **工具命名规范规则**：所有工具命名必须采用"动词+名词"camelCase格式（如getStockHistory而非get_stock_history）

   a. 验收条件：When 新工具注册到ToolRegistry, the 注册模块 shall 校验工具名符合camelCase命名规范，首个单词为动词（get/calculate/check/create/place/parse/extract/generate/summarize/analyze/hybrid）

5. **分组职责区分规则**：工具分组必须按"数据获取"和"数据分析"两类职责区分，行情数据组和基本面数据组为"数据获取"职责，技术分析组和风控合规组为"数据分析"职责

   a. 验收条件：When 查看行情数据组的工具列表, the 工具分组模块 shall 确保该组所有工具均为数据获取类（get开头），不含数据分析类工具（calculate/check开头）

6. **路由Agent分类规则**：当Skill路由降级时，系统必须使用工具分组路由Agent，根据用户query的语义将请求路由到对应的工具组

   a. 验收条件：When Skill路由降级且用户提交query"五粮液2025年资产负债率是多少？结合近30日成交量变化分析其偿债能力。", the 路由Agent shall 将query路由到"行情数据组"和"基本面数据组"两个分组

7. **多组路由规则**：当query涉及多个领域的工具时，路由Agent应返回多个分组，并合并这些分组的工具集

   a. 验收条件：When 路由Agent识别query涉及财务数据和技术分析, the 路由Agent shall 返回"基本面数据组"和"技术分析组"的合并工具集，而非只返回一个分组

8. **子Agent可见工具规则**：子Agent只能看到被路由到的工具组中的工具描述，不可见其他分组的工具

   a. 验收条件：While 子Agent执行query, the 子Agent shall 仅能调用被路由到的工具组中已注册的工具，调用未授权工具时返回"工具不在可用范围内"

9. **路由降级规则**：当路由Agent无法确定分组时，应降级到当前的全量工具平铺模式

   a. 验收条件：If 路由Agent无法匹配任何工具分组, the 路由模块 shall 降级使用全量工具描述构建prompt，与当前行为一致

10. **Skill与分组协同路由规则**：Skill路由为第一优先级，当无法匹配Skill时再使用工具分组路由

    a. 验收条件：When 用户提交query, the 路由模块 shall 先尝试Skill路由匹配，仅在匹配失败时降级到工具分组路由

### **5.2.2 交互流程**

```plantuml
@startuml
actor "用户" as User
participant "路由Agent" as Router
participant "子Agent\n(行情数据组+基本面数据组)" as SubAgent
system "百炼LLM" as LLM
system "ToolRegistry" as ToolReg

User -> Router : "五粮液资产负债率+成交量分析"
Router -> Router : Skill路由匹配(无匹配Skill)
Router -> LLM : 降级:工具分组路由分类请求(仅含分组描述)
LLM --> Router : 分类结果:[行情数据组, 基本面数据组]
Router -> ToolReg : 获取两组的工具描述
ToolReg --> Router : 合并工具描述(10-18个)
Router -> SubAgent : 执行(含合并工具集)
SubAgent -> LLM : 工具调用(getStockFinancial)
LLM --> SubAgent : 工具调用指令
SubAgent -> ToolReg : 执行getStockFinancial
ToolReg --> SubAgent : 财务数据结果
SubAgent -> LLM : 综合分析(偿债能力)
LLM --> SubAgent : 最终分析结果
SubAgent --> User : 整合回答
@enduml
```

### **5.2.3 异常场景**

1. **路由分类失败**

   a. 触发条件：路由Agent返回的分类结果不包含任何已知分组

   b. 系统行为：降级到全量工具平铺模式，记录降级事件日志

   c. 用户感知：用户仍能获得回答，但可能迭代轮次较多

2. **工具组配置缺失**

   a. 触发条件：某个已注册工具未在任何分组配置中声明

   b. 系统行为：将该工具归入"通用"默认分组，记录警告日志

   c. 用户感知：该工具仍可被调用（通过默认分组或降级模式）

3. **分组工具数量超限**

   a. 触发条件：某分组的工具数量超过12个

   b. 系统行为：记录警告日志，提示运维人员考虑进一步拆分子组，但不阻断运行

   c. 用户感知：无直接影响，但LLM选择准确率可能下降

4. **工具命名不符合规范**

   a. 触发条件：新注册的工具名不符合camelCase命名规范

   b. 系统行为：记录警告日志，建议修正为规范命名，但仍允许注册（兼容旧命名）

   c. 用户感知：功能可用，但日志中提示命名不规范

## **5.3 动态工具与Skill检索**

### **5.3.1 业务规则**

1. **Skill向量索引构建规则**：系统必须为每个已注册Skill构建向量索引，索引内容包含Skill名称、描述、适用场景、关联工具

   a. 验收条件：When 系统初始化, the 动态检索模块 shall 为每个已注册Skill生成embedding向量并存储到Skill向量索引中

2. **工具向量索引构建规则**：系统必须为每个已注册工具构建向量索引，索引内容包含工具名称、描述、典型使用场景

   a. 验收条件：When 系统初始化, the 动态工具检索模块 shall 为每个已注册工具生成embedding向量并存储到索引中，索引条目数等于已注册工具数

3. **Skill优先检索规则**：动态检索时，应先在Skill级别进行语义检索匹配，再加载匹配Skill下的Tool

   a. 验收条件：When 执行动态检索且用户query为"分析偿债能力", the 检索模块 shall 优先在Skill向量索引中检索，返回"debt-solvency-analysis"Skill，再加载该Skill关联的Tool

4. **Skill检索降级到Tool检索规则**：当Skill检索结果不满足要求时，应降级到Tool级别的向量检索

   a. 验收条件：If Skill检索结果的最高相关度低于阈值, the 检索模块 shall 降级在工具向量索引中进行检索，返回最相关的Tool

5. **语义检索规则**：系统必须根据用户query的语义向量，从工具向量索引中召回最相关的top-K个工具

   a. 验收条件：When 用户提交query"五粮液资产负债率"且Skill检索降级, the 动态工具检索模块 shall 在召回结果中包含getStockFinancial工具（top-K >= 5时）

6. **top-K参数规则**：默认top-K值为8，可配置，取值范围为5-15；Skill检索和Tool检索可分别配置top-K

   a. 验收条件：When 执行动态检索, the 检索模块 shall 返回不超过top-K个结果，且按相关度降序排列

7. **检索结果替换规则**：Skill检索命中时，将匹配Skill的描述及其关联Tool的描述写入systemPrompt；Tool检索命中时，将检索出的top-K个工具的描述写入systemPrompt

   a. 验收条件：When Skill检索匹配到"debt-solvency-analysis"Skill, the Agent模块 shall 将该Skill描述及其关联的Tool描述写入systemPrompt

8. **检索与分组协同规则**：动态工具检索应与工具分组路由协同工作——先由路由确定候选分组，再在候选分组内进行向量检索

   a. 验收条件：When 路由Agent确定候选分组为"行情数据组"和"技术分析组", the 动态检索模块 shall 仅在这两个分组的工具范围内进行向量检索

9. **Skill索引更新规则**：新增或修改Skill时，应增量更新Skill向量索引，无需全量重建

   a. 验收条件：When 新Skill注册到SkillRegistry, the 索引模块 shall 在5秒内完成该Skill的embedding计算和索引更新

10. **索引更新规则**：新增或修改工具时，应增量更新向量索引，无需全量重建

    a. 验收条件：When 新工具注册到ToolRegistry, the 索引模块 shall 在5秒内完成该工具的embedding计算和索引更新

11. **检索降级规则**：当Skill和Tool的向量索引均不可用时，应降级到工具分组路由模式

    a. 验收条件：If Skill向量索引和工具向量索引均不可用, the 检索模块 shall 降级使用路由分组内的全量工具，记录降级事件日志

### **5.3.2 交互流程**

```plantuml
@startuml
actor "用户" as User
participant "动态检索模块" as Retriever
participant "Skill向量索引" as SkillIndex
participant "工具向量索引" as ToolIndex
system "百炼LLM" as LLM
system "SkillRegistry" as SkillReg
system "ToolRegistry" as ToolReg

User -> Retriever : query="分析五粮液的偿债能力"
Retriever -> SkillIndex : query embedding + topK=5
SkillIndex --> Retriever : 匹配Skill: "debt-solvency-analysis"

alt Skill检索命中
    Retriever -> SkillReg : 获取"debt-solvency-analysis"及其关联Tool
    SkillReg --> Retriever : Skill描述 + [getStockFinancial, getValuationMetrics, ...]
    Retriever -> ToolReg : 获取关联Tool的增强描述
    ToolReg --> Retriever : 增强描述列表
    Retriever -> LLM : 构建prompt(含Skill描述+关联Tool描述)
else Skill检索未命中，降级到Tool检索
    Retriever -> ToolIndex : query embedding + topK=8
    ToolIndex --> Retriever : top8相关工具
    Retriever -> ToolReg : 获取top8工具的增强描述
    ToolReg --> Retriever : 增强描述列表
    Retriever -> LLM : 构建prompt(仅含8个工具描述)
end

LLM --> Retriever : Skill选择/工具调用指令
Retriever --> User : 最终回答
@enduml
```

### **5.3.3 异常场景**

1. **Skill向量索引未构建**

   a. 触发条件：系统启动时Skill向量索引构建失败或未完成

   b. 系统行为：降级到工具向量检索模式，后台异步重试Skill索引构建

   c. 用户感知：首次查询使用工具检索，后续查询Skill检索自动生效

2. **工具向量索引未构建**

   a. 触发条件：系统启动时向量索引构建失败或未完成

   b. 系统行为：降级到工具分组路由模式，后台异步重试索引构建

   c. 用户感知：首次查询可能延迟，后续查询正常

3. **Skill检索和Tool检索均无有效结果**

   a. 触发条件：Skill检索和Tool检索的最高相关度均低于最低阈值

   b. 系统行为：降级到全量工具平铺模式

   c. 用户感知：与当前未优化模式行为一致

4. **检索结果未包含正确工具**

   a. 触发条件：top-K检索结果中不包含query所需的正确工具

   b. 系统行为：反思机制（reflection-node）检测到答案不充分时，扩大top-K重新检索（如top-K从8扩大到15）

   c. 用户感知：可能需要额外1-2轮迭代

5. **embedding服务不可用**

   a. 触发条件：计算query embedding时embedding服务返回错误

   b. 系统行为：降级到关键词匹配检索（基于Skill/工具名称和描述的文本匹配）

   c. 用户感知：检索质量可能下降，但功能可用

## **5.4 工具描述增强**

### **5.4.1 业务规则**

1. **增强描述模板规则**：每个工具的描述必须采用增强schema，包含name、description、when_to_use、when_not_to_use、parameters、example_calls六个字段

   a. 验收条件：When 工具注册到增强描述系统, the 描述模块 shall 为该工具生成包含全部六个字段的增强描述

2. **when_to_use规则**：when_to_use字段必须明确描述该工具的适用场景，使用自然语言

   a. 验收条件：When 查看getStockFinancial的增强描述, the 描述模块 shall 包含when_to_use为"用户询问营收、净利润、ROE、毛利率、资产负债率等财务指标时使用此工具"，而非空泛的"获取股票财务数据"

3. **when_not_to_use规则**：when_not_to_use字段必须明确描述不适用场景，并指向正确的工具

   a. 验收条件：When 查看hybridSearch的增强描述, the 描述模块 shall 包含when_not_to_use为"不要用hybridSearch查找具体财务数字（如营收、利润），应使用getStockFinancial；不要用hybridSearch获取股价数据，应使用getStockHistory"

4. **example_calls规则**：example_calls字段必须提供1-2个完整的调用示例，包含工具名和参数

   a. 验收条件：When 查看getStockFinancial的增强描述, the 描述模块 shall 包含example_calls如{"tool":"getStockFinancial","parameters":{"code":"600519","source":"efinance"}}

5. **工具选择边界规则**：增强描述必须明确区分容易混淆的工具的使用边界

   a. 验收条件：When 查看getStockFinancial和getFinancialReport的增强描述, the 描述模块 shall 在when_not_to_use中互相指向对方，说明"如需详细报表项目用getFinancialReport，如需关键财务指标用getStockFinancial"

6. **few-shot示例规则**：systemPrompt中必须包含2-3个完整的"用户问题→正确工具调用"示例

   a. 验收条件：When 构建Agent的systemPrompt, the prompt构建模块 shall 包含few-shot示例，如"用户问：招商银行MA20是多少？→ 先调用getStockHistory获取数据，再调用calculateMA计算"

7. **Skill增强描述模板规则**：每个Skill的描述必须采用增强schema，包含name、description、applicable_scenarios、orchestration_summary、typical_queries、related_tools六个字段

   a. 验收条件：When Skill注册到增强描述系统, the 描述模块 shall 为该Skill生成包含全部六个字段的增强描述

8. **Skill适用场景规则**：applicable_scenarios字段必须明确描述该Skill的适用业务场景

   a. 验收条件：When 查看"debt-solvency-analysis"Skill的增强描述, the 描述模块 shall 包含applicable_scenarios为"用户需要分析企业偿债能力、资产负债率、流动比率等偿债相关指标时"，而非空泛的"财务分析"

### **5.4.2 交互流程**

```plantuml
@startuml
participant "增强描述模块" as Enhanced
system "ToolRegistry" as ToolReg
system "SkillRegistry" as SkillReg
system "百炼LLM" as LLM

Enhanced -> ToolReg : 读取工具基础描述
ToolReg --> Enhanced : {name, description, parameters}
Enhanced -> Enhanced : 附加when_to_use
Enhanced -> Enhanced : 附加when_not_to_use
Enhanced -> Enhanced : 附加example_calls

Enhanced -> SkillReg : 读取Skill基础描述
SkillReg --> Enhanced : {name, description, steps}
Enhanced -> Enhanced : 附加applicable_scenarios
Enhanced -> Enhanced : 附加orchestration_summary
Enhanced -> Enhanced : 附加typical_queries

Enhanced -> Enhanced : 注入few-shot示例到prompt
Enhanced -> LLM : 发送含Skill和工具增强描述的prompt
LLM --> Enhanced : 更准确的Skill选择和工具调用
@enduml
```

### **5.4.3 异常场景**

1. **增强描述字段缺失**

   a. 触发条件：某个工具的增强描述缺少when_to_use或when_not_to_use字段

   b. 系统行为：使用基础描述（description字段）作为兜底，记录警告日志

   c. 用户感知：LLM工具选择准确率可能下降，但功能可用

2. **Skill增强描述字段缺失**

   a. 触发条件：某个Skill的增强描述缺少applicable_scenarios或orchestration_summary字段

   b. 系统行为：使用Skill基础描述（description + triggerKeywords）作为兜底，记录警告日志

   c. 用户感知：Skill路由准确率可能下降，但功能可用

3. **example_calls参数过时**

   a. 触发条件：example_calls中的参数格式与当前工具参数定义不一致

   b. 系统行为：工具调用校验层会捕获参数错误，返回修正建议

   c. 用户感知：LLM根据修正建议调整参数重试

## **5.5 工具调用校验与流程控制**

### **5.5.1 业务规则**

1. **JSON Schema强制输出规则**：系统必须使用约束解码（function calling API或json_mode）强制LLM输出结构化的工具调用格式

   a. 验收条件：When LLM生成工具调用, the 调用校验模块 shall 确保输出为合法JSON格式，不包含非JSON文本

2. **工具名校验规则**：LLM输出的工具名必须在ToolRegistry中存在

   a. 验收条件：When LLM输出工具名"getStockData"（不存在）, the 校验模块 shall 返回错误"工具getStockData不存在，可用工具：[列表]"，而非直接执行

3. **必填参数校验规则**：LLM输出的工具调用必须包含所有必填参数

   a. 验收条件：When LLM调用getStockHistory但未提供code参数, the 校验模块 shall 返回错误"缺少必填参数code"

4. **参数类型校验规则**：LLM输出的参数值类型必须与工具参数定义的类型匹配

   a. 验收条件：When LLM调用calculateMA传入period="twenty"（字符串而非数字）, the 校验模块 shall 返回错误"参数period类型错误：期望number，实际string"

5. **参数值合理性校验规则**：LLM输出的参数值应在合理范围内

   a. 验收条件：When LLM调用calculateMA传入period=0或period=-5, the 校验模块 shall 返回错误"参数period值不合理：期望正整数，实际0/-5"

6. **校验失败处理规则**：校验失败时，应将错误信息反馈给LLM让其修正，而非直接中断

   a. 验收条件：When 工具调用校验失败, the 校验模块 shall 将错误信息追加到messages中，允许LLM根据错误信息重新生成工具调用

7. **校验重试上限规则**：同一工具调用的校验重试次数不超过3次

   a. 验收条件：When 某工具调用连续3次校验失败, the 校验模块 shall 放弃该工具调用，记录错误日志

8. **ReAct修正规则**：工具执行失败或结果不理想时，应允许LLM根据错误信息再次尝试

   a. 验收条件：When getStockHistory执行返回"fetch failed", the Agent模块 shall 将错误信息反馈给LLM，允许其换用其他数据源（如从baostock切换到efinance）重试

9. **工具调用总次数上限规则**：单次Agent运行中的工具调用总次数不得超过配置的上限值（默认15次）

   a. 验收条件：When 工具调用累计次数达到15次, the Agent模块 shall 终止执行并返回"工具调用次数已达上限，无法完成请求"

10. **重复调用检测规则**：同一工具以相同参数被调用两次时，第二次应直接复用第一次的结果

    a. 验收条件：When LLM尝试第二次以相同参数调用getStockFinancial, the Agent模块 shall 直接返回第一次的结果，而非重新执行

11. **Skill编排内校验规则**：Skill编排执行中的Tool调用同样必须经过校验层校验

    a. 验收条件：When Skill编排执行中的Tool调用未通过校验, the 编排引擎 shall 按Skill错误恢复策略处理，而非跳过校验直接执行

12. **禁止项**：禁止在校验层执行任何修改数据库或外部系统状态的操作

    a. 验收条件：When 检查校验模块代码, the 代码审查 shall 不存在任何写操作（INSERT、UPDATE、DELETE、POST、PUT）

### **5.5.2 交互流程**

```plantuml
@startuml
actor "LLM" as LLM
participant "调用校验模块" as Validator
participant "Skill编排引擎" as Orchestrator
participant "ToolRegistry" as ToolReg
system "百炼LLM" as LLMRetry

alt Skill编排模式
    Orchestrator -> Validator : Skill步骤中的工具调用指令
else 直接调用模式
    LLM -> Validator : 工具调用指令
end

Validator -> Validator : 校验工具名存在性
Validator -> Validator : 校验必填参数齐全性
Validator -> Validator : 校验参数类型正确性
Validator -> Validator : 校验参数值合理性

alt 校验通过
    Validator -> ToolReg : 执行工具
    ToolReg --> Validator : 执行结果
    Validator --> LLM : Observation: 结果
else 校验失败
    Validator -> LLMRetry : 错误信息(校验失败详情)
    LLMRetry --> Validator : 修正后的工具调用
    Validator -> ToolReg : 执行修正后的工具
    ToolReg --> Validator : 执行结果
    Validator --> LLM : Observation: 结果
end
@enduml
```

### **5.5.3 异常场景**

1. **LLM持续输出无效工具调用**

   a. 触发条件：LLM连续3次输出校验失败的工具调用

   b. 系统行为：放弃该工具调用，记录错误日志，尝试使用反思机制重新规划

   c. 用户感知：Agent可能给出部分答案或"无法完成请求"

2. **工具执行超时**

   a. 触发条件：单个工具执行时间超过30秒

   b. 系统行为：终止该工具执行，返回"工具执行超时"，允许LLM换用替代工具

   c. 用户感知：Agent尝试其他方式获取数据

3. **工具调用次数耗尽**

   a. 触发条件：累计工具调用次数达到上限

   b. 系统行为：终止Agent执行，返回当前已获取的最佳答案和"工具调用次数已达上限"提示

   c. 用户感知：获得部分答案，提示可简化query重试

4. **校验模块与工具执行结果不一致**

   a. 触发条件：校验通过但工具执行返回错误（如参数逻辑上合法但业务上无效）

   b. 系统行为：将工具执行错误反馈给LLM，由LLM决定下一步行动

   c. 用户感知：Agent自动调整策略重试

5. **Skill编排中校验失败触发错误恢复**

   a. 触发条件：Skill编排步骤中的Tool调用校验失败

   b. 系统行为：触发Skill错误恢复策略，尝试重试或换用备选Tool

   c. 用户感知：Agent自动尝试恢复，可能需要额外等待时间

## **5.6 金融视觉文档分析**

### **5.6.1 业务规则**

1. **PaddleOCR-VL-1.6 MCP Server主力引擎规则**：系统必须将PaddleOCR-VL-1.6作为视觉分析的主力引擎，作为MCP Tool注册到项目现有MCP工具体系（src/server/mcp/tools/），与其他MCP工具统一管理，通过stdio或SSE协议通信。PaddleOCR-VL-1.6文档结构化准确率96.3%（OmniDocBench SOTA），本地Docker免费无限量，CPU推理15-30秒/页

   a. 验收条件：When 系统启动且PADDLEOCR_MCP_ENABLED=true, the MCP工具注册模块 shall 成功注册PaddleOCR-VL MCP Tool到现有MCP工具体系，Agent可通过标准MCP协议调用PaddleOCR进行OCR解析，且PaddleOCR作为主力引擎优先调用

2. **VISION_MODEL降级引擎规则**：系统必须启用VISION_MODEL环境变量，配置百炼云端多模态视觉语言模型qwen3.5-plus，激活image-caption.ts中已有的Vision调用逻辑（DashScope OpenAI兼容接口），作为视觉分析降级引擎（仅PaddleOCR不可用时紧急降级，100W token额度约58次图片分析）

   a. 验收条件：When 系统启动且VISION_MODEL环境变量已配置为qwen3.5-plus, the 视觉分析模块 shall 成功通过DashScope OpenAI兼容接口调用Vision模型对图片进行描述，作为降级引擎在PaddleOCR失败时启用，不再抛出"VISION_MODEL 环境变量未设置"错误

3. **双引擎降级策略规则**：视觉分析必须实现"PaddleOCR-VL-1.6 MCP Server主力 → 百炼云端qwen3.5-plus降级"的双引擎策略。当PaddleOCR MCP Tool调用失败（容器未启动、超时、返回错误）时，自动降级到Vision模型（qwen3.5-plus）

   a. 验收条件：When PaddleOCR-VL-1.6 MCP Tool调用失败（容器未启动/超时/返回错误）且VISION_FALLBACK_ENABLED=true, the 视觉分析模块 shall 自动切换到Vision模型（qwen3.5-plus）进行图片分析，记录降级事件日志（包含降级原因和切换耗时）

4. **降级策略开关规则**：降级策略通过VISION_FALLBACK_ENABLED环境变量控制，默认true。关闭时仅使用PaddleOCR主力引擎，失败不降级到云端

   a. 验收条件：When VISION_FALLBACK_ENABLED=false且PaddleOCR MCP Tool调用失败, the 视觉分析模块 shall 直接返回错误，不尝试降级调用Vision模型

5. **PaddleOCR MCP Server Docker部署规则**：PaddleOCR-VL-1.6 MCP Server必须通过Docker容器部署，基于PaddleOCR官方deploy/paddleocr_vl_docker/构建镜像，CPU模式运行（USE_GPU=false）

   a. 验收条件：When docker-compose启动paddleocr-vl服务, the 容器 shall 以CPU模式（USE_GPU=false）运行PaddleOCR-VL-1.6模型，模型加载完成后MCP Server进入就绪状态，可接受MCP Tool调用

6. **MinerU VLM引擎优先规则**：研报截图结构化解析中，MinerU VLM引擎作为高精度结构化解析的首选方案，当MinerU不可用时降级到双引擎视觉分析方案（PaddleOCR-VL-1.6主力 → qwen3.5-plus降级）

   a. 验收条件：When 用户上传研报截图并MinerU API可用, the 视觉分析模块 shall 优先调用MinerU VLM引擎进行结构化解析；If MinerU API不可用, the 视觉分析模块 shall 降级使用双引擎视觉分析方案（PaddleOCR-VL-1.6 MCP Tool主力，失败时降级qwen3.5-plus）

7. **研报截图结构化提取规则（screenshot-to-structured-data）**：用户上传研报截图时，系统必须通过MinerU VLM引擎解析图片内容，再调用extractFinancialData提取14个标准财务字段，输出结构化JSON

   a. 验收条件：When 用户上传一张包含资产负债表的研报截图, the screenshot-to-structured-data Skill shall 返回包含revenue、netProfit、roe、debtRatio、grossMargin、netMargin、eps、bvps、operatingCashFlow、totalAssets、totalLiabilities等字段的JSON结构

8. **K线图表形态识别规则（chart-pattern-recognition）**：用户上传K线/技术图表截图时，系统必须通过双引擎策略（PaddleOCR-VL-1.6 MCP Tool主力 → Vision模型qwen3.5-plus降级）识别图表类型和技术形态，再调用量化工具生成交易信号

   a. 验收条件：When 用户上传一张K线图截图, the chart-pattern-recognition Skill shall 优先通过PaddleOCR-VL-1.6 MCP Tool识别图表类型和技术形态，若失败则降级通过Vision模型（qwen3.5-plus）识别，识别后调用calculateMA、calculateMACD等技术指标工具生成交易信号

9. **财报图片OCR指标计算规则（financial-statement-ocr）**：用户上传财报图片时，系统必须通过双引擎策略（PaddleOCR-VL-1.6 MCP Tool主力 → qwen3.5-plus降级）提取文本，再通过正则提取财务字段，最后自动计算财务比率

   a. 验收条件：When 用户上传一张资产负债表图片, the financial-statement-ocr Skill shall 优先通过PaddleOCR-VL-1.6 MCP Tool提取文本，若失败则降级通过Vision模型（qwen3.5-plus）识别文本，再提取财务字段并返回原始字段值（totalAssets、totalLiabilities等）和计算比率（debtRatio = totalLiabilities/totalAssets × 100%）

10. **视觉Skill注册规则**：3个金融视觉Skill必须注册到SkillRegistry，遵循现有Skill定义规范

    a. 验收条件：When 系统初始化, the SkillRegistry shall 包含screenshot-to-structured-data、chart-pattern-recognition、financial-statement-ocr三个Skill的完整编排定义

11. **视觉Skill与路由协同规则**：金融视觉Skill必须与Skill路由和工具分组路由机制协同工作，视觉分析作为知识与文档组的一部分参与路由决策

    a. 验收条件：When 用户上传图片并附带query"提取这张研报的财务数据", the 路由Agent shall 优先匹配screenshot-to-structured-data Skill，而非单独路由到知识与文档组

12. **图片上传校验规则**：上传图片必须经过格式校验和大小校验

    a. 验收条件：When 用户上传一个20MB的图片, the 图片上传模块 shall 拒绝上传并返回"图片大小超过10MB限制"；When 用户上传一个.exe文件, the 图片上传模块 shall 拒绝上传并返回"仅支持JPG/PNG/BMP/WebP格式"

13. **图片上传方式规则**：前端图片上传组件必须支持拖拽、粘贴（Ctrl+V）、选择文件三种方式

    a. 验收条件：When 用户在聊天窗口按Ctrl+V粘贴剪贴板截图, the 图片上传组件 shall 自动捕获粘贴事件并显示图片预览；When 用户拖拽图片到聊天窗口, the 图片上传组件 shall 显示图片预览

14. **图片预览与结果展示规则**：上传图片后必须显示图片预览，分析完成后必须在图片下方展示结构化结果

    a. 验收条件：When 用户上传研报截图并分析完成, the 前端 shall 在图片预览下方展示提取的财务指标列表和对应数值

15. **视觉Skill编排步骤规则**：每个金融视觉Skill必须定义清晰的编排步骤和上下文传递逻辑

    a. 验收条件：When 执行screenshot-to-structured-data Skill, the 编排引擎 shall 按步骤执行extractFromScreenshot → extractFinancialData，并完成步骤间上下文传递

16. **视觉分析与文档分析协同规则**：金融视觉Skill可调用文档分析类工具（extractFinancialData）作为编排步骤，实现跨分组的工具协作

    a. 验收条件：When screenshot-to-structured-data Skill执行, the 编排引擎 shall 调用属于知识与文档组的extractFinancialData工具，实现视觉分析与文档分析的跨组协作

17. **analyzeImage统一入口规则**：知识与文档组中analyzeImage为视觉分析的统一入口工具，封装PaddleOCR-VL-1.6 MCP Tool主力调用逻辑，支持降级到Vision模型（qwen3.5-plus）

    a. 验收条件：When 需要对图片进行视觉分析, the 调用方 shall 通过analyzeImage工具统一调用，而非直接调用PaddleOCR MCP Tool或Vision模型API；If PaddleOCR MCP Tool调用失败且VISION_FALLBACK_ENABLED=true, the analyzeImage shall 自动降级调用Vision模型（qwen3.5-plus）

18. **extractFromScreenshot结构化提取规则**：知识与文档组中extractFromScreenshot封装MinerU VLM引擎调用逻辑，专门用于研报截图的结构化提取

    a. 验收条件：When 需要对研报截图进行结构化提取, the 调用方 shall 通过extractFromScreenshot工具调用MinerU VLM引擎，返回结构化Markdown/JSON

19. **PaddleOCR MCP Tool与MCP工具体系统一管理规则**：PaddleOCR-VL-1.6 MCP Tool必须与项目中其他MCP Tool（如现有src/server/mcp/tools/下的工具）使用相同的注册、发现、调用机制

    a. 验收条件：When 查看项目MCP工具列表, the PaddleOCR-VL-1.6 MCP Tool shall 与其他MCP Tool一起被统一列出，遵循相同的注册接口和调用协议

20. **环境变量配置规则**：视觉分析相关环境变量必须包含PADDLEOCR_MCP_ENABLED（默认true，主力引擎开关）、VISION_MODEL（默认qwen3.5-plus，降级引擎）、VISION_FALLBACK_ENABLED（默认true，降级策略开关），通过.env或docker-compose.yml配置

    a. 验收条件：When 系统启动, the 配置模块 shall 读取VISION_MODEL、PADDLEOCR_MCP_ENABLED、VISION_FALLBACK_ENABLED三个环境变量，缺失时使用默认值

21. **禁止项**：禁止金融视觉Skill绕过SkillRegistry直接调用Vision模型、PaddleOCR MCP Server或MinerU API

    a. 验收条件：When 金融视觉Skill执行, the Skill shall 通过SkillRegistry和ToolRegistry的标准接口调用Vision模型、PaddleOCR MCP Tool和MinerU API，不得绕过注册机制直接调用

### **5.6.2 交互流程**

**场景1：研报截图→结构化数据提取**

```plantuml
@startuml
actor "用户" as User
participant "图片上传组件" as Upload
participant "Skill编排引擎" as Orchestrator
system "MinerU API" as MinerU
system "document_analysis\n(extractFinancialData)" as DocAnalysis
participant "SkillRegistry" as SkillReg

User -> Upload : 上传研报截图
Upload -> Orchestrator : 图片Base64 + query"提取财务数据"
Orchestrator -> SkillReg : 匹配Skill: screenshot-to-structured-data
SkillReg --> Orchestrator : 编排步骤[extractFromScreenshot, extractFinancialData]

Orchestrator -> MinerU : Step1: extractFromScreenshot(图片Base64)
MinerU --> Orchestrator : 结构化Markdown/JSON文本

Orchestrator -> DocAnalysis : Step2: extractFinancialData(解析文本)
DocAnalysis --> Orchestrator : FinancialMetrics{revenue, netProfit, roe, ...}

Orchestrator --> User : 结构化财务指标JSON结果
@enduml
```

**场景2：K线/技术图表截图→量化信号识别（双引擎降级）**

```plantuml
@startuml
actor "用户" as User
participant "图片上传组件" as Upload
participant "Skill编排引擎" as Orchestrator
system "PaddleOCR-VL-1.6\nMCP Server" as PaddleOCR
system "Vision模型\n(qwen3.5-plus)" as Vision
system "量化工具\n(calculateMA/MACD/RSI)" as QuantTools
participant "SkillRegistry" as SkillReg

User -> Upload : 上传K线图截图
Upload -> Orchestrator : 图片Base64 + query"识别K线形态并生成信号"
Orchestrator -> SkillReg : 匹配Skill: chart-pattern-recognition
SkillReg --> Orchestrator : 编排步骤[analyzeImage, calculateTechnicalIndicators, generateSignal]

Orchestrator -> PaddleOCR : Step1a: PaddleOCR MCP Tool(图片Base64, K线识别prompt)
alt PaddleOCR成功
    PaddleOCR --> Orchestrator : 图表类型"K线图"，形态"头肩顶"，关键价格位
else PaddleOCR失败(降级)
    PaddleOCR --> Orchestrator : 调用失败
    Orchestrator -> Vision : Step1b: Vision模型(图片Base64, K线识别prompt)
    Vision --> Orchestrator : 图表类型"K线图"，形态"头肩顶"，关键价格位
end

Orchestrator -> QuantTools : Step2: calculateTechnicalIndicators(基于识别的股票代码和时间范围)
QuantTools --> Orchestrator : MA/MACD/RSI等指标值

Orchestrator -> Orchestrator : Step3: generateSignal(形态+指标→交易信号)
Orchestrator --> User : 交易信号：形态"头肩顶"+技术指标+建议方向
@enduml
```

**场景3：财报图片→财务指标自动计算（双引擎降级）**

```plantuml
@startuml
actor "用户" as User
participant "图片上传组件" as Upload
participant "Skill编排引擎" as Orchestrator
system "PaddleOCR-VL-1.6\nMCP Server" as PaddleOCR
system "Vision模型\n(qwen3.5-plus)" as Vision
system "document_analysis\n(extractFinancialData)" as DocAnalysis
participant "比率计算模块" as Calculator
participant "SkillRegistry" as SkillReg

User -> Upload : 上传财报图片
Upload -> Orchestrator : 图片Base64 + query"计算财务比率"
Orchestrator -> SkillReg : 匹配Skill: financial-statement-ocr
SkillReg --> Orchestrator : 编排步骤[analyzeImage, extractFinancialData, calculateRatios]

Orchestrator -> PaddleOCR : Step1a: PaddleOCR MCP Tool(图片Base64, 主力引擎)
alt PaddleOCR成功
    PaddleOCR --> Orchestrator : OCR识别文本（含财务字段和数值）
else PaddleOCR失败(降级)
    PaddleOCR --> Orchestrator : 调用失败
    Orchestrator -> Vision : Step1b: Vision模型(图片Base64, 降级引擎)
    Vision --> Orchestrator : 识别文本（含财务字段和数值）
end

Orchestrator -> DocAnalysis : Step2: extractFinancialData(识别文本)
DocAnalysis --> Orchestrator : FinancialMetrics{totalAssets, totalLiabilities, ...}

Orchestrator -> Calculator : Step3: calculateRatios(FinancialMetrics)
Calculator --> Orchestrator : 财务比率{debtRatio:65.2%, roe:12.3%, currentRatio:1.5, ...}

Orchestrator --> User : 原始字段值 + 计算比率结果
@enduml
```

### **5.6.3 异常场景**

1. **PaddleOCR MCP Server未启动（主力引擎不可用）**

   a. 触发条件：系统启动时PADDLEOCR_MCP_ENABLED=true但paddleocr-vl Docker容器未运行或未就绪

   b. 系统行为：若VISION_MODEL已配置且VISION_FALLBACK_ENABLED=true，则降级使用Vision模型（qwen3.5-plus）作为视觉分析引擎；若VISION_FALLBACK_ENABLED=false或VISION_MODEL未配置，则禁用所有金融视觉Skill。记录警告日志，Agent仍可通过文本query正常工作

   c. 用户感知：图片上传功能可用，视觉分析降级使用云端Vision模型（若已配置）或返回"视觉引擎不可用，请联系管理员"

2. **PaddleOCR-VL-1.6 MCP Tool调用失败触发降级**

   a. 触发条件：PaddleOCR MCP Tool调用返回容器未启动、超时、返回错误或空结果

   b. 系统行为：若VISION_FALLBACK_ENABLED=true，自动降级到Vision模型（qwen3.5-plus）进行图片分析，记录降级事件日志（包含降级原因、源引擎PaddleOCR-VL-1.6、目标引擎qwen3.5-plus、切换耗时）

   c. 用户感知：视觉分析正常完成，结果可能精度略有差异，响应时间增加（含降级切换耗时）

3. **PaddleOCR MCP Tool和Vision模型均失败**

   a. 触发条件：PaddleOCR-VL-1.6 MCP Tool调用失败且Vision模型（qwen3.5-plus）调用也失败

   b. 系统行为：返回"视觉分析暂不可用，请稍后重试"提示，记录双重失败错误日志

   c. 用户感知：收到视觉分析失败提示，可稍后重试或使用文本query

4. **VISION_MODEL未配置（降级引擎不可用）**

   a. 触发条件：PaddleOCR MCP Tool失败需要降级，但VISION_MODEL环境变量未设置

   b. 系统行为：记录警告日志"降级引擎Vision模型未配置，无法降级"，直接返回PaddleOCR调用失败错误

   c. 用户感知：收到"视觉分析失败，降级引擎未配置"提示，仅能使用PaddleOCR主力引擎

5. **MinerU API不可用**

   a. 触发条件：调用MinerU VLM引擎时API返回错误或超时

   b. 系统行为：降级到双引擎视觉分析方案（PaddleOCR-VL-1.6主力，失败时降级qwen3.5-plus），记录降级事件日志

   c. 用户感知：解析结果可能精度降低，但功能可用

6. **图片格式不支持**

   a. 触发条件：用户上传的图片格式不在支持列表中（如SVG、TIFF）

   b. 系统行为：拒绝上传，返回格式不支持提示和支持格式列表

   c. 用户感知："仅支持JPG/PNG/BMP/WebP格式的图片"

7. **图片大小超限**

   a. 触发条件：用户上传的图片大小超过10MB

   b. 系统行为：拒绝上传，返回大小超限提示

   c. 用户感知："图片大小超过10MB限制，请压缩后重试"

8. **PaddleOCR MCP Tool OCR解析失败**

   a. 触发条件：PaddleOCR MCP Tool调用返回错误或响应内容为空

   b. 系统行为：重试最多3次，若仍失败且VISION_FALLBACK_ENABLED=true则降级到Vision模型（qwen3.5-plus）；若降级也失败或VISION_FALLBACK_ENABLED=false则返回"图片分析失败，请确保图片清晰"提示

   c. 用户感知：收到图片分析失败提示或通过Vision模型降级成功获取结果

9. **OCR提取文本为空**

   a. 触发条件：财报图片OCR提取后文本内容为空或不含任何财务字段

   b. 系统行为：返回"未识别到财务数据，请确保图片包含清晰的财务报表内容"提示

   c. 用户感知：收到识别失败提示，可重新上传更清晰的图片

10. **extractFinancialData提取字段为零**

    a. 触发条件：extractFinancialData从解析文本中未提取到任何财务字段

    b. 系统行为：返回解析文本和"未识别到标准财务指标"提示，供用户参考

    c. 用户感知：获得原始解析文本但无结构化指标，可手动查看

11. **图表形态识别不确定**

    a. 触发条件：双引擎（PaddleOCR/Vision）均无法确定K线图的技术形态（如形态不明显或图片模糊）

    b. 系统行为：返回图表类型识别结果和"形态识别不确定"提示，仍提供技术指标计算结果

    c. 用户感知：获得技术指标但形态判断不确定，可参考指标自行判断

12. **剪贴板内容非图片**

    a. 触发条件：用户按Ctrl+V但剪贴板内容为文本而非图片

    b. 系统行为：忽略粘贴事件，不触发图片上传流程

    c. 用户感知：粘贴操作无反应，文本粘贴到正常输入框

13. **降级策略关闭时PaddleOCR主力引擎失败**

    a. 触发条件：VISION_FALLBACK_ENABLED=false且PaddleOCR MCP Tool调用失败

    b. 系统行为：直接返回PaddleOCR调用错误，不尝试Vision模型降级

    c. 用户感知：收到"视觉分析失败"提示，无法通过降级获取结果

## **5.7 投研分析Skill体系**

### **5.7.1 业务规则**

1. **投研分析Skill注册规则**：系统必须注册以下8个投研分析类Skill到SkillRegistry，遵循Skill定义规范

   a. 验收条件：When 系统初始化, the SkillRegistry shall 包含technical-analysis、fundamental-analysis、debt-solvency-analysis、valuation-analysis、investment-thesis、sector-rotation、stock-comparison、sentiment-analysis共8个投研分析类Skill

2. **technical-analysis Skill规则**：技术面综合分析Skill必须按5步编排执行：calculateMA → calculateMACD → calculateRSI → calculateBollinger → calculateKDJ

   a. 验收条件：When 路由Agent匹配到"technical-analysis"Skill, the 编排引擎 shall 依次执行5个技术指标计算步骤，并整合输出技术面综合分析结果

3. **fundamental-analysis Skill规则**：基本面综合分析Skill必须按4步编排执行：getStockFinancial → getValuationMetrics → getCompanyProfile → getDividendHistory

   a. 验收条件：When 路由Agent匹配到"fundamental-analysis"Skill, the 编排引擎 shall 依次执行4个基本面数据获取步骤，并整合输出基本面综合分析结果

4. **debt-solvency-analysis Skill规则**：偿债能力分析Skill必须按3步编排执行：getStockFinancial → getValuationMetrics → 计算偿债比率

   a. 验收条件：When 路由Agent匹配到"debt-solvency-analysis"Skill, the 编排引擎 shall 依次获取财务数据和估值指标，计算资产负债率、流动比率、速动比率等偿债指标

5. **valuation-analysis Skill规则**：估值分析Skill必须按3步编排执行：getStockFinancial → getValuationMetrics → 行业对比

   a. 验收条件：When 路由Agent匹配到"valuation-analysis"Skill, the 编排引擎 shall 依次获取财务数据和估值指标，与同行业公司进行估值对比分析

6. **investment-thesis Skill规则**：投资论点生成Skill必须输出看多/看空案例、催化剂、入场/离场策略

   a. 验收条件：When 路由Agent匹配到"investment-thesis"Skill, the 编排引擎 shall 整合多维度数据生成结构化投资论点，包含bullCase（看多案例）、bearCase（看空案例）、catalysts（催化剂）、entryStrategy（入场策略）、exitStrategy（离场策略）

7. **sector-rotation Skill规则**：板块轮动分析Skill必须按3步编排执行：getFundFlow → 相对强弱计算 → 龙头股识别

   a. 验收条件：When 路由Agent匹配到"sector-rotation"Skill, the 编排引擎 shall 依次获取资金流向数据、计算板块相对强弱、识别龙头股，输出板块轮动建议

8. **stock-comparison Skill规则**：股票对比分析Skill必须支持多维度打分和推荐

   a. 验收条件：When 路由Agent匹配到"stock-comparison"Skill, the 编排引擎 shall 对比多只股票的技术面、基本面、估值等维度，输出打分和推荐排序

9. **sentiment-analysis Skill规则**：市场情绪分析Skill必须整合新闻情绪、资金流向、北向资金等多维度情绪指标

   a. 验收条件：When 路由Agent匹配到"sentiment-analysis"Skill, the 编排引擎 shall 整合hybridSearch（新闻情绪）+ getFundFlow（资金流向/北向资金），输出综合市场情绪评分

10. **投研分析Skill跨组编排规则**：投研分析Skill必须支持跨组编排，自动加载涉及的所有工具组

    a. 验收条件：When 执行"fundamental-analysis"Skill, the 路由模块 shall 自动加载基本面数据组（getStockFinancial、getValuationMetrics、getCompanyProfile、getDividendHistory）的工具描述

11. **禁止项**：禁止投研分析Skill硬编码调用特定数据源，数据源选择应由工具内部实现决定

    a. 验收条件：When 查看投研分析Skill编排定义, the 定义 shall 不包含特定数据源参数（如source="efinance"），数据源由工具运行时自动选择

### **5.7.2 交互流程**

```plantuml
@startuml
actor "用户" as User
participant "路由Agent" as Router
participant "Skill编排引擎" as Orchestrator
participant "SkillRegistry" as SkillReg
system "ToolRegistry" as ToolReg

User -> Router : "对五粮液做基本面综合分析"
Router -> SkillReg : Skill检索: "fundamental-analysis"
SkillReg --> Router : 匹配Skill: fundamental-analysis
Router -> Orchestrator : 启动Skill编排

Orchestrator -> ToolReg : Step1: getStockFinancial(600519)
ToolReg --> Orchestrator : 三大报表财务数据

Orchestrator -> ToolReg : Step2: getValuationMetrics(600519)
ToolReg --> Orchestrator : PE/PB/PS等估值指标

Orchestrator -> ToolReg : Step3: getCompanyProfile(600519)
ToolReg --> Orchestrator : 公司概况/管理层/股东

Orchestrator -> ToolReg : Step4: getDividendHistory(600519)
ToolReg --> Orchestrator : 分红历史数据

Orchestrator --> User : 基本面综合分析报告
@enduml
```

### **5.7.3 异常场景**

1. **投研分析Skill部分数据获取失败**

   a. 触发条件：Skill编排中某个数据获取步骤失败（如getCompanyProfile超时）

   b. 系统行为：按错误恢复策略处理，用可获取的数据继续分析，标注缺失项

   c. 用户感知：获得部分分析结果，缺失项标注"数据暂不可用"

2. **投资论点生成数据不足**

   a. 触发条件：investment-thesis Skill无法获取足够的多维度数据

   b. 系统行为：基于已有数据生成部分投资论点，标注数据不足的维度

   c. 用户感知：获得部分投资论点，提示"部分数据缺失，论点可能不够全面"

3. **板块轮动分析无资金流向数据**

   a. 触发条件：sector-rotation Skill中getFundFlow返回空数据

   b. 系统行为：仅基于相对强弱和行业分类进行板块分析，标注"资金流向数据缺失"

   c. 用户感知：获得板块轮动建议，但缺少资金流向维度

4. **股票对比分析股票数量不足**

   a. 触发条件：stock-comparison Skill中用户仅提供1只股票

   b. 系统行为：提示用户至少提供2只股票进行对比

   c. 用户感知：收到"请提供至少2只股票代码进行对比分析"提示

# **6. 数据约束**

## **6.1 Skill编排定义（SkillDefinition）**

1. **skillId**：Skill唯一标识，格式为小写英文+连字符，如"debt-solvency-analysis"、"fundamental-analysis"、"investment-thesis"，非空
2. **skillName**：Skill中文名称，如"偿债能力分析"、"基本面综合分析"、"投资论点生成"，非空
3. **description**：Skill业务描述，说明该Skill代表的业务能力，非空
4. **applicableScenarios**：适用场景描述，说明什么情况下应选择此Skill，非空
5. **steps**：编排步骤列表，每个步骤包含toolName（调用的Tool名）、inputMapping（输入映射规则，定义上下文如何传入）、condition（可选，条件分支表达式）、fallbackTool（可选，失败时的备选Tool），非空，至少1个步骤
6. **relatedTools**：Skill关联的所有Tool名称列表，为steps中所有步骤toolName的并集，非空
7. **errorRecovery**：错误恢复策略，定义Tool调用失败时的处理方式（retry/fallback/abort），默认fallback
8. **timeoutMs**：Skill编排执行超时时间，正整数，默认60000（60秒）
9. **triggerKeywords**：触发关键词列表，用于路由Agent快速匹配，非空
10. **skillCategory**：Skill分类，枚举值：investment_analysis/risk_compliance/comprehensive_diagnosis/vision_analysis，非空

## **6.2 Skill增强描述（EnhancedSkillDescription）**

1. **name**：Skill名称，与SkillDefinition.skillId一致，非空
2. **description**：Skill基础描述，继承自SkillDefinition.description，非空
3. **applicableScenarios**：适用场景描述，继承自SkillDefinition.applicableScenarios，非空
4. **orchestrationSummary**：编排步骤概要，以自然语言描述Skill的执行流程，非空
5. **typicalQueries**：典型query示例列表，展示该Skill可处理的典型用户问题，至少2个示例，非空
6. **relatedTools**：关联Tool名称列表，继承自SkillDefinition.relatedTools，非空

## **6.3 Skill向量索引条目（SkillVectorEntry）**

1. **skillId**：Skill标识，与SkillDefinition.skillId一致，非空
2. **embedding**：Skill语义向量，由Skill名称+描述+适用场景+触发关键词的embedding计算得到，维度与embedding模型一致，非空
3. **metadata**：附加元信息，包含relatedTools（关联Tool列表）、applicableScenarios（适用场景）、skillCategory（Skill分类）等，用于检索后过滤

## **6.4 工具分组配置（ToolGroupConfig）**

1. **groupId**：分组唯一标识，格式为小写英文+连字符，非空
2. **groupName**：分组中文名称，非空
3. **groupResponsibility**：分组职责类型，枚举值：data_acquisition/data_analysis/mixed，非空
4. **tools**：分组包含的工具名列表，每个元素为ToolRegistry中已注册的工具名（camelCase格式），非空，元素数量5-12个
5. **description**：分组职责描述，用于路由Agent理解分组用途，非空
6. **priority**：分组优先级，整数，当多个分组匹配时用于排序，默认0

**6组工具分组配置定义：**

**行情数据组（market-data）**
1. **groupId**：market-data
2. **groupName**：行情数据组
3. **groupResponsibility**：data_acquisition
4. **tools**：[getStockHistory, getStockRealtime, getStockList, getTradeCalendar, getIndustry, getConcept, getTickData, getMinuteData, getIndexData, getFundFlow]
5. **description**：获取A股市场原始数据，包括历史K线、实时行情、股票列表、交易日历、行业分类、概念板块、逐笔成交、分钟级数据、指数数据、资金流向

**基本面数据组（fundamental-data）**
1. **groupId**：fundamental-data
2. **groupName**：基本面数据组
3. **groupResponsibility**：data_acquisition
4. **tools**：[getStockFinancial, getFinancialReport, getValuationMetrics, getCompanyProfile, getDividendHistory, getEarningsCalendar, getInsiderTrading, getShareholderStructure]
5. **description**：获取财务报表、估值指标、公司基本面数据，包括三大报表、估值指标、公司概况、分红历史、财报日历、内幕交易、股东结构

**技术分析组（technical-analysis）**
1. **groupId**：technical-analysis
2. **groupName**：技术分析组
3. **groupResponsibility**：data_analysis
4. **tools**：[calculateMA, calculateMACD, calculateRSI, calculateBollinger, calculateKDJ, calculateVWAP, calculateSharpeRatio, calculateMaxDrawdown, calculateVolatility, calculateCorrelation]
5. **description**：计算技术指标和量化信号，包括移动平均线、MACD、RSI、布林带、KDJ、VWAP、夏普比率、最大回撤、波动率、相关性

**风控合规组（risk-compliance）**
1. **groupId**：risk-compliance
2. **groupName**：风控合规组
3. **groupResponsibility**：data_analysis
4. **tools**：[checkTradeCompliance, checkPositionLimit, checkRestrictedStock, getComplianceReport, calculateVaR, calculateStressTest, checkRiskLimits, generateRiskReport]
5. **description**：风险评估、合规检查、交易限制，包括交易合规检查、持仓限额、限售股检查、合规报告、VaR、压力测试、风险限额、风险报告

**模拟交易组（paper-trading）**
1. **groupId**：paper-trading
2. **groupName**：模拟交易组
3. **groupResponsibility**：mixed
4. **tools**：[createPaperAccount, getAccount, placeOrder, getPositions, getOrderHistory, getTradeHistory]
5. **description**：模拟账户和交易操作，包括创建模拟账户、获取账户信息、下单、获取持仓、委托历史、成交历史

**知识与文档组（knowledge-documents）**
1. **groupId**：knowledge-documents
2. **groupName**：知识与文档组
3. **groupResponsibility**：mixed
4. **tools**：[hybridSearch, parsePDF, extractFinancialData, generateResearchReport, summarizeDocument, analyzeImage, extractFromScreenshot]
5. **description**：RAG检索、文档分析、视觉分析，包括混合知识检索、PDF解析、财务数据提取、研报框架生成、文档摘要、图片分析、截图结构化提取

## **6.5 增强工具描述（EnhancedToolDescription）**

1. **name**：工具名称，与ToolRegistry中注册名一致，camelCase格式，非空
2. **description**：工具基础描述，继承自现有ToolDefinition.description，非空
3. **when_to_use**：适用场景描述，自然语言，明确什么情况下使用此工具，非空
4. **when_not_to_use**：不适用场景描述，自然语言，明确什么情况下不使用及应使用的替代工具，非空
5. **parameters**：参数定义，继承自现有ToolDefinition.parameters，非空
6. **example_calls**：调用示例列表，每个示例包含完整参数，至少1个示例，非空
7. **groupId**：所属工具分组ID，与ToolGroupConfig.groupId一致，非空

## **6.6 工具向量索引条目（ToolVectorEntry）**

1. **toolName**：工具名称，与ToolRegistry中注册名一致，camelCase格式，非空
2. **embedding**：工具语义向量，由工具名称+描述+典型场景文本的embedding计算得到，维度与embedding模型一致，非空
3. **metadata**：附加元信息，包含groupId（所属分组）、when_to_use（适用场景）、groupResponsibility（分组职责类型）等，用于检索后过滤

## **6.7 工具调用校验结果（ValidationResult）**

1. **valid**：校验是否通过，布尔值，非空
2. **errors**：校验错误列表，每个元素包含字段名、错误类型（missing/invalid_type/out_of_range/unknown_tool）、错误描述，valid为true时为空列表
3. **suggestion**：修正建议，自然语言，供LLM理解如何修正，valid为true时为空字符串

## **6.8 Skill编排执行上下文（SkillExecutionContext）**

1. **skillId**：正在执行的Skill标识，非空
2. **currentStepIndex**：当前执行到的步骤索引，非负整数
3. **stepResults**：已执行步骤的结果映射，key为步骤索引，value为Tool执行结果，随编排执行逐步填充
4. **status**：编排执行状态，枚举值：running/paused/waiting_user_input/completed/failed/timeout，非空
5. **errorInfo**：错误信息，仅当status为failed时非空，包含失败步骤索引和错误描述

## **6.9 Agent运行配置（AgentRunConfig）**

1. **maxToolCalls**：单次运行最大工具调用次数，正整数，默认15
2. **validationRetryLimit**：校验失败重试上限，正整数，默认3
3. **toolExecutionTimeoutMs**：单个工具执行超时时间，正整数，默认30000（30秒）
4. **skillExecutionTimeoutMs**：Skill编排执行超时时间，正整数，默认60000（60秒）
5. **dynamicRetrievalTopK**：动态工具检索top-K值，正整数，默认8，范围5-15
6. **skillRetrievalTopK**：动态Skill检索top-K值，正整数，默认5，范围3-10
7. **routingEnabled**：是否启用工具分组路由，布尔值，默认true
8. **skillRoutingEnabled**：是否启用Skill路由，布尔值，默认true
9. **dynamicRetrievalEnabled**：是否启用动态工具检索，布尔值，默认true
10. **dynamicSkillRetrievalEnabled**：是否启用动态Skill检索，布尔值，默认true
11. **visionModel**：Vision模型名称，字符串，默认"qwen3.5-plus"（百炼云端多模态视觉语言模型，降级引擎）
12. **visionModelEnabled**：是否启用VISION_MODEL视觉模型（降级引擎），布尔值，默认false（需显式配置VISION_MODEL环境变量后启用，仅PaddleOCR不可用时降级使用）
13. **paddleocrMcpEnabled**：是否启用PaddleOCR-VL-1.6 MCP Server（主力引擎），布尔值，默认true（需PADDLEOCR_MCP_ENABLED=true且Docker容器就绪）
14. **visionFallbackEnabled**：是否启用视觉分析降级策略，布尔值，默认true（PaddleOCR主力引擎失败时降级到Vision模型）
15. **mineruEnabled**：是否启用MinerU VLM引擎，布尔值，默认true（需MINERU_API_KEY已配置）
16. **imageMaxSizeMB**：图片上传大小上限，正整数，默认10（MB）
17. **imageAllowedFormats**：允许的图片格式列表，默认["jpg","jpeg","png","bmp","webp"]
18. **toolNamingConvention**：工具命名规范，枚举值：camelCase/snake_case，默认camelCase

## **6.10 图片上传请求（ImageUploadRequest）**

1. **imageBase64**：图片的Base64编码字符串，非空
2. **fileName**：原始文件名，字符串，可选
3. **fileSize**：文件大小（字节），正整数，不超过imageMaxSizeMB × 1024 × 1024
4. **format**：图片格式，枚举值：jpg/jpeg/png/bmp/webp，非空
5. **source**：上传来源，枚举值：drag_drop/clipboard/file_select，非空

## **6.11 视觉分析结果（VisionAnalysisResult）**

1. **skillType**：触发的视觉Skill类型，枚举值：screenshot-to-structured-data/chart-pattern-recognition/financial-statement-ocr，非空
2. **success**：分析是否成功，布尔值，非空
3. **engineUsed**：实际使用的引擎，枚举值：paddleocr_vl_1.6_mcp/vision_qwen3.5_plus/mineru_vlm，非空（标识是主力引擎还是降级引擎完成的分析，默认paddleocr_vl_1.6_mcp）
4. **fallbackTriggered**：是否触发了降级，布尔值，非空（true表示PaddleOCR主力引擎失败后降级到Vision模型）
5. **parsedContent**：解析后的结构化内容，JSON对象，success为true时非空
6. **financialMetrics**：提取的财务指标，与FinancialMetrics接口一致，screenshot-to-structured-data和financial-statement-ocr场景下非空
7. **chartInfo**：图表识别信息，包含chartType（图表类型）、pattern（技术形态）、keyLevels（关键价位），chart-pattern-recognition场景下非空
8. **tradingSignal**：交易信号，包含direction（方向）、confidence（置信度）、reasoning（推理过程），chart-pattern-recognition场景下非空
9. **financialRatios**：财务比率计算结果，包含debtRatio、roe、currentRatio、quickRatio等比率值，financial-statement-ocr场景下非空
10. **error**：错误信息，success为false时非空，包含错误描述和降级提示

## **6.12 投研分析Skill编排定义**

**technical-analysis Skill**
1. **skillId**：technical-analysis，非空
2. **skillName**：技术面综合分析，非空
3. **skillCategory**：investment_analysis，非空
4. **steps**：[calculateMA → calculateMACD → calculateRSI → calculateBollinger → calculateKDJ]，非空
5. **relatedTools**：[calculateMA, calculateMACD, calculateRSI, calculateBollinger, calculateKDJ]，非空
6. **triggerKeywords**：["技术分析", "技术面", "技术指标", "MA", "MACD", "RSI", "布林带", "KDJ"]，非空
7. **applicableScenarios**：用户需要对股票进行技术面综合分析时，计算多项技术指标并给出综合技术面判断，非空

**fundamental-analysis Skill**
1. **skillId**：fundamental-analysis，非空
2. **skillName**：基本面综合分析，非空
3. **skillCategory**：investment_analysis，非空
4. **steps**：[getStockFinancial → getValuationMetrics → getCompanyProfile → getDividendHistory]，非空
5. **relatedTools**：[getStockFinancial, getValuationMetrics, getCompanyProfile, getDividendHistory]，非空
6. **triggerKeywords**：["基本面分析", "基本面", "财务分析", "公司质量", "基本面综合"]，非空
7. **applicableScenarios**：用户需要对股票进行基本面综合分析时，获取财务数据、估值指标、公司概况和分红历史，非空

**debt-solvency-analysis Skill**
1. **skillId**：debt-solvency-analysis，非空
2. **skillName**：偿债能力分析，非空
3. **skillCategory**：investment_analysis，非空
4. **steps**：[getStockFinancial → getValuationMetrics → 计算偿债比率]，非空
5. **relatedTools**：[getStockFinancial, getValuationMetrics]，非空
6. **triggerKeywords**：["偿债能力", "资产负债率", "流动比率", "速动比率", "债务分析"]，非空
7. **applicableScenarios**：用户需要分析企业偿债能力、资产负债率、流动比率等偿债相关指标时，非空

**valuation-analysis Skill**
1. **skillId**：valuation-analysis，非空
2. **skillName**：估值分析，非空
3. **skillCategory**：investment_analysis，非空
4. **steps**：[getStockFinancial → getValuationMetrics → 行业对比]，非空
5. **relatedTools**：[getStockFinancial, getValuationMetrics, getIndustry]，非空
6. **triggerKeywords**：["估值分析", "PE", "PB", "估值", "估值对比", "估值偏高", "估值偏低"]，非空
7. **applicableScenarios**：用户需要进行估值分析或与同行业公司进行估值对比时，非空

**investment-thesis Skill**
1. **skillId**：investment-thesis，非空
2. **skillName**：投资论点生成，非空
3. **skillCategory**：investment_analysis，非空
4. **steps**：[多维度数据获取 → 看多/看空案例生成 → 催化剂识别 → 入场/离场策略制定]，非空
5. **relatedTools**：[getStockFinancial, getValuationMetrics, getCompanyProfile, getFundFlow, calculateSharpeRatio, calculateMaxDrawdown]，非空
6. **triggerKeywords**：["投资论点", "看多看空", "入场策略", "离场策略", "催化剂", "投资建议"]，非空
7. **applicableScenarios**：用户需要生成结构化投资论点，包含看多/看空案例、催化剂、入场/离场策略时，非空

**sector-rotation Skill**
1. **skillId**：sector-rotation，非空
2. **skillName**：板块轮动分析，非空
3. **skillCategory**：investment_analysis，非空
4. **steps**：[getFundFlow → 相对强弱计算 → 龙头股识别]，非空
5. **relatedTools**：[getFundFlow, getIndustry, getConcept, getStockList]，非空
6. **triggerKeywords**：["板块轮动", "资金流向", "龙头股", "板块强弱", "热点板块"]，非空
7. **applicableScenarios**：用户需要分析板块轮动、资金流向、识别龙头股时，非空

**stock-comparison Skill**
1. **skillId**：stock-comparison，非空
2. **skillName**：股票对比分析，非空
3. **skillCategory**：investment_analysis，非空
4. **steps**：[多股票数据获取 → 多维度打分 → 推荐排序]，非空
5. **relatedTools**：[getStockFinancial, getValuationMetrics, getStockHistory, calculateSharpeRatio, calculateMaxDrawdown, calculateVolatility]，非空
6. **triggerKeywords**：["股票对比", "股票比较", "哪个好", "选股", "多股对比"]，非空
7. **applicableScenarios**：用户需要对比多只股票并给出推荐排序时，非空

**sentiment-analysis Skill**
1. **skillId**：sentiment-analysis，非空
2. **skillName**：市场情绪分析，非空
3. **skillCategory**：investment_analysis，非空
4. **steps**：[hybridSearch新闻情绪 → getFundFlow资金流向 → 综合情绪评分]，非空
5. **relatedTools**：[hybridSearch, getFundFlow]，非空
6. **triggerKeywords**：["市场情绪", "情绪分析", "新闻情绪", "资金情绪", "北向资金"]，非空
7. **applicableScenarios**：用户需要分析市场情绪，包括新闻情绪、资金流向情绪、北向资金情绪时，非空

## **6.13 金融视觉Skill编排定义**

**screenshot-to-structured-data Skill**
1. **skillId**：screenshot-to-structured-data，非空
2. **skillName**：研报截图结构化提取，非空
3. **skillCategory**：vision_analysis，非空
4. **steps**：[extractFromScreenshot → extractFinancialData]，非空
5. **relatedTools**：[extractFromScreenshot, extractFinancialData]，非空
6. **triggerKeywords**：["截图提取", "研报数据", "图表提取", "结构化", "财务数据提取"]，非空
7. **applicableScenarios**：用户上传研报截图需提取结构化财务数据时，非空

**chart-pattern-recognition Skill**
1. **skillId**：chart-pattern-recognition，非空
2. **skillName**：图表形态识别，非空
3. **skillCategory**：vision_analysis，非空
4. **steps**：[analyzeImage → calculateTechnicalIndicators → generateSignal]，非空
5. **relatedTools**：[analyzeImage, calculateMA, calculateMACD, calculateRSI]，非空
6. **triggerKeywords**：["K线形态", "图表识别", "技术形态", "头肩顶", "双底", "交易信号"]，非空
7. **applicableScenarios**：用户上传K线/技术图表截图需识别形态并生成交易信号时，非空

**financial-statement-ocr Skill**
1. **skillId**：financial-statement-ocr，非空
2. **skillName**：财报OCR指标计算，非空
3. **skillCategory**：vision_analysis，非空
4. **steps**：[analyzeImage → extractFinancialData → calculateRatios]，非空
5. **relatedTools**：[analyzeImage, extractFinancialData]，非空
6. **triggerKeywords**：["财报计算", "比率计算", "资产负债率", "ROE", "财务比率"]，非空
7. **applicableScenarios**：用户上传财报图片需自动计算财务比率时，非空

## **6.14 风控合规Skill编排定义**

**compliance-check Skill**
1. **skillId**：compliance-check，非空
2. **skillName**：合规检查，非空
3. **skillCategory**：risk_compliance，非空
4. **steps**：[checkTradeCompliance → checkPositionLimit → checkRestrictedStock]，非空
5. **relatedTools**：[checkTradeCompliance, checkPositionLimit, checkRestrictedStock]，非空
6. **triggerKeywords**：["合规检查", "交易合规", "持仓限额", "限售股"]，非空
7. **applicableScenarios**：用户需要进行交易合规检查时，非空

**risk-assessment Skill**
1. **skillId**：risk-assessment，非空
2. **skillName**：风险评估，非空
3. **skillCategory**：risk_compliance，非空
4. **steps**：[calculateVaR → calculateStressTest → calculateMaxDrawdown → calculateVolatility → checkRiskLimits]，非空
5. **relatedTools**：[calculateVaR, calculateStressTest, calculateMaxDrawdown, calculateVolatility, checkRiskLimits]，非空
6. **triggerKeywords**：["风险评估", "风险分析", "VaR", "压力测试", "最大回撤"]，非空
7. **applicableScenarios**：用户需要进行风险评估或风险限额检查时，非空

## **6.15 综合诊断Skill编排定义**

**comprehensive-diagnosis Skill**
1. **skillId**：comprehensive-diagnosis，非空
2. **skillName**：综合诊断，非空
3. **skillCategory**：comprehensive_diagnosis，非空
4. **steps**：[getStockFinancial → getValuationMetrics → getStockHistory → calculateMA → calculateRSI → calculateMACD → 综合评分]，非空
5. **relatedTools**：[getStockFinancial, getValuationMetrics, getStockHistory, calculateMA, calculateRSI, calculateMACD]，非空
6. **triggerKeywords**：["综合诊断", "综合分析", "全面分析", "股票诊断"]，非空
7. **applicableScenarios**：用户需要对股票进行多维度综合诊断时，非空

## **6.16 图表识别结果（ChartRecognitionResult）**

1. **chartType**：图表类型，枚举值：k_line/candlestick/line_chart/bar_chart/pie_chart/area_chart/unknown，非空
2. **pattern**：识别到的技术形态，字符串，如"头肩顶"、"双底"、"上升三角形"等，形态不确定时为"unknown"
3. **keyLevels**：关键价位列表，每个元素包含levelType（支撑/阻力）和price（价格），可选
4. **confidence**：形态识别置信度，0-1之间的小数，低于0.5时标注"形态识别不确定"
5. **suggestedTimeRange**：建议分析的时间范围，如"近30日"、"近6个月"，基于图表时间轴推断，可选

## **6.17 财务比率计算结果（FinancialRatiosResult）**

1. **debtRatio**：资产负债率 = 总负债/总资产 × 100%，百分比，需totalAssets和totalLiabilities均非空
2. **roe**：净资产收益率 = 净利润/净资产 × 100%，百分比，需netProfit和(totalAssets-totalLiabilities)均非空
3. **currentRatio**：流动比率 = 流动资产/流动负债，需currentAssets和currentLiabilities均非空，可选
4. **quickRatio**：速动比率 = (流动资产-存货)/流动负债，需currentAssets、inventory和currentLiabilities均非空，可选
5. **grossMargin**：毛利率 = (营收-营业成本)/营收 × 100%，百分比，可选
6. **netMargin**：净利率 = 净利润/营收 × 100%，百分比，需netProfit和revenue均非空，可选
7. **calculatedFields**：成功计算的字段名列表，非空
8. **missingFields**：因缺少原始字段而无法计算的字段名列表，非空

## **6.18 投资论点结果（InvestmentThesisResult）**

1. **bullCase**：看多案例，包含论点列表和支撑数据，非空
2. **bearCase**：看空案例，包含论点列表和支撑数据，非空
3. **catalysts**：催化剂列表，每个元素包含catalystType（类型）和description（描述）和expectedTiming（预期时间），非空
4. **entryStrategy**：入场策略，包含entryPrice（入场价位）和positionSize（仓位大小）和reasoning（推理过程），非空
5. **exitStrategy**：离场策略，包含stopLoss（止损价位）和takeProfit（止盈价位）和reasoning（推理过程），非空
6. **confidence**：整体置信度，0-1之间的小数，非空

## **6.19 板块轮动结果（SectorRotationResult）**

1. **sectorRanking**：板块排名列表，每个元素包含sectorName（板块名）、score（综合得分）、fundFlowDirection（资金流向），非空
2. **leadingStocks**：龙头股列表，每个元素包含stockCode、stockName、sectorName、reason（入选原因），非空
3. **rotationSignal**：轮动信号，枚举值：sector_rotation/sector_concentration/sector_divergence，非空
4. **recommendation**：板块轮动建议，自然语言描述，非空

## **6.20 股票对比结果（StockComparisonResult）**

1. **stockScores**：股票评分列表，每个元素包含stockCode、stockName、dimensionScores（维度评分Map）、totalScore（综合得分），非空
2. **ranking**：推荐排名列表，按totalScore降序排列，非空
3. **dimensions**：评分维度列表，如["基本面", "技术面", "估值", "风险"]，非空
4. **recommendation**：对比推荐建议，自然语言描述，非空

## **6.21 市场情绪结果（SentimentAnalysisResult）**

1. **overallScore**：综合情绪评分，-1到1之间（-1极度悲观，1极度乐观），非空
2. **newsSentiment**：新闻情绪评分，-1到1之间，非空
3. **fundFlowSentiment**：资金流向情绪评分，-1到1之间，非空
4. **northboundSentiment**：北向资金情绪评分，-1到1之间，可选
5. **sentimentTrend**：情绪趋势，枚举值：improving/stable/deteriorating，非空
6. **keyEvents**：关键事件列表，每个元素包含event（事件描述）和sentimentImpact（情绪影响），非空

## **6.22 PaddleOCR-VL-1.6 MCP Server配置（PaddleOCRMcpConfig）**

1. **enabled**：是否启用PaddleOCR MCP Server，布尔值，与PADDLEOCR_MCP_ENABLED环境变量一致，默认true
2. **mcpToolName**：MCP Tool注册名称，字符串，默认"paddleocr_vl"，注册到src/server/mcp/tools/目录
3. **communicationProtocol**：通信协议，枚举值：stdio/sse，默认stdio
4. **dockerImage**：Docker镜像名称，字符串，基于PaddleOCR官方deploy/paddleocr_vl_docker/构建
5. **useGpu**：是否使用GPU，布尔值，默认false（CPU模式运行）
6. **modelName**：模型名称，字符串，默认"PaddleOCR-VL-1.6"
7. **modelVolumePath**：模型存储卷路径，字符串，默认"./models/paddleocr"，Docker容器挂载到/root/models
8. **restartPolicy**：容器重启策略，枚举值：no/on-failure/always/unless-stopped，默认"unless-stopped"
9. **healthCheckInterval**：健康检查间隔，正整数，默认30（秒）
10. **ocrTimeoutMs**：单次OCR调用超时时间，正整数，默认45000（45秒）

## **6.23 双引擎降级事件记录（VisionFallbackEvent）**

1. **eventId**：事件唯一标识，UUID格式，非空
2. **timestamp**：事件发生时间，ISO 8601格式，非空
3. **skillType**：触发的视觉Skill类型，枚举值：screenshot-to-structured-data/chart-pattern-recognition/financial-statement-ocr，非空
4. **sourceEngine**：降级源引擎，枚举值：vision_qwen3.5_plus/mineru_vlm，非空
5. **targetEngine**：降级目标引擎，枚举值：paddleocr_vl_1.6_mcp/vision_qwen3.5_plus，非空
6. **fallbackReason**：降级原因，枚举值：network_error/timeout/api_rate_limit/empty_result/service_unavailable，非空
7. **switchDurationMs**：降级切换耗时，正整数（毫秒），非空
8. **sourceEngineError**：源引擎错误详情，字符串，非空
9. **targetEngineSuccess**：目标引擎是否成功接替，布尔值，非空
10. **imageSize**：触发降级的图片大小（字节），正整数，非空

## **6.24 视觉分析环境变量配置（VisionEnvConfig）**

1. **VISION_MODEL**：Vision模型名称，字符串，默认"qwen3.5-plus"（替代原qwen-vl-max）
2. **PADDLEOCR_MCP_ENABLED**：是否启用PaddleOCR-VL-1.6 MCP Server，布尔值，默认"true"
3. **VISION_FALLBACK_ENABLED**：是否启用视觉分析降级策略，布尔值，默认"true"
4. **DASHSCOPE_API_KEY**：百炼API密钥，用于调用qwen3.5-plus模型，字符串，非空（已存在）
5. **MINERU_API_KEY**：MinerU API密钥，字符串，可选（已存在）

## **6.25 PaddleOCR-VL Docker Compose配置（PaddleOCRVLService）**

1. **serviceName**：Docker Compose服务名，字符串，默认"paddleocr-vl"
2. **buildContext**：Docker构建上下文目录，字符串，默认"./paddleocr-vl-docker"（基于PaddleOCR官方deploy/paddleocr_vl_docker/）
3. **dockerfile**：Dockerfile路径，字符串，默认"Dockerfile"
4. **environmentVars**：环境变量列表，包含USE_GPU=false、MODEL=PaddleOCR-VL-1.6
5. **volumes**：数据卷挂载列表，包含"./models/paddleocr:/root/models"（模型持久化存储）
6. **restartPolicy**：重启策略，字符串，默认"unless-stopped"
7. **networkMode**：网络模式，字符串，默认使用项目内部网络（限制外部访问）
