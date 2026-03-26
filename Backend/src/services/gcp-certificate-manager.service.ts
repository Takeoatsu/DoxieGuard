/**
 * GCP Certificate Manager Service
 * Auto-Discovery y gestión de certificados en Google Cloud Platform
 */

import { CertificateManagerClient, protos } from "@google-cloud/certificate-manager";
import { GoogleAuth } from "google-auth-library";

export interface GCPCertificateInfo {
  name: string;
  certificateId: string;
  domain: string;
  issuer: string;
  notBefore: Date;
  notAfter: Date;
  state: string;
  labels?: Record<string, string>;
}

export interface GCPDiscoveryResult {
  provider: "gcp";
  resourceType: "certificate-manager";
  projectId: string;
  certificates: GCPCertificateInfo[];
}

export class GCPCertificateManagerService {
  private client: CertificateManagerClient;
  private projectId: string;

  constructor(projectId?: string) {
    // Usar GoogleAuth para obtener credenciales automáticamente
    this.client = new CertificateManagerClient();
    this.projectId = projectId || process.env.GCP_PROJECT_ID || "";
  }

  /**
   * Lista todos los certificados en Certificate Manager
   */
  async listCertificates(): Promise<GCPCertificateInfo[]> {
    try {
      const certificates: GCPCertificateInfo[] = [];
      
      console.log(`🔍 [GCP Certificate Manager] Listando certificados en proyecto ${this.projectId}...`);
      
      const parent = `projects/${this.projectId}/locations/global`;
      
      // Listar certificate maps (contienen referencias a certificados)
      const [maps] = await this.client.listCertificateMaps({ parent });
      const mapsData = maps as any;
      
      if (mapsData.certificateMaps) {
        for (const map of mapsData.certificateMaps) {
          if (map.name) {
            // Obtener certificados asociados al map
            const mapCerts = await this.getCertificatesForMap(map.name);
            certificates.push(...mapCerts);
          }
        }
      }

      // También listar certificados directos (no en maps)
      const [certs] = await this.client.listCertificates({ parent });
      const certsData = certs as any;
      
      if (certsData.certificates) {
        for (const cert of certsData.certificates) {
          const certInfo = this.parseCertificate(cert);
          certificates.push(certInfo);
          console.log(`  ✅ ${certInfo.name} - ${certInfo.domain} - Estado: ${certInfo.state}`);
        }
      }

      console.log(`✅ [GCP Certificate Manager] Encontrados ${certificates.length} certificados`);
      return certificates;

    } catch (error) {
      console.error(`❌ [GCP Certificate Manager] Error listando certificados:`, error);
      throw error;
    }
  }

  /**
   * Obtiene certificados de un Certificate Map específico
   */
  private async getCertificatesForMap(mapName: string): Promise<GCPCertificateInfo[]> {
    try {
      const certificates: GCPCertificateInfo[] = [];
      
      const [map] = await this.client.getCertificateMap({ name: mapName });
      const mapData = map as any;
      
      if (mapData.certificates) {
        for (const certRef of mapData.certificates) {
          // El certificado puede ser una referencia o un objeto inline
          if (typeof certRef === 'string') {
            // Es una referencia, obtener el certificado real
            const cert = await this.getCertificate(certRef);
            if (cert) {
              certificates.push(cert);
            }
          }
        }
      }

      return certificates;

    } catch (error) {
      console.error(`❌ [GCP Certificate Manager] Error obteniendo certificados del map:`, error);
      return [];
    }
  }

  /**
   * Obtiene un certificado específico por nombre
   */
  async getCertificate(certificateName: string): Promise<GCPCertificateInfo | null> {
    try {
      const [certificate] = await this.client.getCertificate({ name: certificateName });
      
      if (certificate) {
        return this.parseCertificate(certificate);
      }
      
      return null;

    } catch (error) {
      console.error(`❌ [GCP Certificate Manager] Error obteniendo certificado:`, error);
      return null;
    }
  }

  /**
   * Realiza Auto-Discovery de todos los certificados
   */
  async discoverCertificates(): Promise<GCPDiscoveryResult> {
    const certificates = await this.listCertificates();
    
    return {
      provider: "gcp",
      resourceType: "certificate-manager",
      projectId: this.projectId,
      certificates: certificates,
    };
  }

  /**
   * Obtiene certificados próximos a expirar
   */
  async getExpiringCertificates(daysThreshold: number = 30): Promise<GCPCertificateInfo[]> {
    const certificates = await this.listCertificates();
    const now = new Date();
    
    return certificates.filter(cert => {
      const daysUntilExpiration = Math.floor(
        (cert.notAfter.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      return daysUntilExpiration <= daysThreshold;
    });
  }

  /**
   * Parsea información del certificado
   */
  private parseCertificate(certificate: any): GCPCertificateInfo {
    // Los certificados pueden venir en diferentes formatos
    // Intentar extraer la información de diferentes fuentes
    
    let domain = "";
    let issuer = "Google";
    let notBefore = new Date();
    let notAfter = new Date();
    
    // Intentar obtener dominio del subject
    if (certificate.subjectAltNames && Array.isArray(certificate.subjectAltNames)) {
      domain = certificate.subjectAltNames[0] || "";
    }
    
    // Intentar obtener información de tiempo
    if (certificate.createTime) {
      notBefore = new Date(certificate.createTime);
    }
    
    if (certificate.expireTime) {
      notAfter = new Date(certificate.expireTime);
    }

    return {
      name: certificate.name || "",
      certificateId: certificate.name?.split('/').pop() || "",
      domain: domain,
      issuer: issuer,
      notBefore: notBefore,
      notAfter: notAfter,
      state: certificate.state || "ACTIVE",
      labels: certificate.labels as Record<string, string> | undefined,
    };
  }
}

/**
 * Función factory para crear cliente GCP Certificate Manager
 */
export function createGCPCertificateManagerService(projectId?: string): GCPCertificateManagerService {
  console.log(`🔧 [GCP] Creando Certificate Manager client para proyecto ${projectId}`);
  return new GCPCertificateManagerService(projectId);
}
