import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlowDesk — Tu productividad en WhatsApp",
  description: "Gestiona tareas, agenda y diario personal desde WhatsApp. Conectado a Google Calendar.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full">
      <body className="min-h-full flex flex-col antialiased">{children}</body>
    </html>
  );
}
