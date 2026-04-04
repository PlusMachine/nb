import React, { type ReactNode } from "react";

const viewBoxWidth = 18;
const viewBoxHeight = 12;

const renderHorizontalStripes = (colors: string[], ratios?: number[]) => {
  const resolvedRatios = ratios ?? colors.map(() => 1);
  const total = resolvedRatios.reduce((sum, ratio) => sum + ratio, 0);
  let offsetY = 0;

  return colors.map((color, index) => {
    const height = viewBoxHeight * (resolvedRatios[index] / total);
    const node = (
      <rect
        key={`${color}-${index}`}
        x="0"
        y={offsetY}
        width={viewBoxWidth}
        height={height + 0.1}
        fill={color}
      />
    );
    offsetY += height;
    return node;
  });
};

const renderVerticalStripes = (colors: string[]) => {
  const width = viewBoxWidth / colors.length;

  return colors.map((color, index) => (
    <rect
      key={`${color}-${index}`}
      x={index * width}
      y="0"
      width={width + 0.1}
      height={viewBoxHeight}
      fill={color}
    />
  ));
};

const renderNordicCross = ({ background, cross }: { background: string; cross: string }) => (
  <>
    <rect x="0" y="0" width={viewBoxWidth} height={viewBoxHeight} fill={background} />
    <rect x="5" y="0" width="2" height={viewBoxHeight} fill={cross} />
    <rect x="0" y="5" width={viewBoxWidth} height="2" fill={cross} />
  </>
);

const renderUnionJack = () => (
  <>
    <rect x="0" y="0" width={viewBoxWidth} height={viewBoxHeight} fill="#012169" />
    <line x1="0" y1="0" x2={viewBoxWidth} y2={viewBoxHeight} stroke="#FFFFFF" strokeWidth="3.2" />
    <line x1={viewBoxWidth} y1="0" x2="0" y2={viewBoxHeight} stroke="#FFFFFF" strokeWidth="3.2" />
    <line x1={viewBoxWidth / 2} y1="0" x2={viewBoxWidth / 2} y2={viewBoxHeight} stroke="#FFFFFF" strokeWidth="4.6" />
    <line x1="0" y1={viewBoxHeight / 2} x2={viewBoxWidth} y2={viewBoxHeight / 2} stroke="#FFFFFF" strokeWidth="4.6" />
    <line x1="0" y1="0" x2={viewBoxWidth} y2={viewBoxHeight} stroke="#C8102E" strokeWidth="1.5" />
    <line x1={viewBoxWidth} y1="0" x2="0" y2={viewBoxHeight} stroke="#C8102E" strokeWidth="1.5" />
    <line x1={viewBoxWidth / 2} y1="0" x2={viewBoxWidth / 2} y2={viewBoxHeight} stroke="#C8102E" strokeWidth="2.4" />
    <line x1="0" y1={viewBoxHeight / 2} x2={viewBoxWidth} y2={viewBoxHeight / 2} stroke="#C8102E" strokeWidth="2.4" />
  </>
);

