import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Layout } from "./layout/Layout.js";
import { RulesPage } from "./pages/RulesPage.js";
import { ProvidersPage } from "./pages/ProvidersPage.js";
import { ChannelsPage } from "./pages/ChannelsPage.js";
import { PermissionsPage } from "./pages/PermissionsPage.js";
import { UsagePage } from "./pages/UsagePage.js";
import { OnboardingPage } from "./pages/OnboardingPage.js";
import { fetchSettings } from "./api.js";

const PAGES: Record<string, () => ReactNode> = {
  "/": RulesPage,
  "/providers": ProvidersPage,
  "/channels": ChannelsPage,
  "/permissions": PermissionsPage,
  "/usage": UsagePage,
};

export function App() {
  const { t } = useTranslation();
  const [currentPath, setCurrentPath] = useState("/");
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    checkOnboarding();
  }, []);

  async function checkOnboarding() {
    try {
      const settings = await fetchSettings();
      const provider = settings["llm-provider"];
      // API keys are masked to "configured" by the server when present
      const hasApiKey = provider
        ? settings[`${provider}-api-key`] === "configured"
        : false;

      // Show onboarding until a provider with a valid API key is configured
      setShowOnboarding(!hasApiKey);
    } catch {
      setShowOnboarding(false);
    }
  }

  function handleOnboardingComplete() {
    setShowOnboarding(false);
    setCurrentPath("/");
  }

  if (showOnboarding === null) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#888",
        }}
      >
        {t("common.loading")}
      </div>
    );
  }

  if (showOnboarding) {
    return <OnboardingPage onComplete={handleOnboardingComplete} />;
  }

  const PageComponent = PAGES[currentPath] ?? RulesPage;
  return (
    <Layout currentPath={currentPath} onNavigate={setCurrentPath}>
      <PageComponent />
    </Layout>
  );
}
