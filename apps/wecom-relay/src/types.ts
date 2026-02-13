/** WebSocket protocol frame types */

export interface HelloFrame {
  type: "hello";
  gateway_id: string;
  auth_token: string;
}

export interface InboundFrame {
  type: "inbound";
  id: string;
  external_user_id: string;
  msg_type: string;
  content: string;
  timestamp: number;
}

export interface ReplyFrame {
  type: "reply";
  id: string;
  external_user_id: string;
  content: string;
}

export interface AckFrame {
  type: "ack";
  id: string;
}

export interface ErrorFrame {
  type: "error";
  message: string;
}

export type WSFrame = HelloFrame | InboundFrame | ReplyFrame | AckFrame | ErrorFrame;

/** Parsed WeCom message types */

export interface WeComTextMessage {
  msgtype: "text";
  external_userid: string;
  text: string;
  msgid: string;
  send_time: number;
  open_kfid: string;
  origin: number;
}

export interface WeComImageMessage {
  msgtype: "image";
  external_userid: string;
  media_id: string;
  msgid: string;
  send_time: number;
  open_kfid: string;
  origin: number;
}

export interface WeComVoiceMessage {
  msgtype: "voice";
  external_userid: string;
  media_id: string;
  msgid: string;
  send_time: number;
  open_kfid: string;
  origin: number;
}

export interface WeComEventMessage {
  msgtype: "event";
  event_type: string;
  external_userid: string;
  open_kfid: string;
  send_time: number;
}

export type WeComMessage =
  | WeComTextMessage
  | WeComImageMessage
  | WeComVoiceMessage
  | WeComEventMessage;

/** Webhook XML event */
export interface WeComCallbackEvent {
  ToUserName: string;
  CreateTime: string;
  MsgType: string;
  Event?: string;
  Token?: string;
  OpenKfId?: string;
}
