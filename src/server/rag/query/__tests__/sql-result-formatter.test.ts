/**
 * TDD 单测：SQL 结果自然语言格式化器
 *
 * 覆盖场景（基于 V13-r5 评估诊断的 L3/L4 CR 低分根因）：
 *   1. 货币字段：英文→中文标签 + 单位检测 + 亿元转换
 *   2. 百分比字段：小数→百分比转换（YoY 生成"同比增长/下降"描述）
 *   3. 每股字段：直接显示 + 元/股单位
 *   4. null 值：显示"数据缺失"
 *   5. 单位检测：元/千元/万元 量级判断
 *   6. 计算提示：ROE/毛利率/净利率 公式注入
 *   7. 多表合并：financial_income + financial_indicators 联合输出
 *
 * 运行：npx vitest run src/server/rag/query/__tests__/sql-result-formatter.test.ts
 */
import { describe, it, expect } from "vitest";
import { formatSqlResultAsText, formatRawTablesAsText } from "../sql-result-formatter";

describe("formatSqlResultAsText - 基本格式化", () => {
  it("空数组返回无数据提示", () => {
    const result = formatSqlResultAsText([]);
    expect(result).toContain("查询无数据返回");
  });

  it("包含公司名和股票代码", () => {
    const rows = [
      { revenue: "1000000000", _sourceTable: "financial_income", reportYear: 2025, reportQuarter: "annual" },
    ];
    const result = formatSqlResultAsText(rows, "格力电器", "000651");
    expect(result).toContain("格力电器");
    expect(result).toContain("000651");
    expect(result).toContain("2025");
  });
});

describe("formatSqlResultAsText - 货币字段单位检测", () => {
  it("单位为元：revenue > 10^9 → 除以 10^8 转亿元", () => {
    // 格力电器 revenue = 171,118,161,275 元 ≈ 1711.18 亿元
    const rows = [
      {
        revenue: "171118161275.41",
        operatingCost: "137548893694.33",
        netProfit: "28862746016.16",
        _sourceTable: "financial_income",
        reportYear: 2025,
        reportQuarter: "annual",
      },
    ];
    const result = formatSqlResultAsText(rows, "格力电器", "000651");
    expect(result).toContain("数据单位: 元");
    expect(result).toContain("营业收入: 约1711.18亿元");
    expect(result).toContain("营业成本: 约1375.49亿元");
    expect(result).toContain("净利润: 约288.63亿元");
  });

  it("单位为千元：revenue 在 10^5~10^9 之间 → 除以 10^5 转亿元", () => {
    // 中国能建 revenue = 452,929,608 千元 ≈ 4529.30 亿元
    const rows = [
      {
        revenue: "452929608.0",
        operatingCost: "437118437.0",
        _sourceTable: "financial_income",
        reportYear: 2025,
        reportQuarter: "annual",
      },
    ];
    const result = formatSqlResultAsText(rows, "中国能建", "601868");
    expect(result).toContain("数据单位: 千元");
    expect(result).toContain("营业收入: 约4529.30亿元");
    expect(result).toContain("营业成本: 约4371.18亿元");
  });

  it("负值正确显示负号", () => {
    // 中国长城 netProfit = -13,751,299.19 元（负值）
    const rows = [
      {
        revenue: "15808600064.94",
        netProfit: "-13751299.19",
        _sourceTable: "financial_income",
        reportYear: 2025,
        reportQuarter: "annual",
      },
    ];
    const result = formatSqlResultAsText(rows, "中国长城", "000066");
    // -13,751,299.19 / 10^8 = -0.1375 亿元，< 1 亿 → 转万元: -1375.13 万元
    expect(result).toContain("净利润: -约1375.13万元");
  });
});

describe("formatSqlResultAsText - 百分比字段", () => {
  it("YoY 小数 → 百分比 + 增长/下降描述", () => {
    const rows = [
      {
        revenueYoy: "-0.1083783559958269961550887508",
        netProfitYoy: "0.49515355837095",
        _sourceTable: "financial_indicators",
        reportYear: 2025,
        reportQuarter: "annual",
      },
    ];
    const result = formatSqlResultAsText(rows, "格力电器", "000651");
    expect(result).toContain("营业收入同比增长率: 同比下降约10.84%");
    expect(result).toContain("净利润同比增长率: 同比增长约49.52%");
  });

  it("毛利率/净利率小数 → 百分比", () => {
    const rows = [
      {
        grossMargin: "0.8375",
        netMargin: "0.1690",
        _sourceTable: "financial_indicators",
        reportYear: 2025,
        reportQuarter: "annual",
      },
    ];
    const result = formatSqlResultAsText(rows, "五粮液", "000858");
    expect(result).toContain("毛利率: 约83.75%");
    expect(result).toContain("净利率: 约16.90%");
  });

  it("ROE 为 null → 显示数据缺失", () => {
    const rows = [
      {
        roe: null,
        roa: null,
        totalEquity: "122180683645.14",
        _sourceTable: "financial_indicators",
        reportYear: 2025,
        reportQuarter: "annual",
      },
    ];
    const result = formatSqlResultAsText(rows, "五粮液", "000858");
    expect(result).toContain("净资产收益率(ROE): 数据缺失");
    expect(result).toContain("总资产收益率(ROA): 数据缺失");
  });

  it("YoY 为 0 → 同比持平", () => {
    const rows = [
      {
        revenueYoy: "0",
        _sourceTable: "financial_indicators",
        reportYear: 2025,
        reportQuarter: "annual",
      },
    ];
    const result = formatSqlResultAsText(rows, "测试公司", "000001");
    expect(result).toContain("同比持平");
  });
});

