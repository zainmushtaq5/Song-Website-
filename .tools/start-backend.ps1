# Consistent, fully-logged backend launcher (dev).
# - stdout/stderr captured to backend-console.log / backend-error.log
# - PYTHONFAULTHANDLER=1 prints native crash traces (access violations) to stderr
# - PYTHONUNBUFFERED=1 flushes immediately so a death leaves a complete log
Set-Location "$PSScriptRoot\..\backend"
$env:AUTO_CREATE_TABLES = 'true'
$env:DATABASE_URL = 'sqlite+aiosqlite:///./.smoke.db'
$env:DEBUG = 'false'
$env:PYTHONFAULTHANDLER = '1'
$env:PYTHONUNBUFFERED = '1'
& "$env:APPDATA\Python\Python314\Scripts\uv.exe" run uvicorn app.main:app --port 8000 `
    1> backend-console.log 2> backend-error.log
