import { Resend } from 'resend';
import { prisma } from '../lib/prisma';
import nodemailer from 'nodemailer';
import axios from 'axios';

// Email configuration using Resend (primary) or SMTP (fallback)
let resend: Resend | null = null;
let smtpTransporter: nodemailer.Transporter | null = null;

// Initialize email services
export const initializeEmailServices = async () => {
  // Try Resend first (cloud email service)
  if (process.env.RESEND_API_KEY) {
    try {
      resend = new Resend(process.env.RESEND_API_KEY);
      console.log('✅ Resend email service initialized');
    } catch (error) {
      console.error('❌ Resend initialization failed:', error);
    }
  }

  // Setup SMTP fallback
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      smtpTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      console.log('✅ SMTP email service initialized');
    } catch (error) {
      console.error('❌ SMTP initialization failed:', error);
    }
  }

  if (!resend && !smtpTransporter) {
    console.log('⚠️ No email service configured - Add RESEND_API_KEY or SMTP credentials to .env');
  }
};

// Send email function
export const sendEmail = async (
  to: string,
  subject: string,
  html: string,
  options?: {
    from?: string;
    replyTo?: string;
    attachments?: any[];
  }
): Promise<boolean> => {
  const fromEmail = options?.from || process.env.EMAIL_FROM || 'DoxieGuard <noreply@doxieguard.com>';

  // Try Resend first
  if (resend) {
    try {
      const { data, error } = await resend.emails.send({
        from: fromEmail,
        to: [to],
        subject: subject,
        html: html,
        replyTo: options?.replyTo,
        attachments: options?.attachments,
      });

      if (error) {
        console.error('❌ Resend email failed:', error);
        return false;
      }

      console.log(`✅ Email sent via Resend to ${to}`);
      return true;
    } catch (error) {
      console.error('❌ Resend error:', error);
    }
  }

  // Fallback to SMTP
  if (smtpTransporter) {
    try {
      await smtpTransporter.sendMail({
        from: fromEmail,
        to: to,
        subject: subject,
        html: html,
        replyTo: options?.replyTo,
        attachments: options?.attachments,
      });
      console.log(`✅ Email sent via SMTP to ${to}`);
      return true;
    } catch (error) {
      console.error('❌ SMTP email failed:', error);
      return false;
    }
  }

  console.log(`⚠️ Email not sent (no service configured): ${subject} to ${to}`);
  return false;
};

// Webhook system
interface WebhookPayload {
  event: string;
  timestamp: string;
  data: any;
  metadata?: {
    source?: string;
    hostname?: string;
    userAgent?: string;
  };
}

interface WebhookConfig {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  secret?: string;
  createdAt: Date;
}

// Store webhooks in memory (in production, use database)
const webhooks: WebhookConfig[] = [];

