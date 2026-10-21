"use client";

import { useEffect, useId, useRef, useState } from "react";

export function MasterItemDescription({ text }: { text: string }) {
  const id = useId();
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || expanded) return;
    const measure = () => setCanExpand(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, expanded]);

  return (
    <div className="text-sm text-muted-foreground">
      <p ref={ref} id={id} className={`whitespace-pre-line break-words ${expanded ? "" : "line-clamp-4"}`}>
        {text}
      </p>
      {canExpand ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 rounded text-xs font-medium text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {expanded ? "Свернуть" : "Показать полностью"}
        </button>
      ) : null}
    </div>
  );
}
