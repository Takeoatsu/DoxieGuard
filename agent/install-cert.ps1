# DoxieGuard Certificate Installer Script
# Master script for Windows certificate deployment (IIS / Exchange)
# 
# Usage: .\install-cert.ps1 -pfxPath "C:\certs\domain.pfx" -password "DoxieGuard2024" -domain "example.com"
#
# This script expects a pre-generated PFX file from the Go agent and automatically 
# detects IIS and Exchange to apply the certificate.

param(
    [Parameter(Mandatory=$true)]
    [string]$pfxPath,
    
    [Parameter(Mandatory=$true)]
    [string]$password,
    
    [Parameter(Mandatory=$true)]
    [string]$domain
)

$ErrorActionPreference = "Continue"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "DoxieGuard Certificate Installer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verify PFX file exists
if (-not (Test-Path $pfxPath)) {
    Write-Host "ERROR: PFX file not found: $pfxPath" -ForegroundColor Red
    exit 1
}

Write-Host "PFX file found: $pfxPath" -ForegroundColor Green
Write-Host ""

# 2. Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "WARNING: Running as Administrator is recommended for installing certificates." -ForegroundColor Yellow
}

# 3. Import Certificate to Certificate Store
Write-Host "Importing certificate to Certificate Store..." -ForegroundColor Yellow

$securePassword = ConvertTo-SecureString $password -AsPlainText -Force

# Try CurrentUser store first (no admin required)
try {
    $cert = Import-PfxCertificate -FilePath $pfxPath -CertStoreLocation Cert:\CurrentUser\My -Password $securePassword -ErrorAction Stop
    Write-Host "SUCCESS: Certificate imported to CurrentUser store. Thumbprint: $($cert.Thumbprint)" -ForegroundColor Green
} catch {
    # If CurrentUser fails and we're not admin, try LocalMachine
    if ($isAdmin) {
        try {
            $cert = Import-PfxCertificate -FilePath $pfxPath -CertStoreLocation Cert:\LocalMachine\My -Password $securePassword -ErrorAction Stop
            Write-Host "SUCCESS: Certificate imported to LocalMachine store. Thumbprint: $($cert.Thumbprint)" -ForegroundColor Green
        } catch {
            Write-Host "ERROR importing certificate: $_" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "ERROR importing certificate (try running as Administrator): $_" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""

# 4. Auto-detect and configure IIS
Write-Host "Detecting installed services..." -ForegroundColor Yellow
$w3svc = Get-Service -Name W3SVC -ErrorAction SilentlyContinue

if ($null -ne $w3svc) {
    Write-Host "IIS detected! Updating SSL bindings..." -ForegroundColor Cyan
    
    try {
        $bindings = Get-WebBinding -Protocol https -ErrorAction SilentlyContinue
        if ($null -ne $bindings) {
            foreach ($binding in $bindings) {
                $binding.AddSslCertificate($cert.Thumbprint, "My")
                Write-Host "   SUCCESS: Binding updated for: $($binding.bindingInformation)" -ForegroundColor Green
            }
        } else {
            Write-Host "   WARNING: No HTTPS bindings found to update." -ForegroundColor Yellow
        }
    } catch {
        Write-Host "   WARNING: Error updating IIS: $_" -ForegroundColor Yellow
    }
    
    Write-Host ""
}

# 5. Auto-detect and configure Exchange
$exchangeService = Get-Service -Name MSExchangeServiceHost -ErrorAction SilentlyContinue

if ($null -ne $exchangeService) {
    Write-Host "Microsoft Exchange detected! Enabling services..." -ForegroundColor Cyan
    
    try {
        $certData = [System.IO.File]::ReadAllBytes($pfxPath)
        $exchCert = Import-ExchangeCertificate -FileData $certData -Password $securePassword -ErrorAction Stop
        
        $services = @("IIS", "SMTP")
        
        $imapService = Get-Service -Name MSExchangeIMAP* -ErrorAction SilentlyContinue
        if ($null -ne $imapService) { 
            $services += "IMAP" 
        }
        
        $popService = Get-Service -Name MSExchangePOP* -ErrorAction SilentlyContinue
        if ($null -ne $popService) { 
            $services += "POP" 
        }
        
        $servicesStr = $services -join ", "
        
        Enable-ExchangeCertificate -Thumbprint $exchCert.Thumbprint -Services $servicesStr -Force -ErrorAction Stop
        
        Write-Host "   SUCCESS: Certificate enabled for services: $servicesStr" -ForegroundColor Green
    } catch {
        Write-Host "   WARNING: Error configuring Exchange: $_" -ForegroundColor Yellow
    }
    
    Write-Host ""
}

# 6. Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Certificate installation completed!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Domain: $domain" -ForegroundColor White
Write-Host "Thumbprint: $($cert.Thumbprint)" -ForegroundColor White
Write-Host "Expiration: $($cert.NotAfter)" -ForegroundColor White
Write-Host ""
