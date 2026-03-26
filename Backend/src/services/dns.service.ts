// src/services/dns.service.ts
import axios from 'axios';

/**
 * Interface para configuración de proveedor DNS
 */
export interface DnsProviderConfig {
  provider: 'cloudflare' | 'route53' | 'godaddy' | 'namecheap' | 'custom';
  apiKey?: string;
  apiSecret?: string;
  zoneId?: string;
  region?: string;
}

/**
 * Interface para solicitud de registro DNS
 */
export interface DnsRecordRequest {
  domain: string;
  subDomain?: string;
  recordType: 'TXT' | 'A' | 'AAAA' | 'CNAME' | 'MX';
  content: string;
  ttl?: number;
}

/**
 * Interface para respuesta de operación DNS
 */
export interface DnsOperationResult {
  success: boolean;
  recordId?: string;
  provider: string;
  domain: string;
  error?: string;
}

// ============================================================================
// CLOUDFLARE IMPLEMENTATION
// ============================================================================

/**
 * Obtiene el Zone ID para un dominio específico en Cloudflare
 */
export async function getCloudflareZoneId(domain: string): Promise<string | null> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  
  try {
    const response = await axios.get(
      `https://api.cloudflare.com/client/v4/zones`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        params: {
          name: domain
        }
      }
    );

    if (response.data.result && response.data.result.length > 0) {
      return response.data.result[0].id;
    }
    return null;
  } catch (error: any) {
    console.error(`❌ Error obteniendo Zone ID para ${domain}:`, error.message);
    return null;
  }
}

/**
 * Crea un registro TXT en Cloudflare para validación ACME
 */
