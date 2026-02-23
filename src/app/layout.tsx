import type { Metadata } from "next";
import "./globals.css";
import WorkspaceLayout from "@/components/layouts/workspace-layout";

export const metadata: Metadata = {
  title: "Perception",
  description: "AI-powered prediction market terminal",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans" suppressHydrationWarning>
        <WorkspaceLayout>{children}</WorkspaceLayout>
      </body>
    </html>
  );
}
