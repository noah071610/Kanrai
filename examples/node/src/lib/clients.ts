// Stand-ins for the Prisma client and third-party SDKs, so the example reads
// like real code without a database or API keys. Every call resolves to null.
const stub: any = new Proxy(async () => null, { get: () => stub })

export const db: any = stub
export const stripe: any = stub
export const mailgun: any = stub
export const fcm: any = stub
