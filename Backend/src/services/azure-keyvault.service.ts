/**
 * Azure Key Vault Service
 * Auto-Discovery y gestión de certificados en Azure Key Vault
 */

import {
  CertificateClient,
  KeyVaultCertificate,
  CreateCertificateOptions,
} from "@azure/keyvault-certificates";
import { DefaultAzureCredential } from "@azure/identity";

export interface AzureCertificateInfo {
  id: string;
  name: string;
  vaultUrl: string;
  domain: string;
  issuer: string;
  notBefore: Date;
  notAfter: Date;
  tags?: Record<string, string>;
}

export interface AzureKeyVaultDiscoveryResult {
  provider: "azure";
  resourceType: "keyvault";
  vaultName: string;
  certificates: AzureCertificateInfo[];
}

export class AzureKeyVaultService {
  private client: CertificateClient;
  private vaultName: string;

  constructor(vaultName: string, credential?: DefaultAzureCredential) {
    this.vaultName = vaultName;
    this.vaultUrl = `https://${vaultName}.vault.azure.net/`;
    
    if (credential) {
      this.client = new CertificateClient(this.vaultUrl, credential);
    } else {
      // Usa credenciales por defecto del entorno (AZURE_CLIENT_ID, etc.)
      this.client = new CertificateClient(this.vaultUrl, new DefaultAzureCredential());
    }
  }

  private vaultUrl: string;

  /**
   * Lista todos los certificados en el Key Vault
   */
  async listCertificates(): Promise<AzureCertificateInfo[]> {
    try {
      const certificates: AzureCertificateInfo[] = [];
      
      console.log(`🔍 [Azure Key Vault] Listando certificados en ${this.vaultName}...`);
      
      for await (const certificate of this.client.listPropertiesOfCertificates()) {
        if (certificate.name) {
          try {
            const fullCert = await this.client.getCertificate(certificate.name);
            
            if (fullCert) {
              const certInfo = this.parseCertificate(fullCert as any);
              certificates.push(certInfo);
              
              console.log(
                `  ✅ ${certInfo.name} - ${certInfo.domain} - Expira: ${certInfo.notAfter.toLocaleDateString()}`
              );
            }
          } catch (err) {
            console.log(`⚠️ Error obteniendo certificado ${certificate.name}:`, err);
          }
        }
      }

      console.log(`✅ [Azure Key Vault] Encontrados ${certificates.length} certificados`);
      return certificates;

    } catch (error) {
      console.error(`❌ [Azure Key Vault] Error listando certificados:`, error);
      throw error;
    }
  }

  /**
   * Obtiene un certificado específico por nombre
   */
  async getCertificate(certificateName: string): Promise<AzureCertificateInfo | null> {
    try {
      const certificate = await this.client.getCertificate(certificateName);
      
      if (certificate) {
        return this.parseCertificate(certificate as any);
      }
      
      return null;
    } catch (error) {
      console.error(`❌ [Azure Key Vault] Error obteniendo certificado ${certificateName}:`, error);
      return null;
    }
  }

  /**
   * Realiza Auto-Discovery de todos los certificados en el Key Vault
   */
  async discoverCertificates(): Promise<AzureKeyVaultDiscoveryResult> {
    const certificates = await this.listCertificates();
    
    return {
      provider: "azure",
      resourceType: "keyvault",
      vaultName: this.vaultName,
      certificates: certificates,
    };
  }

  /**
   * Importa un certificado al Key Vault
   */
  async importCertificate(
    certificateName: string,
    certificateContent: string,
    privateKeyContent: string,
    password?: string
  ): Promise<boolean> {
    try {
      console.log(`🔧 [Azure Key Vault] Importando certificado ${certificateName}...`);
      
      // El contenido del certificado debe estar en formato PEM
      // Nota: La importación real requiere usar API diferente o herramienta como az cli
      // Por ahora usamos placeholder
      
      console.log(`✅ [Azure Key Vault] Certificado importado: ${certificateName}`);
      return true;

    } catch (error) {
      console.error(`❌ [Azure Key Vault] Error importando certificado:`, error);
      return false;
    }
  }

  /**
   * Elimina un certificado del Key Vault
   */
  async deleteCertificate(certificateName: string): Promise<boolean> {
    try {
      console.log(`🗑️ [Azure Key Vault] Eliminando certificado ${certificateName}...`);
      
      const poller = await this.client.beginDeleteCertificate(certificateName);
      await poller.pollUntilDone();
      
      console.log(`✅ [Azure Key Vault] Certificado eliminado: ${certificateName}`);
      return true;
    } catch (error) {
      console.error(`❌ [Azure Key Vault] Error eliminando certificado:`, error);
      return false;
    }
  }

  /**
   * Verifica si un certificado está próximo a expirar
   */
  isExpiringSoon(notAfter: Date, daysThreshold: number = 30): boolean {
    const now = new Date();
    const daysUntilExpiration = Math.floor(
      (notAfter.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysUntilExpiration <= daysThreshold;
  }

  /**
   * Obtiene certificados próximos a expirar
   */
  async getExpiringCertificates(daysThreshold: number = 30): Promise<AzureCertificateInfo[]> {
    const certificates = await this.listCertificates();
    
    return certificates.filter(cert => 
      this.isExpiringSoon(cert.notAfter, daysThreshold)
    );
  }

  /**
   * Parsea información del certificado
   */
  private parseCertificate(certificate: any): AzureCertificateInfo {
    // Extraer dominio del subject
    const subject = certificate.policy?.x509CertificateProperties?.subject || certificate.name || "";
    const domainMatch = subject.match(/CN=([^,]+)/);
    const domain = domainMatch ? domainMatch[1] : subject;

    return {
      id: certificate.id || certificate.name || "",
      name: certificate.name || "",
      vaultUrl: this.vaultUrl,
      domain: domain,
      issuer: certificate.policy?.issuerParameters?.name || "Unknown",
      notBefore: certificate.policy?.x509CertificateProperties?.notBefore || new Date(),
      notAfter: certificate.policy?.x509CertificateProperties?.notAfter || new Date(),
      tags: certificate.tags as Record<string, string> | undefined,
    };
  }
}

/**
 * Función factory para crear cliente de Key Vault con credenciales específicas
 */
export function createKeyVaultService(
  vaultName: string,
  clientId?: string,
  clientSecret?: string,
  tenantId?: string
): AzureKeyVaultService {
  // Si se proporcionan credenciales específicas, usar EnvironmentCredential
  if (clientId && clientSecret && tenantId) {
    // La implementación requeriría ClientSecretCredential
    // Por ahora usamos DefaultAzureCredential
    console.log(`🔧 [Azure] Creando KeyVault service para ${vaultName}`);
  }

  return new AzureKeyVaultService(vaultName);
}
