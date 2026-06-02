"use client";

import "../globals.css";
import Navbar from "@/components/navbar";
import Providers from "@/components/providers";
import SideMenu from "@/components/sideMenu";
import { cn } from "@/lib/utils";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>FoloUp</title>
        <meta name="description" content="AI-powered Interviews" />
        <link rel="icon" href="/browser-client-icon.ico" />
      </head>
      <body className={cn(inter.className, "antialiased overflow-hidden min-h-screen")}>
        <Providers>
          <Navbar />
          <div className="flex flex-row h-screen">
            <SideMenu />
            <div className="ml-[200px] pt-[64px] h-full overflow-y-auto flex-grow">
              {children}
            </div>
          </div>
          <Toaster
            toastOptions={{
              classNames: {
                toast: "bg-white",
                title: "text-black",
                description: "text-red-400",
                actionButton: "bg-indigo-400",
                cancelButton: "bg-orange-400",
                closeButton: "bg-white-400",
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
