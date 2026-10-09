param(
    [string]$SeanimePath,
    [switch]$BuildOnly
)
$ErrorActionPreference = 'Stop'

$edgeCandidates = @(
    'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
    (Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\Application\msedge.exe')
)
$edgePath = $edgeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (!$edgePath) { throw 'Microsoft Edge was not found. This launcher requires an existing Edge installation.' }

$compilerPath = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (!(Test-Path -LiteralPath $compilerPath)) {
    $compilerPath = 'C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe'
}
if (!(Test-Path -LiteralPath $compilerPath)) { throw 'The Windows .NET Framework C# compiler was not found.' }

$bridgeDirectory = Join-Path $PSScriptRoot 'edge-bridge'
New-Item -ItemType Directory -Path $bridgeDirectory -Force | Out-Null
$bridgePath = Join-Path $bridgeDirectory 'chrome.exe'
$sourcePath = Join-Path $PSScriptRoot 'EdgeBridge.cs'
& $compilerPath /nologo /target:exe /optimize+ "/out:$bridgePath" $sourcePath
if ($LASTEXITCODE -ne 0) { throw 'Building the Edge bridge failed.' }
if ($BuildOnly) { Write-Output "Built: $bridgePath"; return }

if (!$SeanimePath) {
    $seanimeCandidates = @(
        'C:\Program Files\Seanime Denshi\Seanime Denshi.exe',
        (Join-Path $env:LOCALAPPDATA 'Programs\Seanime Denshi\Seanime Denshi.exe')
    )
    $SeanimePath = $seanimeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (!$SeanimePath -or !(Test-Path -LiteralPath $SeanimePath)) {
    throw 'Seanime was not found. Run this script with -SeanimePath followed by your Seanime executable path.'
}
if (Get-Process -Name 'Seanime Denshi', 'seanime-server-windows', 'seanime' -ErrorAction SilentlyContinue) {
    throw 'Fully quit Seanime first (including its tray icon), then run this launcher again.'
}

# Only the new Seanime process inherits these values. No persistent PATH edits.
$originalPath = $env:PATH
$originalEdge = $env:MKISSA_EDGE_EXECUTABLE
try {
    $env:PATH = "$bridgeDirectory;$originalPath"
    $env:MKISSA_EDGE_EXECUTABLE = $edgePath
    Start-Process -FilePath $SeanimePath -WorkingDirectory (Split-Path -Parent $SeanimePath) -WindowStyle Hidden
    Write-Output 'Started Seanime with the existing Microsoft Edge browser. Refresh MKissa in Seanime.'
} finally {
    $env:PATH = $originalPath
    if ($null -eq $originalEdge) { Remove-Item Env:\MKISSA_EDGE_EXECUTABLE -ErrorAction SilentlyContinue }
    else { $env:MKISSA_EDGE_EXECUTABLE = $originalEdge }
}
