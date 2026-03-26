# DoxieGuard Alpha Client - Distribution Packager
# Create a distributable ZIP package for clients

param(
    [string]$OutputZip = "DoxieGuard-Alpha-Client.zip",
    [string]$SourceDir = "."
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " DoxieGuard Alpha Client Packager" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Files to include
$files = @(
    "doxie-alpha-client.ps1",
    "doxie-alpha-client-launcher.bat", 
    "QUICK_START.md",
    "README.md"
)

# Create temp directory
$tempDir = ".\doxie-alpha-dist"
if (Test-Path $tempDir) {
    Remove-Item $tempDir -Recurse -Force
}
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

Write-Host "[INFO] Preparing distribution package..." -ForegroundColor Yellow

# Copy files
foreach ($file in $files) {
    if (Test-Path $file) {
        Copy-Item $file -Destination $tempDir
        Write-Host "[OK] Added: $file" -ForegroundColor Green
    } else {
        Write-Host "[WARNING] Missing: $file" -ForegroundColor Yellow
    }
}

# Create README for distribution
$readmeContent = @"
# DoxieGuard Alpha Client - Distribución

## Contenido del Package

Este ZIP contiene todo lo necesario para ejecutar DoxieGuard Alpha en sistemas cliente Windows.

## Archivos Incluidos

1. **doxie-alpha-client.ps1** - Script principal de auto-discovery
2. **doxie-alpha-client-launcher.bat** - Launcher para doble clic
3. **QUICK_START.md** - Guía rápida de uso
4. **README.md** - Documentación completa

## Instalación

### Opción 1: Launcher (Recomendado)
1. Extrae todos los archivos del ZIP
2. Ejecuta `doxie-alpha-client-launcher.bat`
3. Listo - se abrirá automáticamente

### Opción 2: PowerShell Directo
1. Extrae todos los archivos del ZIP
2. Abre PowerShell como Administrador
3. Ejecuta:
   ```powershell
   .\doxie-alpha-client.ps1
   ```

## Requisitos

- **Windows 10/11** o **Windows Server 2016+**
- **PowerShell 5.0+** (incluido en Windows 10+)
- **Conexión a internet** (opcional - solo para reportes)

## Características

✅ Auto-Discovery de certificados SSL/TLS  
✅ Dashboard visual en http://localhost:3000  
✅ Generación de reportes .log y .json  
✅ Detección de certificados expirados  
✅ Análisis de salud de certificados  

## Solución de Problemas

Si el script no se ejecuta:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

## Soporte

Para reportar problemas o comentarios:
- Revisa los archivos .log en la carpeta .\doxie-logs\
- Contacta al equipo DoxieGuard

---
**DoxieGuard Alpha v1.0.0** - Smart Certificate Management
"@

$readmeContent | Out-File -FilePath "$tempDir\DISTREADME.md" -Encoding UTF8

# Create ZIP
Write-Host "[INFO] Creating ZIP archive..." -ForegroundColor Yellow
Compress-Archive -Path "$tempDir\*" -DestinationPath $OutputZip -Force

if (Test-Path $OutputZip) {
    $zipInfo = Get-Item $OutputZip
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "[SUCCESS] Distribution package created!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Package: $OutputZip" -ForegroundColor White
    Write-Host "Size: $([math]::Round($zipInfo.Length / 1MB, 2)) MB" -ForegroundColor White
    Write-Host "Files included: $($files.Count)" -ForegroundColor White
    Write-Host ""
    Write-Host "[READY] Package is ready for distribution!" -ForegroundColor Cyan
    Write-Host "Share '$OutputZip' with your Alpha clients" -ForegroundColor Yellow
}

# Cleanup temp
Remove-Item $tempDir -Recurse -Force

Write-Host ""
Write-Host "[COMPLETE] Packaging finished" -ForegroundColor Cyan
