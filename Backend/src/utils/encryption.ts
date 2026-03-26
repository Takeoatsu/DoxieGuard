/**
 * Encryption Utilities
 * Manejo seguro de credenciales encriptadas
 */

import crypto from "crypto";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "default-key-change-in-production-32b";
const IV_LENGTH = 16;
const ALGORITHM = "aes-256-cbc";

/**
 * Encripta un texto usando AES-256-CBC
 */
export function encrypt(text: string): string {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY),
      iv
    );

    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    // Retornar IV + encrypted data como string hexadecimal
    return iv.toString("hex") + ":" + encrypted.toString("hex");
  } catch (error) {
    console.error("❌ Encryption error:", error);
    throw new Error("Failed to encrypt data");
  }
}

/**
 * Desencripta un texto encriptado
 */
export function decrypt(text: string): string {
  try {
    const parts = text.split(":");
    if (parts.length !== 2) {
      throw new Error("Invalid encrypted text format");
    }

    const iv = Buffer.from(parts[0], "hex");
    const encryptedText = Buffer.from(parts[1], "hex");

    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY),
      iv
    );

    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString();
  } catch (error) {
    console.error("❌ Decryption error:", error);
    throw new Error("Failed to decrypt data");
  }
}

/**
 * Genera una clave de encriptación aleatoria
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Valida que una clave de encriptación sea válida
 */
export function isValidEncryptionKey(key: string): boolean {
  try {
    // Debe ser de 64 caracteres hexadecimales (32 bytes)
    if (key.length !== 64) {
      return false;
    }

    // Debe ser solo caracteres hexadecimales
    return /^[0-9a-fA-F]{64}$/.test(key);
  } catch (error) {
    return false;
  }
}

/**
 * Encripta credenciales AWS
 */
export function encryptAWSCredentials(credentials: {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}): string {
  return encrypt(JSON.stringify(credentials));
}

/**
 * Desencripta credenciales AWS
 */
export function decryptAWSCredentials(encryptedCredentials: string): {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
} {
  const decrypted = decrypt(encryptedCredentials);
  return JSON.parse(decrypted);
}

/**
 * Encripta credenciales de cualquier proveedor cloud
 */
export function encryptCloudCredentials(credentials: any): string {
  return encrypt(JSON.stringify(credentials));
}

/**
 * Desencripta credenciales de cualquier proveedor cloud
 */
export function decryptCloudCredentials(encryptedCredentials: string): any {
  const decrypted = decrypt(encryptedCredentials);
  return JSON.parse(decrypted);
}
