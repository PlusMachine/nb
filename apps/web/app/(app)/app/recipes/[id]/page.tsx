import { redirect } from "next/navigation";

export default async function RecipeCompatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Keep legacy owner URLs working while `/edit` is the only owner workspace.
  redirect(`/app/recipes/${id}/edit`);
}
