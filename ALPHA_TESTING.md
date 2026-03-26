# 🐾 DoxieGuard Alpha Testing Guide

## 🚀 Quick Start - "Set It and Forget It"

### Prerequisites
- Windows Server 2019+ or Windows 10/11 Pro
- PowerShell 5.1+
- Go 1.21+ (for building agent)
- Node.js 18+ (for backend)
- Docker Desktop OR PostgreSQL 14+ (for database)

### Installation Steps

#### 1. Setup Database (Choose One Method)

**Option A: Using Docker (Recommended - Easiest)**
```powershell
# Use the automatic setup script
.\scripts\setup-database.ps1 -UseDocker
```

**Option B: Using Existing PostgreSQL Installation**
```powershell
# If PostgreSQL is already installed but psql is not in PATH:
.\scripts\setup-database.ps1 -UseExistingPostgres
```

**Option C: Using Docker Compose Directly**
```powershell
cd infra
docker-compose up -d
# Connection: postgresql://doxieroot:doxiepassword123@localhost:5432/doxiedb
```

**Option D: Manual PostgreSQL Setup (if psql is in PATH)**
```powershell
# Only if psql.exe is accessible from PATH
psql -U postgres -c "CREATE DATABASE doxieguard;"
psql -U postgres -c "CREATE USER doxieguard WITH PASSWORD 'your_password';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE doxieguard TO doxieguard;"
```

#### 2. Install Backend
```powershell
cd Backend
npm install
npx prisma migrate deploy
npm run dev
```

#### 3. Install Agent (Windows) - Run as Administrator
```powershell
cd agent
.\install-alpha.ps1 -BackendURL "http://localhost:3001" -AutoStart
```

#### 4. Access Dashboard
Open browser: http://localhost:3000

---

## 🎯 Features Available for Alpha Testing

### ✅ Completed Features

#### Auto-Discovery Engine
- **Linux**: Nginx, Apache certificates
- **Windows**: IIS, Certificate Store, ADCS
- **Kubernetes**: Secrets, Ingress certificates
- **Docker**: Container certificates, Docker Compose
- **Load Balancers**: HAProxy, F5 BIG-IP

#### Cloud Providers
- **AWS**: ACM, ELB, CloudFront
- **Azure**: Key Vault, App Services
- **GCP**: Certificate Manager, Load Balancers

#### Enterprise
- **Exchange**: Microsoft Exchange Server certificates
- **VPNs**: OpenVPN, IPsec certificates
- **ADCS**: Active Directory Certificate Services

#### Certificate Management
- **ACME**: Let's Encrypt integration
- **Wildcards**: *.domain.com support
- **Multi-domain**: Multiple domains and subdomains
- **DNS**: Cloudflare, Route53 integration

### ⏳ Features In Development
- Auto-renewal engine
- Advanced monitoring alerts
- Certificate chain validation
- Fortinet appliances

---

## 📊 Alpha Test Scenarios

### Scenario 1: Basic Auto-Discovery
1. Start DoxieGuard agent
2. Wait for auto-discovery cycle (every hour)
3. View discovered certificates in dashboard
4. Check certificate expiration dates

**Expected Results:**
- All system certificates discovered
- Certificate inventory populated
- Expiration alerts generated

### Scenario 2: Cloud Provider Integration
1. Configure AWS/Azure/GCP credentials in agent.config
2. Restart agent service
3. Run manual discovery: `doxie-agent.exe --discover`
4. Verify cloud certificates appear in dashboard

**Expected Results:**
- Cloud provider APIs accessed
- Certificates imported
- Cloud metadata displayed

### Scenario 3: Enterprise Certificates
1. Install on Windows Server with ADCS
2. Configure ADCS discovery
3. Verify ADCS templates discovered
4. Test certificate request workflow

**Expected Results:**
- ADCS CA detected
- Templates discovered
- Certificate enrollment working

