"use server";

import { revalidatePath } from "next/cache";
import type { IngredientPurchaseLinkDto, UserIngredientReference } from "@/features/ingredients/contracts";
import { PURCHASE_LINK_MAX_PER_REFERENCE, userIngredientReferenceSchema } from "@/features/ingredients/contracts";
import {
  createIngredientPurchaseLink,
  deleteIngredientPurchaseLink,
  listIngredientPurchaseLinksByReference,
  setIngredientFavoriteState,
  updateIngredientPurchaseLink
} from "@/features/ingredients/user-metadata-service";
import { requireUser } from "@/lib/auth";

export type IngredientFavoriteActionResult = {
  ok: boolean;
  isFavorite: boolean;
  message?: string;
};

export type IngredientPurchaseLinkActionResult = {
  ok: boolean;
  link?: IngredientPurchaseLinkDto;
  message?: string;
};

const revalidateIngredientMetadataPaths = (reference: UserIngredientReference) => {
  revalidatePath("/catalog");
  revalidatePath("/app/ingredients");
  revalidatePath(reference.source === "catalog"
    ? `/catalog/system/${reference.id}`
    : `/catalog/custom/${reference.id}`);
};

const mapMetadataErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    if (error.message === "INVALID_PURCHASE_LINK_URL") {
      return "Укажите корректную ссылку.";
    }

    if (error.message === "PURCHASE_LINK_NOT_FOUND") {
      return "Ссылка больше недоступна.";
    }

    if (error.message === "CUSTOM_INGREDIENT_NOT_FOUND") {
      return "Пользовательский ингредиент не найден.";
    }

    if (error.message === "RATE_LIMITED") {
      return "Слишком много ссылок подряд. Немного подождите.";
    }

    if (error.message === "PURCHASE_LINK_QUOTA_REACHED") {
      return `На один ингредиент можно добавить не больше ${PURCHASE_LINK_MAX_PER_REFERENCE} ссылок.`;
    }
  }

  return "Не удалось сохранить изменения.";
};

export const listIngredientPurchaseLinksAction = async (
  reference: UserIngredientReference
): Promise<IngredientPurchaseLinkDto[]> => {
  const user = await requireUser();
  const parsedReference = userIngredientReferenceSchema.parse(reference);

  return listIngredientPurchaseLinksByReference(user.id, parsedReference);
};

export const createIngredientPurchaseLinkAction = async (payload: {
  reference: UserIngredientReference;
  url: string;
}): Promise<IngredientPurchaseLinkActionResult> => {
  try {
    const user = await requireUser();
    const reference = userIngredientReferenceSchema.parse(payload.reference);
    const link = await createIngredientPurchaseLink(user.id, reference, payload.url);
    revalidateIngredientMetadataPaths(reference);

    return {
      ok: true,
      link
    };
  } catch (error) {
    return {
      ok: false,
      message: mapMetadataErrorMessage(error)
    };
  }
};

export const updateIngredientPurchaseLinkAction = async (payload: {
  reference: UserIngredientReference;
  purchaseLinkId: string;
  url: string;
}): Promise<IngredientPurchaseLinkActionResult> => {
  try {
    const user = await requireUser();
    const reference = userIngredientReferenceSchema.parse(payload.reference);
    const link = await updateIngredientPurchaseLink(user.id, payload.purchaseLinkId, payload.url);
    revalidateIngredientMetadataPaths(reference);

    return {
      ok: true,
      link
    };
  } catch (error) {
    return {
      ok: false,
      message: mapMetadataErrorMessage(error)
    };
  }
};

export const deleteIngredientPurchaseLinkAction = async (payload: {
  reference: UserIngredientReference;
  purchaseLinkId: string;
}): Promise<IngredientPurchaseLinkActionResult> => {
  try {
    const user = await requireUser();
    const reference = userIngredientReferenceSchema.parse(payload.reference);
    await deleteIngredientPurchaseLink(user.id, payload.purchaseLinkId);
    revalidateIngredientMetadataPaths(reference);

    return {
      ok: true
    };
  } catch (error) {
    return {
      ok: false,
      message: mapMetadataErrorMessage(error)
    };
  }
};

export const toggleIngredientFavoriteAction = async (payload: {
  reference: UserIngredientReference;
  next?: boolean;
}): Promise<IngredientFavoriteActionResult> => {
  try {
    const user = await requireUser();
    const reference = userIngredientReferenceSchema.parse(payload.reference);
    const isFavorite = await setIngredientFavoriteState(user.id, reference, payload.next ?? true);
    revalidateIngredientMetadataPaths(reference);

    return {
      ok: true,
      isFavorite
    };
  } catch (error) {
    return {
      ok: false,
      isFavorite: false,
      message: mapMetadataErrorMessage(error)
    };
  }
};
