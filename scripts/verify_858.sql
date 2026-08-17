SELECT stock_code, report_year, revenue, net_profit, eps, gross_margin, net_margin
FROM financial_income WHERE stock_code = '000858' ORDER BY report_year;