"use client";

import { useState, type ImgHTMLAttributes, type ReactNode } from "react";

/**
 * <img> that removes itself (or shows `fallback`) when the image fails to
 * load, instead of a broken-image box with alt text.
 */
export default function SafeImg({
  fallback = null,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { fallback?: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img {...props} onError={() => setFailed(true)} />;
}
