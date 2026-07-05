# revive_windows.ps1 — one-click book revival on Windows.
#
# Double-click friendly: right-click this file -> "Run with PowerShell",
# or in a PowerShell window run:
#     powershell -ExecutionPolicy Bypass -File .\revive_windows.ps1
#
# It will:
#   1. Install the needed tools (Python, Tesseract, Ghostscript) via winget if missing.
#   2. pip install ocrmypdf + pymupdf.
#   3. Let you pick your scanned book PDF (file dialog).
#   4. Produce a cleaned, searchable PDF + extracted figures next to it.
#
# Keep this file in the same folder as revive.py.

param([string]$Pdf)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

function Info($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "OK  $m" -ForegroundColor Green }
function Warn($m) { Write-Host "!!  $m" -ForegroundColor Yellow }

# --- 1. Ensure winget is available ---------------------------------------
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Warn "winget not found. Install 'App Installer' from the Microsoft Store, then re-run."
    Read-Host "Press Enter to exit"; exit 1
}

function Ensure-Winget($cmd, $wingetId, $name) {
    if (Get-Command $cmd -ErrorAction SilentlyContinue) { Ok "$name already installed"; return }
    Info "Installing $name (winget: $wingetId)…"
    winget install --id $wingetId -e --accept-source-agreements --accept-package-agreements
}

# --- 2. Install the toolchain --------------------------------------------
Ensure-Winget "python"    "Python.Python.3.12"          "Python 3"
Ensure-Winget "tesseract" "UB-Mannheim.TesseractOCR"    "Tesseract OCR"
Ensure-Winget "gswin64c"  "ArtifexSoftware.GhostScript" "Ghostscript"

# winget-installed tools may not be on PATH in this session — add them.
$tess = "C:\Program Files\Tesseract-OCR"
if (Test-Path $tess) { $env:PATH = "$tess;$env:PATH" }
$gsBin = Get-ChildItem "C:\Program Files\gs" -Directory -ErrorAction SilentlyContinue |
         ForEach-Object { Join-Path $_.FullName "bin" } |
         Where-Object { Test-Path $_ } | Select-Object -First 1
if ($gsBin) { $env:PATH = "$gsBin;$env:PATH" }

# Resolve a python launcher (PowerShell 5.1-compatible; no ternary operator).
if (Get-Command py -ErrorAction SilentlyContinue) { $py = "py" } else { $py = "python" }

Info "Installing Python packages (ocrmypdf, pymupdf)…"
& $py -m pip install --quiet --upgrade pip
& $py -m pip install --quiet ocrmypdf pymupdf
Ok "Toolchain ready"

# --- 3. Pick the PDF ------------------------------------------------------
if (-not $Pdf) {
    Add-Type -AssemblyName System.Windows.Forms
    $dlg = New-Object System.Windows.Forms.OpenFileDialog
    $dlg.Filter = "PDF files (*.pdf)|*.pdf"
    $dlg.Title  = "Select your scanned book PDF"
    if ($dlg.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
        Warn "No file selected. Exiting."; exit 1
    }
    $Pdf = $dlg.FileName
}
if (-not (Test-Path $Pdf)) { Warn "File not found: $Pdf"; exit 1 }
Ok "Book: $Pdf"

# --- 4. Run the pipeline --------------------------------------------------
$outDir = Join-Path (Split-Path -Parent $Pdf) "revived"
Info "Running the pipeline (this can take a while for a big book)…"
& $py (Join-Path $here "revive.py") all "$Pdf" --out "$outDir"

Ok "Done. Your searchable book and figures are in:"
Write-Host "    $outDir" -ForegroundColor Green
if (Test-Path $outDir) { Invoke-Item $outDir }
Read-Host "Press Enter to close"
