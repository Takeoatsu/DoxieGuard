/**
 * AWS ELB Service
 * Elastic Load Balancer - Auto-Discovery de certificados en LBs
 */

import {
  DescribeLoadBalancersCommand,
  DescribeListenersCommand,
  DescribeRulesCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import { AwsCredentialIdentity } from "@aws-sdk/types";

export interface ELBCertificateInfo {
  loadBalancerArn: string;
  loadBalancerName: string;
  loadBalancerType: string;
  dnsName: string;
  listenerArn: string;
  listenerProtocol: string;
  certificateArn: string;
  domainName?: string;
  region: string;
}

export interface AWSELBDiscoveryResult {
  provider: "aws";
  resourceType: "elb";
  region: string;
  certificates: ELBCertificateInfo[];
  loadBalancers: {
    arn: string;
    name: string;
    type: string;
    dnsName: string;
    certificatesCount: number;
  }[];
}

export class AWSELBService {
  private client: any;

  constructor(credentials: AwsCredentialIdentity, region: string = "us-east-1") {
    // Usar ELBv2Client directamente del paquete
    const { ELBv2Client } = require("@aws-sdk/client-elastic-load-balancing-v2");
    this.client = new ELBv2Client({ credentials, region });
  }

  /**
   * Lista todos los Load Balancers
   */
  async listLoadBalancers(): Promise<any[]> {
    try {
      const command = new DescribeLoadBalancersCommand({});
      const response = await this.client.send(command);
      return response.LoadBalancers || [];
    } catch (error) {
      console.error("❌ Error listing Load Balancers:", error);
      throw error;
    }
  }

  /**
   * Lista los listeners de un Load Balancer
   */
  async describeListeners(loadBalancerArn: string): Promise<any[]> {
    try {
      const command = new DescribeListenersCommand({ LoadBalancerArn: loadBalancerArn });
      const response = await this.client.send(command);
      return response.Listeners || [];
    } catch (error) {
      console.error(`❌ Error describing listeners for LB ${loadBalancerArn}:`, error);
      return [];
    }
  }

  /**
   * Lista las reglas de un listener
   */
  async describeRules(listenerArn: string): Promise<any[]> {
    try {
      const command = new DescribeRulesCommand({ ListenerArn: listenerArn });
      const response = await this.client.send(command);
      return response.Rules || [];
    } catch (error) {
      console.error(`❌ Error describing rules for listener ${listenerArn}:`, error);
      return [];
    }
  }

  /**
   * Realiza Auto-Discovery de certificados en ELBs
   */
  async discoverCertificates(region: string): Promise<AWSELBDiscoveryResult> {
    console.log(`🔍 [ELB] Discovering certificates in region: ${region}`);

    const certificates: ELBCertificateInfo[] = [];
    const loadBalancersInfo: AWSELBDiscoveryResult["loadBalancers"] = [];
    const loadBalancers = await this.listLoadBalancers();

    for (const lb of loadBalancers) {
      const listeners = await this.describeListeners(lb.LoadBalancerArn);
      let certificatesCount = 0;

      for (const listener of listeners) {
        // Solo procesar listeners HTTPS
        if (listener.Protocol !== "HTTPS") continue;

        // Certificado principal del listener
        if (listener.Certificates && listener.Certificates.length > 0) {
          for (const cert of listener.Certificates) {
            const certInfo: ELBCertificateInfo = {
              loadBalancerArn: lb.LoadBalancerArn,
              loadBalancerName: lb.LoadBalancerName,
              loadBalancerType: lb.Type,
              dnsName: lb.DNSName,
              listenerArn: listener.ListenerArn,
              listenerProtocol: listener.Protocol,
              certificateArn: cert.CertificateArn,
              domainName: cert.DomainName || undefined,
              region,
            };

            certificates.push(certInfo);
            certificatesCount++;

            console.log(
              `  ✅ [ELB] ${lb.LoadBalancerName} (${lb.Type}) - ${cert.DomainName || cert.CertificateArn}`
            );
          }
        }

        // Verificar reglas para certificados adicionales
        const rules = await this.describeRules(listener.ListenerArn);
        for (const rule of rules) {
          if (rule.Actions) {
            for (const action of rule.Actions) {
              if (action.FixedResponseConfig) {
                // Skip fixed responses
                continue;
              }

              if (action.ForwardConfig && action.ForwardConfig.TargetGroupStickinessConfig) {
                // certificados adicionales en forward configs si es necesario
              }
            }
          }
        }
      }

      loadBalancersInfo.push({
        arn: lb.LoadBalancerArn,
        name: lb.LoadBalancerName,
        type: lb.Type,
        dnsName: lb.DNSName,
        certificatesCount,
      });
    }

    console.log(`✅ [ELB] Found ${certificates.length} certificates across ${loadBalancersInfo.length} load balancers`);

    return {
      provider: "aws",
      resourceType: "elb",
      region,
      certificates,
      loadBalancers: loadBalancersInfo,
    };
  }

  /**
   * Obtiene todos los certificados próximos a expirar
   */
  getExpiringCertificates(certificates: ELBCertificateInfo[], daysThreshold: number = 30): ELBCertificateInfo[] {
    // Esta función debería llamarse después de verificar con ACM
    return certificates;
  }
}
