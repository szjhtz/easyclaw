import { useState } from "react";
import { Layout } from "./layout/Layout.js";
import { RulesPage } from "./pages/RulesPage.js";
import { ProvidersPage } from "./pages/ProvidersPage.js";
import { ChannelsPage } from "./pages/ChannelsPage.js";
import { PermissionsPage } from "./pages/PermissionsPage.js";
import { UsagePage } from "./pages/UsagePage.js";

const PAGES: Record<string, () => JSX.Element> = {
  "/": RulesPage,
  "/providers": ProvidersPage,
  "/channels": ChannelsPage,
  "/permissions": PermissionsPage,
  "/usage": UsagePage,
};

export function App() {
  const [currentPath, setCurrentPath] = useState("/");

  const PageComponent = PAGES[currentPath] ?? RulesPage;

  return (
    <Layout currentPath={currentPath} onNavigate={setCurrentPath}>
      <PageComponent />
    </Layout>
  );
}
