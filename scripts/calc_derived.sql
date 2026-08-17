BEGIN;

-- ============================================================
-- 1. 更新 financial_indicators: 从 income + balancesheet 计算 roe, roa, gross_margin, net_margin, debt_ratio, current_ratio, eps, bvps
-- ============================================================

UPDATE financial_indicators fi
SET
  roe = CASE
    WHEN bs.total_equity IS NOT NULL AND bs.total_equity != 0 AND inc.net_profit IS NOT NULL
    THEN ROUND(inc.net_profit / bs.total_equity, 6)
    ELSE fi.roe
  END,
  roa = CASE
    WHEN bs.total_assets IS NOT NULL AND bs.total_assets != 0 AND inc.net_profit IS NOT NULL
    THEN ROUND(inc.net_profit / bs.total_assets, 6)
    ELSE fi.roa
  END,
  gross_margin = CASE
    WHEN inc.revenue IS NOT NULL AND inc.revenue != 0 AND inc.operating_cost IS NOT NULL
    THEN ROUND((inc.revenue - inc.operating_cost) / inc.revenue, 6)
    WHEN inc.revenue IS NOT NULL AND inc.revenue != 0 AND inc.gross_margin IS NOT NULL
    THEN inc.gross_margin
    ELSE fi.gross_margin
  END,
  net_margin = CASE
    WHEN inc.revenue IS NOT NULL AND inc.revenue != 0 AND inc.net_profit IS NOT NULL
    THEN ROUND(inc.net_profit / inc.revenue, 6)
    ELSE fi.net_margin
  END,
  debt_ratio = CASE
    WHEN bs.total_assets IS NOT NULL AND bs.total_assets != 0 AND bs.total_liabilities IS NOT NULL
    THEN ROUND(bs.total_liabilities / bs.total_assets, 6)
    WHEN bs.debt_ratio IS NOT NULL
    THEN bs.debt_ratio
    ELSE fi.debt_ratio
  END,
  current_ratio = CASE
    WHEN bs.current_liabilities IS NOT NULL AND bs.current_liabilities != 0 AND bs.current_assets IS NOT NULL
    THEN ROUND(bs.current_assets / bs.current_liabilities, 6)
    ELSE fi.current_ratio
  END,
  eps = CASE
    WHEN inc.eps IS NOT NULL THEN inc.eps
    ELSE fi.eps
  END,
  bvps = CASE
    WHEN inc.bvps IS NOT NULL THEN inc.bvps
    ELSE fi.bvps
  END,
  updated_at = NOW()
FROM financial_income inc
JOIN financial_balancesheet bs
  ON bs.stock_code = fi.stock_code
  AND bs.report_year = fi.report_year
  AND COALESCE(bs.report_quarter, 'annual') = COALESCE(fi.report_quarter, 'annual')
WHERE inc.stock_code = fi.stock_code
  AND inc.report_year = fi.report_year
  AND COALESCE(inc.report_quarter, 'annual') = COALESCE(fi.report_quarter, 'annual');

-- ============================================================
-- 2. 更新 financial_cashflow: free_cash_flow = operating_cash_flow - investing_cash_flow (资本支出近似)
-- ============================================================

UPDATE financial_cashflow
SET
  free_cash_flow = CASE
    WHEN operating_cash_flow IS NOT NULL AND investing_cash_flow IS NOT NULL
    THEN operating_cash_flow + investing_cash_flow  -- investing_cash_flow 通常为负值
    WHEN operating_cash_flow IS NOT NULL AND cash_flow_from_investing IS NOT NULL
    THEN operating_cash_flow + cash_flow_from_investing
    ELSE free_cash_flow
  END,
  updated_at = NOW()
WHERE free_cash_flow IS NULL
  AND operating_cash_flow IS NOT NULL;

-- ============================================================
-- 3. 更新 financial_income: 从 balancesheet 补充 gross_margin
-- ============================================================

UPDATE financial_income inc
SET
  gross_margin = CASE
    WHEN inc.revenue IS NOT NULL AND inc.revenue != 0 AND inc.operating_cost IS NOT NULL
    THEN ROUND((inc.revenue - inc.operating_cost) / inc.revenue, 6)
    ELSE inc.gross_margin
  END,
  net_margin = CASE
    WHEN inc.revenue IS NOT NULL AND inc.revenue != 0 AND inc.net_profit IS NOT NULL
    THEN ROUND(inc.net_profit / inc.revenue, 6)
    ELSE inc.net_margin
  END,
  updated_at = NOW()
WHERE (inc.gross_margin IS NULL OR inc.net_margin IS NULL)
  AND inc.revenue IS NOT NULL AND inc.revenue != 0;

-- ============================================================
-- 4. 更新 financial_balancesheet: debt_ratio 从 total_liabilities/total_assets 计算
-- ============================================================

UPDATE financial_balancesheet
SET
  debt_ratio = ROUND(total_liabilities / total_assets, 6),
  updated_at = NOW()
WHERE debt_ratio IS NULL
  AND total_liabilities IS NOT NULL
  AND total_assets IS NOT NULL
  AND total_assets != 0;

COMMIT;