import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Who Ordered Tax?",
    short_name: "WhoTax",
    description: "Split the bill to the exact cent.",
    start_url: "/bills",
    display: "standalone",
    background_color: "#fff7e8",
    theme_color: "#ff4d8d",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
