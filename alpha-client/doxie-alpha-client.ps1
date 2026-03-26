# DoxieGuard Alpha Client - Portable Certificate Scanner
# Author: DoxieGuard Team
# Version: 1.0.0-alpha
# Description: Auto-discovery de certificados SSL/TLS con dashboard visual

param(
    [string]$OutputDir = ".\doxie-logs",
    [string]$Port = "3000",
    [switch]$GenerateReport,
    [switch]$SendToDashboard,
    [string]$BackendURL = "http://localhost:5000"
)

# Colors for console output
function Write-DoxieHeader {
    param([string]$Text)
    $header = @"
╔══════════════════════════════════════════════════════════════╗
║  $Text
╚══════════════════════════════════════════════════════════════╝
"@
    Write-Host $header -ForegroundColor Cyan
}

function Write-DoxieSuccess {
    param([string]$Text)
    Write-Host "[✅] $Text" -ForegroundColor Green
}

function Write-DoxieWarning {
    param([string]$Text)
    Write-Host "[⚠️] $Text" -ForegroundColor Yellow
}

function Write-DoxieError {
    param([string]$Text)
    Write-Host "[❌] $Text" -ForegroundColor Red
}

# Initialize directories
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$logFile = Join-Path $OutputDir "doxie-report-$timestamp.log"
$certJsonFile = Join-Path $OutputDir "certificates-$timestamp.json"

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

# Logging function
function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $logEntry = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$Level] $Message"
    Add-Content -Path $logFile -Value $logEntry -Encoding UTF8
    Write-Host $logEntry
}

# Certificate discovery classes
class CertificateInfo {
    [string]$Subject
    [string]$Issuer
    [string]$Thumbprint
    [datetime]$NotBefore
    [datetime]$NotAfter
    [int]$DaysToExpiry
    [string]$Status
    [string]$Source
    [string]$Path
}

# Auto-Discovery Functions
function Get-WindowsCertificateStore {
    Write-Log "Iniciando descubrimiento de certificados en Windows Certificate Store..."
    
    $certificates = @()
    $stores = @("My", "Root", "CA", "TrustedPeople", "TrustedPublisher")
    
    foreach ($storeName in $stores) {
        try {
            $store = Get-ChildItem -Path "Cert:\LocalMachine\$storeName" -ErrorAction SilentlyContinue
            foreach ($cert in $store) {
                $daysToExpiry = ($cert.NotAfter - (Get-Date)).Days
                
                $status = switch ($daysToExpiry) {
                    { $_ -lt 0 } { "EXPIRED" }
                    { $_ -lt 30 } { "CRITICAL" }
                    { $_ -lt 90 } { "WARNING" }
                    default { "HEALTHY" }
                }
                
                $certInfo = [CertificateInfo]@{
                    Subject = $cert.Subject
                    Issuer = $cert.Issuer
                    Thumbprint = $cert.Thumbprint
                    NotBefore = $cert.NotBefore
                    NotAfter = $cert.NotAfter
                    DaysToExpiry = $daysToExpiry
                    Status = $status
                    Source = "Windows Certificate Store"
                    Path = $cert.PSPath
                }
                $certificates += $certInfo
                Write-Log "Certificado encontrado: $($cert.Subject) - $status" "DISCOVERY"
            }
        } catch {
            Write-Log "Error accediendo al store $storeName : $_" "ERROR"
        }
    }
    
    Write-DoxieSuccess "Encontrados $($certificates.Count) certificados en Windows Certificate Store"
    return $certificates
}

