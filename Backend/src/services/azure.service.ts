/**
 * Azure Cloud Service - Orquestador principal
 * Coordina Auto-Discovery entre Azure Key Vault y App Services
 */

import { AzureKeyVaultService, AzureCertificateInfo } from "./azure-keyvault.service";
import { AzureAppServiceService, AzureAppServiceCertificateInfo } from "./azure-appservice.service";

export interface AzureDiscoveryResult {
  provider: "azure";
  timestamp: Date;
  keyVault: {
    discovered: number;
    certificates: AzureCertificateInfo[];
  };
  appServices: {
    discovered: number;
    certificates: AzureAppServiceCertificateInfo[];
  };
  totalCertificates: number;
}

export interface AzureCertificateSummary {
  source: "keyvault" | "appservice";
  certificate: any;
  metadata: any;
}

export class AzureService {
  private keyVaultService: AzureKeyVaultService;
  private appServiceService: AzureAppServiceService;
  private subscriptionId: string;
  private vaultName: string;

  constructor(subscriptionId: string, vaultName: string) {
    this.subscriptionId = subscriptionId;
    this.vaultName = vaultName;
    this.keyVaultService = new AzureKeyVaultService(vaultName);
    this.appServiceService = new AzureAppServiceService(subscriptionId);
  }

  /**
   * Auto-Discovery completo de Azure
   */
  async discoverAll(): Promise<AzureDiscoveryResult> {
    console.log(`🔍 [Azure] Iniciando Auto-Discovery completo...`);

    try {
      // Ejecutar descubrimiento en paralelo
      const [keyVaultCerts, appServiceCerts] = await Promise.all([
        this.keyVaultService.discoverCertificates().catch(err => {
          console.error(`⚠️ [Azure] Error en Key Vault discovery:`, err);
          return { certificates: [] };
        }),
        this.appServiceService.discoverCertificates().catch(err => {
          console.error(`⚠️ [Azure] Error en App Service discovery:`, err);
          return { certificates: [] };
        })
      ]);

      const result: AzureDiscoveryResult = {
        provider: "azure",
        timestamp: new Date(),
        keyVault: {
          discovered: keyVaultCerts.certificates?.length || 0,
          certificates: keyVaultCerts.certificates || []
        },
        appServices: {
          discovered: appServiceCerts.certificates?.length || 0,
          certificates: appServiceCerts.certificates || []
        },
        totalCertificates: 
          (keyVaultCerts.certificates?.length || 0) +
          (appServiceCerts.certificates?.length || 0)
      };

      console.log(`✅ [Azure] Auto-Discovery completado: ${result.totalCertificates} certificados`);
      return result;

    } catch (error) {
      console.error(`❌ [Azure] Error en Auto-Discovery:`, error);
      throw error;
    }
  }

  /**
   * Importa certificado a Key Vault
   */
  async importCertificateToKeyVault(
    certificateName: string,
    certificateContent: string,
    privateKeyContent: string,
    password?: string
  ): Promise<boolean> {
    return await this.keyVaultService.importCertificate(
      certificateName,
      certificateContent,
      privateKeyContent,
      password
    );
  }

  /**
   * Vincula certificado a App Service
   */
  async bindCertificateToAppService(
    resourceGroupName: string,
    appServiceName: string,
    hostname: string,
    certificateThumbprint: string
  ): Promise<boolean> {
    return await this.appServiceService.bindCertificate(
      resourceGroupName,
      appServiceName,
      hostname,
      certificateThumbprint
    );
  }

  /**
   * Lista certificados de Key Vault
   */
  async listKeyVaultCertificates(): Promise<AzureCertificateInfo[]> {
    return await this.keyVaultService.listCertificates();
  }

  async listAppServices(): Promise<AzureAppServiceCertificateInfo[]> {
    return await this.appServiceService.listAppServices();
  }

  /**
   * Obtiene resumen de certificados Azure
   */
  async getCertificateSummary(): Promise<AzureCertificateSummary[]> {
    const discovery = await this.discoverAll();
    const summary: AzureCertificateSummary[] = [];

    // Agregar certificados de Key Vault
    for (const cert of discovery.keyVault.certificates) {
      summary.push({
        source: "keyvault",
        certificate: cert,
        metadata: {
          vault: this.vaultName,
          expiration: cert.notAfter
        }
      });
    }

    // Agregar certificados de App Services
    for (const cert of discovery.appServices.certificates) {
      summary.push({
        source: "appservice",
        certificate: cert,
        metadata: {
          appService: cert.appServiceName,
          domain: cert.domain
        }
      });
    }

    return summary;
  }
}

/**
 * Función factory para crear cliente Azure
 */
export function createAzureService(
  subscriptionId: string,
  vaultName: string
): AzureService {
  console.log(`🔧 [Azure] Creando cliente Azure para suscripción ${subscriptionId}, vault ${vaultName}`);
  return new AzureService(subscriptionId, vaultName);
}
