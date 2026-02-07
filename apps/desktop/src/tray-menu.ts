import { Menu } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import type { GatewayState } from "@easyclaw/gateway";

/** Human-readable labels for each gateway state. */
const STATE_LABELS: Record<GatewayState, string> = {
  running: "Gateway: Running",
  starting: "Gateway: Starting...",
  stopping: "Gateway: Stopping...",
  stopped: "Gateway: Stopped",
};

/** Callbacks wired into the tray context menu. */
export interface TrayMenuCallbacks {
  onOpenPanel: () => void;
  onRestartGateway: () => void;
  onQuit: () => void;
}

/**
 * Build the tray context menu.
 *
 * The menu displays the current gateway status (as a disabled label),
 * followed by action items: Open Panel, Restart Gateway, and Quit.
 */
export function buildTrayMenu(
  state: GatewayState,
  callbacks: TrayMenuCallbacks,
): Menu {
  const isTransitioning = state === "starting" || state === "stopping";

  const template: MenuItemConstructorOptions[] = [
    {
      label: STATE_LABELS[state],
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Open Panel",
      click: callbacks.onOpenPanel,
      enabled: state === "running",
    },
    { type: "separator" },
    {
      label: "Restart Gateway",
      click: callbacks.onRestartGateway,
      enabled: !isTransitioning,
    },
    { type: "separator" },
    {
      label: "Quit EasyClaw",
      click: callbacks.onQuit,
    },
  ];

  return Menu.buildFromTemplate(template);
}