export const createCloudflareTxtRecord = async (domain: string, content: string) => {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID || await getCloudflareZoneId(domain);

  if (!zoneId) {
    console.error(`❌ No se encontró Zone ID para ${domain}`);
    return false;
  }

  try {
    const response = await axios.post(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
      {
        type: 'TXT',
        name: `_acme-challenge.${domain}`,
        content: content,
        ttl: 60 
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data.success;
  } catch (error: any) {
    console.error("❌ Error Cloudflare API:", error.response?.data || error.message);
    return false;
  }
};

/**
 * Crea un registro DNS genérico en Cloudflare
 */
export async function createCloudflareRecord(
  request: DnsRecordRequest
): Promise<DnsOperationResult> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID || await getCloudflareZoneId(request.domain);

  if (!zoneId) {
    return {
      success: false,
      provider: 'cloudflare',
      domain: request.domain,
      error: `No se encontró Zone ID para ${request.domain}`
    };
  }

  const fullRecordName = request.subDomain 
    ? `${request.subDomain}.${request.domain}` 
    : request.domain;

  try {
    const response = await axios.post(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
      {
        type: request.recordType,
        name: fullRecordName,
        content: request.content,
        ttl: request.ttl || 60 
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.success) {
      return {
        success: true,
        recordId: response.data.result.id,
        provider: 'cloudflare',
        domain: fullRecordName
      };
    }

    return {
      success: false,
      provider: 'cloudflare',
      domain: fullRecordName,
      error: 'Cloudflare API returned unsuccessful response'
    };

  } catch (error: any) {
    console.error(`❌ Error Cloudflare API para ${fullRecordName}:`, error.response?.data || error.message);
    return {
      success: false,
      provider: 'cloudflare',
      domain: fullRecordName,
      error: error.response?.data?.errors?.[0]?.message || error.message
    };
  }
};

// ============================================================================
// MULTI-DOMAIN DNS OPERATIONS
// ============================================================================

/**
 * Crea registros DNS para MÚLTIPLES dominios simultáneamente
 * Ideal para certificados wildcard con múltiples dominios
 */
export async function createMultiDomainDnsRecords(
  domains: string[],
  acmeChallenge: string
): Promise<{
  success: boolean;
  results: DnsOperationResult[];
  failedDomains: string[];
}> {
  const results: DnsOperationResult[] = [];
  const failedDomains: string[] = [];

  console.log(`🌐 Creando registros DNS para ${domains.length} dominios...`);

  for (const domain of domains) {
    const result = await createCloudflareTxtRecord(domain, acmeChallenge);
    
    if (result) {
      results.push({
        success: true,
        provider: 'cloudflare',
        domain: domain
      });
      console.log(`✅ Registro DNS creado para: ${domain}`);
    } else {
      results.push({
        success: false,
        provider: 'cloudflare',
        domain: domain,
        error: 'Failed to create TXT record'
      });
      failedDomains.push(domain);
      console.log(`❌ Error creando registro DNS para: ${domain}`);
    }
  }

  const success = failedDomains.length === 0;

  console.log(`📊 Resultados: ${results.length - failedDomains.length} exitosos, ${failedDomains.length} fallidos`);

  return {
    success,
    results,
    failedDomains
  };
}

/**
 * Elimina registros DNS de múltiples dominios después de validación ACME
 */
export async function cleanupMultiDomainDnsRecords(
  results: DnsOperationResult[]
): Promise<void> {
  console.log(`🧹 Limpiando registros DNS de ${results.length} dominios...`);

  for (const result of results) {
    if (result.success && result.recordId) {
      await deleteCloudflareRecord(result.recordId);
      console.log(`🗑️ Registro eliminado: ${result.domain}`);
    }
  }
}

/**
 * Elimina un registro específico de Cloudflare
 */
export async function deleteCloudflareRecord(recordId: string): Promise<boolean> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;

  if (!zoneId) {
    console.error('❌ No hay Zone ID configurado para eliminar registro');
    return false;
  }

  try {
    const response = await axios.delete(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data.success;
  } catch (error: any) {
    console.error(`❌ Error eliminando registro ${recordId}:`, error.message);
    return false;
  }
}

// ============================================================================
// ROUTE53 IMPLEMENTATION (AWS)
// ============================================================================

/**
 * Crea registro DNS en Route53 (para múltiples dominios AWS)
 */
export async function createRoute53Record(
  domain: string,
  content: string,
  hostedZoneId?: string
): Promise<DnsOperationResult> {
  // Esta implementación requeriría AWS SDK
  // Por ahora retornamos un placeholder
  console.log(`🔧 [Route53] Creando registro para ${domain}`);

  return {
    success: false,
    provider: 'route53',
    domain: domain,
    error: 'Route53 implementation pending - requires AWS SDK'
  };
}

// ============================================================================
// MULTI-PROVIDER DNS MANAGEMENT
// ============================================================================

/**
 * Obtiene el proveedor DNS配置 basándose en el dominio
 */
export function getDnsProviderForDomain(domain: string): DnsProviderConfig {
  // Lógica para determinar el proveedor DNS basándose en el dominio
  // Podría consultar la base de datos o configuración
  
  const cloudflareDomains = process.env.CLOUDFLARE_DOMAINS?.split(',') || [];
  
  if (cloudflareDomains.some(d => domain.endsWith(d))) {
    return { provider: 'cloudflare' };
  }

  const route53Domains = process.env.ROUTE53_DOMAINS?.split(',') || [];
  
  if (route53Domains.some(d => domain.endsWith(d))) {
    return { 
      provider: 'route53',
      region: process.env.AWS_REGION || 'us-east-1'
    };
  }

  // Default a Cloudflare
  return { provider: 'cloudflare' };
}

/**
 * Crea registro DNS usando el proveedor apropiado para múltiples dominios
 */
export async function createDnsRecordForProvider(
  request: DnsRecordRequest,
  provider: DnsProviderConfig
): Promise<DnsOperationResult> {
  switch (provider.provider) {
    case 'cloudflare':
      return createCloudflareRecord(request);
    
    case 'route53':
      return createRoute53Record(request.domain, request.content);
    
    case 'godaddy':
      console.log(`🔧 [GoDaddy] Implementación pendiente para ${request.domain}`);
      return {
        success: false,
        provider: 'godaddy',
        domain: request.domain,
        error: 'GoDaddy implementation pending'
      };
    
    case 'namecheap':
      console.log(`🔧 [Namecheap] Implementación pendiente para ${request.domain}`);
      return {
        success: false,
        provider: 'namecheap',
        domain: request.domain,
        error: 'Namecheap implementation pending'
      };
    
    default:
      return {
        success: false,
        provider: provider.provider,
        domain: request.domain,
        error: 'Unknown DNS provider'
      };
  }
}