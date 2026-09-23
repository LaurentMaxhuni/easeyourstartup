import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://easeyourstartup.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard", "/studio", "/settings/", "/checkout", "/render/"],
    },
    sitemap: new URL("/sitemap.xml", siteUrl).toString(),
  };
}