function Get-CommonPathsDiscovery {
    Write-Log "Buscando certificados en rutas comunes..."
    
    $certificates = @()
    $commonPaths = @(
        "C:\ProgramData\VMware\vmwarecert",
        "C:\ProgramData\VMware\vcerts",
        "C:\ProgramData\McAfee",
        "C:\ProgramData\Symantec",
        "C:\Windows\System32\config\systemprofile\AppData\Local\Microsoft\Crypto",
        "C:\Program Files\OpenVPN\config",
        "C:\Program Files (x86)\OpenVPN\config",
        "C:\nginx\conf",
        "C:\Apache24\conf",
        "C:\xampp\apache\conf",
        "$env:USERPROFILE\.docker\machine\certs",
        "$env:USERPROFILE\.minikube\certs"
    )
    
    foreach ($path in $commonPaths) {
        if (Test-Path $path) {
            $certs = Get-ChildItem -Path $path -Filter "*.pem,*.crt,*.cer,*.pfx" -Recurse -ErrorAction SilentlyContinue
            foreach ($cert in $certs) {
                try {
                    $certInfo = [CertificateInfo]@{
                        Subject = $cert.Name
                        Issuer = "File System"
                        Thumbprint = $cert.BaseName
                        NotBefore = $cert.CreationTime
                        NotAfter = $cert.LastWriteTime
                        DaysToExpiry = 0
                        Status = "DISCOVERED"
                        Source = "Common Paths"
                        Path = $cert.FullName
                    }
                    $certificates += $certInfo
                    Write-Log "Certificado encontrado: $($cert.FullName)" "DISCOVERY"
                } catch {
                    Write-Log "Error leyendo certificado $($cert.FullName): $_" "ERROR"
                }
            }
        }
    }
    
    Write-DoxieSuccess "Búsqueda en rutas comunes completada"
    return $certificates
}

function Get-DockerCertificates {
    Write-Log "Buscando certificados en Docker..."
    
    $certificates = @()
    
    # Docker config directories
    $dockerPaths = @(
        "$env:USERPROFILE\.docker",
        "C:\ProgramData\docker"
    )
    
    foreach ($path in $dockerPaths) {
        if (Test-Path $path) {
            $certs = Get-ChildItem -Path $path -Filter "*.pem,*.crt" -Recurse -ErrorAction SilentlyContinue
            foreach ($cert in $certs) {
                $certInfo = [CertificateInfo]@{
                    Subject = $cert.Name
                    Issuer = "Docker"
                    Thumbprint = $cert.BaseName
                    NotBefore = $cert.CreationTime
                    NotAfter = $cert.LastWriteTime
                    DaysToExpiry = 0
                    Status = "DISCOVERED"
                    Source = "Docker"
                    Path = $cert.FullName
                }
                $certificates += $certInfo
                Write-Log "Certificado Docker encontrado: $($cert.FullName)" "DISCOVERY"
            }
        }
    }
    
    Write-DoxieSuccess "Búsqueda en Docker completada"
    return $certificates
}

function Get-WebServerCertificates {
    Write-Log "Detectando certificados de servidores web..."
    
    $certificates = @()
    
    # IIS Certificates
    try {
        Import-Module WebAdministration -ErrorAction SilentlyContinue
        $iisCerts = Get-ChildItem -Path "IIS:\SslBindings" -ErrorAction SilentlyContinue
        foreach ($cert in $iisCerts) {
            $certInfo = [CertificateInfo]@{
                Subject = $cert.Host
                Issuer = "IIS"
                Thumbprint = $cert.Thumbprint
                NotBefore = (Get-Date)
                NotAfter = (Get-Date).AddDays(365)
                DaysToExpiry = 365
                Status = "DISCOVERED"
                Source = "IIS"
                Path = "IIS:\SslBindings"
            }
            $certificates += $certInfo
            Write-Log "Certificado IIS encontrado: $($cert.Host)" "DISCOVERY"
        }
    } catch {
        Write-Log "IIS no disponible o sin certificados: $_" "WARNING"
    }
    
    Write-DoxieSuccess "Búsqueda de servidores web completada"
    return $certificates
}

