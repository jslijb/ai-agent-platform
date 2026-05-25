$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvFile = Join-Path -Path $ScriptDir -ChildPath "..\.env.local"

if (-Not (Test-Path $EnvFile)) {
    Write-Host ">>> ERROR: $EnvFile not found" -ForegroundColor Red
    exit 1
}

Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
    if ($_ -match '^([^=]+)=(.*)$') {
        [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], "Process")
    }
}
Write-Host ">>> Loaded config from $EnvFile" -ForegroundColor Green

$Container = $env:PG_HOST
$AdminUser = $env:PG_ADMIN_USER
$AdminPass = $env:PG_ADMIN_PASSWORD
$AdminDb = $env:PG_ADMIN_DB
$NewUser = $env:PG_USER
$NewPass = $env:PG_PASSWORD
$NewDb = $env:PG_DB

function Invoke-Psql {
    param(
        [string]$User,
        [string]$Db,
        [string]$Sql
    )
    $result = docker exec $Container psql -U $User -d $Db -c $Sql 2>&1
    $exitCode = $LASTEXITCODE
    $output = $result | Out-String
    if ($exitCode -ne 0) {
        Write-Host ">>> FAILED:`n$output" -ForegroundColor Red
        throw "psql exited with code $exitCode"
    }
    return $output
}

Write-Host ">>> Step 1: Creating user $NewUser" -ForegroundColor Cyan
$checkUser = Invoke-Psql -User $AdminUser -Db $AdminDb -Sql "SELECT 1 FROM pg_roles WHERE rolname = '$NewUser'"
if ($checkUser -match "1 row") {
    Write-Host ">>> User $NewUser already exists, skipping" -ForegroundColor Yellow
} else {
    Invoke-Psql -User $AdminUser -Db $AdminDb -Sql "CREATE USER $NewUser WITH PASSWORD '$NewPass';"
    Write-Host ">>> User $NewUser created" -ForegroundColor Green
}

Write-Host ">>> Step 2: Creating database $NewDb" -ForegroundColor Cyan
$checkDb = Invoke-Psql -User $AdminUser -Db $AdminDb -Sql "SELECT 1 FROM pg_database WHERE datname = '$NewDb'"
if ($checkDb -match "1 row") {
    Write-Host ">>> Database $NewDb already exists, skipping" -ForegroundColor Yellow
} else {
    Invoke-Psql -User $AdminUser -Db $AdminDb -Sql "CREATE DATABASE $NewDb OWNER $NewUser;"
    Write-Host ">>> Database $NewDb created" -ForegroundColor Green
}

Write-Host ">>> Step 3: Granting schema privileges to $NewUser" -ForegroundColor Cyan
Invoke-Psql -User $AdminUser -Db $NewDb -Sql "GRANT ALL PRIVILEGES ON SCHEMA public TO $NewUser;"
Write-Host ">>> Schema privileges granted" -ForegroundColor Green

Write-Host ">>> Step 4: Granting default privileges to $NewUser" -ForegroundColor Cyan
Invoke-Psql -User $AdminUser -Db $NewDb -Sql "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO $NewUser;"
Invoke-Psql -User $AdminUser -Db $NewDb -Sql "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO $NewUser;"
Write-Host ">>> Default privileges granted" -ForegroundColor Green

Write-Host ">>> Step 5: Verifying connection as $NewUser" -ForegroundColor Cyan
$verify = Invoke-Psql -User $NewUser -Db $NewDb -Sql "SELECT current_user, current_database();"
Write-Host $verify

Write-Host ">>> Done! Database $NewDb is ready for user $NewUser" -ForegroundColor Green
