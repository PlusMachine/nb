import type { Metadata } from "next";
import React from "react";

import { CalculatorsIndex } from "@/components/calculators/calculators-index";

export const metadata: Metadata = {
  title: "Калькуляторы для пивоварения",
  description: "Автономные пивоваренные расчеты для варки, брожения и розлива."
};

export default function CalculatorsPage() {
  return <CalculatorsIndex />;
}
