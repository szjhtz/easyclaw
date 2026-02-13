import { describe, it, expect } from "vitest";
import { parseCallbackXml, extractEncryptedBody } from "../message-parser.js";

describe("parseCallbackXml", () => {
  it("should parse a kf_msg_or_event callback XML", () => {
    const xml = `<xml>
      <ToUserName><![CDATA[wwf6dbf1dfac548c72]]></ToUserName>
      <CreateTime>1409659813</CreateTime>
      <MsgType><![CDATA[event]]></MsgType>
      <Event><![CDATA[kf_msg_or_event]]></Event>
      <Token><![CDATA[ENCApHxnGDNAVNY4AaSJKj4Tb2FW]]></Token>
      <OpenKfId><![CDATA[wkAJ2GCAAASSm4mvM]]></OpenKfId>
    </xml>`;

    const result = parseCallbackXml(xml);

    expect(result.ToUserName).toBe("wwf6dbf1dfac548c72");
    expect(result.CreateTime).toBe("1409659813");
    expect(result.MsgType).toBe("event");
    expect(result.Event).toBe("kf_msg_or_event");
    expect(result.Token).toBe("ENCApHxnGDNAVNY4AaSJKj4Tb2FW");
    expect(result.OpenKfId).toBe("wkAJ2GCAAASSm4mvM");
  });

  it("should parse XML with plain text values (no CDATA)", () => {
    const xml = `<xml>
      <ToUserName>corp123</ToUserName>
      <CreateTime>1609459200</CreateTime>
      <MsgType>text</MsgType>
    </xml>`;

    const result = parseCallbackXml(xml);

    expect(result.ToUserName).toBe("corp123");
    expect(result.CreateTime).toBe("1609459200");
    expect(result.MsgType).toBe("text");
  });

  it("should handle missing optional fields", () => {
    const xml = `<xml>
      <ToUserName><![CDATA[corp]]></ToUserName>
      <CreateTime>123</CreateTime>
      <MsgType><![CDATA[text]]></MsgType>
    </xml>`;

    const result = parseCallbackXml(xml);

    expect(result.Event).toBeUndefined();
    expect(result.Token).toBeUndefined();
    expect(result.OpenKfId).toBeUndefined();
  });

  it("should handle empty XML gracefully", () => {
    const result = parseCallbackXml("<xml></xml>");

    expect(result.ToUserName).toBe("");
    expect(result.MsgType).toBe("");
  });
});

describe("extractEncryptedBody", () => {
  it("should extract the Encrypt field from XML", () => {
    const xml = `<xml>
      <ToUserName><![CDATA[corp123]]></ToUserName>
      <Encrypt><![CDATA[base64encryptedcontent+/=]]></Encrypt>
      <AgentID><![CDATA[1000002]]></AgentID>
    </xml>`;

    const result = extractEncryptedBody(xml);
    expect(result).toBe("base64encryptedcontent+/=");
  });

  it("should throw if Encrypt field is missing", () => {
    const xml = `<xml>
      <ToUserName><![CDATA[corp123]]></ToUserName>
    </xml>`;

    expect(() => extractEncryptedBody(xml)).toThrow("No <Encrypt> field");
  });
});
