# build.ps1 — Build the Windows agent binary + installer.
#
# Run on Windows (PowerShell 5+):
#   cd agent
#   npm ci
#   powershell -ExecutionPolicy Bypass -File installer\build.ps1
#
# Steps:
#   1. @yao-pkg/pkg bundles agent.js (ESM) into dist\labelgo-agent.exe
#   2. Inno Setup (iscc) compiles LabelGoAgent-Setup.exe
#
# Em CI, o workflow .github/workflows/agent-installer.yml faz isso num runner
# Windows e publica o Setup no release `agent-latest` do GitHub.
#
# Requirements:
#   - Node.js 18+ (build machine only — customers do NOT need Node)
#   - npm i -D @yao-pkg/pkg (or npx)
#   - Inno Setup 6 (https://jrsoftware.org/isdl.php)

$ErrorActionPreference = 'Stop'
$agentDir = Split-Path -Parent $PSScriptRoot
Push-Location $agentDir
try {
    Write-Host "==> Building labelgo-agent.exe with @yao-pkg/pkg..."
    npx --yes @yao-pkg/pkg package.json `
        --targets node22-win-x64 `
        --output dist\labelgo-agent.exe

    if (-not (Test-Path dist\labelgo-agent.exe)) {
        throw "pkg did not produce dist\labelgo-agent.exe"
    }
    Write-Host "==> Binary OK: dist\labelgo-agent.exe"

    $iscc = Get-Command iscc.exe -ErrorAction SilentlyContinue
    if (-not $iscc) {
        $iscc = "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe"
        if (-not (Test-Path $iscc)) {
            Write-Warning "Inno Setup (iscc.exe) not found — skipping installer compile."
            Write-Warning "Install Inno Setup 6 and run: iscc installer\LabelGoAgent.iss"
            exit 0
        }
        $iscc = Get-Item $iscc
    }

    Write-Host "==> Compiling installer with Inno Setup..."
    & $iscc.Path installer\LabelGoAgent.iss
    Write-Host "==> Done: installer\Output\LabelGoAgent-Setup.exe"
}
finally {
    Pop-Location
}
