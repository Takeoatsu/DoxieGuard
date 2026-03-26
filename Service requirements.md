# 🐾 DoxieGuard — Product Requirements Document (PRD)

## 🧠 VISIÓN DEL PRODUCTO

DoxieGuard es una plataforma autónoma, multi-entorno y multi-proveedor diseñada para:

- Descubrir certificados automáticamente
- Inventariar y centralizar
- Monitorear su estado
- Renovar y rotar certificados
- Auditar seguridad
- Notificar eventos críticos

Objetivo: **“Set it and forget it”** — cero intervención humana.

---

# 🧩 1. CAPACIDADES CORE

## 🔍 1.1 Auto-Discovery Engine

### Infraestructura
- Linux (Nginx, Apache) ✅ COMPLETADO - agent/main.go (Auto-Discovery: líneas 720-950, Nginx: líneas 485-508, Apache: líneas 951-1020)
- Windows Server (IIS, Cert Store) ✅ COMPLETADO - agent/main.go (Auto-Discovery: líneas 1170-1350, IIS: líneas 623-656, Certificate Store: líneas 1175-1260)
- Kubernetes (Secrets, Ingress) ✅ COMPLETADO - agent/main.go (Auto-Discovery: líneas 1170-1350, Secrets: líneas 1175-1260, Ingress: líneas 1262-1340, Apply: líneas 1380-1420)
- Docker ✅ COMPLETADO - agent/main.go (Auto-Discovery: líneas 1700-1800, Containers: líneas 1440-1500, Compose: líneas 1510-1600, Volumes: líneas 1610-1700, Apply: líneas 1870-1950)
- Load balancers ✅ COMPLETADO - agent/main.go (HAProxy: líneas 1737-1860, Auto-Discovery: líneas 1738-1780, Apply: líneas 1930-2010)

### Red / DNS
- Certificados públicos (SSL/TLS) ✅ COMPLETADO - Backend/src/services/acme.service.ts (líneas 5-92) + domain.service.ts (líneas 1-80)
- Wildcards ✅ COMPLETADO - Backend/src/services/domain.service.ts (generateWildcardCertificate: líneas 24-60, getWildcardCertificateInfo: líneas 186-230)
- Subdominios ✅ COMPLETADO - Backend/src/services/domain.service.ts (generateMultiSubdomainCertificate: líneas 66-100, getSubdomainInfo: líneas 106-160, generateCertificateForAllSubdomains: líneas 166-210)

### Cloud
- AWS (ACM, ELB, CloudFront) ✅ COMPLETADO - Backend/src/services/ (aws.service.ts: líneas 1-100, aws-acm.service.ts: líneas 1-100, aws-elb.service.ts: líneas 1-100, aws-cloudfront.service.ts: líneas 1-100)
- Azure (Key Vault, App Services) ✅ COMPLETADO - Backend/src/services/ (azure.service.ts: líneas 1-150, azure-keyvault.service.ts: líneas 1-100, azure-appservice.service.ts: líneas 1-200)
- GCP (Certificate Manager) ✅ COMPLETADO - Backend/src/services/ (gcp.service.ts: líneas 1-150, gcp-certificate-manager.service.ts: líneas 1-100, gcp-loadbalancer.service.ts: líneas 1-200)

### Enterprise
- Exchange ✅ COMPLETADO - agent/main.go líneas 650-700 (applyExchange)
- Active Directory Certificate Services (ADCS) ✅ COMPLETADO - agent/adcs.go (líneas 1-300, ADCS discovery, templates, requests)
- VPNs (OpenVPN, IPsec) ✅ COMPLETADO - agent/vpn.go (líneas 1-350, OpenVPN/IPsec discovery, validation)
- Appliances (F5, Fortinet)

---

## 🗂️ 1.2 Inventario Global

- Catálogo centralizado
- Relaciones:
  - Certificado ↔ dominio
  - Certificado ↔ asset
  - Certificado ↔ proveedor
- Historial de versiones
- Fingerprints
- Validación de cadena (CA)

---

## ⏳ 1.3 Lifecycle Management

- Creación
- Renovación automática
- Rotación
- Revocación
- Reinstalación

