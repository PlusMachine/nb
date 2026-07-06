import React from "react";

export function RecipeEditorErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-destructive-border bg-destructive-subtle px-3 py-2 text-sm text-destructive-subtle-foreground" role="alert">
      {message}
    </div>
  );
}
