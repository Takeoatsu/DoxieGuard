# 🌐 Estrategia de Implementación Cloud - DoxieGuard

**Fecha:** 25 de Marzo, 2026  
**Objetivo:** Implementar Auto-Discovery y gestión de certificados en AWS, Azure y GCP

---

## 📋 Requerimientos Cloud

Según [`Service requirements.md`](Service requirements.md):

### AWS
- ACM (AWS Certificate Manager)
- ELB (Elastic Load Balancer)
- CloudFront
- Route53

### Azure
- Key Vault
- App Services
- Application Gateway

### GCP
- Certificate Manager
- Load Balancers
- Cloud CDN

---

## 🏗️ Arquitectura Propuesta

### Diferencia Clave: Backend vs Agente

**Infraestructura Local (Actual):**
- ✅ Agente instalado en el servidor
- ✅ Acceso directo al sistema de archivos
- ✅ Ejecución de comandos locales

**Cloud (Nuevo Enfoque):**
- 🆕 **Backend hace las llamadas API**
- 🆕 Credenciales almacenadas en el backend
- 🆕 No requiere agente en la nube
- 🆕 Polling periódico desde el backend

---

## 🔧 Implementación Recomendada

### Opción 1: Backend con Servicios Cloud (RECOMENDADO)

**Ventajas:**
- ✅ Centralizado en el backend
- ✅ No requiere agentes adicionales
- ✅ Más seguro (credenciales en un solo lugar)
- ✅ Más fácil de mantener

**Arquitectura:**
```
Backend (Node.js/TypeScript)
├── services/
│   ├── aws.service.ts       (AWS SDK)
│   ├── azure.service.ts     (Azure SDK)
│   ├── gcp.service.ts       (GCP SDK)
│   └── cloud-discovery.service.ts
├── jobs/
│   └── cloud-discovery.job.ts (Cron job)
└── routes/
    └── cloud-config.routes.ts
```

**Flujo:**
1. Usuario configura credenciales cloud en el backend
2. Backend ejecuta discovery periódicamente (cron job)
3. Backend llama APIs de AWS/Azure/GCP
4. Backend almacena certificados descubiertos en DB
5. Backend notifica sobre expiraciones
6. Backend renueva certificados automáticamente

---

### Opción 2: Agente Cloud Híbrido

**Ventajas:**
- ✅ Consistente con arquitectura actual
- ✅ Puede ejecutarse en instancias cloud

**Desventajas:**
- ❌ Requiere instancia corriendo 24/7
- ❌ Costos adicionales de infraestructura
- ❌ Más complejo de mantener

---

## 📦 Implementación por Proveedor

### 1. AWS (Amazon Web Services)

#### SDKs Necesarios
```bash
npm install @aws-sdk/client-acm
npm install @aws-sdk/client-elbv2
npm install @aws-sdk/client-cloudfront
npm install @aws-sdk/client-route53
```

#### Servicios a Implementar

**AWS Certificate Manager (ACM)**
```typescript
// services/aws-acm.service.ts
import { ACMClient, ListCertificatesCommand, DescribeCertificateCommand } from "@aws-sdk/client-acm";

export class AWSACMService {
  async discoverCertificates(region: string, credentials: AWSCredentials) {
    const client = new ACMClient({ region, credentials });
    const command = new ListCertificatesCommand({});
    const response = await client.send(command);
    
    // Para cada certificado, obtener detalles
    for (const cert of response.CertificateSummaryList) {
      const details = await client.send(
        new DescribeCertificateCommand({ CertificateArn: cert.CertificateArn })
      );
      // Procesar y almacenar
    }
  }
}
```

**Elastic Load Balancer (ELB)**
```typescript
// services/aws-elb.service.ts
import { ElasticLoadBalancingV2Client, DescribeLoadBalancersCommand, DescribeListenersCommand } from "@aws-sdk/client-elbv2";

export class AWSELBService {
  async discoverCertificates(region: string, credentials: AWSCredentials) {
    const client = new ElasticLoadBalancingV2Client({ region, credentials });
    
    // Listar load balancers
    const lbs = await client.send(new DescribeLoadBalancersCommand({}));
    
    // Para cada LB, obtener listeners con certificados
    for (const lb of lbs.LoadBalancers) {
      const listeners = await client.send(
        new DescribeListenersCommand({ LoadBalancerArn: lb.LoadBalancerArn })
      );
      // Extraer certificados de listeners HTTPS
    }
  }
}
```