### Scenario 4: VPN Certificates
1. Configure OpenVPN/IPsec discovery
2. Verify VPN certificates detected
3. Test certificate validation
4. Check expiration monitoring

**Expected Results:**
- VPN certificates found
- Validation status accurate
- Alerts for expiring certs

---

## 🔧 Troubleshooting

### PostgreSQL Connection Issues

**Problem: psql not recognized**
```powershell
# Solution 1: Use Docker
.\scripts\setup-database.ps1 -UseDocker

# Solution 2: Add PostgreSQL to PATH
$env:Path += ";C:\Program Files\PostgreSQL\15\bin"
refreshenv  # or restart terminal

# Solution 3: Use full path
& "C:\Program Files\PostgreSQL\15\bin\psql.exe" -U postgres -c "CREATE DATABASE doxieguard;"
```

**Problem: Docker not available**
```powershell
# Check if Docker is running
docker --version

# If not installed, download from:
# https://www.docker.com/products/docker-desktop/

# Alternative: Install PostgreSQL directly
# https://www.postgresql.org/download/windows/
```

**Problem: Database connection refused**
```powershell
# Check if PostgreSQL is running
# For Docker:
docker ps
docker logs doxie_db

# For local PostgreSQL:
Get-Service -Name postgresql*
```

### Agent Won't Start
```powershell
# Check service status
Get-Service -Name DoxieGuard

# View logs
Get-Content C:\path\to\agent\logs\*.log -Tail 50

# Check configuration
Get-Content C:\path\to\agent\agent.config
```

### Backend Connection Issues
```powershell
# Test backend connectivity
Invoke-WebRequest -Uri http://localhost:3001/api/health

# Check backend logs
cd Backend
npm run dev
```

### Database Connection
```powershell
# Test database connection
# For Docker:
docker exec doxie_db psql -U doxieroot -d doxiedb -c "SELECT 1;"

# For local PostgreSQL:
psql -U doxieguard -d doxieguard -c "SELECT 1;"

# Check migrations
cd Backend
npx prisma migrate status
```

---

## 📈 Monitoring Alpha Testing

### Metrics to Track
- Number of certificates discovered
- Time for auto-discovery cycle
- Certificate expiration distribution
- Alert generation rate
- Agent memory/CPU usage

### Success Criteria
- ✅ 100% of system certificates discovered
- ✅ Certificate inventory accurate
- ✅ No false positives
- ✅ Stable operation (no crashes)
- ✅ Performance acceptable (<5% CPU usage)

---

## 🐛 Reporting Issues

### Log Collection
```powershell
# Gather diagnostic information
$report = @"
DoxieGuard Alpha Diagnostic Report
Date: $(Get-Date)
Agent Version: $(doxie-agent.exe --version)
Backend Version: $(curl http://localhost:3001/api/health 2>$null | ConvertFrom-Json).version
System: $env:COMPUTERNAME
OS: $env:OS
"@

# Export logs
Get-ChildItem C:\path\to\agent\logs | Compress-Archive -DestinationPath logs.zip

# Docker logs
docker logs doxie_db > doxie_db.log
```

### Issue Template
```markdown
## Issue Description
[Describe the problem]

## Environment
- OS:
- Agent Version:
- Backend Version:
- Database: [Docker/Local PostgreSQL]

## Steps to Reproduce
1. 
2. 
3. 

## Expected Behavior
[What should happen]

## Actual Behavior
[What actually happens]

## Logs
[Attach relevant logs]
```

---

## 📞 Support & Documentation

- **Documentation**: See Service requirements.md
- **Issues**: Create GitHub issue with logs
- **Features**: Propose in GitHub discussions

---

## 🎉 Alpha Testing Goals

By the end of alpha testing, we should have:
1. ✅ Fully functional auto-discovery
2. ✅ Stable agent operation
3. ✅ Accurate certificate inventory
4. ✅ Working cloud integrations
5. ✅ Reliable enterprise features
6. ✅ Performance validated

---

**Happy Testing! 🐾**

For questions: Check Service requirements.md for feature details
