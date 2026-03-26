# 🔔 DoxieGuard - Notifications Setup Guide

## ✅ Sistema Completado

El sistema de notificaciones está funcionando y listo para recibir reportes de clientes Alpha.

### Estado Actual:
```json
{
  "email": {
    "resend": true,      // ✅ Configurado
    "smtp": false        // ⚠️ No configurado
  },
  "slack": {
    "configured": false   // ⚠️ No configurado
  },
  "teams": {
    "configured": false   // ⚠️ No configurado
  },
  "webhooks": {
    "count": 0,
    "registered": []
  }
}
```

---

## 📧 Configurar Email (Resend - Recomendado)

### 1. Obtener API Key de Resend
1. Ve a https://resend.com
2. Crea una cuenta (gratis para 开发)
3. Ve a API Keys
4. Crea una nueva API Key
5. Copia la clave

### 2. Configurar en Backend/.env
```env
RESEND_API_KEY=re_tu_api_key_aqui
ADMIN_EMAIL=tucorreo@example.com
EMAIL_FROM=DoxieGuard <noreply@doxieguard.com>
FRONTEND_URL=https://doxieguard.com
```

### 3. Verificar Configuración
```bash
curl -X GET http://localhost:5000/api/notifications/config
```

Debería mostrar:
```json
{
  "email": {
    "resend": true,  // ✅ Ahora true
    "smtp": false
  }
}
```

### 4. Probar Envío de Email
```bash
curl -X POST http://localhost:5000/api/notifications/email/test \
  -H "Content-Type: application/json" \
  -d '{
    "to": "tucorreo@example.com",
    "subject": "Test DoxieGuard",
    "message": "Este es un email de prueba"
  }'
```

---

## 🔗 Configurar Webhooks

### Registrar un Webhook
```bash
curl -X POST http://localhost:5000/api/notifications/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://tu-servidor.com/webhook",
    "events": ["certificate.expired", "alpha.report.received"],
    "secret": "tu_secret_opcional"
  }'
```

### Eventos Disponibles:
- `certificate.expired` - Certificado expirado
- `certificate.expiring` - Certificado por expirar
- `certificate.renewed` - Certificado renovado
- `certificate.created` - Nuevo certificado
- `certificate.deleted` - Certificado eliminado
- `alpha.report.received` - Reporte Alpha recibido
- `system.error` - Error del sistema
- `system.warning` - Warning del sistema

### Probar Webhook
```bash
curl -X POST http://localhost:5000/api/notifications/webhooks/test \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://webhook.site/tu-id-unico"
  }'
```

---

## 💬 Configurar Slack

### 1. Crear Slack App
1. Ve a https://api.slack.com/apps
2. Click "Create New App"
3. Selecciona "From scratch"
4. Nombre: DoxieGuard
5. Selecciona tu workspace

