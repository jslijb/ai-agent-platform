-- 测试: 查看 financial_indicators 和 income/balancesheet 能否关联
SELECT fi.stock_code, fi.report_year, fi.report_quarter,
  inc.net_profit, bs.total_equity, bs.total_assets,
  inc.revenue, inc.operating_cost, bs.total_liabilities
FROM financial_indicators fi
LEFT JOIN financial_income inc ON inc.stock_code = fi.stock_code AND inc.report_year = fi.report_year AND COALESCE(inc.report_quarter, 'annual') = COALESCE(fi.report_quarter, 'annual')
LEFT JOIN financial_balancesheet bs ON bs.stock_code = fi.stock_code AND bs.report_year = fi.report_year AND COALESCE(bs.report_quarter, 'annual') = COALESCE(fi.report_quarter, 'annual')
ORDER BY fi.stock_code, fi.report_year;