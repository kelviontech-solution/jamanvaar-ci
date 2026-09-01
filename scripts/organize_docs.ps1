$workspaceRoot = $PSScriptRoot | Split-Path -Parent
$docsDir = Join-Path $workspaceRoot "docs"

if (-not (Test-Path $docsDir)) {
    New-Item -ItemType Directory -Force -Path $docsDir | Out-Null
}

$docFiles = @(
    "ADMIN_GUIDE.md",
    "API.md",
    "ARCHITECTURE.md",
    "AUDIT.md",
    "DATABASE.md",
    "DEPLOYMENT.md",
    "FINAL_AUDIT.md",
    "KIOSK_SETUP.md",
    "RECEIPT_PRINTER_IMPLEMENTATION.md",
    "SECURITY.md",
    "SYNC.md",
    "TESTING.md",
    "TROUBLESHOOTING.md",
    "JAMANVAAR_Kiosk_Complete_Feature_Breakdown.pdf"
)

foreach ($f in $docFiles) {
    $src = Join-Path $workspaceRoot $f
    if (Test-Path $src) {
        $dest = Join-Path $docsDir $f
        Move-Item -Path $src -Destination $dest -Force
        Write-Host "Moved $f to docs/"
    }
}

Write-Host "All documentation markdown and PDF files have been organized into docs/ successfully!"
