import React, { useId } from "react";

export function BeerGlassIcon({
  color,
  gradientFrom,
  gradientTo,
  size = 32,
  className,
}: {
  color: string;
  gradientFrom?: string;
  gradientTo?: string;
  size?: number;
  className?: string;
}) {
  const width = Math.round(size * 0.71);
  const gradientId = useId().replace(/:/g, "");
  const fill = gradientFrom && gradientTo ? `url(#${gradientId})` : color;

  return (
    <svg
      width={width}
      height={size}
      viewBox="0 0 20 28"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {gradientFrom && gradientTo ? (
        <defs>
          <linearGradient id={gradientId} x1="10" y1="6" x2="10" y2="26" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={gradientFrom} />
            <stop offset="100%" stopColor={gradientTo} />
          </linearGradient>
        </defs>
      ) : null}
      <path
        d="M5 8 L4 21.5 Q4 26 10 26 Q16 26 16 21.5 L15 8 Z"
        fill={fill}
      />
      <path
        d="M5 8 Q7.5 5.8 10 8 Q12.5 5.8 15 8 Z"
        fill="rgba(255,255,255,0.55)"
      />
      <path
        d="M4.5 5.5 L3.5 22 Q3.5 27 10 27 Q16.5 27 16.5 22 L15.5 5.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="4.5"
        y1="5.5"
        x2="15.5"
        y2="5.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
