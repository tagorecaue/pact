export interface CryptoResult {
  [key: string]: unknown;
}

export class CryptoPrimitive {
  async execute(
    operation: string,
    params: Record<string, unknown>,
  ): Promise<CryptoResult> {
    switch (operation) {
      case "hmac":
        return this.hmac(params);
      case "hash":
        return this.hash(params);
      case "uuid":
        return this.uuid();
      default:
        throw new Error(`CryptoPrimitive: unknown operation "${operation}"`);
    }
  }

  private async hmac(params: Record<string, unknown>): Promise<CryptoResult> {
    const algorithm = (params.algorithm as string) ?? "sha256";
    const key = params.key as string;
    const data = params.data as string;

    if (!key) throw new Error("CryptoPrimitive.hmac: key is required");
    if (!data) throw new Error("CryptoPrimitive.hmac: data is required");

    const hmac = new Bun.CryptoHasher(algorithm as "sha256" | "sha512" | "sha1" | "md5", key);
    hmac.update(data);
    const signature = hmac.digest("hex");

    return { signature, algorithm };
  }

  private async hash(params: Record<string, unknown>): Promise<CryptoResult> {
    const algorithm = (params.algorithm as string) ?? "sha256";
    const data = params.data as string;

    if (!data) throw new Error("CryptoPrimitive.hash: data is required");

    const hasher = new Bun.CryptoHasher(algorithm as "sha256" | "sha512" | "sha1" | "md5");
    hasher.update(data);
    const hash = hasher.digest("hex");

    return { hash, algorithm };
  }

  private async uuid(): Promise<CryptoResult> {
    const id = crypto.randomUUID();
    return { uuid: id };
  }
}
