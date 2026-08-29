const encoder = new TextEncoder()
const subtle = crypto.subtle as SubtleCrypto & {
  timingSafeEqual(a: ArrayBuffer, b: ArrayBuffer): boolean
}

function bytesToBase64(bytes: ArrayBuffer): string {
  let binary = ""
  for (const byte of new Uint8Array(bytes)) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

/** Validate Twilio's HMAC-SHA1 signature over the exact URL and form fields. */
export async function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>,
): Promise<boolean> {
  if (signature === "") return false

  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => `${acc}${key}${params[key]}`, url)
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  )
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(data))
  const expected = encoder.encode(bytesToBase64(digest))
  const presented = encoder.encode(signature)
  return (
    expected.byteLength === presented.byteLength &&
    subtle.timingSafeEqual(
      expected.buffer as ArrayBuffer,
      presented.buffer as ArrayBuffer,
    )
  )
}