### 2. Configurar Incoming Webhook
1. En "Add features and functionality", click "Incoming Webhooks"
2. Toggle "Activate Incoming Webhooks" a ON
3. Click "Add New Webhook to Workspace"
4. Selecciona canal (#certificates)
5. Copia el Webhook URL

### 3. Configurar en Backend/.env
```env
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/TXXXXXX/BXXXXXX/XXXXXXXXXX
```

### 4. Probar Slack
```bash
curl -X POST http://localhost:5000/api/notifications/slack \
  -H "Content-Type: application/json" \
  -d '{
    "message": "🎉 DoxieGuard está funcionando!",
    "channel": "#certificates"
  }'
```

---

## 💼 Configurar Microsoft Teams

### 1. Crear Incoming Webhook
1. En tu canal de Teams, click "..." (más opciones)
2. Selecciona "Conectores"
3. Busca "Incoming Webhook"
4. Click "Configurar"
5. Nombre: DoxieGuard
6. Copia el Webhook URL

### 2. Configurar en Backend/.env
```env
TEAMS_WEBHOOK_URL=https://outlook.office.com/webhook/tu-webhook-url
```

### 3. Probar Teams
```bash
curl -X POST http://localhost:5000/api/notifications/teams \
  -H "Content-Type: application/json" \
  -d '{
    "title": "DoxieGuard Alert",
    "message": "Certificado próximo a expirar",
    "color": "#ff0000"
  }'
```

---

## 📊 Recibir Reportes de Clientes Alpha

### Endpoint para recibir reportes:
```
POST http://localhost:5000/api/notifications/alpha/reports
```

### Formato del reporte:
```json
{
  "timestamp": "2026-03-26T20:00:00Z",
  "hostname": "servidor-cliente",
  "username": "admin",
  "certificates": [
    {
      "Subject": "CN=ejemplo.com",
      "Issuer": "Let\"s Encrypt",
      "Thumbprint": "ABC123...",
      "NotBefore": "2026-01-01T00:00:00Z",
      "NotAfter": "2027-01-01T00:00:00Z",
      "DaysToExpiry": 281,
      "Status": "HEALTHY",
      "Source": "Windows Certificate Store",
      "Path": "Cert:\\LocalMachine\\My\\..."
    }
  ]
}
```

### Respuesta exitosa:
```json
{
  "success": true,
  "message": "Alpha report received and processed",
  "reportId": "report_1234567890"
}
```

---

## 🔐 Configurar Variables de Entorno

Agrega estas variables a tu `Backend/.env`:

```env
# Email (Resend)
RESEND_API_KEY=re_tu_api_key
ADMIN_EMAIL=admin@doxieguard.com
EMAIL_FROM=DoxieGuard <noreply@doxieguard.com>
FRONTEND_URL=https://doxieguard.com

# Slack
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# Microsoft Teams
TEAMS_WEBHOOK_URL=https://outlook.office.com/webhook/...

# SMTP (Alternativo)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tucorreo@gmail.com
SMTP_PASS=tu_app_password
```

---

## 🧪 Testing Checklist

Después de configurar, prueba cada servicio:

- [ ] Email funciona:
  ```bash
  curl -X POST http://localhost:5000/api/notifications/email/test
  ```

- [ ] Webhooks configurados:
  ```bash
  curl -X GET http://localhost:5000/api/notifications/config
  ```

- [ ] Slack prueba:
  ```bash
  curl -X POST http://localhost:5000/api/notifications/slack
  ```

- [ ] Teams prueba:
  ```bash
  curl -X POST http://localhost:5000/api/notifications/teams
  ```

- [ ] Alpha reports:
  ```bash
  curl -X POST http://localhost:5000/api/notifications/alpha/reports
  ```

---

## 📝 Ejemplo de Uso en Producción

### Monitoreo de Certificados
```bash
# Configurar webhook para recibir alertas
curl -X POST http://localhost:5000/api/notifications/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://tu-sistema.com/api/cert-alerts",
    "events": ["certificate.expired", "certificate.expiring"],
    "secret": "secure_token_123"
  }'
```

### Recibir Reportes Alpha
```bash
# Tu cliente Alpha envía reporte
curl -X POST http://localhost:5000/api/notifications/alpha/reports \
  -H "Content-Type: application/json" \
  -d @reporte-cliente.json

# Tú recibes:
# 1. Email de notificación
# 2. Webhook a tu sistema
# 3. Slack/Teams mensaje (si configurado)
```

---

## 🎯 Próximos Pasos

1. **Configurar Email** (más importante)
2. **Probar Alpha Reports** con cliente real
3. **Configurar Slack/Teams** para team
4. **Registrar Webhooks** para integraciones
5. **Deploy en producción**

---

## 📚 Recursos

- Resend API: https://resend.com/docs
- Slack Webhooks: https://api.slack.com/messaging/webhooks
- Teams Webhooks: https://docs.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook

---

**¿Preguntas?** Revisa los logs del backend para ver el estado de cada notificación.
