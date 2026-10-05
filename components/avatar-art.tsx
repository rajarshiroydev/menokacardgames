import { avatarSrc } from "@/lib/avatars";

/**
 * Shows one avatar (public/avatars/<id>.svg, see lib/avatars.ts). Unknown ids
 * fall back to a stable pick from `seed`. Decorative: the name always sits
 * beside it.
 */
export function AvatarArt({
  id,
  seed = "",
  size,
  className,
}: {
  id: string | null | undefined;
  seed?: string;
  size?: number;
  className?: string;
}) {
  return (
    // A plain <img>: the files are small static SVGs, so next/image adds nothing.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarSrc(id, seed)}
      alt=""
      width={size}
      height={size}
      className={className}
      draggable={false}
      decoding="async"
    />
  );
}
