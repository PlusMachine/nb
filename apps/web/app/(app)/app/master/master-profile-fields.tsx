"use client";

import React from "react";

import { NumericInput } from "@/components/shared/numeric-input";
import {
  MASTER_SPECIALIZATIONS,
  type MasterProfileInput,
  type MasterSpecializationKey
} from "@/features/masters/contracts";

export type MasterProfileFormValues = {
  displayName: string;
  city: string;
  specializations: MasterSpecializationKey[];
  summary: string;
  about: string;
  contactTelegram: string;
  contactPhone: string;
  contactEmail: string;
  contactWebsite: string;
  craftSince: string;
};

export const emptyMasterProfileFormValues: MasterProfileFormValues = {
  displayName: "",
  city: "",
  specializations: [],
  summary: "",
  about: "",
  contactTelegram: "",
  contactPhone: "",
  contactEmail: "",
  contactWebsite: "",
  craftSince: ""
};

export const buildMasterProfileFormPayload = (values: MasterProfileFormValues): Partial<MasterProfileInput> => ({
  displayName: values.displayName,
  city: values.city,
  specializations: values.specializations,
  summary: values.summary,
  about: values.about,
  contactTelegram: values.contactTelegram,
  contactPhone: values.contactPhone,
  contactEmail: values.contactEmail,
  contactWebsite: values.contactWebsite,
  craftSince: values.craftSince.trim() ? Number(values.craftSince) : null
});

const labelClassName = "flex flex-col gap-1 text-sm";
const inputClassName = "h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";
const textareaClassName = "min-h-[8rem] rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

export function MasterProfileFormFields({
  values,
  onChange,
  disabled = false
}: {
  values: MasterProfileFormValues;
  onChange: (next: MasterProfileFormValues) => void;
  disabled?: boolean;
}) {
  const setField = <K extends keyof MasterProfileFormValues>(key: K, value: MasterProfileFormValues[K]) => {
    onChange({ ...values, [key]: value });
  };

  const toggleSpecialization = (key: MasterSpecializationKey) => {
    if (disabled) {
      return;
    }

    const isSelected = values.specializations.includes(key);
    if (isSelected) {
      setField("specializations", values.specializations.filter((item) => item !== key));
      return;
    }

    if (values.specializations.length >= 4) {
      return;
    }

    setField("specializations", [...values.specializations, key]);
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClassName}>
          <span className="text-muted-foreground">Название мастерской или имя</span>
          <input
            className={inputClassName}
            value={values.displayName}
            onChange={(event) => setField("displayName", event.target.value)}
            maxLength={120}
            disabled={disabled}
            placeholder="Иван Кузнецов"
          />
        </label>
        <label className={labelClassName}>
          <span className="text-muted-foreground">Город</span>
          <input
            className={inputClassName}
            value={values.city}
            onChange={(event) => setField("city", event.target.value)}
            maxLength={120}
            disabled={disabled}
            placeholder="Новосибирск"
          />
        </label>
      </div>

      <div className="space-y-2">
        <span className="text-sm text-muted-foreground">Специализации (1–4)</span>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Специализации">
          {MASTER_SPECIALIZATIONS.map((option) => {
            const isSelected = values.specializations.includes(option.key);
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={isSelected}
                disabled={disabled || (!isSelected && values.specializations.length >= 4)}
                onClick={() => toggleSpecialization(option.key)}
                className={`inline-flex h-9 items-center rounded-full border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  isSelected
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-foreground hover:bg-accent"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <label className={labelClassName}>
        <span className="flex items-center justify-between text-muted-foreground">
          <span>Коротко о себе (для карточки на витрине)</span>
          <span className="text-xs tabular-nums text-muted-foreground">{values.summary.length}/200</span>
        </span>
        <input
          className={inputClassName}
          value={values.summary}
          onChange={(event) => setField("summary", event.target.value)}
          maxLength={200}
          disabled={disabled}
          placeholder="Делаю ЦКТ и щиты автоматики из нержавейки."
        />
      </label>

      <label className={labelClassName}>
        <span className="text-muted-foreground">О мастере</span>
        <textarea
          className={textareaClassName}
          value={values.about}
          onChange={(event) => setField("about", event.target.value)}
          maxLength={5000}
          disabled={disabled}
          placeholder="Что делаете, из чего, сроки изготовления, география доставки…"
        />
      </label>

      <div className="space-y-2">
        <span className="text-sm text-muted-foreground">Контакты — укажите минимум один способ связи</span>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClassName}>
            <span className="text-xs text-muted-foreground">Telegram</span>
            <input
              className={inputClassName}
              value={values.contactTelegram}
              onChange={(event) => setField("contactTelegram", event.target.value)}
              disabled={disabled}
              placeholder="@ivan_brew"
            />
          </label>
          <label className={labelClassName}>
            <span className="text-xs text-muted-foreground">Телефон</span>
            <input
              className={inputClassName}
              value={values.contactPhone}
              onChange={(event) => setField("contactPhone", event.target.value)}
              disabled={disabled}
              placeholder="+7 900 000-00-00"
            />
          </label>
          <label className={labelClassName}>
            <span className="text-xs text-muted-foreground">E-mail</span>
            <input
              className={inputClassName}
              value={values.contactEmail}
              onChange={(event) => setField("contactEmail", event.target.value)}
              disabled={disabled}
              placeholder="master@example.com"
            />
          </label>
          <label className={labelClassName}>
            <span className="text-xs text-muted-foreground">Сайт</span>
            <input
              className={inputClassName}
              value={values.contactWebsite}
              onChange={(event) => setField("contactWebsite", event.target.value)}
              disabled={disabled}
              placeholder="https://example.com"
            />
          </label>
        </div>
      </div>

      <label className={`${labelClassName} sm:w-48`}>
        <span className="text-muted-foreground">Делаете с (год, опционально)</span>
        <NumericInput
          className={inputClassName}
          integer
          value={values.craftSince}
          onChange={(event) => setField("craftSince", event.target.value)}
          disabled={disabled}
          placeholder="2019"
        />
      </label>
    </div>
  );
}
