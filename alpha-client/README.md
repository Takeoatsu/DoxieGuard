# DoxieGuard Alpha Client - Portable Certificate Scanner

## Descripción
Ejecutable portable para clientes Alpha que realiza auto-discovery de certificados SSL/TLS en el sistema y genera reportes.

## Características
- 🔍 Auto-Discovery de certificados (Linux, Windows, Docker, K8s)
- 🌐 Frontend ligero en localhost:3000
- 📊 Dashboard visual con certificados encontrados
- 📝 Generación de archivo .log con reporte detallado
- 📤 Envío de reporte a DoxieGuard Dashboard

## Uso
```powershell
# Ejecutar el cliente
.\doxie-alpha-client.exe

# Ver reportes generados
Get-Content .\doxie-report-*.log
```

## Requisitos
- Windows 10/11 o Linux
- PowerShell 5.0+
- Conexión a internet (para reportes)

## Estructura de Salida
- Frontend: http://localhost:3000
- Logs: ./doxie-logs/doxie-report-{timestamp}.log
- Certificados: ./doxie-logs/certificates-{timestamp}.json