const renderFlagArt = (countryCode?: string | null): ReactNode => {
  const code = countryCode?.trim().toUpperCase() ?? "";

  switch (code) {
    case "DE":
      return renderHorizontalStripes(["#000000", "#DD0000", "#FFCE00"]);
    case "BE":
      return renderVerticalStripes(["#000000", "#FFD90C", "#EF3340"]);
    case "RU":
      return renderHorizontalStripes(["#FFFFFF", "#0039A6", "#D52B1E"]);
    case "US":
      return (
        <>
          {renderHorizontalStripes(["#B22234", "#FFFFFF", "#B22234", "#FFFFFF", "#B22234", "#FFFFFF", "#B22234"])}
          <rect x="0" y="0" width="7.5" height="6.5" fill="#3C3B6E" />
          <circle cx="1.5" cy="1.5" r="0.45" fill="#FFFFFF" />
          <circle cx="3.75" cy="1.5" r="0.45" fill="#FFFFFF" />
          <circle cx="6" cy="1.5" r="0.45" fill="#FFFFFF" />
          <circle cx="2.6" cy="3.2" r="0.45" fill="#FFFFFF" />
          <circle cx="4.9" cy="3.2" r="0.45" fill="#FFFFFF" />
          <circle cx="1.5" cy="4.9" r="0.45" fill="#FFFFFF" />
          <circle cx="3.75" cy="4.9" r="0.45" fill="#FFFFFF" />
          <circle cx="6" cy="4.9" r="0.45" fill="#FFFFFF" />
        </>
      );
    case "FR":
      return renderVerticalStripes(["#0055A4", "#FFFFFF", "#EF4135"]);
    case "CA":
      return (
        <>
          <rect x="0" y="0" width="4.5" height={viewBoxHeight} fill="#D80621" />
          <rect x="4.5" y="0" width="9" height={viewBoxHeight} fill="#FFFFFF" />
          <rect x="13.5" y="0" width="4.5" height={viewBoxHeight} fill="#D80621" />
          <path
            d="M9 2.1 9.6 3.4 10.9 2.9 10.3 4.1 11.4 4.8 10 5 10.1 6.4 9 5.8 7.9 6.4 8 5 6.6 4.8 7.7 4.1 7.1 2.9 8.4 3.4Z"
            fill="#D80621"
          />
          <rect x="8.55" y="5.8" width="0.9" height="2" fill="#D80621" />
        </>
      );
    case "GB":
      return renderUnionJack();
    case "FI":
      return renderNordicCross({ background: "#FFFFFF", cross: "#003580" });
    case "UA":
      return renderHorizontalStripes(["#0057B7", "#FFD700"]);
    case "CZ":
      return (
        <>
          <rect x="0" y="0" width={viewBoxWidth} height={viewBoxHeight / 2} fill="#FFFFFF" />
          <rect x="0" y={viewBoxHeight / 2} width={viewBoxWidth} height={viewBoxHeight / 2} fill="#D7141A" />
          <polygon points={`0,0 8,${viewBoxHeight / 2} 0,${viewBoxHeight}`} fill="#11457E" />
        </>
      );
    case "BY":
      return (
        <>
          <rect x="0" y="0" width={viewBoxWidth} height={viewBoxHeight} fill="#C8313E" />
          <rect x="0" y="8" width={viewBoxWidth} height="4" fill="#4AA657" />
          <rect x="0" y="0" width="3" height={viewBoxHeight} fill="#FFFFFF" />
          <rect x="0.8" y="0" width="0.6" height={viewBoxHeight} fill="#C8313E" />
          <rect x="1.8" y="0" width="0.6" height={viewBoxHeight} fill="#C8313E" />
        </>
      );
    case "NL":
      return renderHorizontalStripes(["#AE1C28", "#FFFFFF", "#21468B"]);
    case "SI":
      return (
        <>
          {renderHorizontalStripes(["#FFFFFF", "#0056A3", "#D50032"])}
          <rect x="2.4" y="2.2" width="2.4" height="3.2" rx="0.7" fill="#0056A3" />
          <path d="M2.8 4.6 L3.6 3.4 L4.4 4.6" fill="none" stroke="#FFFFFF" strokeWidth="0.35" />
        </>
      );
    case "SK":
      return (
        <>
          {renderHorizontalStripes(["#FFFFFF", "#0B4EA2", "#EE1C25"])}
          <rect x="2.3" y="2.1" width="2.6" height="3.6" rx="0.8" fill="#EE1C25" />
          <rect x="3.2" y="2.8" width="0.5" height="2.1" fill="#FFFFFF" />
          <rect x="2.7" y="3.3" width="1.5" height="0.5" fill="#FFFFFF" />
        </>
      );
    case "NZ":
      return (
        <>
          <rect x="0" y="0" width={viewBoxWidth} height={viewBoxHeight} fill="#00247D" />
          <g transform="scale(0.45)">
            {renderUnionJack()}
          </g>
          <circle cx="11.8" cy="3.2" r="1" fill="#FFFFFF" />
          <circle cx="11.8" cy="3.2" r="0.65" fill="#CC142B" />
          <circle cx="14.7" cy="5.4" r="1" fill="#FFFFFF" />
          <circle cx="14.7" cy="5.4" r="0.65" fill="#CC142B" />
          <circle cx="12.9" cy="8.3" r="1" fill="#FFFFFF" />
          <circle cx="12.9" cy="8.3" r="0.65" fill="#CC142B" />
          <circle cx="9.8" cy="6.8" r="0.85" fill="#FFFFFF" />
          <circle cx="9.8" cy="6.8" r="0.55" fill="#CC142B" />
        </>
      );
    case "AT":
      return renderHorizontalStripes(["#ED2939", "#FFFFFF", "#ED2939"]);
    case "LV":
      return renderHorizontalStripes(["#8C1C3D", "#FFFFFF", "#8C1C3D"], [5, 2, 5]);
    case "ZA":
      return (
        <>
          <rect x="0" y="0" width={viewBoxWidth} height={viewBoxHeight / 2} fill="#DE3831" />
          <rect x="0" y={viewBoxHeight / 2} width={viewBoxWidth} height={viewBoxHeight / 2} fill="#002395" />
          <polygon points="0,0 7,6 0,12" fill="#000000" />
          <polygon points="0,1.2 5.8,6 0,10.8 0,9.4 4.2,6 0,2.6" fill="#FFB612" />
          <path d="M18 0 L8.4 0 L4.6 3.1 L0 3.1 L0 4.4 L5 4.4 L9 1.3 L18 1.3 Z" fill="#FFFFFF" />
          <path d="M18 12 L8.4 12 L4.6 8.9 L0 8.9 L0 7.6 L5 7.6 L9 10.7 L18 10.7 Z" fill="#FFFFFF" />
          <path d="M18 1.8 L8.8 1.8 L5.6 4.4 L0 4.4 L0 7.6 L5.6 7.6 L8.8 10.2 L18 10.2 L18 8.8 L9.2 8.8 L6 6.3 L6 5.7 L9.2 3.2 L18 3.2 Z" fill="#007A4D" />
        </>
      );
    case "AU":
      return (
        <>
          <rect x="0" y="0" width={viewBoxWidth} height={viewBoxHeight} fill="#012169" />
          <g transform="scale(0.45)">
            {renderUnionJack()}
          </g>
          <circle cx="12.4" cy="3" r="0.7" fill="#FFFFFF" />
          <circle cx="14.2" cy="5.1" r="0.7" fill="#FFFFFF" />
          <circle cx="11.2" cy="6.1" r="0.7" fill="#FFFFFF" />
          <circle cx="14.8" cy="8" r="0.7" fill="#FFFFFF" />
          <circle cx="9.6" cy="8.7" r="0.95" fill="#FFFFFF" />
        </>
      );
    case "SE":
      return renderNordicCross({ background: "#006AA7", cross: "#FECC00" });
    case "GR":
      return (
        <>
          {renderHorizontalStripes(["#0D5EAF", "#FFFFFF", "#0D5EAF", "#FFFFFF", "#0D5EAF", "#FFFFFF", "#0D5EAF", "#FFFFFF", "#0D5EAF"])}
          <rect x="0" y="0" width="7" height="7" fill="#0D5EAF" />
          <rect x="2.8" y="0" width="1.4" height="7" fill="#FFFFFF" />
          <rect x="0" y="2.8" width="7" height="1.4" fill="#FFFFFF" />
        </>
      );
    case "DK":
      return renderNordicCross({ background: "#C60C30", cross: "#FFFFFF" });
    case "CN":
      return (
        <>
          <rect x="0" y="0" width={viewBoxWidth} height={viewBoxHeight} fill="#DE2910" />
          <circle cx="4" cy="3" r="1.3" fill="#FFDE00" />
          <circle cx="6.6" cy="1.5" r="0.35" fill="#FFDE00" />
          <circle cx="7.4" cy="3" r="0.35" fill="#FFDE00" />
          <circle cx="6.8" cy="4.4" r="0.35" fill="#FFDE00" />
          <circle cx="5.6" cy="5.3" r="0.35" fill="#FFDE00" />
        </>
      );
    case "PL":
      return renderHorizontalStripes(["#FFFFFF", "#DC143C"]);
    default:
      return (
        <>
          <rect x="0" y="0" width={viewBoxWidth} height={viewBoxHeight} fill="#E4E4E7" />
          <rect x="0" y="4" width={viewBoxWidth} height="4" fill="#D4D4D8" />
        </>
      );
  }
};

export function CountryFlag({
  countryCode,
  className = "h-3.5 w-[1.15rem]"
}: {
  countryCode?: string | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 overflow-hidden rounded-[3px] ring-1 ring-black/10 ${className}`}
    >
      <svg viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`} className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
        {renderFlagArt(countryCode)}
      </svg>
    </span>
  );
}

export function CountryFlagLabel({
  countryCode,
  label,
  className = "",
  iconClassName,
  textClassName = ""
}: {
  countryCode?: string | null;
  label: string;
  className?: string;
  iconClassName?: string;
  textClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`.trim()}>
      <CountryFlag countryCode={countryCode} className={iconClassName} />
      <span className={textClassName}>{label}</span>
    </span>
  );
}
