/**
 * AWS Service
 * Servicio principal que coordina ACM, ELB y CloudFront
 */

import { AwsCredentialIdentity } from "@aws-sdk/types";
import { AWSACMService } from "./aws-acm.service";
import { AWSELBService } from "./aws-elb.service";
import { AWSCloudFrontService } from "./aws-cloudfront.service";

export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export interface AWSDiscoveryResult {
  acm: Awaited<ReturnType<AWSACMService["discoverCertificates"]>> | null;
  elb: Awaited<ReturnType<AWSELBService["discoverCertificates"]>> | null;
  cloudfront: Awaited<ReturnType<AWSCloudFrontService["discoverCertificates"]>> | null;
}

export class AWSService {
  private credentials: AwsCredentialIdentity;
  private acmService: AWSACMService;
  private elbService: AWSELBService;
  private cloudFrontService: AWSCloudFrontService;

  constructor(credentials: AWSCredentials) {
    this.credentials = {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken && { sessionToken: credentials.sessionToken }),
    };

    this.acmService = new AWSACMService(this.credentials);
    this.elbService = new AWSELBService(this.credentials);
    this.cloudFrontService = new AWSCloudFrontService(this.credentials);
  }

  /**
   * Realiza Auto-Discovery completo en AWS
   */
  async discoverAll(regions: string[] = ["us-east-1"]): Promise<AWSDiscoveryResult> {
    console.log("🔍 [AWS] Starting complete discovery...");

    const result: AWSDiscoveryResult = {
      acm: null,
      elb: null,
      cloudfront: null,
    };

    try {
      // ACM y ELB por región
      for (const region of regions) {
        console.log(`🌍 [AWS] Processing region: ${region}`);

        try {
          result.acm = await this.acmService.discoverCertificates(region);
        } catch (error) {
          console.error(`❌ [ACM] Error in region ${region}:`, error);
        }

        try {
          result.elb = await this.elbService.discoverCertificates(region);
        } catch (error) {
          console.error(`❌ [ELB] Error in region ${region}:`, error);
        }
      }

      // CloudFront es global
      try {
        result.cloudfront = await this.cloudFrontService.discoverCertificates();
      } catch (error) {
        console.error("❌ [CloudFront] Error:", error);
      }

      console.log("✅ [AWS] Discovery completed");
    } catch (error) {
      console.error("❌ [AWS] Discovery failed:", error);
    }

    return result;
  }

  /**
   * Obtiene certificados ACM
   */
  async getACMCertificates(region: string): Promise<any> {
    return await this.acmService.discoverCertificates(region);
  }

  /**
   * Obtiene certificados de ELB
   */
  async getELBCertificates(region: string): Promise<any> {
    return await this.elbService.discoverCertificates(region);
  }

  /**
   * Obtiene certificados de CloudFront
   */
  async getCloudFrontCertificates(): Promise<any> {
    return await this.cloudFrontService.discoverCertificates();
  }

  /**
   * Obtiene todos los certificados próximos a expirar
   */
  async getExpiringCertificates(regions: string[] = ["us-east-1"], daysThreshold: number = 30) {
    const discovery = await this.discoverAll(regions);
    const expiringCerts: any[] = [];

    // Certificados ACM próximos a expirar
    if (discovery.acm) {
      for (const cert of discovery.acm.certificates) {
        if (this.acmService.isExpiringSoon(cert.notAfter, daysThreshold)) {
          expiringCerts.push({
            ...cert,
            resourceType: "acm",
            region: discovery.acm.region,
          });
        }
      }
    }

    // ELB y CloudFront usan certificados de ACM, así que ya están cubiertos
    // Pero podemos agregar lógica adicional si es necesario

    return expiringCerts;
  }

  /**
   * Obtiene resumen de todos los recursos
   */
  async getSummary(regions: string[] = ["us-east-1"]) {
    const discovery = await this.discoverAll(regions);

    return {
      acm: {
        totalCertificates: discovery.acm?.certificates.length || 0,
        regions: regions,
      },
      elb: {
        totalCertificates: discovery.elb?.certificates.length || 0,
        totalLoadBalancers: discovery.elb?.loadBalancers.length || 0,
        regions: regions,
      },
      cloudfront: {
        totalCertificates: discovery.cloudfront?.certificates.length || 0,
        totalDistributions: discovery.cloudfront?.distributions.length || 0,
      },
    };
  }
}
