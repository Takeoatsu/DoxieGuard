import axios from 'axios';
import "dotenv/config";

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;
const RECORD_ID = "c8adc7b8812598185ad01f9c3c9086d2"; // 👈 Pega aquí el ID que te dio la consola

if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ZONE_ID) {
  console.error('❌ Cloudflare credentials missing. Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID in .env');
  process.exit(1);
}

async function deleteRecord() {
  console.log("🧹 Borrando registro de prueba...");
  try {
    const response = await axios.delete(
      `https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${RECORD_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    if (response.data.success) {
      console.log("🗑️ Registro eliminado con éxito.");
    } else {
      console.error("❌ No se pudo eliminar el registro", response.data.errors);
    }
  } catch (error: any) {
    console.error("❌ Error al borrar:", error.response?.data || error.message);
  }
}

deleteRecord();