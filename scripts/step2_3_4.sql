-- Step 2: 更新 financial_cashflow 的 free_cash_flow
UPDATE financial_cashflow
SET
  free_cash_flow = CASE
    WHEN operating_cash_flow IS NOT NULL AND investing_cash_flow IS NOT NULL
    THEN operating_cash_flow + investing_cash_flow
    WHEN operating_cash_flow IS NOT NULL AND cash_flow_from_investing IS NOT NULL
    THEN operating_cash_flow + cash_flow_from_investing
    ELSE free_cash_flow
  END,
  updated_at = NOW()
WHERE free_cash_flow IS NULL
  AND operating_cash_flow IS NOT NULL;

-- Step 3: 更新 financial_income 的 gross_margin 和 net_margin
UPDATE financial_income
SET
  gross_margin = ROUND((revenue - operating_cost) / revenue, 6),
  net_margin = ROUND(net_profit / revenue, 6),
  updated_at = NOW()
WHERE revenue IS NOT NULL AND revenue != 0 AND operating_cost IS NOT NULL
  AND (gross_margin IS NULL OR net_margin IS NULL);

-- Step 4: 更新 financial_balancesheet 的 debt_ratio
UPDATE financial_balancesheet
SET
  debt_ratio = ROUND(total_liabilities / total_assets, 6),
  updated_at = NOW()
WHERE debt_ratio IS NULL
  AND total_liabilities IS NOT NULL
  AND total_assets IS NOT NULL
  AND total_assets != 0;