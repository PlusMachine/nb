export const canModerateTransition = (current: "pending" | "approved" | "rejected" | "merged", next: "approve" | "reject" | "merge") => {
  if (current !== "pending") return false;
  return ["approve", "reject", "merge"].includes(next);
};

export const validateMergeInput = (sourceIngredientId: string, targetIngredientId: string) => {
  if (!sourceIngredientId || !targetIngredientId) {
    throw new Error("INVALID_INPUT");
  }
  if (sourceIngredientId === targetIngredientId) {
    throw new Error("SAME_INGREDIENT");
  }
};
