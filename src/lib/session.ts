import { cookies } from "next/headers";
import { prisma } from "./db";

const COOKIE = "iosbid_sid";

/**
 * Track a visitor for the "N online" and total-visitor counters. A session is
 * counted once, the first time we see it.
 */
export async function touchPresence(): Promise<void> {
  try {
    const jar = await cookies();
    const existing = jar.get(COOKIE)?.value;
    if (!existing) return; // Set by middleware on the next request.

    await prisma.$transaction(async (tx) => {
      const seen = await tx.presence.findUnique({ where: { sessionId: existing } });
      if (seen) {
        await tx.presence.update({
          where: { sessionId: existing },
          data: { lastSeen: new Date() },
        });
        return;
      }
      await tx.presence.create({ data: { sessionId: existing } });
      await tx.siteStat.upsert({
        where: { id: 1 },
        create: { id: 1, totalVisitors: 1 },
        update: { totalVisitors: { increment: 1 } },
      });
    });
  } catch {
    // Presence is decorative; never let it break a page render.
  }
}
