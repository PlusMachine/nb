import { permanentRedirect } from "next/navigation";

// Индекс раздела переехал на товарную витрину /market: покупатель ищет вещь
// («мельница»), а не человека. Страницы мастеров остались на /masters/[slug]
// как профиль продавца.
export default function MastersIndexRedirect() {
  permanentRedirect("/market");
}
