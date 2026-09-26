import { z } from "zod";

import { stageEnum } from "./case";

// D-10: every /search query param is whitelisted through Zod before it ever
// reaches a Prisma where clause. Each field independently falls back via
// .catch() so one malformed param never rejects the whole query — the page
// renders as if that param were absent (never a 400, never a raw passthrough).
export const searchParamsSchema = z.object({
  q: z.string().trim().max(200).optional().catch(undefined),
  stage: stageEnum.optional().catch(undefined),
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
  // No .optional() here: an absent `page` key must ALSO default to 1, not
  // remain undefined — .catch() only fires when the inner schema throws,
  // which .optional() would short-circuit for a genuinely-missing key.
  page: z.coerce.number().int().min(1).catch(1),
});

export type SearchParamsInput = z.infer<typeof searchParamsSchema>;

// D-07: Case.createdAt is a UTC instant (TIMESTAMP(3), written via
// Prisma's new Date()); from/to are IST calendar-day boundaries typed into
// native <input type="date"> fields. India Standard Time is a fixed
// UTC+5:30 offset (no DST), so a literal "+05:30" suffix on the ISO date
// string is enough — no timezone library needed (RESEARCH.md Pattern 3).
// Pure function: no Prisma/Next import, unit-testable under plain node:test.
export function computeInclusiveIstRange(
  from: string | undefined,
  to: string | undefined,
): { gte?: Date; lte?: Date } {
  const range: { gte?: Date; lte?: Date } = {};
  if (from) {
    range.gte = new Date(`${from}T00:00:00.000+05:30`);
  }
  if (to) {
    range.lte = new Date(`${to}T23:59:59.999+05:30`);
  }
  return range;
}
