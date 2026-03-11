import { requireRole } from "@/lib/auth";
import { AdminIngredientForm } from "@/components/ingredients/admin-ingredient-form";

export default async function NewIngredientPage() {
  await requireRole("admin");
  return <AdminIngredientForm />;
}