describe("formatSqlResultAsText - 每股字段", () => {
  it("EPS/BVPS 显示元/股单位", () => {
    const rows = [
      {
        eps: "1.6234",
        bvps: "6.7543",
        _sourceTable: "financial_income",
        reportYear: 2025,
        reportQuarter: "annual",
      },
    ];
    const result = formatSqlResultAsText(rows, "格力电器", "000651");
    expect(result).toContain("每股收益: 约1.6234元/股");
    expect(result).toContain("每股净资产: 约6.7543元/股");
  });
});

describe("formatSqlResultAsText - 计算提示", () => {
  it("有营收+成本但无毛利率 → 注入毛利率公式", () => {
    const rows = [
      {
        revenue: "171118161275.41",
        operatingCost: "137548893694.33",
        _sourceTable: "financial_income",
        reportYear: 2025,
        reportQuarter: "annual",
      },
    ];
    const result = formatSqlResultAsText(rows, "格力电器", "000651");
    expect(result).toContain("毛利率 = (营业收入 - 营业成本) / 营业收入");
    expect(result).toContain("毛利 = 营业收入 - 营业成本");
  });

  it("有净利润+净资产但无 ROE → 注入 ROE 公式", () => {
    const rows = [
      {
        netProfit: "28862746016.16",
        _sourceTable: "financial_income",
        reportYear: 2025,
        reportQuarter: "annual",
      },
      {
        totalEquity: "122180683645.14",
        _sourceTable: "financial_balancesheet",
        reportYear: 2025,
        reportQuarter: "annual",
      },
    ];
    const result = formatSqlResultAsText(rows, "五粮液", "000858");
    expect(result).toContain("净资产收益率(ROE) = 净利润 / 所有者权益");
  });
});

describe("formatSqlResultAsText - 多表合并", () => {
  it("financial_income + financial_indicators 联合输出", () => {
    const rows = [
      {
        revenue: "9001411806.06",
        operatingCost: "6804504225.79",
        netProfit: "2158633048.42",
        _sourceTable: "financial_income",
        reportYear: 2025,
        reportQuarter: "annual",
      },
      {
        roe: null,
        revenueYoy: "-0.10057996987049",
        _sourceTable: "financial_indicators",
        reportYear: 2025,
        reportQuarter: "annual",
      },
    ];
    const result = formatSqlResultAsText(rows, "片仔癀", "600436");
    // 利润表数据
    expect(result).toContain("利润表数据");
    expect(result).toContain("营业收入: 约90.01亿元");
    expect(result).toContain("营业成本: 约68.05亿元");
    expect(result).toContain("净利润: 约21.59亿元");
    // 衍生指标数据
    expect(result).toContain("衍生指标数据");
    expect(result).toContain("净资产收益率(ROE): 数据缺失");
    expect(result).toContain("营业收入同比增长率: 同比下降约10.06%");
    // 计算提示
    expect(result).toContain("毛利率 = (营业收入 - 营业成本) / 营业收入");
  });
});

describe("formatSqlResultAsText - 资产负债表字段", () => {
  it("总资产/总负债/净资产 正确格式化", () => {
    const rows = [
      {
        totalAssets: "941597382.0",
        totalLiabilities: "731979102.0",
        totalEquity: "426954855.0",
        debtRatio: "0.4964",
        _sourceTable: "financial_balancesheet",
        reportYear: 2025,
        reportQuarter: "annual",
      },
    ];
    const result = formatSqlResultAsText(rows, "中国能建", "601868");
    // 中国能建是千元单位
    expect(result).toContain("总资产: 约9415.97亿元");
    expect(result).toContain("总负债: 约7319.79亿元");
    expect(result).toContain("所有者权益（净资产）: 约4269.55亿元");
    expect(result).toContain("资产负债率: 约49.64%");
  });
});

describe("formatRawTablesAsText - 原始表格格式化", () => {
  it("空数组返回无数据提示", () => {
    const result = formatRawTablesAsText([]);
    expect(result).toContain("查询无数据返回");
  });

  it("包含表格名和数据", () => {
    const rows = [
      {
        tableName: "主要会计数据",
        tableData: '[{"项目": "营业收入", "金额": "100亿"}]',
        stockCode: "000651",
        reportYear: 2025,
      },
    ];
    const result = formatRawTablesAsText(rows, "格力电器", "000651");
    expect(result).toContain("格力电器");
    expect(result).toContain("原始表格 1 张");
    expect(result).toContain("主要会计数据");
  });
});