// Register webhook
export const registerWebhook = (
  url: string,
  events: string[],
  options?: {
    secret?: string;
  }
): WebhookConfig => {
  const webhook: WebhookConfig = {
    id: `wh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    url,
    events,
    active: true,
    secret: options?.secret,
    createdAt: new Date(),
  };

  webhooks.push(webhook);
  console.log(`✅ Webhook registered: ${webhook.id} for ${events.join(', ')}`);

  return webhook;
};

// Send webhook notification
export const sendWebhook = async (
  event: string,
  payload: WebhookPayload
): Promise<void> => {
  const relevantWebhooks = webhooks.filter(
    (wh) => wh.active && wh.events.includes(event)
  );

  if (relevantWebhooks.length === 0) {
    console.log(`⚠️ No webhooks registered for event: ${event}`);
    return;
  }

  for (const webhook of relevantWebhooks) {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'DoxieGuard-Webhook/1.0',
        'X-DoxieGuard-Event': event,
      };

      // Add signature if secret is configured
      if (webhook.secret) {
        const crypto = await import('crypto');
        const signature = crypto
          .createHmac('sha256', webhook.secret)
          .update(JSON.stringify(payload))
          .digest('hex');
        headers['X-DoxieGuard-Signature'] = signature;
      }

      await axios.post(webhook.url, payload, { headers });

      console.log(`✅ Webhook sent: ${webhook.id} for event ${event}`);
    } catch (error) {
      console.error(`❌ Webhook failed: ${webhook.id}`, error);
    }
  }
};

// Slack notification
export const sendSlackNotification = async (
  message: string,
  options?: {
    webhookUrl?: string;
    channel?: string;
    username?: string;
    iconEmoji?: string;
  }
): Promise<boolean> => {
  const webhookUrl = options?.webhookUrl || process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    console.log('⚠️ Slack webhook URL not configured');
    return false;
  }

  try {
    const payload = {
      channel: options?.channel || '#certificates',
      username: options?.username || 'DoxieGuard Bot',
      icon_emoji: options?.iconEmoji || ':certificate:',
      text: message,
      attachments: [
        {
          color: '#36a64f',
          fields: [
            {
              title: 'DoxieGuard Alert',
              value: message,
              short: false,
            },
          ],
          footer: 'DoxieGuard - Smart Certificate Management',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    await axios.post(webhookUrl, payload);
    console.log('✅ Slack notification sent');
    return true;
  } catch (error) {
    console.error('❌ Slack notification failed:', error);
    return false;
  }
};

// Microsoft Teams notification
export const sendTeamsNotification = async (
  title: string,
  message: string,
  options?: {
    webhookUrl?: string;
    color?: string;
  }
): Promise<boolean> => {
  const webhookUrl = options?.webhookUrl || process.env.TEAMS_WEBHOOK_URL;

  if (!webhookUrl) {
    console.log('⚠️ Teams webhook URL not configured');
    return false;
  }

  try {
    const payload = {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor: options?.color || '0078D4',
      summary: title,
      sections: [
        {
          activityTitle: title,
          activitySubtitle: 'DoxieGuard Alert',
          facts: [
            {
              name: 'Message',
              value: message,
            },
            {
              name: 'Timestamp',
              value: new Date().toISOString(),
            },
          ],
          markdown: true,
        },
      ],
    };

    await axios.post(webhookUrl, payload);
    console.log('✅ Teams notification sent');
    return true;
  } catch (error) {
    console.error('❌ Teams notification failed:', error);
    return false;
  }
};

// Email templates
export const emailTemplates = {
  certificateExpiring: (cert: any) => ({
    subject: `⚠️ Certificate Expiring: ${cert.domain}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #f59e0b;">⚠️ Certificate Expiring Soon</h1>
        
        <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h2 style="margin: 0 0 10px 0;">${cert.domain}</h2>
          <p style="margin: 5px 0;"><strong>Expires:</strong> ${new Date(cert.expiresAt).toLocaleDateString()}</p>
          <p style="margin: 5px 0;"><strong>Days Left:</strong> ${cert.daysLeft}</p>
          <p style="margin: 5px 0;"><strong>Status:</strong> ${cert.status}</p>
        </div>
        
        <p>DoxieGuard detected that this certificate will expire soon. Please take action to renew it.</p>
        
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/certificates/${cert.id}" 
           style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
          View Certificate
        </a>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        
        <p style="color: #6b7280; font-size: 12px;">
          This is an automated message from <strong>DoxieGuard</strong>.<br>
          Smart Certificate Management for modern infrastructure.
        </p>
      </div>
    `,
  }),

  certificateExpired: (cert: any) => ({
    subject: `🔴 Certificate Expired: ${cert.domain}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #ef4444;">🔴 Certificate Expired!</h1>
        
        <div style="background: #fee2e2; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h2 style="margin: 0 0 10px 0;">${cert.domain}</h2>
          <p style="margin: 5px 0;"><strong>Expired:</strong> ${new Date(cert.expiresAt).toLocaleDateString()}</p>
          <p style="margin: 5px 0;"><strong>Status:</strong> CRITICAL</p>
        </div>
        
        <p style="color: #ef4444; font-weight: bold;">
          ⚠️ URGENT: This certificate has expired and needs immediate attention!
        </p>
        
        <p>This could cause service disruptions, security warnings, or complete failure for HTTPS connections.</p>
        
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/certificates/${cert.id}" 
           style="background: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Renew Certificate Now
        </a>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        
        <p style="color: #6b7280; font-size: 12px;">
          This is an automated message from <strong>DoxieGuard</strong>.<br>
          Smart Certificate Management for modern infrastructure.
        </p>
      </div>
    `,
  }),

  alphaReportReceived: (report: any) => ({
    subject: `📊 Alpha Report Received: ${report.hostname}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #667eea;">📊 New Alpha Client Report</h1>
        
        <div style="background: #f3e8ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h2 style="margin: 0 0 10px 0;">Client Information</h2>
          <p style="margin: 5px 0;"><strong>Hostname:</strong> ${report.hostname || 'Unknown'}</p>
          <p style="margin: 5px 0;"><strong>User:</strong> ${report.username || 'Unknown'}</p>
          <p style="margin: 5px 0;"><strong>Timestamp:</strong> ${new Date(report.timestamp).toLocaleString()}</p>
          <p style="margin: 5px 0;"><strong>Certificates Found:</strong> ${report.certificates?.length || 0}</p>
        </div>
        
        <h3>Certificate Summary:</h3>
        <ul>
          <li><strong>Healthy:</strong> ${report.certificates?.filter((c: any) => c.Status === 'HEALTHY').length || 0}</li>
          <li><strong>Warning:</strong> ${report.certificates?.filter((c: any) => c.Status === 'WARNING').length || 0}</li>
          <li><strong>Critical:</strong> ${report.certificates?.filter((c: any) => c.Status === 'CRITICAL' || c.Status === 'EXPIRED').length || 0}</li>
        </ul>
        
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/alpha-reports" 
           style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
          View Full Report
        </a>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        
        <p style="color: #6b7280; font-size: 12px;">
          This is an automated message from <strong>DoxieGuard Alpha Program</strong>.<br>
          Thank you for participating in our Alpha testing!
        </p>
      </div>
    `,
  }),
};

// Main notification function
export const sendNotification = async (
  type: 'email' | 'slack' | 'teams' | 'webhook',
  target: string,
  template: any
): Promise<boolean> => {
  switch (type) {
    case 'email':
      return await sendEmail(target, template.subject, template.html);

    case 'slack':
      return await sendSlackNotification(template.subject);

    case 'teams':
      return await sendTeamsNotification(template.subject, template.html);

    default:
      console.error(`Unknown notification type: ${type}`);
      return false;
  }
};

// Check expiring certificates and send notifications
export const checkAndNotifyExpirations = async () => {
  console.log('🔔 Checking certificate expirations...');

  const now = new Date();

  // Get all certificates
  const certs = await prisma.certificate.findMany({
    where: { status: { not: 'EXPIRED' } },
    include: { asset: true },
  });

  for (const cert of certs) {
    const expiresAt = new Date(cert.expiresAt);
    const diff = expiresAt.getTime() - now.getTime();
    const daysLeft = Math.ceil(diff / (1000 * 3600 * 24));

    // Update daysLeft in database
    await prisma.certificate.update({
      where: { id: cert.id },
      data: { daysLeft },
    });

    // Define notification milestones
    const milestones = {
      90: '90-day-warning',
      30: '30-day-warning',
      15: '15-day-warning',
      7: '7-day-warning',
      1: '1-day-warning',
    };

    if (daysLeft <= 0) {
      // Certificate expired
      if (cert.status !== 'EXPIRED') {
        await prisma.certificate.update({
          where: { id: cert.id },
          data: { status: 'EXPIRED' },
        });

        // Send expired notification
        const template = emailTemplates.certificateExpired({ ...cert, daysLeft });
        await sendWebhook('certificate.expired', {
          event: 'certificate.expired',
          timestamp: new Date().toISOString(),
          data: { certificate: cert },
        });

        if (process.env.ADMIN_EMAIL) {
          await sendEmail(process.env.ADMIN_EMAIL, template.subject, template.html);
        }
      }
    } else if (milestones[daysLeft as keyof typeof milestones]) {
      // Certificate approaching expiration
      const template = emailTemplates.certificateExpiring({ ...cert, daysLeft });

      // Send webhook notification
      await sendWebhook(milestones[daysLeft as keyof typeof milestones], {
        event: milestones[daysLeft as keyof typeof milestones],
        timestamp: new Date().toISOString(),
        data: { certificate: cert, daysLeft },
      });

      // Send email to admin
      if (process.env.ADMIN_EMAIL) {
        await sendEmail(process.env.ADMIN_EMAIL, template.subject, template.html);
      }

      // Send Slack notification if configured
      await sendSlackNotification(
        `⚠️ Certificate expiring in ${daysLeft} days: ${cert.domain}`
      );
    }
  }

  console.log('✅ Expiration check completed');
};

// Process Alpha client report
export const processAlphaReport = async (report: {
  timestamp: string;
  hostname: string;
  username?: string;
  certificates: any[];
}) => {
  console.log('📥 Processing Alpha client report...');

  // Store report in database (you'll need to create an AlphaReport model)
  // For now, just log it
  console.log('Alpha Report:', JSON.stringify(report, null, 2));

  // Send webhook for new alpha report
  await sendWebhook('alpha.report.received', {
    event: 'alpha.report.received',
    timestamp: new Date().toISOString(),
    data: report,
    metadata: {
      source: 'alpha-client',
      hostname: report.hostname,
    },
  });

  // Send email notification to admin
  const template = emailTemplates.alphaReportReceived(report);
  if (process.env.ADMIN_EMAIL) {
    await sendEmail(process.env.ADMIN_EMAIL, template.subject, template.html);
  }

  // Send Slack notification
  await sendSlackNotification(
    `📊 New Alpha Report from ${report.hostname}: ${report.certificates.length} certificates found`
  );

  console.log('✅ Alpha report processed successfully');
};
