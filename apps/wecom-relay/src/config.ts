import { z } from "zod";

const configSchema = z.object({
  WECOM_CORPID: z.string().min(1),
  WECOM_APP_SECRET: z.string().min(1),
  WECOM_TOKEN: z.string().min(1),
  WECOM_ENCODING_AES_KEY: z.string().length(43),
  WECOM_OPEN_KFID: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  WS_PORT: z.coerce.number().int().positive().default(3001),
  RELAY_AUTH_SECRET: z.string().min(1),
  DATABASE_PATH: z.string().default("./data/relay.db"),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  return configSchema.parse(process.env);
}
