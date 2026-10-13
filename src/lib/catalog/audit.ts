import { prisma } from "./db";

export async function logAudit(action: string, opts: { batchId?: string | null; userId?: string | null; details?: unknown } = {}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action,
      batchId: opts.batchId ?? null,
      userId: opts.userId ?? null,
      details: JSON.stringify(opts.details ?? {}),
    },
  });
}
