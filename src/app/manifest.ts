import type { MetadataRoute } from "next";

/** /manifest.webmanifest — install name, colours and icons. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Arovyx Studio",
    short_name: "Arovyx",
    description: "A developer showcase of apps, games, packages and plugins.",
    start_url: "/",
    display: "standalone",
    background_color: "#07090b",
    theme_color: "#07090b",
    icons: [
      { src: "/brand/arovyx-mark-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/arovyx-mark.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
