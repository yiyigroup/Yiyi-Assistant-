import { z } from "zod";

/** Shared schema — confirm must be literal true; at least one status field required. */
export const orderStatusBodySchema = z
  .object({
    opId: z.string().min(8).max(120),
    sourceTab: z.string(),
    sourceRow: z.number().int().positive(),
    expectedFingerprint: z.string().min(16),
    arrival: z.string().max(200).optional(),
    payment: z.string().max(200).optional(),
    confirm: z.literal(true),
  })
  .refine((d) => d.arrival !== undefined || d.payment !== undefined, {
    message: "At least one of arrival or payment is required",
  });

export type OrderStatusBody = z.infer<typeof orderStatusBodySchema>;
