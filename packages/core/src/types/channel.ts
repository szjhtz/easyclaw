export interface ChannelConfig {
  id: string;
  channelType: string;
  enabled: boolean;
  accountId: string;
  settings: Record<string, unknown>;
}
