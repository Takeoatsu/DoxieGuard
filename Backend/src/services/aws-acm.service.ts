/**
 * AWS ACM Service
 * AWS Certificate Manager - Auto-Discovery y gestión de certificados
 */

import {
  ACMClient,
  ListCertificatesCommand,
  DescribeCertificateCommand,
  RequestCertificateCommand,
  DeleteCertificateCommand,
  CertificateSummary,
  CertificateDetail,
} from "@aws-sdk/client-acm";
import { AwsCredentialIdentity } from "@aws-sdk/types";

export interface AWSCertificateInfo {
  certificateArn: string;
  domainName: string;
  subjectAlternativeNames: string[];
  issuer: string;
  notBefore: Date;
  notAfter: Date;
  status: string;
  keyAlgorithm: string;
  serial: string;
  signatureAlgorithm: string;
}

export interface AWSDiscoveryResult {
  provider: "aws";
  resourceType: "acm";
  region: string;
  certificates: AWSCertificateInfo[];
}

export class AWSACMService {
  private client: ACMClient;

  constructor(credentials: AwsCredentialIdentity, region: string = "us-east-1") {
    this.client = new ACMClient({
      credentials,
      region,
    });
  }

  /**
   * Lista todos los certificados en ACM
   */
  async listCertificates(): Promise<CertificateSummary[]> {
    try {
      const command = new ListCertificatesCommand({});
      const response = await this.client.send(command);
      return response.CertificateSummaryList || [];
    } catch (error) {
      console.error("❌ Error listing ACM certificates:", error);
      throw error;
    }
  }

  /**
   * Obtiene detalles de un certificado específico
   */
  async describeCertificate(certificateArn: string): Promise<CertificateDetail | null> {
    try {
      const command = new DescribeCertificateCommand({ CertificateArn: certificateArn });
      const response = await this.client.send(command);
      return response.Certificate || null;
    } catch (error) {
      console.error(`❌ Error describing certificate ${certificateArn}:`, error);
      return null;
    }
  }

  /**
   * Realiza Auto-Discovery de todos los certificados ACM
   */
  async discoverCertificates(region: string): Promise<AWSDiscoveryResult> {
    console.log(`🔍 [ACM] Discovering certificates in region: ${region}`);

    const certificates: AWSCertificateInfo[] = [];
    const summaries = await this.listCertificates();

    for (const summary of summaries) {
      const details = await this.describeCertificate(summary.CertificateArn!);
      if (!details) continue;

      const certInfo: AWSCertificateInfo = {
        certificateArn: details.CertificateArn!,
        domainName: details.DomainName!,
        subjectAlternativeNames: details.SubjectAlternativeNames || [],
        issuer: details.Issuer || "Unknown",
        notBefore: details.NotBefore!,
        notAfter: details.NotAfter!,
        status: details.Status!,
        keyAlgorithm: details.KeyAlgorithm || "Unknown",
        serial: details.Serial || "Unknown",
        signatureAlgorithm: details.SignatureAlgorithm || "Unknown",
      };

      certificates.push(certInfo);

      console.log(
        `  ✅ [ACM] ${certInfo.domainName} - Expires: ${certInfo.notAfter.toLocaleDateString()} - Status: ${certInfo.status}`
      );
    }

    console.log(`✅ [ACM] Found ${certificates.length} certificates`);

    return {
      provider: "aws",
      resourceType: "acm",
      region,
      certificates,
    };
  }

  /**
   * Solicita un nuevo certificado
   */
  async requestCertificate(
    domainName: string,
    validationMethod: "DNS" | "EMAIL" = "DNS",
    subjectAlternativeNames?: string[]
  ): Promise<string | null> {
    try {
      const command = new RequestCertificateCommand({
        DomainName: domainName,
        ValidationMethod: validationMethod,
        SubjectAlternativeNames: subjectAlternativeNames,
      });

      const response = await this.client.send(command);
      console.log(`✅ [ACM] Certificate requested for: ${domainName}`);
      return response.CertificateArn || null;
    } catch (error) {
      console.error(`❌ Error requesting certificate for ${domainName}:`, error);
      return null;
    }
  }

  /**
   * Elimina un certificado
   */
  async deleteCertificate(certificateArn: string): Promise<boolean> {
    try {
      const command = new DeleteCertificateCommand({ CertificateArn: certificateArn });
      await this.client.send(command);
      console.log(`✅ [ACM] Certificate deleted: ${certificateArn}`);
      return true;
    } catch (error) {
      console.error(`❌ Error deleting certificate ${certificateArn}:`, error);
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
   * Obtiene todos los certificados próximos a expirar
   */
  async getExpiringCertificates(
    region: string,
    daysThreshold: number = 30
  ): Promise<AWSCertificateInfo[]> {
    const discovery = await this.discoverCertificates(region);
    return discovery.certificates.filter((cert) =>
      this.isExpiringSoon(cert.notAfter, daysThreshold)
    );
  }
}
