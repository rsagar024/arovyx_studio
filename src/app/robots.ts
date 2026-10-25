import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/utils";

/** /robots.txt — keep the hidden studio and the API out of search engines. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/studio", "/api/"] }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
