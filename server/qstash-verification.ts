export type QStashVerifier = {
  verify(request: { signature: string | null; body: string; url: string }): Promise<boolean>;
};

// Reads the body of a QStash delivery and checks its signature for this exact
// URL. Returns the body, or null when the signature does not verify; the
// caller picks its own refusal response.
export const readVerifiedBody = async (
  request: Request,
  { verifier, url }: { verifier: QStashVerifier; url: string },
) => {
  const body = await request.text();
  const signature = request.headers.get("upstash-signature");
  return (await verifier.verify({ signature, body, url })) ? body : null;
};
