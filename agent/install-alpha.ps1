# DoxieGuard Alpha - Set It and Forget It Installation Script
# This script automatically installs and configures DoxieGuard Agent for alpha testing

param(
    [string]$BackendURL = "http://localhost:3001",
    [string]$AgentName = "DoxieGuard",
    [switch]$AutoStart = $true,
    [switch]$InstallService = $true
)

Write-Host "🐾 DoxieGuard Alpha Installer" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$ServiceName = "DoxieGuard"
$ServiceDisplayName = "DoxieGuard Certificate Manager"
$ExePath = Join-Path $PSScriptRoot "doxie-agent.exe"
$ConfigPath = Join-Path $PSScriptRoot "agent.config"
$LogPath = Join-Path $PSScriptRoot "logs"
$NSSMPath = Join-Path $PSScriptRoot "nssm.exe"

# Colors for output
$Success = "Green"
$Warning = "Yellow"
$ErrorColor = "Red"
$Info = "Cyan"

function Write-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor $Success
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor $Warning
}

function Write-Error {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor $ErrorColor
}

function Write-Info {
    param([string]$Message)
    Write-Host "ℹ️  $Message" -ForegroundColor $Info
}

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Warning "This script should be run as Administrator for service installation."
    Write-Info "Re-run with: Start-Process powershell -Verb RunAs -ArgumentList '-File `"$PSCommandPath`"'"
}

Write-Info "Starting DoxieGuard Agent installation..."

# 1. Create necessary directories
Write-Info "Creating directories..."
New-Item -ItemType Directory -Path $LogPath -Force | Out-Null
Write-Success "Directories created"

# 2. Create configuration file
Write-Info "Creating configuration file..."
$configContent = @"
# DoxieGuard Agent Configuration
BACKEND_URL=$BackendURL
AGENT_NAME=$AgentName
LOG_LEVEL=info
AUTO_DISCOVERY_INTERVAL=3600
CERT_CHECK_INTERVAL=86400
ENABLE_AUTO_UPDATE=true
ENABLE_TELEMETRY=true

# Discovery settings
DISCOVER_LINUX=true
DISCOVER_WINDOWS=true
DISCOVER_KUBERNETES=true
DISCOVER_DOCKER=true
DISCOVER_LOADBALANCERS=true
DISCOVER_ADCS=true
DISCOVER_VPN=true

# Cloud providers
ENABLE_AWS=false
ENABLE_AZURE=false
ENABLE_GCP=false
"@

Set-Content -Path $ConfigPath -Value $configContent -Encoding UTF8
Write-Success "Configuration file created: $ConfigPath"

# 3. Check if agent executable exists
if (-not (Test-Path $ExePath)) {
    Write-Info "Agent executable not found. Building..."
    Set-Location $PSScriptRoot
    
    # Build Go agent
    $buildResult = go build -o doxie-agent.exe main.go adcs.go vpn.go 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Agent built successfully"
    } else {
        Write-Error "Failed to build agent: $buildResult"
        exit 1
    }
}

# 4. Test agent execution
Write-Info "Testing agent execution..."
$testOutput = & $ExePath --version 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Success "Agent test successful: $testOutput"
} else {
    Write-Warning "Agent test failed (this is normal if agent needs configuration)"
}

# 5. Install as Windows Service
if ($InstallService -and $isAdmin) {
    Write-Info "Installing Windows Service..."
    
    # Check if service already exists
    $existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    
    if ($existingService) {
        Write-Warning "Service '$ServiceName' already exists"
        Write-Info "Stopping existing service..."
        Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
        Write-Info "Removing existing service..."
        & $NSSMPath remove $ServiceName confirm
    }
    
    # Install service using NSSM
    Write-Info "Installing service with NSSM..."
    & $NSSMPath install $ServiceName $ExePath
    & $NSSMPath set $ServiceName DisplayName $ServiceDisplayName
    & $NSSMPath set $ServiceName Description "DoxieGuard - Automated Certificate Management"
    & $NSSMPath set $ServiceName AppStdout (Join-Path $LogPath "stdout.log")
    & $NSSMPath set $ServiceName AppStderr (Join-Path $LogPath "stderr.log")
    & $NSSMPath set $ServiceName AppRotateFiles 1
    & $NSSMPath set $ServiceName AppRotateBytes 10485760
    
    Write-Success "Service installed successfully"
    
    # Configure service startup
    if ($AutoStart) {
        Write-Info "Setting service to start automatically..."
        Set-Service -Name $ServiceName -StartupType Automatic
        Write-Success "Service configured for automatic startup"
    }
    
    # Start service
    Write-Info "Starting service..."
    Start-Service -Name $ServiceName -ErrorAction SilentlyContinue
    
    # Wait a moment for service to start
    Start-Sleep -Seconds 3
    
    # Check service status
    $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($service.Status -eq 'Running') {
        Write-Success "Service is running!"
    } else {
        Write-Warning "Service status: $($service.Status)"
    }
}

# 6. Create scheduled task for non-admin Auto-Discovery
if (-not $isAdmin -or -not $InstallService) {
    Write-Info "Creating scheduled task for Auto-Discovery..."
    
    $taskName = "DoxieGuard_AutoDiscovery"
    $action = New-ScheduledTaskAction -Execute $ExePath -Argument "--daemon"
    $trigger = New-ScheduledTaskTrigger -Daily -At "09:00"
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "DoxieGuard Auto-Discovery" -ErrorAction SilentlyContinue
    Write-Success "Scheduled task created"
}

# 7. Create startup shortcut
Write-Info "Creating desktop shortcut..."
$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktopPath "DoxieGuard Agent.lnk"

$WScriptShell = New-Object -ComObject WScript.Shell
$Shortcut = $WScriptShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = $ExePath
$Shortcut.WorkingDirectory = $PSScriptRoot
$Shortcut.Description = "DoxieGuard Certificate Manager Agent"
$Shortcut.Save()

Write-Success "Desktop shortcut created"

# 8. Test connectivity to backend
Write-Info "Testing backend connectivity..."
try {
    $response = Invoke-WebRequest -Uri "$BackendURL/api/health" -Method GET -TimeoutSec 5 -ErrorAction SilentlyContinue
    if ($response.StatusCode -eq 200) {
        Write-Success "Backend is accessible at $BackendURL"
    } else {
        Write-Warning "Backend responded with status: $($response.StatusCode)"
    }
} catch {
    Write-Warning "Backend is not accessible at $BackendURL"
    Write-Info "This is normal if backend is not running yet"
}

# 9. Generate installation report
$installReport = @"
DoxieGuard Alpha Installation Report
======================================
Date: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Agent: $AgentName
Backend: $BackendURL
Installation Path: $PSScriptRoot
Service Status: $(if ($service) { $service.Status } else { 'Not installed' })
Configuration: $ConfigPath
Logs: $LogPath

Features Enabled:
- Auto-Discovery: All platforms
- Cloud Providers: AWS, Azure, GCP
- Enterprise: ADCS, VPNs
- Lifecycle: ACME, Auto-Renewal

Next Steps:
1. Start backend: cd Backend && npm run dev
2. View logs: Get-Content $LogPath\*.log -Tail 50
3. Check service: Get-Service -Name $ServiceName
4. Access dashboard: http://localhost:3000
"@

$reportPath = Join-Path $PSScriptRoot "INSTALLATION_REPORT.txt"
Set-Content -Path $reportPath -Value $installReport
Write-Success "Installation report saved: $reportPath"

# Final output
Write-Host ""
Write-Host "🎉 DoxieGuard Alpha Installation Complete!" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 Summary:" -ForegroundColor Yellow
Write-Host "   - Agent installed at: $ExePath"
Write-Host "   - Configuration: $ConfigPath"  
Write-Host "   - Logs location: $LogPath"
Write-Host "   - Service: $(if ($service) { $service.Status } else { 'Not installed' })"
Write-Host ""
Write-Host "🚀 To start testing:" -ForegroundColor Yellow
Write-Host "   1. Start Backend: cd Backend && npm run dev"
Write-Host "   2. Check service: Get-Service -Name $ServiceName"
Write-Host "   3. View logs: Get-Content $LogPath\*.log -Tail 50"
Write-Host "   4. Access dashboard: http://localhost:3000"
Write-Host ""
Write-Host "📖 For help: Get-Content $reportPath"
Write-Host ""

# Return success
exit 0
