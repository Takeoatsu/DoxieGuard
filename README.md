# 🐾 DoxieGuard - Smart Certificate Management

> Automated SSL/TLS certificate discovery, monitoring, and renewal for modern infrastructure.

![DoxieGuard Logo](frontend/public/logo-doxie.png)

## 🎯 Overview

DoxieGuard is an autonomous, multi-environment, and multi-provider platform designed to:

- 🔍 **Auto-Discover** certificates automatically
- 📊 **Inventory** and centralize all certificates
- 🚨 **Monitor** their health status
- 🔄 **Renew** and rotate certificates automatically
- 🔒 **Audit** security compliance
- 📧 **Notify** critical events

**Goal:** *"Set it and forget it"* — zero human intervention required.

## ✨ Features

### Core Capabilities
- **Auto-Discovery Engine**: Linux (Nginx, Apache), Windows Server (IIS), Kubernetes, Docker, Load Balancers
- **Multi-Cloud Support**: AWS (ACM, ELB, CloudFront), Azure (Key Vault, App Services), GCP (Certificate Manager)
- **Enterprise Ready**: ADCS, OpenVPN, IPsec, F5, Fortinet
- **ACME Protocol**: Let's Encrypt integration with automatic renewal

### Notifications
- 📧 **Email** (Resend, SMTP)
- 💬 **Slack** & **Microsoft Teams**
- 🔗 **Webhooks** for custom integrations
- 📱 **Telegram** alerts

### Dashboard
- 📊 Real-time certificate health monitoring
- ⏰ Expiration tracking and alerts (90, 30, 15, 7, 1 days)
- 📈 Analytics and reporting
- 🌍 Multi-tenant support

## 🚀 Quick Start

### 1. Download Alpha Client
```powershell
# Download from our website or build from source
.\agent\doxie-agent.exe
```

### 2. Run Discovery
```powershell
# The agent automatically discovers certificates
.\doxie-alpha-client.ps1
```

### 3. View Dashboard
```
Open http://localhost:3000
```

## 📦 Installation

### Backend
```bash
cd Backend
npm install
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Database
```bash
# Using Docker Compose
cd infra
docker-compose up -d
```

## 🏗️ Architecture

```
┌─────────────┐
│   DoxieGuard Agent    │
│   (Go/PowerShell)     │
└─────────────┘
         │
         ▼
┌─────────────┐
│   Backend API           │
│   (Node.js/Express)    │
│   - REST endpoints      │
│   - Webhook handler     │
│   - Job scheduler       │
└─────────────┘
         │
         ▼
┌─────────────┐
│   PostgreSQL          │
│   Certificate Store    │
│   User Management     │
└─────────────┘
         │
         ▼
┌─────────────┐
│   Frontend             │
│   (Next.js)            │
│   - Dashboard          │
│   - Analytics          │
│   - Settings           │
└─────────────┘
```

## 🔧 Configuration

### Environment Variables

```env
# Backend
DATABASE_URL=postgresql://user:pass@localhost:5432/doxiedb
RESEND_API_KEY=re_your_api_key
ADMIN_EMAIL=admin@example.com
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
TELEGRAM_BOT_TOKEN=your_token

# Cloud Providers (optional)
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AZURE_CLIENT_ID=your_client_id
GCP_PROJECT_ID=your_project
```

## 📚 Documentation

- [Service Requirements](Service%20requirements.md)
- [Alpha Testing Guide](ALPHA_TESTING.md)
- [Notifications Setup](Backend/NOTIFICATIONS_SETUP.md)
- [Landing Page Deployment](LANDING_PAGE_DEPLOYMENT.md)

## 🧪 Alpha Program

We're currently in Alpha testing! Join us:

1. Download the Alpha Client
2. Run on your infrastructure
3. Send us reports automatically
4. Get free lifetime access

**Current Alpha Features:**
- ✅ Auto-discovery
- ✅ Basic monitoring
- ✅ Email notifications
- 🔄 Advanced analytics (coming soon)

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines first.

## 📄 License

MIT License - see LICENSE file for details.

## 🐾 About DoxieGuard

Built with ❤️ for DevOps teams who are tired of certificate expiration nightmares.

**Made with love in Colombia 🇨🇴**

---

⭐ Star us on GitHub if this project helped you!

📧 Contact: support@doxieguard.com  
🌐 Website: https://doxieguard.com