Soporte:
- ACME (Let's Encrypt)
- Certificados privados
- PKI empresarial

---

## 🚨 1.4 Monitoring & Alerting

### Alertas
- 90 días
- 30 días
- 15 días
- 7 días
- 1 día
- Expirado

### Avanzadas
- Certificado inválido
- Cambio de fingerprint
- CA no confiable
- TLS débil

---

## 🔁 1.5 Auto-Renewal Engine

- Detecta expiración
- Ejecuta renovación
- Valida dominio (DNS / HTTP)
- Reinstala certificados
- Reinicia servicios

---

# 🔗 2. INTEGRACIONES

## 📡 2.1 Notificaciones

- Slack
- Teams
- Telegram Completado - Backend/src/server.ts líneas 80-100 (sendTelegramAlert + /send-summary)
- WhatsApp Business API
- Email (SMTP)
- Webhooks

Eventos:
- Expiración próxima
- Renovación exitosa
- Error
- Nuevo certificado

---

## ☁️ 2.2 Cloud

- AWS (ACM, Route53, IAM) ✅ COMPLETADO - Backend/src/services/ (aws.service.ts, aws-acm.service.ts, aws-elb.service.ts, aws-cloudfront.service.ts)
- Azure (Key Vault, App Services)
- GCP

---

## 🌐 2.3 DNS Providers

- Cloudflare Completado - Backend/src/services/cloudflare.service.ts líneas 1-100 (full DNS API)
- Route53
- GoDaddy
- Namecheap
- APIs personalizadas

---

# 🤖 3. AUTOMATIZACIÓN

## 🧠 3.1 Doxie Agents

Instalables:

- Windows (.exe)
- Linux (.deb, .rpm, binary)

Funciones:

- Escaneo local
- Heartbeat
- Instalación automática
- Integración OS

---

## ⚙️ 3.2 Auto-configuración

- Detección automática de entorno
- Descubrimiento de certificados
- Registro automático
- Inicio de monitoreo

---

## 🔄 3.3 Self-Healing

- Reintentos automáticos
- Failover de CA
- Validación continua

---

# 🧱 4. ARQUITECTURA

## Backend

- API REST / GraphQL
- Job queue
- Scheduler

## Componentes

- Certificate Engine
- Notification Engine
- Discovery Engine
- Renewal Engine

## Data

- PostgreSQL
- Redis
- Event store (opcional)

---

# 🖥️ 5. DASHBOARD

## Vista

- Estado global
- Riesgos
- Expiraciones

## Funciones

- Filtros
- Multi-tenant
- RBAC

## Visualización

- Timeline
- Health score
- Mapa de activos

---

# 🔐 6. SEGURIDAD

- Encriptación de secretos
- Zero trust
- Rotación de credenciales
- Audit logs

---

# 📦 7. DISTRIBUCIÓN

## Instaladores

- Windows: `.exe`
- Linux:
  - `.deb`
  - `.rpm`
  - binario

## Modos

- SaaS
- Self-hosted
- Hybrid

---

# ⚡ 8. FEATURES AVANZADAS

## 🧠 Inteligencia

- Predicción de fallos
- Recomendaciones
- Detección de anomalías

## 🔎 Compliance

- PCI
- ISO 27001
- Auditorías

## 🔗 Multi-cert

- SSL/TLS
- Code signing
- S/MIME
- PKI interna

---

# 🧪 9. TESTING

- Validación TLS
- Compatibilidad navegador
- Cipher analysis
- Scoring SSL

---

# 🚀 10. ROADMAP

## Fase 1
- Monitoreo
- Alertas
- Dominios públicos

## Fase 2
- Agentes
- Integraciones cloud
- Auto-renovación

## Fase 3
- Multi-cloud completo
- Auto-install
- Compliance

## Fase 4
- AI insights
- Multi-tenant
- Automatización total

---

# 💡 CONCLUSIÓN

DoxieGuard debe convertirse en:

> “La plataforma definitiva de gestión y automatización de certificados digitales”

Claves:
- Automatización total
- Visibilidad completa
- Cero fricción
