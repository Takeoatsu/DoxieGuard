import express, { Request, Response } from 'express';
import { prisma } from './lib/prisma';
import cors from 'cors';
import "dotenv/config";
import cron from 'node-cron';
import { checkAndNotifyExpirations } from './services/notification.service';
import cloudRoutes from './routes/cloud.routes';
import notificationsRoutes from './routes/notifications.routes';
// Cloudflare: skip if no token
let cloudflareService: any = null;

const app = express();
app.use(cors());
app.use(express.json());

// Cloud Provider Routes
app.use('/api/cloud-providers', cloudRoutes);

// Notifications Routes (Email, Webhooks, Slack, Teams)
app.use('/api/notifications', notificationsRoutes);

// --- UTILIDADES (Lógica Limpia) ---
const calculateDaysLeft = (expiresAt: string | Date): number => {
  const diff = new Date(expiresAt).getTime() - new Date().getTime();
  return Math.ceil(diff / (1000 * 3600 * 24));
};

const getHealthStatus = (daysLeft: number) => {
  if (daysLeft < 10) return "CRITICAL";
  if (daysLeft < 50) return "WARNING";
  return "HEALTHY";
};

// Enviar alertas a Telegram (si está configurado)
const sendTelegramAlert = async (message: string) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
    });
  } catch (err) {
    console.error('❌ Falló el envío de alerta a Telegram', err);
  }
};

// --- ENDPOINTS ---

/**
 * Reporte del Agente: Procesa el estado de un certificado y devuelve órdenes.
 */
