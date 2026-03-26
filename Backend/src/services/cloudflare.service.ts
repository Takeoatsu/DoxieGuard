// Native Cloudflare DNS API v4 - ZERO dependencies
// Token scope: Zone:DNS:Edit

export class CloudflareService {
  private readonly apiToken: string;
  private readonly headers: HeadersInit;

  constructor() {
    if (!process.env.CLOUDFLARE_API_TOKEN) {
      throw new Error('CLOUDFLARE_API_TOKEN missing from .env');
    }
    
    this.apiToken = process.env.CLOUDFLARE_API_TOKEN!;
    this.headers = {
      'Authorization': `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json'
    };
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const url = `https://api.cloudflare.com/client/v4${endpoint}`;
    const res = await fetch(url, {
      ...options,
      headers: { ...this.headers, ...options.headers }
    });
    
    if (!res.ok) {
      const error = await res.json();
      throw new Error(`${res.status}: ${error.errors?.[0]?.message || res.statusText}`);
    }
    
    return res.json();
  }

  async getZoneId(domain: string): Promise<string> {
    console.log('🔍 [CLOUDFLARE] Finding zone for:', domain);
    
    const zones = await this.request('/zones');
    
    for (const zone of zones.result) {
      if (domain.endsWith('.' + zone.name) || zone.name === domain) {
        console.log(`✅ Zone found: ${zone.name} -> ${zone.id}`);
        return zone.id;
      }
    }
    
    throw new Error(`❌ No Cloudflare zone found for ${domain}`);
  }

  async createTxtRecord(zoneId: string, domain: string, txtValue: string): Promise<void> {
    const recordName = `_acme-challenge.${domain}`;
    
    console.log(`📝 Creating TXT: ${recordName}="${txtValue}"`);
    
    await this.request(`/zones/${zoneId}/dns_records`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'TXT',
        name: recordName,
        content: txtValue,
        ttl: 60,
        proxied: false
      })
    });
    
    console.log(`✅ TXT record creado: _acme-challenge.${domain}`);
  }

  async deleteTxtRecord(zoneId: string, domain: string): Promise<void> {
    const recordName = `_acme-challenge.${domain}`;
    
    const records = await this.request(`/zones/${zoneId}/dns_records?type=TXT&name=${recordName}`);
    
    for (const record of records.result) {
      await this.request(`/zones/${zoneId}/dns_records/${record.id}`, { method: 'DELETE' });
    }
    
    console.log(`🗑️ Cleanup TXT: _acme-challenge.${domain}`);
  }

  async verifyPropagation(domain: string, txtValue: string, maxAttempts = 12): Promise<boolean> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Real DNS lookup (simplified)
        const lookup = await fetch(`https://dns.google/resolve?name=_acme-challenge.${domain}&type=TXT`);
        const dns = await lookup.json();
        
        if (dns.Answer?.some((r: any) => r.data.includes(txtValue))) {
          console.log(`✅ DNS propagation confirmed after ${attempt} attempts`);
          return true;
        }
      } catch {}
      
      console.log(`⏳ Propagation check ${attempt}/${maxAttempts}...`);
      await new Promise(r => setTimeout(r, 30000)); // 30s
    }
    
    throw new Error('DNS propagation timeout');
  }
}
