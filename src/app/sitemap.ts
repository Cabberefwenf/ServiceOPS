import type { MetadataRoute } from "next";
import { siteConfig } from "./site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteConfig.url,
      lastModified: new Date("2026-10-31T00:00:00.000Z"),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
