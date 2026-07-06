import React from "react";

export function ShoppingListSkeleton() {
  return (
    <main className="space-y-5">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
      <div className="space-y-3">
        {[0, 1, 2].map((row) => (
          <div key={row} className="h-20 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    </main>
  );
}

export default ShoppingListSkeleton;
