$ErrorActionPreference = 'SilentlyContinue'
$dest = "$PSScriptRoot\pg16.zip"
$expected = 338727828
for ($i = 1; $i -le 40; $i++) {
    if ((Test-Path $dest) -and ((Get-Item $dest).Length -ge $expected)) { break }
    & curl.exe -L -C - --retry 10 --retry-delay 2 --max-time 3600 -o $dest https://get.enterprisedb.com/postgresql/postgresql-16.4-1-windows-x64-binaries.zip
    Start-Sleep 3
}
"final size: " + (Get-Item $dest).Length | Out-File "$PSScriptRoot\getpg.log"
