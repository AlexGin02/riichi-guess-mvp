import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Riichi Guess",
  description: "A two-player Riichi Mahjong tenpai guessing MVP"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
