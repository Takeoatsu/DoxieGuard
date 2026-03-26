/**
 * GCP Cloud Service - Orquestador principal
 * Coordina Auto-Discovery entre GCP Certificate Manager y Load Balancers
 */

import { GCPCertificateManagerService, GCPCertificateInfo } from "./gcp-certificate-manager.service";
import { GCPLoadBalancerService, GCPLoadBalancerCertificateInfo } from "./gcp-loadbalancer.service";

export interface GCPDiscoveryResult {
  provider: "gcp";
  timestamp: Date;
  certificateManager: {
    discovered: number;
    certificates: GCPCertificateInfo[];
  };
  loadBalancers: {
    discovered: number;
    loadBalancers: GCPLoadBalancerCertificateInfo[];
  };
  totalCertificates: number;
}

export interface GCPCertificateSummary {
  source: "certificate-manager" | "loadbalancer";
  certificate: any;
  metadata: any;
}

export class GCPService {
  private certificateManager: GCPCertificateManagerService;
  private loadBalancerService: GCPLoadBalancerService;
  private projectId: string;

  constructor(projectId?: string) {
    this.projectId = projectId || process.env.GCP_PROJECT_ID || "";
    this.certificateManager = new GCPCertificateManagerService(this.projectId);
    this.loadBalancerService = new GCPLoadBalancerService(this.projectId);
  }

  /**
   * Auto-Discovery completo de GCP
   */
  async discoverAll(): Promise<GCPDiscoveryResult> {
    console.log(`🔍 [GCP] Iniciando Auto-Discovery completo...`);

    try {
      // Ejecutar descubrimiento en paralelo
      const [certManagerCerts, loadBalancerCerts] = await Promise.all([
        this.certificateManager.discoverCertificates().catch(err => {
          console.error(`⚠️ [GCP] Error en Certificate Manager discovery:`, err);
          return { certificates: [] };
        }),
        this.loadBalancerService.discoverLoadBalancers().catch(err => {
          console.error(`⚠️ [GCP] Error en Load Balancer discovery:`, err);
          return { loadBalancers: [] };
        })
      ]);

      const result: GCPDiscoveryResult = {
        provider: "gcp",
        timestamp: new Date(),
        certificateManager: {
          discovered: certManagerCerts.certificates?.length || 0,
          certificates: certManagerCerts.certificates || []
        },
        loadBalancers: {
          discovered: loadBalancerCerts.loadBalancers?.length || 0,
          loadBalancers: loadBalancerCerts.loadBalancers || []
        },
        totalCertificates: 
          (certManagerCerts.certificates?.length || 0) +
          (loadBalancerCerts.loadBalancers?.length || 0)
      };

      console.log(`✅ [GCP] Auto-Discovery completado: ${result.totalCertificates} certificados`);
      return result;

    } catch (error) {
      console.error(`❌ [GCP] Error en Auto-Discovery:`, error);
      throw error;
    }
  }

  /**
   * Lista certificados de Certificate Manager
   */
  async listCertificateManagerCertificates(): Promise<GCPCertificateInfo[]> {
    return await this.certificateManager.listCertificates();
  }

  /**
   * Obtiene certificados próximos a expirar
   */
  async getExpiringCertificates(daysThreshold: number = 30): Promise<GCPCertificateInfo[]> {
    return await this.certificateManager.getExpiringCertificates(daysThreshold);
  }

  /**
   * Obtiene resumen de certificados GCP
   */
  async getCertificateSummary(): Promise<GCPCertificateSummary[]> {
    const discovery = await this.discoverAll();
    const summary: GCPCertificateSummary[] = [];

    // Agregar certificados de Certificate Manager
    for (const cert of discovery.certificateManager.certificates) {
      summary.push({
        source: "certificate-manager",
        certificate: cert,
        metadata: {
          project: this.projectId,
          expiration: cert.notAfter
        }
      });
    }

    // Agregar certificados de Load Balancers
    for (const lb of discovery.loadBalancers.loadBalancers) {
      summary.push({
        source: "loadbalancer",
        certificate: lb,
        metadata: {
          loadBalancer: lb.loadBalancerName,
          type: lb.loadBalancerType
        }
      });
    }

    return summary;
  }
}

/**
 * Función factory para crear cliente GCP
 */
export function createGCPService(projectId?: string): GCPService {
  console.log(`🔧 [GCP] Creando cliente GCP para proyecto ${projectId}`);
  return new GCPService(projectId);
}
