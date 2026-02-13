import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skive — Video Meetings, Simplified",
  description:
    "Start or join a video meeting in seconds. Collaborate with a built-in whiteboard powered by Excalidraw.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
