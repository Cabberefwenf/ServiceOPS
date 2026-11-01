import { ImageResponse } from "next/og";

export const alt = "ServiceOPS industrial field-service operations command center";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          color: "#f1f7fb",
          background: "linear-gradient(135deg, #040c14 0%, #0a2233 62%, #0c6478 100%)",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 34, fontWeight: 800 }}>
          <span>Service</span><span style={{ color: "#25d2f4", marginLeft: -18 }}>OPS</span>
          <span style={{ color: "#9fb5c6", fontSize: 20, fontWeight: 500 }}>Synthetic public demonstration</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ maxWidth: 960, fontSize: 66, lineHeight: 1.02, letterSpacing: "-2px", fontWeight: 800 }}>
            Industrial service operations, made explainable.
          </div>
          <div style={{ maxWidth: 940, color: "#bdd0dc", fontSize: 27, lineHeight: 1.35 }}>
            Work orders · technician scheduling · parts readiness · SLA risk · service financials · disruption recovery
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", color: "#9fb5c6", fontSize: 20 }}>
          <span>Local-first · validated domain rules · reversible scenarios</span>
          <span>Veldarium Worth portfolio</span>
        </div>
      </div>
    ),
    size,
  );
}
