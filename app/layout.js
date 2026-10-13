import "./globals.css";
import { Suspense } from "react";
import NavProgress from "./NavProgress";

export const metadata = { title: "Reklama va lidlar paneli" };

export default function RootLayout({ children }) {
  return (
    <html lang="uz">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body><Suspense fallback={null}><NavProgress /></Suspense>{children}</body>
    </html>
  );
}
