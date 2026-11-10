import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "一一妈咪好物团 · 订单工作台",
  description: "Yiyi Shipping Assistant — Next.js migration",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
