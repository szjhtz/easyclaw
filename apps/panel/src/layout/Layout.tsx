import type { ReactNode } from "react";

const NAV_ITEMS = [
  { path: "/", label: "Rules" },
  { path: "/providers", label: "LLM Providers" },
  { path: "/channels", label: "Channels" },
  { path: "/permissions", label: "Permissions" },
  { path: "/usage", label: "Usage" },
];

export function Layout({
  children,
  currentPath,
  onNavigate,
}: {
  children: ReactNode;
  currentPath: string;
  onNavigate: (path: string) => void;
}) {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <nav
        style={{
          width: 220,
          padding: 16,
          borderRight: "1px solid #e0e0e0",
          backgroundColor: "#fafafa",
        }}
      >
        <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>EasyClaw</h2>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
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
      <main style={{ flex: 1, padding: 24 }}>{children}</main>
    </div>
  );
}
