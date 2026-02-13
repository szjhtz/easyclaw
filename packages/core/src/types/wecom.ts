export type WeComBindingStatus = "pending" | "bound" | "active" | "error";

export type WeComAccountConfig = {
  corpId: string;
  relayUrl: string;
  bindingStatus: WeComBindingStatus;
};

export type WeComRelayMessage = {
  externalUserId: string;
  msgType: string;
  content: string;
  timestamp: number;
};
