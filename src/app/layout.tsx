import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ARENA — Private Gaming Platform",
    template: "%s · ARENA",
  },
  description:
    "A private gaming platform for the crew. Earn ARC, play games, climb the leaderboard. ARC is virtual currency with no real-world value.",
};

export const viewport: Viewport = {
  themeColor: "#07080d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
