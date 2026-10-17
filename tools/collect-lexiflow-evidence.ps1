# Read-only evidence collection for an immutable LexiFlow release tag.
param(
  [ValidateSet('v0.8.7','v0.8.8')][string]$Version = 'v0.8.7',
  [string]$OutputRoot = (Join-Path (Get-Location) 'lexiflow-evidence')
)
$ErrorActionPreference = 'Stop'
$Expected = @{
  'v0.8.7' = 'da57b4b4776d3b7ef58299f4fafb864f053b4695'
  'v0.8.8' = '0db812747e22404c72bad73bfb7ec0bf02135155'
}
$OutputRoot = [IO.Path]::GetFullPath($OutputRoot)
$RunDir = Join-Path $OutputRoot ("evidence-$Version-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$Src = Join-Path $RunDir 'source'
$Out = Join-Path $RunDir 'evidence'
New-Item -ItemType Directory -Path $Out -Force | Out-Null
$Old = (Get-Location).Path
$Phase = 'initialization'
$Success = $false
Start-Transcript -Path (Join-Path $Out 'full-terminal-log.txt') -Force | Out-Null
try {
  Write-Host "LexiFlow evidence collection | $Version | $(Get-Date -Format o)"
  $Phase = 'clone release tag'
  & git clone --branch $Version --depth 1 https://github.com/lineana-lyu/lexiflow.git $Src
  if ($LASTEXITCODE -ne 0) { throw "git clone failed: $LASTEXITCODE" }
  Set-Location $Src
  $Commit = (& git rev-parse HEAD).Trim()
  if ($Commit -ne $Expected[$Version]) { throw "Tag SHA mismatch: $Commit" }
  $Node = (& node --version).Trim()
  $Npm = (& npm.cmd --version).Trim()
  Write-Host "Release commit: $Commit"
  Write-Host "Node: $Node | npm: $Npm | OS: $([Environment]::OSVersion.VersionString)"
  $Phase = 'npm ci'
  & npm.cmd ci 2>&1 | Tee-Object -FilePath (Join-Path $Out 'dependency-install.txt')
  if ($LASTEXITCODE -ne 0) { throw "npm ci failed: $LASTEXITCODE" }
  $Phase = 'npm run check'
  & npm.cmd run check 2>&1 | Tee-Object -FilePath (Join-Path $Out 'automated-checks.txt')
  if ($LASTEXITCODE -ne 0) { throw "npm run check failed: $LASTEXITCODE" }
  $Phase = 'prepare:dictionary'
  & npm.cmd run prepare:dictionary 2>&1 | Tee-Object -FilePath (Join-Path $Out 'dictionary-preparation.txt')
  if ($LASTEXITCODE -ne 0) { throw "prepare:dictionary failed: $LASTEXITCODE" }
  $Phase = 'benchmark-core-lexicon'
  for ($i = 1; $i -le 3; $i++) {
    Write-Host "=== Benchmark run $i of 3 ==="
    & node scripts/benchmark-core-lexicon.js 2>&1 | Tee-Object -FilePath (Join-Path $Out "benchmark-run-$i.txt")
    if ($LASTEXITCODE -ne 0) { throw "Benchmark run $i failed: $LASTEXITCODE" }
  }
  $Manifest = Join-Path $Out 'environment-and-source.txt'
  @(
    "Project: LexiFlow",
    "Release: $Version",
    "Commit: $Commit",
    "Executed: $(Get-Date -Format o)",
    "OS: $([Environment]::OSVersion.VersionString)",
    "Node: $Node",
    "npm: $Npm",
    "Commands: npm ci; npm run check; npm run prepare:dictionary; node scripts/benchmark-core-lexicon.js x3",
    "Scope: local dictionary microbenchmark; not application or AI response latency."
  ) | Set-Content -Path $Manifest -Encoding UTF8
  foreach ($File in @('resources/core-lexicon.sqlite','resources/ecdict.sqlite','resources/phrase-dictionary.sqlite')) {
    if (Test-Path $File) {
      $Hash = Get-FileHash -Algorithm SHA256 -Path $File
      Add-Content -Path $Manifest -Value "SHA256 $File $($Hash.Hash)" -Encoding UTF8
    }
  }
  $Success = $true
  Write-Host "SUCCESS: $Out"
} catch {
  Write-Host "FAILURE: phase=$Phase; message=$($_.Exception.Message)"
  throw
} finally {
  Write-Host "Finished: $(Get-Date -Format o); success=$Success"
  Set-Location $Old
  Stop-Transcript | Out-Null
}
