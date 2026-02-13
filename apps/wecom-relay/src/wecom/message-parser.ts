import type { WeComCallbackEvent } from "../types.js";

/**
 * Parse decrypted XML from WeCom callback into a typed event object.
 *
 * WeCom sends XML like:
 * <xml>
 *   <ToUserName><![CDATA[...]]></ToUserName>
 *   <CreateTime>...</CreateTime>
 *   <MsgType><![CDATA[event]]></MsgType>
 *   <Event><![CDATA[kf_msg_or_event]]></Event>
 *   <Token><![CDATA[...]]></Token>
 *   <OpenKfId><![CDATA[...]]></OpenKfId>
 * </xml>
 */
export function parseCallbackXml(xml: string): WeComCallbackEvent {
  const result: Record<string, string> = {};

  // Match both CDATA and plain text values
  const tagRegex = /<(\w+)>(?:<!\[CDATA\[(.*?)\]\]>|([^<]*))<\/\1>/gs;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(xml)) !== null) {
    const tagName = match[1]!;
    const value = match[2] ?? match[3] ?? "";
    result[tagName] = value;
  }

  return {
    ToUserName: result["ToUserName"] ?? "",
    CreateTime: result["CreateTime"] ?? "",
    MsgType: result["MsgType"] ?? "",
    Event: result["Event"],
    Token: result["Token"],
    OpenKfId: result["OpenKfId"],
  };
}

/**
 * Extract the encrypted message body from WeCom POST XML.
 *
 * <xml>
 *   <ToUserName><![CDATA[...]]></ToUserName>
 *   <Encrypt><![CDATA[...]]></Encrypt>
 *   <AgentID><![CDATA[...]]></AgentID>
 * </xml>
 */
export function extractEncryptedBody(xml: string): string {
  const match = /<Encrypt><!\[CDATA\[(.*?)\]\]><\/Encrypt>/s.exec(xml);
  if (!match?.[1]) {
    throw new Error("No <Encrypt> field found in XML body");
  }
  return match[1];
}
