-- 验证 financial_indicators
SELECT 'financial_indicators' as tbl, COUNT(*) as total,
  COUNT(CASE WHEN roe IS NULL THEN 1 END) as null_roe,
  COUNT(CASE WHEN roa IS NULL THEN 1 END) as null_roa,
  COUNT(CASE WHEN gross_margin IS NULL THEN 1 END) as null_gm,
  COUNT(CASE WHEN net_margin IS NULL THEN 1 END) as null_nm,
  COUNT(CASE WHEN debt_ratio IS NULL THEN 1 END) as null_dr
FROM financial_indicators;

-- 验证 financial_cashflow
SELECT 'financial_cashflow' as tbl, COUNT(*) as total,
  COUNT(CASE WHEN free_cash_flow IS NULL THEN 1 END) as null_fcf
FROM financial_cashflow;

-- 验证 financial_income
SELECT 'financial_income' as tbl, COUNT(*) as total,
  COUNT(CASE WHEN gross_margin IS NULL THEN 1 END) as null_gm,
  COUNT(CASE WHEN net_margin IS NULL THEN 1 END) as null_nm
FROM financial_income;

-- 验证 financial_balancesheet
SELECT 'financial_balancesheet' as tbl, COUNT(*) as total,
  COUNT(CASE WHEN debt_ratio IS NULL THEN 1 END) as null_dr
FROM financial_balancesheet;

-- 样本验证
SELECT stock_code, report_year, roe, roa, gross_margin, net_margin, debt_ratio, current_ratio, eps
FROM financial_indicators ORDER BY stock_code, report_year;