**CloudFront**
```typescript
// services/aws-cloudfront.service.ts
import { CloudFrontClient, ListDistributionsCommand } from "@aws-sdk/client-cloudfront";

export class AWSCloudFrontService {
  async discoverCertificates(credentials: AWSCredentials) {
    const client = new CloudFrontClient({ credentials });
    const distributions = await client.send(new ListDistributionsCommand({}));
    
    // Extraer certificados de cada distribución
    for (const dist of distributions.DistributionList.Items) {
      if (dist.ViewerCertificate) {
        // Procesar certificado
      }
    }
  }
}
```

---

### 2. Azure (Microsoft Azure)

#### SDKs Necesarios
```bash
npm install @azure/identity
npm install @azure/keyvault-certificates
npm install @azure/arm-appservice
npm install @azure/arm-network
```

#### Servicios a Implementar

**Azure Key Vault**
```typescript
// services/azure-keyvault.service.ts
import { CertificateClient } from "@azure/keyvault-certificates";
import { DefaultAzureCredential } from "@azure/identity";

export class AzureKeyVaultService {
  async discoverCertificates(vaultUrl: string) {
    const credential = new DefaultAzureCredential();
    const client = new CertificateClient(vaultUrl, credential);
    
    // Listar certificados
    for await (const certProperties of client.listPropertiesOfCertificates()) {
      const cert = await client.getCertificate(certProperties.name);
      // Procesar certificado
    }
  }
}
```

**Azure App Services**
```typescript
// services/azure-appservice.service.ts
import { WebSiteManagementClient } from "@azure/arm-appservice";
import { DefaultAzureCredential } from "@azure/identity";

export class AzureAppServiceService {
  async discoverCertificates(subscriptionId: string) {
    const credential = new DefaultAzureCredential();
    const client = new WebSiteManagementClient(credential, subscriptionId);
    
    // Listar certificados
    for await (const cert of client.certificates.list()) {
      // Procesar certificado
    }
  }
}
```

---

### 3. GCP (Google Cloud Platform)

#### SDKs Necesarios
```bash
npm install @google-cloud/certificate-manager
npm install @google-cloud/compute
npm install @google-cloud/load-balancer
```

#### Servicios a Implementar

**GCP Certificate Manager**
```typescript
// services/gcp-certmanager.service.ts
import { CertificateManagerClient } from '@google-cloud/certificate-manager';

export class GCPCertManagerService {
  async discoverCertificates(projectId: string) {
    const client = new CertificateManagerClient();
    
    // Listar certificados
    const [certificates] = await client.listCertificates({
      parent: `projects/${projectId}/locations/global`,
    });
    
    for (const cert of certificates) {
      // Procesar certificado
    }
  }
}
```

---

## 🗄️ Modelo de Datos

### Tabla: CloudProviders
```prisma
model CloudProvider {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  provider      String   // "aws", "azure", "gcp"
  name          String   // Nombre descriptivo
  credentials   Json     // Credenciales encriptadas
  regions       String[] // Regiones a escanear
  enabled       Boolean  @default(true)
  lastSync      DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  certificates  Certificate[]
}
```

### Actualizar Tabla: Certificate
```prisma
model Certificate {
  id                String    @id @default(cuid())
  domain            String    @unique
  expiresAt         DateTime
  status            String
  assetId           String?
  asset             Asset?    @relation(fields: [assetId], references: [id])
  cloudProviderId   String?   // NUEVO
  cloudProvider     CloudProvider? @relation(fields: [cloudProviderId], references: [id])
  cloudResourceType String?   // "acm", "elb", "cloudfront", "keyvault", etc.
  cloudResourceId   String?   // ARN, Resource ID, etc.
  cloudRegion       String?   // Región del recurso
  certificate       String?
  privateKey        String?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
}
```

---

## 🔄 Cron Jobs

