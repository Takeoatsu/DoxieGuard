import * as acme from 'acme-client';
import { createCloudflareTxtRecord } from './dns.service';
import { prisma } from '../lib/prisma';

export interface AcmeCertificateRequest {
  primaryDomain: string;          // Dominio principal (ej: ejemplo.com)
  includeWildcard?: boolean;       // Incluir wildcard (ej: *.ejemplo.com)
  additionalDomains?: string[];    // Dominios adicionales (subdominios)
}

export interface AcmeCertificateResponse {
  certificate: string;
  key: string;
  domains: string[];               // Lista de todos los dominios incluidos
  isWildcard: boolean;
}

/**
 * Función avanzada para solicitar certificados con soporte para:
 * - Wildcards (*.dominio.com)
 * - Subdominios específicos
 * - Múltiples dominios en un solo certificado
 */
export const runAdvancedAcmeFlow = async (request: AcmeCertificateRequest): Promise<AcmeCertificateResponse> => {
  console.log(`🐕 DoxieGuard iniciando flujo ACME avanzado para: ${request.primaryDomain}`);

  // 1. Generar una llave privada para la cuenta de DoxieGuard
  const accountKey = await acme.crypto.createPrivateKey();

  const client = new acme.Client({
    directoryUrl: acme.directory.letsencrypt.staging,
    accountKey: accountKey
  });

  try {
    // ✨ EL PASO QUE FALTABA: Registrar la cuenta en Let's Encrypt
    console.log('📝 Registrando cuenta en Let\'s Encrypt...');
    await client.createAccount({
      termsOfServiceAgreed: true,
      contact: ['mailto:admin@doxieguard.com']
    });

    // Construir lista de identificadores para ACME
    const identifiers: { type: 'dns'; value: string }[] = [
      { type: 'dns', value: request.primaryDomain }
    ];

    // Agregar wildcard si se solicita
    if (request.includeWildcard) {
      const wildcardDomain = `*.${request.primaryDomain}`;
      identifiers.push({ type: 'dns', value: wildcardDomain });
      console.log(`🌟 Incluyendo wildcard: ${wildcardDomain}`);
    }

    // Agregar subdominios adicionales
    if (request.additionalDomains && request.additionalDomains.length > 0) {
      for (const domain of request.additionalDomains) {
        identifiers.push({ type: 'dns', value: domain });
        console.log(`🔗 Incluyendo subdominio: ${domain}`);
      }
    }

    console.log(`📋 Total de dominios a certificar: ${identifiers.length}`);

    // 2. Crear la orden con múltiples identificadores
    const order = await client.createOrder({
      identifiers: identifiers
    });

    // 3. Obtener autorizaciones y validar cada dominio
    const authorizations = await client.getAuthorizations(order);
    const dnsChallenges: { challenge: any; domain: string }[] = [];

    for (const auth of authorizations) {
      const dnsChallenge = auth.challenges.find(c => c.type === 'dns-01');
      if (!dnsChallenge) {
        throw new Error(`No se encontró reto DNS-01 para: ${auth.identifier.value}`);
      }
      dnsChallenges.push({ challenge: dnsChallenge, domain: auth.identifier.value });
    }

    // 4. Publicar registros DNS para TODOS los desafíos
    for (const { challenge, domain } of dnsChallenges) {
      const keyAuthorization = await client.getChallengeKeyAuthorization(challenge);
      await createCloudflareTxtRecord(domain, keyAuthorization);
      console.log(`🌐 Registro DNS creado para: ${domain}`);
    }

    console.log('⏳ Esperando propagación DNS (45s)...');
    await new Promise(resolve => setTimeout(resolve, 45000));

    // 5. Notificar y Validar TODOS los desafíos
    for (const { challenge, domain } of dnsChallenges) {
      await client.completeChallenge(challenge);
      console.log(`✅ Desafío completado para: ${domain}`);
    }

    // 6. Esperar validación de TODOS los desafíos
    for (const { challenge, domain } of dnsChallenges) {
      await client.waitForValidStatus(challenge);
      console.log(`✅ Validación exitosa para: ${domain}`);
    }

    // 7. Finalizar: Crear CSR y obtener Certificado con múltiples dominios
    // Generamos la llave privada del certificado (Diferente a la de la cuenta)
    const domainsList = identifiers.map(id => id.value);
    const [certKey, csr] = await acme.crypto.createCsr({
      commonName: request.primaryDomain,
      altNames: domainsList.filter(d => d !== request.primaryDomain) // SANs sin el CN
    });

    const finalizedOrder = await client.finalizeOrder(order, csr);
    const certificate = await client.getCertificate(finalizedOrder);

    console.log('✅ ¡CERTIFICADO MULTI-DOMINIO EMITIDO CON ÉXITO!');

    // ✨ GUARDAR EN DB
    const certRecord = await prisma.certificate.findUnique({
      where: { domain: request.primaryDomain },
      select: { assetId: true }
    });

    if (certRecord?.assetId) {
      await prisma.asset.update({
        where: { id: certRecord.assetId },
        data: {
          certificateContent: certificate.toString(),
          privateKeyContent: certKey.toString(),
          issuedAt: new Date()
        }
      });

      await prisma.certificate.update({
        where: { domain: request.primaryDomain },
        data: { status: 'HEALTHY' }
      });
    }

    // 🧹 LIMPIEZA: Borrar registros de Cloudflare para no dejar basura

    return {
      certificate: certificate.toString(),
      key: certKey.toString(),
      domains: domainsList,
      isWildcard: request.includeWildcard || false
    };

  } catch (error: any) {
    console.error('❌ Fallo en el flujo ACME:', error.message);
    throw error;
  }
};

/**
 * Función legacy para compatibilidad hacia atrás
 */
export const runAcmeFlow = async (domain: string) => {
  const result = await runAdvancedAcmeFlow({
    primaryDomain: domain,
    includeWildcard: false,
    additionalDomains: []
  });

  return {
    certificate: result.certificate,
    key: result.key
  };
};