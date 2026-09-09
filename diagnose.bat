@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === LexiFlow Diagnostics ===
echo Folder: %CD%
echo.
echo [Node]
where node
node -v
echo.
echo [Codex]
where codex
if exist "%CODEX_CLI_PATH%" (
  echo CODEX_CLI_PATH exists: %CODEX_CLI_PATH%
  "%CODEX_CLI_PATH%" --version
) else (
  codex --version
)
echo.
echo [CODEX_CLI_PATH]
echo %CODEX_CLI_PATH%
echo.
echo [Codex Auth]
if exist "%USERPROFILE%\.codex\auth.json" (
  echo Found: %USERPROFILE%\.codex\auth.json
  echo Security: content is NOT displayed.
) else (
  echo Not found: %USERPROFILE%\.codex\auth.json
)
echo.
echo [Codex Optional Config]
if exist "%USERPROFILE%\.codex\config.toml" (
  echo Found: %USERPROFILE%\.codex\config.toml
) else (
  echo Not found: %USERPROFILE%\.codex\config.toml
)
echo.
echo [Files]
dir /b server.js public\index.html public\app.js public\styles.css
echo.
pause
