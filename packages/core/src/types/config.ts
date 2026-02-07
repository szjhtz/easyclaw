import { z } from "zod/v4";

export const easyClawConfigSchema = z.object({
  region: z.string(),
  language: z.string(),
  gatewayVersion: z.string(),
  panelPort: z.number().int().min(1024).max(65535),
});

export type EasyClawConfig = z.infer<typeof easyClawConfigSchema>;
