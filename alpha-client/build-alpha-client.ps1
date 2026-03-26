# DoxieGuard Alpha Client - Build Script
# Description: Compile PowerShell script to standalone executable
# This script packages the Alpha Client for distribution to clients

param(
    [string]$OutputPath = ".\doxie-alpha-client.exe",
    [string]$ScriptPath = ".\doxie-alpha-client.ps1"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " DoxieGuard Alpha Client Builder" -ForegroundColor Cyan  
Write-Host "========================================" -ForegroundColor Cyan

# Check if script exists
if (-not (Test-Path $ScriptPath)) {
    Write-Host "[ERROR] Script not found: $ScriptPath" -ForegroundColor Red
    exit 1
}

# Check for PS2EXE module
Write-Host "[INFO] Checking PS2EXE module..." -ForegroundColor Yellow
$ps2exe = Get-Module -ListAvailable -Name PS2EXE

if (-not $ps2xe) {
    Write-Host "[INFO] PS2EXE not found. Installing..." -ForegroundColor Yellow
    try {
        Install-Module -Name PS2EXE -Scope CurrentUser -Force -ErrorAction Stop
        Import-Module PS2EXE -ErrorAction Stop
        Write-Host "[OK] PS2EXE installed successfully" -ForegroundColor Green
    } catch {
        Write-Host "[WARNING] Could not install PS2EXE. Will use alternative method." -ForegroundColor Yellow
        $useAlternative = $true
    }
} else {
    Import-Module PS2EXE -ErrorAction Stop
    Write-Host "[OK] PS2EXE module ready" -ForegroundColor Green
}

# Create output directory if needed
$outputDir = Split-Path $OutputPath -Parent
if ($outputDir -and -not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

# Remove existing exe if exists
if (Test-Path $OutputPath) {
    Write-Host "[INFO] Removing existing executable..." -ForegroundColor Yellow
    Remove-Item $OutputPath -Force
}

Write-Host "[INFO] Compiling PowerShell script to executable..." -ForegroundColor Yellow
Write-Host "[INFO] This may take a few minutes..." -ForegroundColor Yellow

# Compile using PS2EXE
try {
    $compileParams = @{
        InputFile = $ScriptPath
        OutputFile = $OutputPath
        DotNetVersion = 'v4.6.2'
        Description = 'DoxieGuard Alpha - Certificate Scanner'
        CompanyName = 'DoxieGuard'
        ProductName = 'DoxieGuard Alpha Client'
        FileVersion = '1.0.0.0'
        ProductVersion = '1.0.0'
        CompileWithXPManifest = $false
        RequireElevation = $false
        SupportOS = $true
        NoConsole = $false
        WindowStyle = 'Normal'
    }
    
    # Execute compilation
    Write-Host "[INFO] Running PS2EXE compilation..." -ForegroundColor Cyan
    Compile-Script @compileParams -ErrorAction Stop
    
    if (Test-Path $OutputPath) {
        $fileInfo = Get-Item $OutputPath
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "[SUCCESS] Compilation completed!" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "Executable: $OutputPath" -ForegroundColor White
        Write-Host "Size: $([math]::Round($fileInfo.Length / 1MB, 2)) MB" -ForegroundColor White
        Write-Host ""
        Write-Host "[READY] Client is ready for distribution!" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Usage:" -ForegroundColor Yellow
        Write-Host "  1. Share doxie-alpha-client.exe with clients" -ForegroundColor White
        Write-Host "  2. Client runs it on their Windows machine" -ForegroundColor White
        Write-Host "  3. Frontend opens at http://localhost:3000" -ForegroundColor White
        Write-Host "  4. Reports saved to .\doxie-logs\" -ForegroundColor White
    } else {
        Write-Host "[ERROR] Compilation failed - executable not created" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "[ERROR] Compilation failed: $($_.Exception.Message)" -ForegroundColor Red
    
    # Alternative: Create a batch launcher
    Write-Host "[INFO] Creating alternative batch launcher..." -ForegroundColor Yellow
    
    $batchContent = @"
@echo off
echo DoxieGuard Alpha Client
echo =========================
echo Starting certificate scanner...
echo.
powershell.exe -ExecutionPolicy Bypass -File "%~dp0doxie-alpha-client.ps1"
pause
"@
    
    $batchPath = $OutputPath -replace '\.exe$', '-launcher.bat'
    $batchContent | Out-File -FilePath $batchPath -Encoding ASCII
    
    Write-Host "[OK] Batch launcher created: $batchPath" -ForegroundColor Green
    Write-Host "[INFO] Clients can run the .ps1 script directly" -ForegroundColor Yellow
    Write-Host "[INFO] PowerShell must be installed on client machines" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[COMPLETE] Build process finished" -ForegroundColor Cyan
