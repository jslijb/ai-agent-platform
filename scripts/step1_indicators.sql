-- Step 1: 更新 financial_indicators 衍生指标
UPDATE financial_indicators fi
SET
  roe = calc.roe,
  roa = calc.roa,
  gross_margin = calc.gross_margin,
  net_margin = calc.net_margin,
  debt_ratio = calc.debt_ratio,
  current_ratio = calc.current_ratio,
  eps = calc.eps,
  bvps = calc.bvps
FROM (
  SELECT
    fi2.id as fi_id,
    CASE WHEN bs.total_equity IS NOT NULL AND bs.total_equity != 0 AND inc.net_profit IS NOT NULL
      THEN ROUND(inc.net_profit / bs.total_equity, 6) ELSE fi2.roe END as roe,
    CASE WHEN bs.total_assets IS NOT NULL AND bs.total_assets != 0 AND inc.net_profit IS NOT NULL
      THEN ROUND(inc.net_profit / bs.total_assets, 6) ELSE fi2.roa END as roa,
    CASE WHEN inc.revenue IS NOT NULL AND inc.revenue != 0 AND inc.operating_cost IS NOT NULL
      THEN ROUND((inc.revenue - inc.operating_cost) / inc.revenue, 6)
      WHEN inc.gross_margin IS NOT NULL THEN inc.gross_margin ELSE fi2.gross_margin END as gross_margin,
    CASE WHEN inc.revenue IS NOT NULL AND inc.revenue != 0 AND inc.net_profit IS NOT NULL
      THEN ROUND(inc.net_profit / inc.revenue, 6) ELSE fi2.net_margin END as net_margin,
    CASE WHEN bs.total_assets IS NOT NULL AND bs.total_assets != 0 AND bs.total_liabilities IS NOT NULL
      THEN ROUND(bs.total_liabilities / bs.total_assets, 6)
      WHEN bs.debt_ratio IS NOT NULL THEN bs.debt_ratio ELSE fi2.debt_ratio END as debt_ratio,
    CASE WHEN bs.current_liabilities IS NOT NULL AND bs.current_liabilities != 0 AND bs.current_assets IS NOT NULL
      THEN ROUND(bs.current_assets / bs.current_liabilities, 6) ELSE fi2.current_ratio END as current_ratio,
    COALESCE(inc.eps, fi2.eps) as eps,
    COALESCE(inc.bvps, fi2.bvps) as bvps
  FROM financial_indicators fi2
  JOIN financial_income inc ON inc.stock_code = fi2.stock_code AND inc.report_year = fi2.report_year
    AND COALESCE(inc.report_quarter, 'annual') = COALESCE(fi2.report_quarter, 'annual')
  JOIN financial_balancesheet bs ON bs.stock_code = fi2.stock_code AND bs.report_year = fi2.report_year
    AND COALESCE(bs.report_quarter, 'annual') = COALESCE(fi2.report_quarter, 'annual')
) calc
WHERE fi.id = calc.fi_id;
