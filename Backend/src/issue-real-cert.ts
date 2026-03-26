import "dotenv/config"; // 1. PRIMERO cargamos el .env
import { runAcmeFlow } from './services/acme.service'; // 2. LUEGO importamos la lógica

async function main() {
  try {
    // Esto disparará todo: Cuenta -> DNS -> Validación -> Guardado en DB
    const result = await runAcmeFlow('doxieguard.com');

    console.log("---------------------------------------");
    console.log("🔥 PROCESO COMPLETADO CON ÉXITO 🔥");
    console.log("El certificado ya debería estar en tu DB.");
    console.log("---------------------------------------");
    console.log(`Certificado (preview): ${result.certificate?.substring(0, 80)}...`);
  } catch (e) {
    console.error("La prueba maestra falló.", e);
  }
}

main();