/**
 * Base64 in both directions, without `atob`/`btoa`.
 *
 * `expo-file-system`'s legacy reader and writer both speak base64, which makes
 * it the transport for reading a bounded window of a file and for writing an
 * extracted picture back out. `atob`/`btoa` are not reliably present in Hermes,
 * so the codec is hand-rolled — and kept in one place so the reader and the
 * writer cannot disagree about padding.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const LOOKUP = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let index = 0; index < ALPHABET.length; index += 1) {
    table[ALPHABET.charCodeAt(index)] = index;
  }
  return table;
})();

export function decodeBase64(input: string): Uint8Array {
  const clean = input.replace(/[^A-Za-z0-9+/]/g, "");
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let written = 0;
  let buffer = 0;
  let bits = 0;

  for (let index = 0; index < clean.length; index += 1) {
    const value = LOOKUP[clean.charCodeAt(index)];
    if (value < 0) {
      continue;
    }
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[written] = (buffer >> bits) & 0xff;
      written += 1;
    }
  }

  return bytes.subarray(0, written);
}

export function encodeBase64(bytes: Uint8Array): string {
  let out = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const remaining = bytes.length - index;
    const chunk =
      ((bytes[index] ?? 0) << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0);
    out += ALPHABET[(chunk >> 18) & 0x3f];
    out += ALPHABET[(chunk >> 12) & 0x3f];
    out += remaining > 1 ? ALPHABET[(chunk >> 6) & 0x3f] : "=";
    out += remaining > 2 ? ALPHABET[chunk & 0x3f] : "=";
  }
  return out;
}
