import { z } from "zod";

export const routingSchema = z.object({
  name: z.string().trim().min(1).max(100),
  isDefault: z.boolean().default(false),
  routes: z.array(z.object({
    modelAlias: z.string().trim().min(1).max(100),
    connectionId: z.string().uuid(),
    upstreamModel: z.string().trim().min(1).max(200),
    priority: z.number().int().min(0).max(1000),
  })).min(1).max(100),
}).refine(({ routes }) => new Set(routes.map((route) => JSON.stringify([route.modelAlias, route.priority]))).size === routes.length);

export type RoutingInput = z.infer<typeof routingSchema>;
export type RoutingConfig = { id: string; name: string; is_default: boolean; routes: RoutingInput["routes"] };
