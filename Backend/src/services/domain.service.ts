/**
 * Domain Service
 * Gestión avanzada de dominios, wildcards y subdominios
 */

import { prisma } from '../lib/prisma';
import { runAdvancedAcmeFlow, AcmeCertificateRequest } from './acme.service';

export interface DomainCertificateConfig {
  domain: string;
  includeWildcard: boolean;
  additionalSubdomains: string[];
  autoRenew: boolean;
  renewalDaysBefore: number;
}

export interface SubdomainInfo {
  subdomain: string;
  fullDomain: string;
  hasCertificate: boolean;
  certificateExpiry?: Date;
  status: 'active' | 'inactive' | 'pending';
}

export interface WildcardCertificateInfo {
  primaryDomain: string;
  wildcardDomain: string;
  hasWildcardCertificate: boolean;
  wildcardExpiry?: Date;
  associatedSubdomains: string[];
}

/**
 * Genera un certificado wildcard para un dominio
 */
export async function generateWildcardCertificate(
  domain: string,
  additionalSubdomains: string[] = []
): Promise<{
  success: boolean;
  certificate?: string;
  key?: string;
  domains?: string[];
  error?: string;
}> {
  try {
    console.log(`🌟 Generando certificado wildcard para: ${domain}`);

    const request: AcmeCertificateRequest = {
      primaryDomain: domain,
      includeWildcard: true,
      additionalDomains: additionalSubdomains
    };

    const result = await runAdvancedAcmeFlow(request);

    console.log(`✅ Certificado wildcard generado exitosamente para: ${result.domains.join(', ')}`);

    return {
      success: true,
      certificate: result.certificate,
      key: result.key,
      domains: result.domains
    };

  } catch (error: any) {
    console.error(`❌ Error generando certificado wildcard:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Genera certificados para múltiples subdominios específicos
 */
export async function generateMultiSubdomainCertificate(
  primaryDomain: string,
  subdomains: string[]
): Promise<{
  success: boolean;
  certificate?: string;
  key?: string;
  domains?: string[];
  error?: string;
}> {
  try {
    console.log(`🔗 Generando certificado multi-subdominio para: ${primaryDomain}`);
    console.log(`📋 Subdominios: ${subdomains.join(', ')}`);

    const request: AcmeCertificateRequest = {
      primaryDomain: primaryDomain,
      includeWildcard: false,
      additionalDomains: subdomains.map(sub => `${sub}.${primaryDomain}`)
    };

    const result = await runAdvancedAcmeFlow(request);

    console.log(`✅ Certificado multi-subdominio generado exitosamente`);

    return {
      success: true,
      certificate: result.certificate,
      key: result.key,
      domains: result.domains
    };

  } catch (error: any) {
    console.error(`❌ Error generando certificado multi-subdominio:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Obtiene información de subdominios para un dominio
 */
export async function getSubdomainInfo(domain: string): Promise<SubdomainInfo[]> {
  try {
    // Buscar certificados existentes para subdominios
    const certificates = await prisma.certificate.findMany({
      where: {
        domain: {
          endsWith: domain
        }
      },
      include: {
        asset: true
      }
    });

    const subdomainMap = new Map<string, SubdomainInfo>();

    // Agregar el dominio principal
    subdomainMap.set(domain, {
      subdomain: '@',
      fullDomain: domain,
      hasCertificate: false,
      status: 'inactive'
    });

    // Procesar certificados encontrados
    for (const cert of certificates) {
      const parts = cert.domain.split('.');
      const rootDomain = parts.slice(-2).join('.');

      if (rootDomain === domain) {
        const subdomain = cert.domain.replace(`.${domain}`, '');
        subdomainMap.set(cert.domain, {
          subdomain: subdomain,
          fullDomain: cert.domain,
          hasCertificate: true,
          certificateExpiry: cert.expiresAt,
          status: cert.status === 'HEALTHY' ? 'active' : 'inactive'
        });
      }
    }

    return Array.from(subdomainMap.values());

  } catch (error: any) {
    console.error(`❌ Error obteniendo información de subdominios:`, error);
    return [];
  }
}

/**
 * Genera certificados para TODOS los subdominios activos de un dominio
 */
export async function generateCertificateForAllSubdomains(
  domain: string
): Promise<{
  success: boolean;
  certificatesGenerated: number;
  domains?: string[];
  error?: string;
}> {
  try {
    // Obtener todos los subdominios
    const subdomains = await getSubdomainInfo(domain);

    // Filtrar solo los activos (que queremos certificados)
    const activeSubdomains = subdomains
      .filter(s => s.status === 'active' && s.hasCertificate)
      .map(s => s.subdomain);

    if (activeSubdomains.length === 0) {
      return {
        success: true,
        certificatesGenerated: 0
      };
    }

    // Generar certificado multi-subdominio
    const result = await generateMultiSubdomainCertificate(domain, activeSubdomains);

    if (result.success) {
      return {
        success: true,
        certificatesGenerated: activeSubdomains.length,
        domains: result.domains
      };
    } else {
      return {
        success: false,
        certificatesGenerated: 0,
        error: result.error
      };
    }

  } catch (error: any) {
    console.error(`❌ Error generando certificados para subdominios:`, error);
    return {
      success: false,
      certificatesGenerated: 0,
      error: error.message
    };
  }
}

/**
 * Obtiene información del certificado wildcard de un dominio
 */
export async function getWildcardCertificateInfo(domain: string): Promise<WildcardCertificateInfo | null> {
  try {
    const wildcardDomain = `*.${domain}`;

    // Buscar certificado wildcard
    const wildcardCert = await prisma.certificate.findUnique({
      where: { domain: wildcardDomain },
      include: { asset: true }
    });

    // Obtener todos los subdominios
    const subdomains = await getSubdomainInfo(domain);

    const associatedSubdomains = subdomains
      .filter(s => s.hasCertificate && s.subdomain !== '@')
      .map(s => s.fullDomain);

    return {
      primaryDomain: domain,
      wildcardDomain: wildcardDomain,
      hasWildcardCertificate: !!wildcardCert,
      wildcardExpiry: wildcardCert?.expiresAt || undefined,
      associatedSubdomains: associatedSubdomains
    };

  } catch (error: any) {
    console.error(`❌ Error obteniendo info de certificado wildcard:`, error);
    return null;
  }
}

/**
 * Configura certificados automáticos para un dominio y sus subdominios
 */
export async function setupDomainCertificates(
  config: DomainCertificateConfig
): Promise<{
  success: boolean;
  message: string;
  domains?: string[];
}> {
  try {
    console.log(`🔧 Configurando certificados para: ${config.domain}`);

    // Generar certificado con wildcard y subdominios
    const result = await runAdvancedAcmeFlow({
      primaryDomain: config.domain,
      includeWildcard: config.includeWildcard,
      additionalDomains: config.additionalSubdomains.map(sub => `${sub}.${config.domain}`)
    });

    // Guardar configuración de renovación automática
    if (config.autoRenew) {
      await prisma.certificate.updateMany({
        where: {
          domain: {
            in: result.domains
          }
        },
        data: {
          autoRenew: true,
          renewalDaysBefore: config.renewalDaysBefore
        }
      });
    }

    const message = config.includeWildcard
      ? `Certificados configurados para ${config.domain} y wildcard ${result.domains[1]}`
      : `Certificados configurados para ${result.domains.join(', ')}`;

    console.log(`✅ ${message}`);

    return {
      success: true,
      message: message,
      domains: result.domains
    };

  } catch (error: any) {
    console.error(`❌ Error configurando certificados:`, error);
    return {
      success: false,
      message: `Error: ${error.message}`
    };
  }
}