# Generate HTML Dashboard
function Generate-HTMLDashboard {
    param(
        [CertificateInfo[]]$Certificates,
        [string]$Timestamp
    )
    
    $html = @"
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DoxieGuard Alpha - Certificate Scanner</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        .header {
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            margin-bottom: 30px;
        }
        
        .header h1 {
            color: #667eea;
            font-size: 2.5em;
            margin-bottom: 10px;
        }
        
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .stat-card {
            background: white;
            padding: 25px;
            border-radius: 15px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
            text-align: center;
        }
        
        .stat-card h3 {
            font-size: 3em;
            margin-bottom: 10px;
        }
        
        .stat-card.healthy h3 { color: #10b981; }
        .stat-card.warning h3 { color: #f59e0b; }
        .stat-card.critical h3 { color: #ef4444; }
        .stat-card.total h3 { color: #667eea; }
        
        .certificates {
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        
        .certificates h2 {
            color: #333;
            margin-bottom: 20px;
            font-size: 1.8em;
        }
        
        .cert-item {
            border: 2px solid #e5e7eb;
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 15px;
            transition: all 0.3s;
        }
        
        .cert-item:hover {
            border-color: #667eea;
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.3);
        }
        
        .cert-item.EXPIRED { border-left: 5px solid #ef4444; }
        .cert-item.CRITICAL { border-left: 5px solid #f59e0b; }
        .cert-item.WARNING { border-left: 5px solid #fbbf24; }
        .cert-item.HEALTHY { border-left: 5px solid #10b981; }
        .cert-item.DISCOVERED { border-left: 5px solid #667eea; }
        
        .cert-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        
        .cert-subject {
            font-weight: bold;
            font-size: 1.2em;
            color: #333;
        }
        
        .cert-status {
            padding: 5px 15px;
            border-radius: 20px;
            font-weight: bold;
            font-size: 0.9em;
        }
        
        .status-EXPIRED { background: #fee2e2; color: #ef4444; }
        .status-CRITICAL { background: #fef3c7; color: #f59e0b; }
        .status-WARNING { background: #fef9c3; color: #ca8a04; }
        .status-HEALTHY { background: #d1fae5; color: #10b981; }
        .status-DISCOVERED { background: #dbeafe; color: #667eea; }
        
        .cert-details {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }
        
        .detail-item {
            padding: 10px;
            background: #f9fafb;
            border-radius: 5px;
        }
        
        .detail-label {
            font-weight: bold;
            color: #666;
            font-size: 0.9em;
        }
        
        .detail-value {
            color: #333;
            margin-top: 5px;
        }
        
        .actions {
            margin-top: 30px;
            text-align: center;
        }
        
        .btn {
            padding: 12px 30px;
            border: none;
            border-radius: 25px;
            font-size: 1em;
            cursor: pointer;
            margin: 5px;
            transition: all 0.3s;
        }
        
        .btn-primary {
            background: #667eea;
            color: white;
        }
        
        .btn-primary:hover {
            background: #764ba2;
            transform: translateY(-2px);
        }
        
        .btn-secondary {
            background: #e5e7eb;
            color: #333;
        }
        
        .btn-secondary:hover {
            background: #d1d5db;
        }
        
        .footer {
            margin-top: 30px;
            text-align: center;
            color: white;
            font-size: 0.9em;
        }
        
        .scan-time {
            background: white;
            padding: 15px;
            border-radius: 10px;
            margin-bottom: 20px;
            text-align: center;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔐 DoxieGuard Alpha Scanner</h1>
            <p>Sistema de Auto-Discovery de Certificados SSL/TLS</p>
        </div>
        
        <div class="stats">
            <div class="stat-card total">
                <h3>$($Certificates.Count)</h3>
                <p>Total Certificados</p>
            </div>
            <div class="stat-card healthy">
                <h3>$($Certificates.Where({$_.Status -eq 'HEALTHY'}).Count)</h3>
                <p>✅ Saludables</p>
            </div>
            <div class="stat-card warning">
                <h3>$($Certificates.Where({$_.Status -eq 'WARNING'}).Count)</h3>
                <p>⚠️ Por Expirar</p>
            </div>
            <div class="stat-card critical">
                <h3>$($Certificates.Where({$_.Status -eq 'CRITICAL' -or $_.Status -eq 'EXPIRED'}).Count)</h3>
                <p>❌ Críticos</p>
            </div>
        </div>
        
        <div class="certificates">
            <h2>📋 Certificados Descubiertos</h2>
            <div class="scan-time">
                <strong>Fecha de Escaneo:</strong> $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
            </div>
"@
    
    # Add certificate items
    foreach ($cert in $Certificates) {
        $html += @"
            <div class="cert-item $($cert.Status)">
                <div class="cert-header">
                    <div class="cert-subject">$($cert.Subject)</div>
                    <div class="cert-status status-$($cert.Status)">$($cert.Status)</div>
                </div>
                <div class="cert-details">
                    <div class="detail-item">
                        <div class="detail-label">📤 Emisor</div>
                        <div class="detail-value">$($cert.Issuer)</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">🔑 Huella Digital</div>
                        <div class="detail-value" style="font-family: monospace; font-size: 0.85em;">$($cert.Thumbprint)</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">📅 Válido Desde</div>
                        <div class="detail-value">$($cert.NotBefore.ToString('yyyy-MM-dd'))</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">📅 Válido Hasta</div>
                        <div class="detail-value">$($cert.NotAfter.ToString('yyyy-MM-dd'))</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">⏱️ Días Restantes</div>
                        <div class="detail-value">$($cert.DaysToExpiry) días</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">💻 Fuente</div>
                        <div class="detail-value">$($cert.Source)</div>
                    </div>
                </div>
            </div>
"@
    }
    
    $html += @"
            <div class="actions">
                <button class="btn btn-primary" onclick="downloadReport()">📥 Descargar Reporte</button>
                <button class="btn btn-secondary" onclick="sendToDoxieGuard()">📤 Enviar a DoxieGuard</button>
                <button class="btn btn-secondary" onclick="refreshScan()">🔄 Nuevo Escaneo</button>
            </div>
        </div>
        
        <div class="footer">
            <p>🔐 DoxieGuard Alpha Client v1.0.0 | Generado automáticamente</p>
            <p>Powered by DoxieGuard - Smart Certificate Management</p>
        </div>
    </div>
    
    <script>
        function downloadReport() {
            window.location.href = '/report';
        }
        
        function sendToDoxieGuard() {
            alert('Enviando reporte a DoxieGuard Dashboard...');
            fetch('/api/report', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    timestamp: new Date().toISOString(),
                    hostname: window.location.hostname,
                    certificates: $($Certificates | ConvertTo-Json -Compress)
                })
            }).then(response => {
                if (response.ok) {
                    alert('✅ Reporte enviado exitosamente a DoxieGuard');
                } else {
                    alert('❌ Error enviando reporte');
                }
            });
        }
        
        function refreshScan() {
            window.location.reload();
        }
        
        // Auto-refresh every 5 minutes
        setTimeout(() => {
            if (confirm('¿Desea realizar un nuevo escaneo?')) {
                window.location.reload();
            }
        }, 300000);
    </script>
</body>
</html>
"@
    
    return $html
}

# Simple HTTP Server for Dashboard
function Start-SimpleHTTPServer {
    param([int]$Port = 3000)
    
    Write-Log "Iniciando servidor HTTP en puerto $Port..."
    
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://localhost:$Port/")
    $listener.Start()
    
    Write-DoxieSuccess "Servidor HTTP iniciado en http://localhost:$Port"
    Write-Log "Dashboard disponible en http://localhost:$Port" "SERVER"
    
    $global:Certificates = @()  # Store certificates globally
    
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        try {
            switch ($request.Url.AbsolutePath) {
                "/" {
                    $html = Generate-HTMLDashboard -Certificates $global:Certificates -Timestamp $timestamp
                    $buffer = [System.Text.Encoding]::UTF8.GetBytes($html)
                }
                "/report" {
                    $reportContent = $global:Certificates | ConvertTo-Json -Depth 10
                    $buffer = [System.Text.Encoding]::UTF8.GetBytes($reportContent)
                    $response.ContentType = "application/json"
                    $response.Headers.Add("Content-Disposition", "attachment; filename=doxie-report-$timestamp.json")
                }
                "/api/report" {
                    if ($request.HttpMethod -eq "POST") {
                        $reader = New-Object System.IO.StreamReader($request.InputStream)
                        $body = $reader.ReadToEnd()
                        Write-Log "Reporte recibido: $body" "API"
                        
                        $buffer = [System.Text.Encoding]::UTF8.GetBytes('{"status":"success","message":"Reporte enviado"}')
                        $response.ContentType = "application/json"
                    }
                }
                default {
                    $buffer = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
                    $response.StatusCode = 404
                }
            }
            
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
        } catch {
            Write-Log "Error manejando request: $_" "ERROR"
        } finally {
            $response.Close()
        }
    }
}

# Main execution
Write-DoxieHeader "DoxieGuard Alpha Client - Certificate Scanner v1.0.0"

Write-Log "========================================" "START"
Write-Log "Iniciando escaneo de certificados..." "START"
Write-Log "Timestamp: $timestamp" "START"
Write-Log "Directorio de salida: $OutputDir" "START"
Write-Log "========================================" "START"

# Discover certificates
$allCertificates = @()

Write-DoxieHeader "Fase 1: Windows Certificate Store"
$windowsCerts = Get-WindowsCertificateStore
$allCertificates += $windowsCerts

Write-DoxieHeader "Fase 2: Rutas Comunes"
$commonCerts = Get-CommonPathsDiscovery
$allCertificates += $commonCerts

Write-DoxieHeader "Fase 3: Docker Certificates"
$dockerCerts = Get-DockerCertificates
$allCertificates += $dockerCerts

Write-DoxieHeader "Fase 4: Servidores Web"
$webCerts = Get-WebServerCertificates
$allCertificates += $webCerts

# Save certificates to JSON
$allCertificates | ConvertTo-Json -Depth 10 | Set-Content -Path $certJsonFile -Encoding UTF8
Write-Log "Certificados guardados en: $certJsonFile" "SAVE"

# Generate summary log
$scanDate = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$hostname = $env:COMPUTERNAME
$username = $env:USERNAME
$totalCerts = $allCertificates.Count

$healthyCount = ($allCertificates | Where-Object { $_.Status -eq 'HEALTHY' }).Count
$warningCount = ($allCertificates | Where-Object { $_.Status -eq 'WARNING' }).Count
$criticalCount = ($allCertificates | Where-Object { $_.Status -eq 'CRITICAL' }).Count
$expiredCount = ($allCertificates | Where-Object { $_.Status -eq 'EXPIRED' }).Count
$discoveredCount = ($allCertificates | Where-Object { $_.Status -eq 'DISCOVERED' }).Count

$windowsStoreCount = ($allCertificates | Where-Object { $_.Source -eq 'Windows Certificate Store' }).Count
$commonPathsCount = ($allCertificates | Where-Object { $_.Source -eq 'Common Paths' }).Count
$dockerCount = ($allCertificates | Where-Object { $_.Source -eq 'Docker' }).Count
$iisCount = ($allCertificates | Where-Object { $_.Source -eq 'IIS' }).Count

$criticalCerts = $allCertificates | Where-Object { $_.DaysToExpiry -lt 30 }
$criticalDetails = ""
foreach ($cert in $criticalCerts) {
    $criticalDetails += "- $($cert.Subject) - $($cert.DaysToExpiry) días`n"
}

$summary = @"
========================================
DOXIEGUARD ALPHA SCAN SUMMARY
========================================
Scan Date: $scanDate
Hostname: $hostname
User: $username

TOTAL CERTIFICATES FOUND: $totalCerts

BY STATUS:
- HEALTHY: $healthyCount
- WARNING: $warningCount
- CRITICAL: $criticalCount
- EXPIRED: $expiredCount
- DISCOVERED: $discoveredCount

BY SOURCE:
- Windows Certificate Store: $windowsStoreCount
- Common Paths: $commonPathsCount
- Docker: $dockerCount
- IIS: $iisCount

CRITICAL CERTIFICATES (expiring within 30 days):
$criticalDetails
========================================
"@

Add-Content -Path $logFile -Value $summary -Encoding UTF8

Write-DoxieHeader "RESUMEN DE ESCANEO"
Write-Host $summary -ForegroundColor White

# Start HTTP Server with certificates
$global:Certificates = $allCertificates
Start-SimpleHTTPServer -Port ([int]$Port)

Write-DoxieWarning "Presiona Ctrl+C para detener el servidor"
