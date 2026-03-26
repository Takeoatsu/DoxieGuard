// test-dns.ts
import axios from 'axios';
import "dotenv/config";

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;

if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ZONE_ID) {
  console.error('❌ Cloudflare credentials missing. Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID in .env');
  process.exit(1);
}

async function testCloudflare() {
  console.log("🚀 Iniciando prueba de conexión con Cloudflare...");

  try {
    const response = await axios.post(
      `https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records`,
      {
        type: 'TXT',
        name: '_acme-challenge-test',
        content: 'doxie-check-123',
        ttl: 60,
      },
      {
        headers: {
          'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.success) {
      console.log('✅ ¡ÉXITO! Registro creado en Cloudflare.');
      console.log('🔗 ID del registro:', response.data.result.id);
    } else {
      console.error('❌ Error en la respuesta de Cloudflare:', response.data.errors);
    }
  } catch (error: any) {
    console.error('❌ Error al conectar con Cloudflare:');
    console.error(error.response?.data || error.message);
  }
}

testCloudflare();