### Backend Job Scheduler
```typescript
// jobs/cloud-discovery.job.ts
import cron from 'node-cron';
import { discoverAWSCertificates } from '../services/aws.service';
import { discoverAzureCertificates } from '../services/azure.service';
import { discoverGCPCertificates } from '../services/gcp.service';

// Ejecutar cada 6 horas
cron.schedule('0 */6 * * *', async () => {
  console.log('🔍 Iniciando Cloud Discovery...');
  
  const providers = await prisma.cloudProvider.findMany({
    where: { enabled: true }
  });
  
  for (const provider of providers) {
    try {
      switch (provider.provider) {
        case 'aws':
          await discoverAWSCertificates(provider);
          break;
        case 'azure':
          await discoverAzureCertificates(provider);
          break;
        case 'gcp':
          await discoverGCPCertificates(provider);
          break;
      }
      
      await prisma.cloudProvider.update({
        where: { id: provider.id },
        data: { lastSync: new Date() }
      });
    } catch (error) {
      console.error(`Error en ${provider.provider}:`, error);
    }
  }
  
  console.log('✅ Cloud Discovery completado');
});
```

---

## 🔐 Seguridad

### Encriptación de Credenciales
```typescript
// utils/encryption.ts
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY!; // 32 bytes
const IV_LENGTH = 16;

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(text: string): string {
  const parts = text.split(':');
  const iv = Buffer.from(parts.shift()!, 'hex');
  const encryptedText = Buffer.from(parts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}
```

---

## 📝 Endpoints del Backend

### Configuración de Proveedores Cloud
```typescript
// POST /api/cloud-providers
app.post('/api/cloud-providers', async (req, res) => {
  const { provider, name, credentials, regions } = req.body;
  
  // Encriptar credenciales
  const encryptedCreds = encrypt(JSON.stringify(credentials));
  
  const cloudProvider = await prisma.cloudProvider.create({
    data: {
      userId: req.user.id,
      provider,
      name,
      credentials: encryptedCreds,
      regions,
    }
  });
  
  res.json(cloudProvider);
});

// GET /api/cloud-providers
app.get('/api/cloud-providers', async (req, res) => {
  const providers = await prisma.cloudProvider.findMany({
    where: { userId: req.user.id },
    select: {
      id: true,
      provider: true,
      name: true,
      regions: true,
      enabled: true,
      lastSync: true,
      // NO incluir credentials por seguridad
    }
  });
  
  res.json(providers);
});

// POST /api/cloud-providers/:id/sync
app.post('/api/cloud-providers/:id/sync', async (req, res) => {
  const { id } = req.params;
  
  // Ejecutar discovery inmediatamente
  await triggerCloudDiscovery(id);
  
  res.json({ message: 'Discovery iniciado' });
});
```

---

## 🎯 Plan de Implementación

### Fase 1: AWS (Prioridad Alta)
1. ✅ Crear servicios AWS (ACM, ELB, CloudFront)
2. ✅ Implementar discovery
3. ✅ Implementar renovación automática
4. ✅ Crear endpoints de configuración
5. ✅ Implementar cron job
6. ✅ Testing

### Fase 2: Azure (Prioridad Media)
1. ✅ Crear servicios Azure (Key Vault, App Services)
2. ✅ Implementar discovery
3. ✅ Implementar renovación automática
4. ✅ Testing

### Fase 3: GCP (Prioridad Media)
1. ✅ Crear servicios GCP (Certificate Manager)
2. ✅ Implementar discovery
3. ✅ Implementar renovación automática
4. ✅ Testing

---

## 💡 Recomendación Final

**Implementar en el Backend, NO en el Agente**

**Razones:**
1. ✅ Las APIs cloud son accesibles desde cualquier lugar
2. ✅ No requiere infraestructura adicional
3. ✅ Más seguro (credenciales centralizadas)
4. ✅ Más fácil de mantener y actualizar
5. ✅ Consistente con arquitectura serverless/cloud-native

**Próximo Paso:**
Comenzar con AWS ACM ya que es el servicio más común y tiene la mejor documentación.

---

**¿Deseas que comience con la implementación de AWS?**
