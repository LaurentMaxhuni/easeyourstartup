import type { Metadata, Viewport } from "next";
import "@/app/globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "EaseYourStartup | Turn every ship into a campaign",
    template: "%s | EaseYourStartup",
  },
  description:
    "Source-backed launch copy and screenshot-faithful visuals for every product update.",
  openGraph: {
    title: "EaseYourStartup",
    description: "Turn every ship into a campaign.",
    type: "website",
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f3ef" },
    { media: "(prefers-color-scheme: dark)", color: "#111411" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
