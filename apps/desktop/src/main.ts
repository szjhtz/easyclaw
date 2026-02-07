import { app, Tray, Menu, nativeImage } from "electron";
import { createLogger } from "@easyclaw/logger";

const log = createLogger("desktop");

app.dock?.hide();

app.whenReady().then(() => {
  log.info("EasyClaw desktop starting");

  const icon = nativeImage.createEmpty();
  const tray = new Tray(icon);
  tray.setToolTip("EasyClaw");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open Panel",
      click: () => {
        log.info("Open Panel clicked");
      },
    },
    { type: "separator" },
    {
      label: "Restart Gateway",
      click: () => {
        log.info("Restart Gateway clicked");
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  log.info("EasyClaw desktop ready");
});