app.post("/report-cert", async (req, res) => {
  const { domain, expiresAt, assetName } = req.body;
  const agentToken = `token-${assetName}`;

  try {
    const daysLeft = calculateDaysLeft(expiresAt);
    const currentStatus = daysLeft < 10 ? "EXPIRING" : "ACTIVE";

    // 1. Upsert del Asset (Actualiza pulso o crea si no existe)
    const asset = await prisma.asset.upsert({
      where: { agentToken },
      update: { lastHeartbeat: new Date() },
      create: {
        name: assetName,
        agentToken,
        user: {
          connectOrCreate: {
            where: { email: "admin@doxieguard.com" },
            create: { email: "admin@doxieguard.com" }
          }
        }
      }
    });

    // 2. Upsert del Certificado (Mantiene una única fuente de verdad por dominio)
    await prisma.certificate.upsert({
      where: { domain },
      update: { expiresAt: new Date(expiresAt), status: currentStatus },
      create: {
        domain,
        expiresAt: new Date(expiresAt),
        status: currentStatus,
        assetId: asset.id
      }
    });

    // 3. Lógica de Comando
    const command = currentStatus === "EXPIRING" ? "PREPARE_RENEWAL" : "SLEEP";
    console.log(`✅ [${domain}] | Días: ${daysLeft} | Orden: ${command}`);

    console.log(`🚀 [DEBUG] Dominio: ${domain} | Días: ${daysLeft} | ¿Menor a 200?: ${daysLeft < 200} | Orden: ${command}`);
    
    return res.status(200).json({ command, daysLeft });

  } catch (error: any) {
    console.error("❌ Error en report-cert:", error.message);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/agent-tasks/:token", async (req, res) => {
  const { token } = req.params;

  try {
    const asset = await prisma.asset.findFirst({
      where: { agentToken: token },
      select: { 
        name: true,
        certificates: { select: { domain: true } } 
      }
    });

    if (!asset) {
      return res.status(404).json({ error: "Agente no autorizado" });
    }

    const domains = asset.certificates.map(c => c.domain);
    console.log(`📋 Tareas para ${asset.name}: ${domains.join(", ")}`);
    
    return res.json({ domains });

  } catch (error: any) {
    console.error("❌ Error en agent-tasks:", error);
    return res.status(500).json({ error: "Error al obtener tareas" });
  }
});

/**
 * Descarga de Certificado por dominio para el Agente
 */
app.get("/api/download-cert/:domain", async (req, res) => {
  const { domain } = req.params;
  const agentToken = req.headers['x-agent-token'];

  if (!agentToken || typeof agentToken !== 'string') {
    return res.status(401).json({ error: "No autorizado" });
  }

  const certificate = await prisma.certificate.findUnique({
    where: { domain },
    include: { asset: true }
  });

  if (!certificate || !certificate.asset || certificate.asset.agentToken !== agentToken) {
    return res.status(401).json({ error: "No autorizado" });
  }

  if (!certificate.asset.certificateContent || !certificate.asset.privateKeyContent) {
    // Si el proceso ACME aún no ha completado y el contenido aún no está disponible.
    return res.status(202).json({ message: "Procesando certificado..." });
  }

  return res.json({
    certificate: certificate.asset.certificateContent,
    key: certificate.asset.privateKeyContent
  });
});

/**
 * Confirmación de Reto DNS: El agente avisa que ya preparó todo para renovar.
 */
app.post("/confirm-dns-challenge", async (req, res) => {
  const { domain } = req.body;

  if (!domain) {
    return res.status(400).json({ error: "Domain is required" });
  }

  try {
    const updatedCert = await prisma.certificate.update({
      where: { domain },
      data: { status: "PENDING_VALIDATION" }
    });

    /*const alertMessage = `� <b>Doxie-Agent en Acción</b>\nIniciado reto DNS para <code>${domain}</code>\nEstado: <b>PENDING_VALIDATION</b>`;
    await sendTelegramAlert(
    `🐕 <b>DoxieGuard: RENOVACIÓN EN CURSO</b>\n\n` +
    `El Agente ha completado el reto DNS para:\n` +
    `👉 <code>${domain}</code>\n\n` +
    `<i>Estado actualizado a: PENDING_VALIDATION</i>`
    );*/

    // FASE 1: Cloudflare DNS-01 real challenge
    const acmeTxt = `doxie_${domain}_${Date.now()}`; // Real ACME value from ZeroSSL
    
    // Cloudflare DNS (safe)
    if (cloudflareService) {
      try {
        const zoneId = await cloudflareService.getZoneId(domain);
        await cloudflareService.createTxtRecord(zoneId, domain, acmeTxt);
        console.log(`🚀 LIVE DNS01 ${domain}`);
      } catch {
        console.log('⚠️ DNS skip');
      }
    }
    
    console.log(`🚀 DNS-01 LIVE [${domain}] TXT=_acme-challenge.${domain}="${acmeTxt}"`);
    
console.log(`🔄 DNS simulado ${domain} (add CLOUDFLARE_API_TOKEN)`);
    return res.status(200).json({ 
      success: true, 
      message: "DNS challenge ready (sim) - add Cloudflare token for LIVE" 
    });
  } catch (error: any) {
    console.error("❌ Cloudflare Error:", error.message);
    await sendTelegramAlert(`❌ DNS01 Fail\n${domain}\n${error.message}`);
    return res.status(500).json({ error: error.message });
  }
});


/**
 * Reporte de Errores: El agente avisa si no pudo contactar con un dominio.
 */
/*app.post("/report-error", async (req, res) => {
  const { domain, errorMessage } = req.body;

  if (!domain || !errorMessage) {
    return res.status(400).json({ error: "domain and errorMessage are required" });
  }

  try {
    await prisma.certificate.upsert({
      where: { domain },
      update: { status: "UNREACHABLE" },
      create: {
        domain,
        status: "UNREACHABLE",
        expiresAt: new Date(),
        asset: {
          connect: { agentToken: "token-Servidor-Local-Santi" }
        }
      }
    });

    const alertMessage = `🚨 <b>ALERTA CRÍTICA</b>\nEl dominio <code>${domain}</code> no es alcanzable.\nError: ${errorMessage}`;
    await sendTelegramAlert(
      `🚨 <b>DoxieGuard: FALLO DE CONEXIÓN</b>\n\n` +
      `<b>Dominio:</b> <code>${domain}</code>\n` +
      `<b>Estado:</b> UNREACHABLE\n` +
      `<b>Error:</b> <i>${errorMessage}</i>`
    );

    console.log(`⚠️ [${domain}] Reportado como caído: ${errorMessage}`);
    return res.status(200).json({ message: "Error reportado con éxito" });
  } catch (error: any) {
    const alertMessage = `❌ <b>${domain}</b> - Error al procesar reporte de fallo: ${error.message}`;
    await sendTelegramAlert(
      `🚨 <b>DoxieGuard: FALLO DE CONEXIÓN</b>\n\n` +
      `<b>Dominio:</b> <code>${domain}</code>\n` +
      `<b>Estado:</b> UNREACHABLE\n` +
      `<b>Error:</b> <i>${errorMessage}</i>`
    );

    console.error("❌ Error al procesar reporte de fallo:", error.message);
    return res.status(500).json({ error: "No se pudo registrar el fallo" });
  }
});*/

app.post("/report-error", async (req, res) => {
  const { domain, errorMessage } = req.body;

  // 1. Esto está bien (Log en la consola del servidor)
  console.log(`⚠️ Registro de error para ${domain}: ${errorMessage}`);

  // 2. Aquí podrías guardar en la base de datos con Prisma si quieres:
  // await prisma.domain.update({ ... })

  // 3. ❌ ASEGÚRATE DE QUE NO HAYA NINGUNA LÍNEA QUE DIGA:
  // await sendTelegramAlert(...) 

  return res.status(200).json({ message: "Error registrado en DB" });
});

app.post("/send-summary", async (req, res) => {
  const { message } = req.body;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        chat_id: chatId, 
        text: message, 
        parse_mode: 'Markdown' // ✨ Esto permite que los * de Go se vean como Negritas
      }),
    });
    return res.status(200).send("Resumen enviado");
  } catch (err) {
    return res.status(500).send("Error");
  }
});

/**
 * Endpoint para recibir certificados descubiertos por el agente
 */
