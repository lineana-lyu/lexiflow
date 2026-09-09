$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$log = Join-Path $PSScriptRoot "startup.log"
"=== LexiFlow startup $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Set-Content -Path $log -Encoding UTF8

function Log([string]$Text) {
    $Text | Tee-Object -FilePath $log -Append
}

try {
    Log "[1/5] 工作目录: $PSScriptRoot"

    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) {
        Log "[ERROR] 未找到 Node.js。"
        Log "请安装 Node.js 18 或更高版本，然后重新启动。"
        Log "下载地址: https://nodejs.org/"
        throw "NODE_NOT_FOUND"
    }

    $nodeVersion = (& node -v 2>&1 | Out-String).Trim()
    Log "[2/5] Node.js: $nodeVersion"

    $major = 0
    if ($nodeVersion -match '^v(\d+)') {
        $major = [int]$Matches[1]
    }
    if ($major -lt 18) {
        Log "[ERROR] Node.js 版本过低，需要 Node.js 18+。"
        throw "NODE_TOO_OLD"
    }

    $server = Join-Path $PSScriptRoot "server.js"
    if (-not (Test-Path $server)) {
        Log "[ERROR] 找不到 server.js: $server"
        throw "SERVER_JS_MISSING"
    }

    Log "[3/5] server.js 存在。"

    $codexResolved = $null

    if ($env:CODEX_CLI_PATH -and (Test-Path $env:CODEX_CLI_PATH)) {
        $codexResolved = $env:CODEX_CLI_PATH
    }

    if (-not $codexResolved) {
        $commonCandidates = @(
            (Join-Path $env:APPDATA "npm\node_modules\@openai\codex\node_modules\@openai\codex-win32-x64\vendor\x86_64-pc-windows-msvc\bin\codex.exe"),
            (Join-Path $env:APPDATA "npm\node_modules\@openai\codex\node_modules\@openai\codex-win32-x64\vendor\x86_64-pc-windows-msvc\codex\codex.exe"),
            (Join-Path $env:APPDATA "npm\codex.cmd")
        )
        foreach ($candidate in $commonCandidates) {
            if ($candidate -and (Test-Path $candidate)) {
                $codexResolved = $candidate
                break
            }
        }
    }

    if (-not $codexResolved) {
        $codexCommand = Get-Command codex -ErrorAction SilentlyContinue
        if ($codexCommand) { $codexResolved = $codexCommand.Source }
    }

    if ($codexResolved) {
        $env:CODEX_CLI_PATH = $codexResolved
        try {
            $codexVersion = (& $codexResolved --version 2>&1 | Out-String).Trim()
            Log "[4/6] Codex CLI: $codexVersion"
            Log "      路径: $codexResolved"
        } catch {
            Log "[4/6] 已找到 Codex 文件，但启动检测失败: $codexResolved"
            Log "      $($_.Exception.Message)"
        }
    } else {
        Log "[4/6] Codex CLI 未检测到。词典仍可使用，但文本/图片 AI 暂不可用。"
    }

    $authPath = Join-Path $env:USERPROFILE ".codex\auth.json"
    if (Test-Path $authPath) {
        Log "[5/6] Codex auth.json: 已检测到 $authPath"
        Log "      安全说明：LexiFlow 不会读取或输出 auth.json 内容。"
    } else {
        Log "[5/6] Codex auth.json: 未检测到 $authPath"
    }

    Log "[6/6] 正在启动本地服务..."
    Log "如果启动成功，浏览器会打开 http://127.0.0.1:4177"
    Log "关闭此 PowerShell 窗口即可停止 LexiFlow。"
    Log "------------------------------------------------------------"

    # Start server in the foreground so errors remain visible.
    & node $server 2>&1 | Tee-Object -FilePath $log -Append

    $exitCode = $LASTEXITCODE
    Log "------------------------------------------------------------"
    Log "[ERROR] LexiFlow 服务已退出，退出码: $exitCode"
}
catch {
    Log "------------------------------------------------------------"
    Log "[STARTUP FAILED] $($_.Exception.Message)"
}
finally {
    Write-Host ""
    Write-Host "启动日志已保存到：" -ForegroundColor Yellow
    Write-Host $log -ForegroundColor Yellow
    Write-Host ""
    Read-Host "按 Enter 关闭此窗口"
}
