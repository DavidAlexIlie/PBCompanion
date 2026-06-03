$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$compiler = Join-Path $root 'tools\mingw64\w64devkit\bin\g++.exe'
if (Test-Path -LiteralPath $compiler) {
  exit 0
}

$tools = Join-Path $root 'tools'
$archive = Join-Path $tools 'w64devkit-x64-2.8.0.7z.exe'
$destination = Join-Path $tools 'mingw64'
$url = 'https://github.com/skeeto/w64devkit/releases/download/v2.8.0/w64devkit-x64-2.8.0.7z.exe'

New-Item -ItemType Directory -Force -Path $tools, $destination | Out-Null
if (-not (Test-Path -LiteralPath $archive)) {
  Write-Host 'Downloading portable C++ compiler...'
  Invoke-WebRequest -Uri $url -OutFile $archive
}

Write-Host 'Extracting portable C++ compiler...'
& $archive -y "-o$destination" | Out-Null
if (-not (Test-Path -LiteralPath $compiler)) {
  throw "Portable compiler extraction failed: $compiler was not created."
}
