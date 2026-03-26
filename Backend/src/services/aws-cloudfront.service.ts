/**
 * AWS CloudFront Service
 * Auto-Discovery de certificados en distribuciones CloudFront
 */

import {
  CloudFrontClient,
  ListDistributionsCommand,
  ListDistributionsCommandInput,
  GetDistributionCommand,
} from "@aws-sdk/client-cloudfront";
import { AwsCredentialIdentity } from "@aws-sdk/types";

export interface CloudFrontCertificateInfo {
  distributionId: string;
  domainName: string;
  callerReference: string;
  status: string;
  enabled: boolean;
  certificate: {
    acmCertificateArn?: string;
    iamCertificateId?: string;
    sslSupportMethod?: string;
    minimumProtocolVersion?: string;
    certificate?: string;
    certificateSource?: string;
  };
  aliases: string[];
  region: string;
}

export interface AWSCloudFrontDiscoveryResult {
  provider: "aws";
  resourceType: "cloudfront";
  region: string;
  certificates: CloudFrontCertificateInfo[];
  distributions: {
    id: string;
    domain: string;
    status: string;
    enabled: boolean;
    hasCertificate: boolean;
  }[];
}

export class AWSCloudFrontService {
  private client: CloudFrontClient;

  constructor(credentials: AwsCredentialIdentity) {
    // CloudFront es global, no necesita región
    this.client = new CloudFrontClient({
      credentials,
      region: "us-east-1", // CloudFront siempre usa us-east-1
    });
  }

  /**
   * Lista todas las distribuciones CloudFront
   */
  async listDistributions(): Promise<any[]> {
    try {
      let marker: string | undefined;
      const allDistributions: any[] = [];

      do {
        const input: ListDistributionsCommandInput = marker
          ? { Marker: marker }
          : {};
        
        const command = new ListDistributionsCommand(input);
        const response = await this.client.send(command);
        
        if (response.DistributionList?.Items) {
          allDistributions.push(...response.DistributionList.Items);
        }

        marker = response.DistributionList?.NextMarker;
      } while (marker);

      return allDistributions;
    } catch (error) {
      console.error("❌ Error listing CloudFront distributions:", error);
      throw error;
    }
  }

  /**
   * Obtiene detalles de una distribución específica
   */
  async getDistribution(distributionId: string): Promise<any | null> {
    try {
      const command = new GetDistributionCommand({ Id: distributionId });
      const response = await this.client.send(command);
      return response.Distribution || null;
    } catch (error) {
      console.error(`❌ Error getting distribution ${distributionId}:`, error);
      return null;
    }
  }

  /**
   * Realiza Auto-Discovery de certificados en CloudFront
   */
  async discoverCertificates(region: string = "global"): Promise<AWSCloudFrontDiscoveryResult> {
    console.log(`🔍 [CloudFront] Discovering certificates`);

    const certificates: CloudFrontCertificateInfo[] = [];
    const distributionsInfo: AWSCloudFrontDiscoveryResult["distributions"] = [];
    const distributions = await this.listDistributions();

    for (const dist of distributions) {
      const certInfo: CloudFrontCertificateInfo = {
        distributionId: dist.Id,
        domainName: dist.DomainName,
        callerReference: dist.CallerReference,
        status: dist.Status,
        enabled: dist.Enabled,
        certificate: {
          acmCertificateArn: dist.ViewerCertificate?.ACMCertificateArn,
          iamCertificateId: dist.ViewerCertificate?.IAMCertificateId,
          sslSupportMethod: dist.ViewerCertificate?.SSLSupportMethod,
          minimumProtocolVersion: dist.ViewerCertificate?.MinimumProtocolVersion,
          certificate: dist.ViewerCertificate?.Certificate,
          certificateSource: dist.ViewerCertificate?.CertificateSource,
        },
        aliases: dist.Aliases?.Items || [],
        region,
      };

      // Solo agregar si tiene certificado configurado
      if (certInfo.certificate.acmCertificateArn || certInfo.certificate.iamCertificateId) {
        certificates.push(certInfo);
      }

      distributionsInfo.push({
        id: dist.Id,
        domain: dist.DomainName,
        status: dist.Status,
        enabled: dist.Enabled,
        hasCertificate: !!(certInfo.certificate.acmCertificateArn || certInfo.certificate.iamCertificateId),
      });

      const certIdentifier = certInfo.certificate.acmCertificateArn || certInfo.certificate.iamCertificateId || "Custom Certificate";
      console.log(
        `  ✅ [CloudFront] ${dist.DomainName} - Status: ${dist.Status} - Cert: ${certIdentifier}`
      );
    }

    console.log(`✅ [CloudFront] Found ${certificates.length} certificates across ${distributionsInfo.length} distributions`);

    return {
      provider: "aws",
      resourceType: "cloudfront",
      region,
      certificates,
      distributions: distributionsInfo,
    };
  }

  /**
   * Obtiene distribuciones por expirar (verificando ACM)
   */
  getExpiringCertificates(certificates: CloudFrontCertificateInfo[]): CloudFrontCertificateInfo[] {
    // Similar a ELB, CloudFront usa certificados de ACM
    // La verificación de expiración se hace a través de ACM
    return certificates;
  }
}
