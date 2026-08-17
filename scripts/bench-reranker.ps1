$sw = [System.Diagnostics.Stopwatch]::StartNew()
$body = '{"query":"招商银行MA20","documents":["招商银行2024年营收增长5%","五粮液净利润下降3%","招商银行ROE为15.2%"],"top_k":3}'
$r = Invoke-WebRequest -Uri 'http://127.0.0.1:8010/rerank' -Method POST -ContentType 'application/json' -Body $body -UseBasicParsing -TimeoutSec 10
$sw.Stop()
Write-Host "Status: $($r.StatusCode)"
Write-Host "Latency: $($sw.ElapsedMilliseconds)ms"
Write-Host "Response: $($r.Content.Substring(0, [Math]::Min(200, $r.Content.Length)))"