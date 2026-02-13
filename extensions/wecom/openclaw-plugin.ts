import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

const plugin = {
  id: "wecom",
  name: "WeCom",
  description: "WeChat channel via WeCom Customer Service",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    api.registerChannel({
      plugin: {
        id: "wechat",
        meta: {
          id: "wechat",
          label: "WeChat",
          selectionLabel: "WeChat (微信)",
          docsPath: "/channels/wechat",
          blurb: "WeChat messaging via WeCom Customer Service relay.",
          aliases: ["wecom"],
        },
        capabilities: {
          chatTypes: ["direct"],
        },
        config: {
          listAccountIds: () => [],
          resolveAccount: () => null,
        },
      },
    });
  },
};

export default plugin;
