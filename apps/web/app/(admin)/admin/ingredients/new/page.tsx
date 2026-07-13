import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminIngredientForm } from "@/components/ingredients/admin-ingredient-form";
import { requireRole } from "@/lib/auth";

export default async function NewIngredientPage() {
  await requireRole("admin");

  return (
    <section className="space-y-5">
      <AdminPageHeader title="Новый ингредиент" backHref="/admin/ingredients" backLabel="К каталогу" />
      <AdminIngredientForm />
    </section>
  );
}
