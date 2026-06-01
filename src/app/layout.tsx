import type { Metadata } from "next";
import "highlight.js/styles/github.css";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "PRD Hub - 产品需求托管平台",
  description: "AI 时代的 PRD 工作台 - MD 渲染、HTML 原型、版本管理、行级评论",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