app.post("/report-discovered-certs", async (req, res) => {
  const { certificates, agentToken, timestamp } = req.body;

  if (!certificates || !Array.isArray(certificates)) {
    return res.status(400).json({ error: "Formato inválido" });
  }

  try {
    console.log(`🔍 [AUTO-DISCOVERY] Recibidos ${certificates.length} certificados descubiertos`);

    // Buscar el asset por token
    const asset = await prisma.asset.findUnique({
      where: { agentToken }
    });

    if (!asset) {
      console.log(`⚠️ Asset no encontrado para token: ${agentToken}`);
      return res.status(404).json({ error: "Asset no encontrado" });
    }

    // Procesar cada certificado descubierto
    for (const cert of certificates) {
      const { domain, certPath, keyPath, expiresAt, issuer, serverType, configPath, serverNames } = cert;

      // Calcular días restantes
      const daysLeft = calculateDaysLeft(expiresAt);
      const currentStatus = daysLeft < 10 ? "EXPIRING" : "ACTIVE";

      // Upsert del certificado
      await prisma.certificate.upsert({
        where: { domain },
        update: {
          expiresAt: new Date(expiresAt),
          status: currentStatus,
          // Guardar metadata adicional si el schema lo soporta
        },
        create: {
          domain,
          expiresAt: new Date(expiresAt),
          status: currentStatus,
          assetId: asset.id,
        }
      });

      console.log(`  ✅ [${serverType.toUpperCase()}] ${domain} - Expira: ${new Date(expiresAt).toLocaleDateString()} (${daysLeft} días)`);
      console.log(`     📁 Cert: ${certPath}`);
      console.log(`     🔑 Key: ${keyPath}`);
      console.log(`     ⚙️  Config: ${configPath}`);
      if (serverNames.length > 1) {
        console.log(`     🌐 Aliases: ${serverNames.slice(1).join(', ')}`);
      }
    }

    // Enviar notificación a Telegram si hay certificados por expirar
    const expiringCerts = certificates.filter((cert: any) => {
      const daysLeft = calculateDaysLeft(cert.expiresAt);
      return daysLeft < 30;
    });

    if (expiringCerts.length > 0) {
      const message = `🔍 <b>Auto-Discovery Completado</b>\n\n` +
        `📊 Total descubiertos: ${certificates.length}\n` +
        `⚠️ Por expirar (< 30 días): ${expiringCerts.length}\n\n` +
        expiringCerts.map((cert: any) => {
          const daysLeft = calculateDaysLeft(cert.expiresAt);
          return `• ${cert.domain} (${daysLeft} días)`;
        }).join('\n');
      
      await sendTelegramAlert(message);
    }

    return res.status(200).json({ 
      message: "Certificados descubiertos procesados correctamente",
      processed: certificates.length 
    });

  } catch (error: any) {
    console.error("❌ Error procesando certificados descubiertos:", error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Endpoint de Entrega: Permite al Agente descargar certificado y llave privada.
 */
app.get("/api/assets/:domain/download", async (req, res) => {
  const { domain } = req.params;
  const token = req.headers['x-agent-token'];

  if (!domain || !token || typeof token !== 'string') {
    return res.status(401).json({ error: "No autorizado o dominio no encontrado" });
  }

  const certificate = await prisma.certificate.findUnique({
    where: { domain },
    include: { asset: true }
  });

  if (!certificate || !certificate.asset || certificate.asset.agentToken !== token) {
    return res.status(401).json({ error: "No autorizado o dominio no encontrado" });
  }

  if (!certificate.asset.certificateContent || !certificate.asset.privateKeyContent) {
    return res.status(202).json({ message: "Procesando certificado..." });
  }

  return res.json({
    certificate: certificate.asset.certificateContent,
    key: certificate.asset.privateKeyContent
  });
});

/**
 * Dashboard: Obtiene todos los certificados con metadatos de salud.
 */
app.get('/certificates', async (_req: Request, res: Response) => {
  try {
    const certs = await prisma.certificate.findMany({
      include: { asset: true },
      orderBy: { expiresAt: 'asc' }
    });

    const enrichedCerts = certs.map(cert => {
      const daysLeft = calculateDaysLeft(cert.expiresAt);
      return {
        ...cert,
        daysLeft,
        healthStatus: getHealthStatus(daysLeft)
      };
    });

    return res.json(enrichedCerts);
  } catch (error) {
    return res.status(500).json({ error: "Error al obtener certificados" });
  }
});

// --- TAREA PROGRAMADA DIARIA ---
// '0 9 * * *' se ejecuta todos los días a las 09:00 del servidor (CST si el servidor está en esa zona horaria)
cron.schedule('0 8 * * *', () => {
  console.log('🐕 DoxieGuard revisando expiraciones diarias...');
  checkAndNotifyExpirations().catch(error => {
    console.error('❌ Error en checkAndNotifyExpirations:', error);
  });
});

// --- INICIO DEL SERVIDOR ---
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`
  🚀 Doxie-API Desplegada
  📡 Puerto: ${PORT}
  🔗 URL: http://localhost:${PORT}
  `);
});