/**
 * GCP Load Balancer Service
 * Auto-Discovery de certificados en GCP Load Balancers y CDN
 * Nota: GCP Load Balancers usan certificados de Certificate Manager
 */

import { GCPCertificateManagerService, GCPCertificateInfo } from "./gcp-certificate-manager.service";

export interface GCPLoadBalancerCertificateInfo {
  loadBalancerName: string;
  loadBalancerType: string;
  certificateName: string;
  certificateId: string;
  domains: string[];
  targetProxy: string;
  sslPolicy?: string;
}

export interface GCPLoadBalancerDiscoveryResult {
  provider: "gcp";
  resourceType: "loadbalancer";
  projectId: string;
  loadBalancers: GCPLoadBalancerCertificateInfo[];
}

export class GCPLoadBalancerService {
  private certificateManager: GCPCertificateManagerService;
  private projectId: string;

  constructor(projectId?: string) {
    this.projectId = projectId || process.env.GCP_PROJECT_ID || "";
    this.certificateManager = new GCPCertificateManagerService(this.projectId);
  }

  /**
   * Lista certificados en Global HTTP(S) Load Balancers
   */
  async listGlobalHttpLoadBalancers(): Promise<GCPLoadBalancerCertificateInfo[]> {
    try {
      const certificates: GCPLoadBalancerCertificateInfo[] = [];
      
      console.log(`🔍 [GCP Load Balancer] Listando Global HTTP(S) Load Balancers...`);
      
      // GCP Global HTTP(S) Load Balancers usan Target HTTPS Proxies
      // que referencian certificados de Certificate Manager
      // Por ahora usamos los certificados de Certificate Manager filtrados
      
      const allCerts = await this.certificateManager.listCertificates();
      
      // Filtrar certificados que tienen labels de load balancer
      const lbCerts = allCerts.filter(cert => 
        cert.labels?.['gcp-resource'] === 'loadbalancer' ||
        cert.labels?.['type'] === 'global-http'
      );

      for (const cert of lbCerts) {
        certificates.push({
          loadBalancerName: cert.labels?.['loadbalancer-name'] || cert.name,
          loadBalancerType: "GLOBAL_HTTP(S)_LOAD_BALANCER",
          certificateName: cert.name,
          certificateId: cert.certificateId,
          domains: [cert.domain],
          targetProxy: cert.labels?.['target-proxy'] || "unknown"
        });
      }

      console.log(`✅ [GCP Load Balancer] Encontrados ${certificates.length} load balancers`);
      return certificates;

    } catch (error) {
      console.error(`❌ [GCP Load Balancer] Error listando load balancers:`, error);
      return [];
    }
  }

  /**
   * Lista certificados en SSL Load Balancers
   */
  async listSSLLoadBalancers(): Promise<GCPLoadBalancerCertificateInfo[]> {
    try {
      const certificates: GCPLoadBalancerCertificateInfo[] = [];
      
      console.log(`🔍 [GCP Load Balancer] Listando SSL Load Balancers...`);
      
      // SSL Load Balancers también usan Target SSL Proxies
      const allCerts = await this.certificateManager.listCertificates();
      
      // Filtrar certificados SSL
      const sslCerts = allCerts.filter(cert => 
        cert.labels?.['type'] === 'ssl-proxy'
      );

      for (const cert of sslCerts) {
        certificates.push({
          loadBalancerName: cert.labels?.['loadbalancer-name'] || cert.name,
          loadBalancerType: "SSL_PROXY_LOAD_BALANCER",
          certificateName: cert.name,
          certificateId: cert.certificateId,
          domains: [cert.domain],
          targetProxy: cert.labels?.['target-proxy'] || "unknown"
        });
      }

      console.log(`✅ [GCP Load Balancer] Encontrados ${certificates.length} SSL load balancers`);
      return certificates;

    } catch (error) {
      console.error(`❌ [GCP Load Balancer] Error listando SSL load balancers:`, error);
      return [];
    }
  }

  /**
   * Auto-Discovery completo de Load Balancers
   */
  async discoverLoadBalancers(): Promise<GCPLoadBalancerDiscoveryResult> {
    const [httpCerts, sslCerts] = await Promise.all([
      this.listGlobalHttpLoadBalancers(),
      this.listSSLLoadBalancers()
    ]);

    return {
      provider: "gcp",
      resourceType: "loadbalancer",
      projectId: this.projectId,
      loadBalancers: [...httpCerts, ...sslCerts],
    };
  }

  /**
   * Obtiene certificados asociados a target proxies
   */
  async getTargetProxyCertificates(): Promise<GCPCertificateInfo[]> {
    try {
      // Los target proxies tienen certificados asociados
      // podemos descubrirlos a través de Certificate Manager
      
      const allCerts = await this.certificateManager.listCertificates();
      
      // Filtrar solo los que tienen labels que indiquen uso en load balancers
      return allCerts.filter(cert => 
        cert.labels?.['gcp-resource'] === 'loadbalancer' ||
        cert.labels?.['managed'] === 'google'
      );

    } catch (error) {
      console.error(`❌ [GCP Load Balancer] Error obteniendo target proxy certificates:`, error);
      return [];
    }
  }
}

/**
 * Función factory para crear cliente GCP Load Balancer
 */
export function createGCPLoadBalancerService(projectId?: string): GCPLoadBalancerService {
  console.log(`🔧 [GCP] Creando Load Balancer client para proyecto ${projectId}`);
  return new GCPLoadBalancerService(projectId);
}
