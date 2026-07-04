import { gcm } from "@noble/ciphers/aes.js";

// --- RSA Key Handling ---

export async function deserializePrivateKey(b64: string): Promise<CryptoKey> {
  const der = Buffer.from(b64, "base64");
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["decrypt"],
  );
}

export async function extractPublicKeyBase64(
  privateKey: CryptoKey,
): Promise<string> {
  const jwk = await crypto.subtle.exportKey("jwk", privateKey);
  const pubJwk = { ...jwk, d: undefined, dp: undefined, dq: undefined, qi: undefined, key_ops: ["encrypt"] };
  const pubKey = await crypto.subtle.importKey(
    "jwk",
    pubJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"],
  );
  const spki = await crypto.subtle.exportKey("spki", pubKey);
  return Buffer.from(spki).toString("base64");
}

// --- Decryption ---

export async function decryptDek(
  dekWrapped: string,
  privateKey: CryptoKey,
): Promise<string> {
  const dekEncrypted = Buffer.from(dekWrapped, "base64");
  const dekBytes = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    dekEncrypted,
  );
  return Buffer.from(dekBytes).toString("base64");
}

export function decryptSecret(valueEncrypted: string, dek: string): string {
  const [iv, ciphertext] = valueEncrypted.split(";");
  if (iv == null || ciphertext == null) {
    throw new Error("Invalid encrypted secret format");
  }
  const ivBytes = Buffer.from(iv, "base64");
  const ciphertextBytes = Buffer.from(ciphertext, "base64");
  const dekBytes = Buffer.from(dek, "base64");
  const cipher = gcm(dekBytes, ivBytes);
  const plaintext = cipher.decrypt(ciphertextBytes);
  return new TextDecoder().decode(plaintext);
}

// --- API Client ---

interface FetchSecretOptions {
  baseUrl: string;
  environmentId: string;
  privateKey: CryptoKey;
  publicKeyBase64: string;
  key: string;
}

export async function fetchSecret(opts: FetchSecretOptions): Promise<string> {
  const { baseUrl, environmentId, privateKey, publicKeyBase64, key } = opts;
  const url = `${baseUrl}/api/v1/environments/${environmentId}/secrets/${key}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${publicKeyBase64}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch secret "${key}": ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as {
    key: string;
    valueEncrypted: string;
    dekWrappedByClientPublicKey: string;
  };
  const dek = await decryptDek(data.dekWrappedByClientPublicKey, privateKey);
  return decryptSecret(data.valueEncrypted, dek);
}

export async function loadSecrets<K extends string>(opts: {
  baseUrl: string;
  environmentId: string;
  privateKeyBase64: string;
  keys: readonly K[];
}): Promise<Record<K, string>> {
  const privateKey = await deserializePrivateKey(opts.privateKeyBase64);
  const publicKeyBase64 = await extractPublicKeyBase64(privateKey);
  const entries = await Promise.all(
    opts.keys.map(async (key) => {
      const value = await fetchSecret({
        baseUrl: opts.baseUrl,
        environmentId: opts.environmentId,
        privateKey,
        publicKeyBase64,
        key,
      });
      return [key, value] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<K, string>;
}
