$key = $env:AGNES_KEY
if (-not $key) {
    Write-Host "AGNES_KEY 未设置"
    exit 1
}
Write-Host "AGNES_KEY 长度: $($key.Length)"

$body = @{
    model = "agnes-2.0-flash"
    messages = @(@{role = "user"; content = "你好"})
} | ConvertTo-Json -Depth 5

$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $key"
}

Write-Host "发送测试请求到 AGNES..."
$sw = [System.Diagnostics.Stopwatch]::StartNew()
try {
    $r = Invoke-WebRequest -Uri "https://apihub.agnes-ai.com/v1/chat/completions" -Method POST -Headers $headers -Body $body -TimeoutSec 120 -UseBasicParsing
    $sw.Stop()
    Write-Host "状态码: $($r.StatusCode)"
    Write-Host "耗时: $($sw.ElapsedMilliseconds) ms"
    $content = $r.Content
    if ($content.Length -gt 500) {
        Write-Host "响应: $($content.Substring(0, 500))"
    } else {
        Write-Host "响应: $content"
    }
} catch {
    $sw.Stop()
    Write-Host "错误: $($_.Exception.Message)"
    Write-Host "耗时: $($sw.ElapsedMilliseconds) ms"
}
