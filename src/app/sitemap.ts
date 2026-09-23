import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://easeyourstartup.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return ["/", "/pricing", "/help", "/bot"].map((path) => ({
    url: new URL(path, siteUrl).toString(),
    lastModified,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.6,
  }));
}
