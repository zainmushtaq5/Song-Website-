Set-Location "$PSScriptRoot\..\backend"
$env:AUTO_CREATE_TABLES = 'true'
$env:DATABASE_URL = 'sqlite+aiosqlite:///./.smoke.db'
$env:DEBUG = 'false'
& "$env:APPDATA\Python\Python314\Scripts\uv.exe" run uvicorn app.main:app --port 8000 *> .smoke-server.log
