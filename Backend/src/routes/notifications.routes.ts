import { Router } from 'express';
import { 
  sendEmail, 
  registerWebhook, 
  sendWebhook, 
  sendSlackNotification,
  sendTeamsNotification,
  processAlphaReport,
  emailTemplates 
} from '../services/notification.service';

const router = Router();

// ==================== EMAIL ENDPOINTS ====================

// Send test email
router.post('/email/test', async (req, res) => {
  try {
    const { to, subject, message } = req.body;

    if (!to || !subject || !message) {
      return res.status(400).json({ 
        error: 'Missing required fields: to, subject, message' 
      });
    }

    const template = {
      subject,
      html: `<div style="font-family: Arial; padding: 20px;">
        <h1>${subject}</h1>
        <p>${message}</p>
        <p><strong>Sent from DoxieGuard API</strong></p>
      </div>`
    };

    const success = await sendEmail(to, template.subject, template.html);

    if (success) {
      res.json({ success: true, message: 'Email sent successfully' });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to send email. Check email service configuration.' 
      });
    }
  } catch (error) {
    console.error('Email test error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send certificate notification
router.post('/email/certificate/:certId', async (req, res) => {
  try {
    const { certId } = req.params;
    const { to, type } = req.body;

    if (!to || !type) {
      return res.status(400).json({ 
        error: 'Missing required fields: to, type' 
      });
    }

    // Get certificate from database
    const { prisma } = await import('../lib/prisma');
    const cert = await prisma.certificate.findUnique({
      where: { id: certId }
    });

    if (!cert) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    // Generate template based on type
    let template;
    switch (type) {
      case 'expiring':
        template = emailTemplates.certificateExpiring({
          ...cert,
          daysLeft: cert.daysLeft || 0
        });
        break;
      case 'expired':
        template = emailTemplates.certificateExpired({
          ...cert,
          daysLeft: cert.daysLeft || 0
        });
        break;
      default:
        return res.status(400).json({ 
          error: 'Invalid type. Use "expiring" or "expired"' 
        });
    }

    const success = await sendEmail(to, template.subject, template.html);

    res.json({ success, message: success ? 'Email sent' : 'Email failed' });
  } catch (error) {
    console.error('Certificate email error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== WEBHOOK ENDPOINTS ====================

// Register new webhook
router.post('/webhooks', (req, res) => {
  try {
    const { url, events, secret } = req.body;

    if (!url || !events || !Array.isArray(events)) {
      return res.status(400).json({ 
        error: 'Missing required fields: url (string), events (array)' 
      });
    }

    const validEvents = [
      'certificate.expired',
      'certificate.expiring',
      'certificate.renewed',
      'certificate.created',
      'certificate.deleted',
      'alpha.report.received',
      'system.error',
      'system.warning'
    ];

    const invalidEvents = events.filter(e => !validEvents.includes(e));
    if (invalidEvents.length > 0) {
      return res.status(400).json({ 
        error: `Invalid events: ${invalidEvents.join(', ')}`,
        validEvents 
      });
    }

    const webhook = registerWebhook(url, events, { secret });

    res.json({ success: true, webhook });
  } catch (error) {
    console.error('Webhook registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test webhook
router.post('/webhooks/test', async (req, res) => {
  try {
    const { url, secret } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'Missing required field: url' });
    }

    const testPayload = {
      event: 'test.webhook',
      timestamp: new Date().toISOString(),
      data: {
        message: 'This is a test webhook from DoxieGuard',
        version: '1.0.0'
      }
    };

    try {
      const axios = await import('axios');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'DoxieGuard-Webhook/1.0',
        'X-DoxieGuard-Event': 'test.webhook'
      };

      if (secret) {
        const crypto = await import('crypto');
        const signature = crypto
          .createHmac('sha256', secret)
          .update(JSON.stringify(testPayload))
          .digest('hex');
        headers['X-DoxieGuard-Signature'] = signature;
      }

      await axios.default.post(url, testPayload, { headers });

      res.json({ success: true, message: 'Test webhook sent successfully' });
    } catch (webhookError: any) {
      res.status(400).json({ 
        success: false, 
        error: `Webhook test failed: ${webhookError.message}`,
        details: webhookError.response?.data 
      });
    }
  } catch (error) {
    console.error('Webhook test error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Trigger webhook event
router.post('/webhooks/trigger', async (req, res) => {
  try {
    const { event, data } = req.body;

    if (!event) {
      return res.status(400).json({ error: 'Missing required field: event' });
    }

    await sendWebhook(event, {
      event,
      timestamp: new Date().toISOString(),
      data: data || {}
    });

    res.json({ success: true, message: `Webhook triggered for event: ${event}` });
  } catch (error) {
    console.error('Webhook trigger error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== SLACK/TEAMS ENDPOINTS ====================

// Send Slack notification
router.post('/slack', async (req, res) => {
  try {
    const { message, channel } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Missing required field: message' });
    }

    const success = await sendSlackNotification(message, { channel });

    res.json({ success, message: success ? 'Slack message sent' : 'Slack failed' });
  } catch (error) {
    console.error('Slack error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send Teams notification
router.post('/teams', async (req, res) => {
  try {
    const { title, message, color } = req.body;

    if (!title || !message) {
      return res.status(400).json({ 
        error: 'Missing required fields: title, message' 
      });
    }

    const success = await sendTeamsNotification(title, message, { color });

    res.json({ success, message: success ? 'Teams message sent' : 'Teams failed' });
  } catch (error) {
    console.error('Teams error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== ALPHA REPORTS ENDPOINTS ====================

// Receive Alpha client report
router.post('/alpha/reports', async (req, res) => {
  try {
    const report = req.body;

    if (!report.timestamp || !report.hostname || !report.certificates) {
      return res.status(400).json({ 
        error: 'Missing required fields: timestamp, hostname, certificates' 
      });
    }

    // Process the alpha report
    await processAlphaReport(report);

    res.json({ 
      success: true, 
      message: 'Alpha report received and processed',
      reportId: `report_${Date.now()}`
    });
  } catch (error) {
    console.error('Alpha report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get Alpha reports (placeholder for future implementation)
router.get('/alpha/reports', async (req, res) => {
  try {
    // Placeholder - in production, fetch from database
    res.json({ 
      message: 'Alpha reports endpoint',
      note: 'Implement database storage for production'
    });
  } catch (error) {
    console.error('Alpha reports fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== CONFIGURATION ENDPOINTS ====================

// Get notification configuration status
router.get('/config', async (req, res) => {
  try {
    const config = {
      email: {
        resend: !!process.env.RESEND_API_KEY,
        smtp: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
      },
      slack: {
        configured: !!process.env.SLACK_WEBHOOK_URL
      },
      teams: {
        configured: !!process.env.TEAMS_WEBHOOK_URL
      },
      webhooks: {
        count: 0, // Would track registered webhooks
        registered: [] // Would return registered webhooks
      }
    };

    res.json(config);
  } catch (error) {
    console.error('Config fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
