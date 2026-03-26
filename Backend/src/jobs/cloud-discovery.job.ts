/**
 * Cloud Discovery Job
 * Cron job para descubrimiento automático de certificados cloud
 */

import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { AWSService } from "../services/aws.service";
import { decryptCloudCredentials } from "../utils/encryption";

const prisma = new PrismaClient();

// Función simple para enviar alertas a Telegram
async function sendTelegramAlert(message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.log("⚠️ Telegram not configured");
    return;
  }

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
    });
  } catch (err) {
    console.error("❌ Telegram alert failed:", err);
  }
}

/**
 * Realiza discovery para un proveedor cloud específico
 */
async function discoverForProvider(providerId: string, providerType: string, credentials: string, regions: string[]) {
  try {
    console.log(`🔍 [Discovery] Starting for provider: ${providerId}`);

    // Desencriptar credenciales
    const decryptedCreds = decryptCloudCredentials(credentials);

    // Crear servicio cloud según el tipo
    let awsService: AWSService | null = null;

    if (providerType === "aws") {
      awsService = new AWSService(decryptedCreds);
    } else {
      console.log(`⚠️ Provider type ${providerType} not implemented yet`);
      return;
    }

    // Realizar discovery completo
    const discovery = await awsService.discoverAll(regions);

    // Procesar certificados ACM
    if (discovery.acm) {
      for (const cert of discovery.acm.certificates) {
        const daysUntilExpiration = Math.floor(
          (cert.notAfter.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        const status = daysUntilExpiration < 10 ? "EXPIRING" : "ACTIVE";

        await prisma.certificate.upsert({
          where: { domain: cert.domainName },
          update: {
            expiresAt: cert.notAfter,
            status,
            cloudProviderId: providerId,
            cloudResourceType: "acm",
            cloudResourceId: cert.certificateArn,
            cloudRegion: discovery.acm.region,
          },
          create: {
            domain: cert.domainName,
            expiresAt: cert.notAfter,
            status,
            cloudProviderId: providerId,
            cloudResourceType: "acm",
            cloudResourceId: cert.certificateArn,
            cloudRegion: discovery.acm.region,
          },
        });

        console.log(`  ✅ [ACM] ${cert.domainName} - Expires: ${cert.notAfter.toLocaleDateString()}`);
      }
    }

    // Procesar certificados ELB
    if (discovery.elb) {
      for (const cert of discovery.elb.certificates) {
        // Los ELB usan certificados de ACM, así que el dominio puede estar en ACM
        // Pero podemos crear una entrada separada si es necesario
        await prisma.certificate.upsert({
          where: { domain: cert.domainName || `elb-${cert.loadBalancerName}` },
          update: {
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // AWS usa ACM, así que la expiración real está en ACM
            cloudProviderId: providerId,
            cloudResourceType: "elb",
            cloudResourceId: cert.certificateArn,
            cloudRegion: discovery.elb.region,
          },
          create: {
            domain: cert.domainName || `elb-${cert.loadBalancerName}`,
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            status: "ACTIVE",
            cloudProviderId: providerId,
            cloudResourceType: "elb",
            cloudResourceId: cert.certificateArn,
            cloudRegion: discovery.elb.region,
          },
        });

        console.log(`  ✅ [ELB] ${cert.loadBalancerName} - Cert: ${cert.certificateArn}`);
      }
    }

    // Procesar certificados CloudFront
    if (discovery.cloudfront) {
      for (const cert of discovery.cloudfront.certificates) {
        await prisma.certificate.upsert({
          where: { domain: cert.domainName },
          update: {
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // CloudFront usa ACM
            cloudProviderId: providerId,
            cloudResourceType: "cloudfront",
            cloudResourceId: cert.distributionId,
            cloudRegion: "global",
          },
          create: {
            domain: cert.domainName,
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            status: "ACTIVE",
            cloudProviderId: providerId,
            cloudResourceType: "cloudfront",
            cloudResourceId: cert.distributionId,
            cloudRegion: "global",
          },
        });

        console.log(`  ✅ [CloudFront] ${cert.domainName} - Dist: ${cert.distributionId}`);
      }
    }

    // Actualizar último sync
    await prisma.cloudProvider.update({
      where: { id: providerId },
      data: { lastSync: new Date() },
    });

    console.log(`✅ [Discovery] Completed for provider: ${providerId}`);

    // Enviar notificación si hay certificados próximos a expirar
    const expiringCerts = await prisma.certificate.findMany({
      where: {
        cloudProviderId: providerId,
        expiresAt: {
          lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 días
        },
      },
    });

    if (expiringCerts.length > 0) {
      const message = `⚠️ <b>Cloud Certificates Expiring Soon</b>\n\n` +
        `Provider: ${providerType}\n` +
        `Expiring certificates: ${expiringCerts.length}\n\n` +
        expiringCerts.map(cert => 
          `• ${cert.domain} - ${Math.floor((new Date(cert.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days`
        ).join("\n");
      
      await sendTelegramAlert(message);
    }

  } catch (error) {
    console.error(`❌ [Discovery] Error for provider ${providerId}:`, error);
  }
}

/**
 * Ejecuta discovery para todos los proveedores cloud activos
 */
async function runCloudDiscovery() {
  console.log("🔍 [Cloud Discovery Job] Starting...");

  try {
    const providers = await prisma.cloudProvider.findMany({
      where: { enabled: true },
    });

    console.log(`📦 Found ${providers.length} enabled cloud providers`);

    for (const provider of providers) {
      await discoverForProvider(
        provider.id,
        provider.provider,
        provider.credentials,
        provider.regions || ["us-east-1"]
      );
    }

    console.log("✅ [Cloud Discovery Job] Completed");
  } catch (error) {
    console.error("❌ [Cloud Discovery Job] Error:", error);
  }
}

/**
 * Inicia el cron job de discovery
 */
export function startCloudDiscoveryJob() {
  console.log("🚀 Starting Cloud Discovery Job");

  // Ejecutar cada 6 horas
  cron.schedule("0 */6 * * *", async () => {
    await runCloudDiscovery();
  });

  // También ejecutar inmediatamente al iniciar
  runCloudDiscovery();
}

/**
 * Ejecuta discovery manualmente para un proveedor específico
 */
export async function triggerManualDiscovery(providerId: string) {
  const provider = await prisma.cloudProvider.findUnique({
    where: { id: providerId },
  });

  if (!provider) {
    throw new Error("Provider not found");
  }

  await discoverForProvider(
    provider.id,
    provider.provider,
    provider.credentials,
    provider.regions || ["us-east-1"]
  );
}
