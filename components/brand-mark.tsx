import Image from "next/image";

/** The Pokerize logo (design 3b, rendered by scripts/render-icons.mjs). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <Image
      className={className}
      src="/icons/icon-192.png"
      alt=""
      aria-hidden="true"
      width={192}
      height={192}
      loading="eager"
      unoptimized
    />
  );
}
