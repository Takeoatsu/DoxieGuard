# 🚀 DoxieGuard Alpha - Quick Start Guide

## Para Clientes Alpha

### Opción 1: Ejecutable Portable (Recomendado)
1. **Recibe** el archivo `doxie-alpha-client.exe`
2. **Ejecuta** haciendo doble clic
3. **Listo** - Se abrirá automáticamente en tu navegador

### Opción 2: Script PowerShell
1. **Recibe** `doxie-alpha-client.ps1`
2. **Abre** PowerShell como Administrador
3. **Ejecuta**:
   ```powershell
   .\doxie-alpha-client.ps1
   ```

## 📊 Lo que verás

### Dashboard en http://localhost:3000
- **Total de certificados** encontrados
- **Estado de salud** de cada certificado
- **Detalles** de cada certificado:
  - Emisor
  - Fecha de expiración
  - Días restantes
  - Fuente (Windows Store, Docker, etc.)

### Archivos generados automáticamente
- 📄 `.\doxie-logs\doxie-report-{timestamp}.log` - Reporte detallado
- 📋 `.\doxie-logs\certificates-{timestamp}.json` - Datos en JSON

## 🔍 Qué descubre automáticamente

- ✅ Windows Certificate Store (My, Root, CA, TrustedPeople)
- ✅ IIS SSL Bindings
- ✅ Docker certificates
- ✅ VMware certificates  
- ✅ OpenVPN configurations
- ✅ Common certificate paths
- ✅ Nginx, Apache, XAMPP certificates

## 🎨 Estados de certificados

- 🟢 **HEALTHY**: Más de 90 días de validez
- 🟡 **WARNING**: 30-90 días restantes
- 🔴 **CRITICAL**: Menos de 30 días
- ⚫ **EXPIRED**: Ya expirado
- 🔵 **DISCOVERED**: Certificado encontrado sin validar

## 📤 Enviar reporte a DoxieGuard

En el dashboard:
1. Click **"📥 Descargar Reporte"** - Guarda JSON localmente
2. Click **"📤 Enviar a DoxieGuard"** - Envía automáticamente
3. Click **"🔄 Nuevo Escaneo"** - Actualiza datos

## 🔧 Opciones avanzadas

```powershell
# Especificar puerto diferente
.\doxie-alpha-client.ps1 -Port 8080

# Directorio de salida personalizado
.\doxie-alpha-client.ps1 -OutputDir "C:\Reports\DoxieGuard"

# Generar solo reporte sin dashboard
.\doxie-alpha-client.ps1 -GenerateReport

# Enviar reporte a backend específico
.\doxie-alpha-client.ps1 -BackendURL "http://your-server:5000"
```

## ⚠️ Requisitos

- **Windows 10/11** o **Windows Server 2016+**
- **PowerShell 5.0+** (incluido en Windows 10+)
- **Conexión a internet** (para enviar reportes)

## 🆘 Solución de problemas

### "No se puede ejecutar"
```powershell
# Desbloquear script
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### "Puerto en uso"
```powershell
# Usar puerto diferente
.\doxie-alpha-client.ps1 -Port 8080
```

### "IIS module not found"
- Normal si IIS no está instalado
- Otros certificados seguirán siendo descubiertos

## 📞 Reportar problemas

Si encuentras errores:
1. Revisa `.\doxie-logs\` para archivos de log
2. Contacta al equipo DoxieGuard con:
   - Contenido del archivo `.log`
   - Captura de pantalla del dashboard
   - Versión de Windows (`winver`)

## 🔒 Privacidad

- **Local Only**: Todos los datos se procesan en tu máquina
- **Solo envío manual**: No enviamos datos sin tu consentimiento
- **Sin instalación**: No requiere permisos de administrador (excepto algunos stores)

---

**DoxieGuard Alpha** - Smart Certificate Management v1.0.0
*Helping you keep your certificates healthy* 🌟
