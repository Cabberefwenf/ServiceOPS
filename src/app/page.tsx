import { ServiceOpsApp } from "@/components/ServiceOpsApp";
import { siteConfig } from "./site";

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: siteConfig.name,
  url: siteConfig.url,
  description: siteConfig.description,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Modern web browser",
  isAccessibleForFree: true,
  creator: {
    "@type": "Organization",
    name: "Veldarium Worth",
    url: siteConfig.portfolioUrl,
  },
  featureList: [
    "Validated work-order lifecycle",
    "Constraint-aware technician scheduling",
    "Parts reservation and inventory readiness",
    "SLA and business-calendar calculations",
    "Invoice and partial-payment tracking",
    "Human-approved automation receipts",
    "Reversible operational disruption scenarios",
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
      <ServiceOpsApp />
    </>
  );
}
