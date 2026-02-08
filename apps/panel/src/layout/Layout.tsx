import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function Layout({
  children,
  currentPath,
  onNavigate,
}: {
  children: ReactNode;
  currentPath: string;
  onNavigate: (path: string) => void;
}) {
  const { t, i18n } = useTranslation();

  const NAV_ITEMS = [
    { path: "/", label: t("nav.rules") },
    { path: "/providers", label: t("nav.providers") },
    { path: "/channels", label: t("nav.channels") },
    { path: "/permissions", label: t("nav.permissions") },
    { path: "/usage", label: t("nav.usage") },
  ];

  function toggleLang() {
    i18n.changeLanguage(i18n.language === "zh" ? "en" : "zh");
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <nav
        style={{
          width: 220,
          padding: 16,
          borderRight: "1px solid #e0e0e0",
          backgroundColor: "#fafafa",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>{t("common.brandName")}</h2>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, flex: 1 }}>
          {NAV_ITEMS.map((item) => (
            <li key={item.path} style={{ marginBottom: 4 }}>
              <button
                onClick={() => onNavigate(item.path)}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "8px 12px",
                  border: "none",
                  borderRadius: 4,
                  textAlign: "left",
                  cursor: "pointer",
                  backgroundColor:
                    currentPath === item.path ? "#e3f2fd" : "transparent",
                  fontWeight: currentPath === item.path ? 600 : 400,
                  fontSize: 14,
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            padding: "12px 24px 0",
          }}
        >
          <button
            onClick={toggleLang}
            style={{
              padding: "4px 12px",
              border: "1px solid #e0e0e0",
              borderRadius: 4,
              backgroundColor: "transparent",
              cursor: "pointer",
              fontSize: 13,
              color: "#555",
            }}
          >
            {i18n.language === "zh" ? "English" : "中文"}
          </button>
        </div>
        <main style={{ flex: 1, padding: "12px 24px 24px" }}>{children}</main>
      </div>
    </div>
  );
}
