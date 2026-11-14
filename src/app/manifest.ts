import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Who Ordered The Tax?",
    short_name: "WhoTax",
    description: "Itemized bill splitting, to the cent.",
    start_url: "/bills",
    display: "standalone",
    background_color: "#f7f7f5",
    theme_color: "#0d8a5f",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
