import type { Metadata } from "next";
import "highlight.js/styles/github.css";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "IntentLoop - 需求意图闭环工作台",
  description: "AI 时代的需求评审工作台 - PRD、HTML 原型、版本管理、行级评论",
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
