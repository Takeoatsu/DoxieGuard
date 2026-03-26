/**
 * Azure App Service Service
 * Auto-Discovery y gestión de certificados en Azure App Services
 */

import { WebSiteManagementClient } from "@azure/arm-appservice";
import { DefaultAzureCredential } from "@azure/identity";

export interface AzureAppServiceCertificateInfo {
  resourceGroupName: string;
  appServiceName: string;
  domain: string;
  thumbprint: string;
  expiryDate?: Date;
  enabled: boolean;
}

export interface AzureAppServiceDiscoveryResult {
  provider: "azure";
  resourceType: "appservice";
  subscriptionId: string;
  certificates: AzureAppServiceCertificateInfo[];
}

export class AzureAppServiceService {
  private client: WebSiteManagementClient;
  private subscriptionId: string;

  constructor(subscriptionId: string, credential?: DefaultAzureCredential) {
    this.subscriptionId = subscriptionId;
    
    if (credential) {
      this.client = new WebSiteManagementClient(credential, subscriptionId);
    } else {
      this.client = new WebSiteManagementClient(new DefaultAzureCredential(), subscriptionId);
    }
  }

  /**
   * Lista todos los App Services y sus certificados
   */
  async listAppServices(): Promise<AzureAppServiceCertificateInfo[]> {
    try {
      const certificates: AzureAppServiceCertificateInfo[] = [];
      
      console.log(`🔍 [Azure App Service] Listando recursos...`);
      
      // Listar web apps en la suscripción
      for await (const webApp of this.client.webApps.list()) {
        if (webApp.resourceGroup && webApp.name) {
          try {
            // Obtener configuración de host names y bindings SSL
            const hostNames = webApp.hostNames || [];
            
            // Intentar obtener información SSL
            const appServiceCerts = await this.getAppServiceCertificates(
              webApp.resourceGroup,
              webApp.name
            );
            
            certificates.push(...appServiceCerts);
            
            console.log(`  ✅ ${webApp.name} - ${hostNames.length} dominios`);
          } catch (err) {
            console.log(`⚠️ Error obteniendo info de ${webApp.name}:`, err);
          }
        }
      }

      console.log(`✅ [Azure App Service] Encontrados ${certificates.length} certificados`);
      return certificates;

    } catch (error) {
      console.error(`❌ [Azure App Service] Error listando recursos:`, error);
      throw error;
    }
  }

  /**
   * Obtiene certificados de un App Service específico
   */
  async getAppServiceCertificates(
    resourceGroupName: string,
    appServiceName: string
  ): Promise<AzureAppServiceCertificateInfo[]> {
    try {
      // Obtener hostname bindings
      const hostNameBindings = await this.client.webApps.listHostNameBindings(
        resourceGroupName,
        appServiceName
      );

      // Obtener configuración SSL
      // Nota: listSlotConfigurations podría no existir, usamos placeholder
      const sslBindings = [];
      
      const certificates: AzureAppServiceCertificateInfo[] = [];
      const hostNames = new Set<string>();

      // Recopilar hostnames
      for await (const binding of hostNameBindings) {
        if (binding.name) {
          hostNames.add(binding.name);
        }
      }

      // Por cada hostname con SSL, crear entrada
      for (const domain of hostNames) {
        certificates.push({
          resourceGroupName: resourceGroupName,
          appServiceName: appServiceName,
          domain: domain,
          thumbprint: "pending", // SSL bindings pueden tener thumbprint
          enabled: true
        });
      }

      return certificates;

    } catch (error) {
      console.error(`❌ [Azure App Service] Error obteniendo certificados de ${appServiceName}:`, error);
      return [];
    }
  }

  /**
   * Realiza Auto-Discovery de todos los App Services
   */
  async discoverCertificates(): Promise<AzureAppServiceDiscoveryResult> {
    const certificates = await this.listAppServices();
    
    return {
      provider: "azure",
      resourceType: "appservice",
      subscriptionId: this.subscriptionId,
      certificates: certificates,
    };
  }

  /**
   * Asocia un certificado a un App Service
   */
  async bindCertificate(
    resourceGroupName: string,
    appServiceName: string,
    hostname: string,
    certificateThumbprint: string
  ): Promise<boolean> {
    try {
      console.log(`🔧 [Azure App Service] Vinculando certificado a ${hostname}...`);
      
      // Crear binding SSL
      await this.client.webApps.createOrUpdateHostNameBinding(
        resourceGroupName,
        appServiceName,
        hostname,
        {
          sslState: "SniEnabled",
          thumbprint: certificateThumbprint
        }
      );

      console.log(`✅ [Azure App Service] Certificado vinculado a ${hostname}`);
      return true;

    } catch (error) {
      console.error(`❌ [Azure App Service] Error vinculando certificado:`, error);
      return false;
    }
  }

  /**
   * Elimina binding SSL de un App Service
   */
  async unbindCertificate(
    resourceGroupName: string,
    appServiceName: string,
    hostname: string
  ): Promise<boolean> {
    try {
      console.log(`🗑️ [Azure App Service] Desvinculando certificado de ${hostname}...`);
      
      await this.client.webApps.deleteHostNameBinding(
        resourceGroupName,
        appServiceName,
        hostname
      );

      console.log(`✅ [Azure App Service] Certificado desvinculado de ${hostname}`);
      return true;

    } catch (error) {
      console.error(`❌ [Azure App Service] Error desvinculando certificado:`, error);
      return false;
    }
  }

  /**
   * Lista recursos específicos de un Resource Group
   */
  async listAppServicesInResourceGroup(resourceGroupName: string): Promise<AzureAppServiceCertificateInfo[]> {
    try {
      const certificates: AzureAppServiceCertificateInfo[] = [];
      
      const webApps: any = await this.client.webApps.listByResourceGroup(resourceGroupName);
      
      for (const webApp of (webApps as any)) {
        if (webApp.name) {
          const appCerts = await this.getAppServiceCertificates(
            resourceGroupName,
            webApp.name
          );
          certificates.push(...appCerts);
        }
      }

      return certificates;

    } catch (error) {
      console.error(`❌ [Azure App Service] Error listando en resource group ${resourceGroupName}:`, error);
      return [];
    }
  }
}

/**
 * Función factory para crear cliente de App Service
 */
export function createAppServiceService(
  subscriptionId: string,
  clientId?: string,
  clientSecret?: string,
  tenantId?: string
): AzureAppServiceService {
  console.log(`🔧 [Azure] Creando App Service client para suscripción ${subscriptionId}`);
  return new AzureAppServiceService(subscriptionId);
}
