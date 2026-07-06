"use client";

import { ImagePlus } from "lucide-react";
import React, { useRef } from "react";

export function RecipeImageUploader({
  disabled = false,
  empty = false,
  label,
  onFilesSelected
}: {
  disabled?: boolean;
  empty?: boolean;
  label: string;
  onFilesSelected: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) {
      return;
    }

    onFilesSelected(Array.from(files));
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const content = empty ? (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      className={`flex min-h-[11rem] flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-border bg-muted/50 px-6 py-10 text-center transition
        ${disabled ? "pointer-events-none opacity-50" : "cursor-pointer hover:border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"}`}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (!disabled) {
          handleFiles(event.dataTransfer.files);
        }
      }}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
        <ImagePlus className="h-6 w-6 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-1 text-xs text-muted-foreground">До 8 фото · JPG, PNG, WEBP · не более 10 МБ</p>
      </div>
    </div>
  ) : (
    <div>
      <button
        type="button"
        disabled={disabled}
        className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-accent disabled:opacity-50"
        onClick={() => inputRef.current?.click()}
      >
        <ImagePlus className="mr-2 h-4 w-4" />
        {label}
      </button>
    </div>
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(event) => handleFiles(event.target.files)}
      />
      {content}
    </>
  );
}
