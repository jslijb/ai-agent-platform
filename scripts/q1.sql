SELECT COUNT(*) as total,
  COUNT(CASE WHEN revenue IS NULL THEN 1 END) as null_revenue,
  COUNT(CASE WHEN "netProfit" IS NULL THEN 1 END) as null_netProfit,
  COUNT(CASE WHEN eps IS NULL THEN 1 END) as null_eps
FROM financial_income;