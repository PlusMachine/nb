"use client";

// =============================================================================
//  features/devices/components/device-config-form.tsx
//  Форма настроек устройства BrewForge (§6.3). Грузит текущий конфиг по
//  GET /api/devices/:id/config, рендерит редактируемые поля группами (PID,
//  Кипячение, Насос, Безопасность, Калибровка датчиков, Прочее) по метаданным
//  CONFIG_FIELD_RANGES (диапазоны/шаг/подписи), и при сохранении PUT-ит ТОЛЬКО
//  изменённые поля.
//
//  Инвариант безопасности: финальный клампинг полей безопасности и интерлоки §5 —
//  на УСТРОЙСТВЕ. Портал показывает подсказки-диапазоны, но не является источником
//  истины: устройство возвращает эффективный (клампнутый) конфиг, который мы и
//  делаем новой базой. Изменения применяются после ПЕРЕЗАГРУЗКИ устройства.
//
//  Секреты/токены здесь не фигурируют (конфиг несекретный); ошибки — по кодам.
// =============================================================================
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  CONFIG_FIELD_RANGES,
  DeviceConfigSchema,
  type ConfigFieldDescriptor,
  type ConfigFieldKey,
  type DeviceConfig,
  type DeviceConfigPatch
} from "@nb/brewforge-protocol";
import { Button, Card, Input, SliderScaffold } from "@nb/ui";

import {
  applyProfileAction,
  saveProfileAction,
  type DeviceProfileView
} from "@/features/devices/actions";

// --- Перевод доменных кодов ошибок (config-route + profiles) в RU-текст. -------
const ERROR_TEXT: Record<string, string> = {
  INVALID_REQUEST: "Проверьте введённые значения",
  PROVIDER_UNAVAILABLE: "Синхронизация настроек недоступна для этого устройства",
  DEVICE_UNREACHABLE: "Устройство не отвечает — проверьте, что оно в сети",
  NOT_FOUND: "Устройство не найдено",
  PROFILE_NAME_REQUIRED: "Укажите имя профиля",
  INVALID_CONFIG: "Конфиг профиля повреждён",
  PROFILE_SAVE_FAILED: "Не удалось сохранить профиль",
  FORBIDDEN: "Нет доступа к этому устройству",
  INTERNAL_ERROR: "Внутренняя ошибка. Попробуйте позже"
};

const errText = (code: string | undefined | null): string =>
  (code && ERROR_TEXT[code]) || "Не удалось выполнить операцию";

// --- Группировка полей для рендера (sensorCal вынесен в отдельную таблицу). ----
const SENSOR_COUNT = 5;

type FieldGroup = { title: string; keys: ConfigFieldKey[] };

const GROUPS: FieldGroup[] = [
  {
    title: "PID-регулятор затирания",
    keys: [
      "pid.kp",
      "pid.ki",
      "pid.kd",
      "pid.sampleMs",
      "pid.windowMs",
      "pid.pidStartBandC",
      "pid.ponMeasurement"
    ]
  },
  { title: "Кипячение", keys: ["boil.tempC", "boil.heatPct"] },
  {
    title: "Насос",
    keys: [
      "pump.cycleMin",
      "pump.restMin",
      "pump.stopTempC",
      "pump.primeCycles",
      "pump.paddleMode",
      "pump.heatDuringRest"
    ]
  },
  {
    title: "Безопасность",
    keys: [
      "safety.overshootCutC",
      "safety.absMaxC",
      "safety.maxDtPerSec",
      "safety.sensorFaultCycles",
      "safety.stageTimeoutMin"
    ]
  },
  {
    title: "Прочее",
    keys: [
      "units",
      "filterBeta",
      "interHeaterDelayMs",
      "buzzer",
      "spargeHeating",
      "iodineTest",
      "removeMaltPrompt"
    ]
  }
];

// --- Доступ к значению по dotted-path (config — неоднородный объект). ----------
type AnyRecord = Record<string, unknown>;

function getAt(config: DeviceConfig, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = config;
  for (const p of parts) {
    if (cur && typeof cur === "object") {
      cur = (cur as AnyRecord)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

/** Иммутабельно записать значение по dotted-path, возвращая новый конфиг. */
function setAt(config: DeviceConfig, path: string, value: unknown): DeviceConfig {
  const parts = path.split(".");
  const root: AnyRecord = { ...(config as AnyRecord) };
  let cur: AnyRecord = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i]!;
    const child = cur[key];
    cur[key] = child && typeof child === "object" ? { ...(child as AnyRecord) } : {};
    cur = cur[key] as AnyRecord;
  }
  cur[parts[parts.length - 1]!] = value;
  return root as DeviceConfig;
}

/** Собрать патч из ТОЛЬКО изменённых полей (вложенная структура сохраняется). */
function buildPatch(baseline: DeviceConfig, draft: DeviceConfig): DeviceConfigPatch {
  const patch: AnyRecord = {};
  // Скалярные/булевы/enum-поля по реестру (sensorCal.* — отдельно ниже).
  for (const key of Object.keys(CONFIG_FIELD_RANGES) as ConfigFieldKey[]) {
    if (key.startsWith("sensorCal.")) continue;
    const before = getAt(baseline, key);
    const after = getAt(draft, key);
    if (before !== after) {
      const parts = key.split(".");
      if (parts.length === 1) {
        patch[parts[0]!] = after;
      } else {
        const grp = (patch[parts[0]!] as AnyRecord | undefined) ?? {};
        grp[parts[1]!] = after;
        patch[parts[0]!] = grp;
      }
    }
  }
  // sensorCal — массив по индексам: если хоть что-то изменилось, шлём весь массив
  // (прошивка переопределяет по индексу; целиком — безопаснее частичных диффов).
  if (JSON.stringify(baseline.sensorCal) !== JSON.stringify(draft.sensorCal)) {
    patch.sensorCal = draft.sensorCal;
  }
  return patch as DeviceConfigPatch;
}

type Props = {
  deviceId: string;
  deviceName: string;
  initialProfiles: DeviceProfileView[];
};

export function DeviceConfigForm({ deviceId, deviceName, initialProfiles }: Props) {
  // Конфиг устройства: baseline = последнее эффективное значение с устройства,
  // draft = редактируемая копия. Патч = diff(draft, baseline).
  const [baseline, setBaseline] = useState<DeviceConfig | null>(null);
  const [draft, setDraft] = useState<DeviceConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  // Профили (бэкап/восстановление).
  const [profiles, setProfiles] = useState<DeviceProfileView[]>(initialProfiles);
  const [profileName, setProfileName] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileOk, setProfileOk] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/devices/${deviceId}/config`, { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as
        | { config?: unknown; error?: string }
        | null;
      if (!res.ok || !body?.config) {
        setLoadError(errText(body?.error));
        setBaseline(null);
        setDraft(null);
        return;
      }
      const parsed = DeviceConfigSchema.safeParse(body.config);
      if (!parsed.success) {
        setLoadError("Устройство вернуло неожиданный формат конфигурации");
        return;
      }
      setBaseline(parsed.data);
      setDraft(parsed.data);
    } catch {
      setLoadError(ERROR_TEXT.DEVICE_UNREACHABLE!);
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const dirty = useMemo(() => {
    if (!baseline || !draft) return false;
    return Object.keys(buildPatch(baseline, draft)).length > 0;
  }, [baseline, draft]);

  const update = useCallback((path: string, value: unknown) => {
    setSaveOk(false);
    setSaveError(null);
    setDraft((prev) => (prev ? setAt(prev, path, value) : prev));
  }, []);

  const updateSensor = useCallback(
    (index: number, field: "scale" | "offset", value: number) => {
      setSaveOk(false);
      setSaveError(null);
      setDraft((prev) => {
        if (!prev) return prev;
        const cal = prev.sensorCal.map((c) => ({ ...c }));
        while (cal.length <= index) cal.push({ scale: 1, offset: 0 });
        cal[index] = { ...cal[index]!, [field]: value };
        return { ...prev, sensorCal: cal };
      });
    },
    []
  );

  const onSave = useCallback(async () => {
    if (!baseline || !draft) return;
    const patch = buildPatch(baseline, draft);
    if (Object.keys(patch).length === 0) return;
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      const res = await fetch(`/api/devices/${deviceId}/config`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config: patch })
      });
      const body = (await res.json().catch(() => null)) as
        | { config?: unknown; error?: string }
        | null;
      if (!res.ok || !body?.config) {
        setSaveError(errText(body?.error));
        return;
      }
      const parsed = DeviceConfigSchema.safeParse(body.config);
      if (parsed.success) {
        // Берём ЭФФЕКТИВНЫЙ (клампнутый прошивкой) конфиг как новую базу.
        setBaseline(parsed.data);
        setDraft(parsed.data);
      }
      setSaveOk(true);
    } catch {
      setSaveError(ERROR_TEXT.DEVICE_UNREACHABLE!);
    } finally {
      setSaving(false);
    }
  }, [baseline, draft, deviceId]);

  const onSaveProfile = useCallback(async () => {
    if (!draft) return;
    const name = profileName.trim();
    if (!name) {
      setProfileError(ERROR_TEXT.PROFILE_NAME_REQUIRED!);
      return;
    }
    setProfileBusy(true);
    setProfileError(null);
    setProfileOk(null);
    try {
      const saved = await saveProfileAction({ deviceId, name, config: draft });
      setProfiles((prev) => [saved, ...prev]);
      setProfileName("");
      setProfileOk(`Профиль «${saved.name}» сохранён`);
    } catch (error) {
      setProfileError(errText((error as Error).message));
    } finally {
      setProfileBusy(false);
    }
  }, [draft, profileName, deviceId]);

  const onApplyProfile = useCallback(
    async (profile: DeviceProfileView) => {
      setApplyingId(profile.id);
      setProfileError(null);
      setProfileOk(null);
      try {
        const effective = await applyProfileAction({ profileId: profile.id, deviceId });
        const parsed = DeviceConfigSchema.safeParse(effective);
        if (parsed.success) {
          setBaseline(parsed.data);
          setDraft(parsed.data);
        }
        setProfileOk(`Профиль «${profile.name}» применён (вступит в силу после перезагрузки)`);
      } catch (error) {
        setProfileError(errText((error as Error).message));
      } finally {
        setApplyingId(null);
      }
    },
    [deviceId]
  );

  return (
    <div className="space-y-6">
      {/* Важное предупреждение про клампинг и перезагрузку. */}
      <Card className="border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-semibold text-amber-900">Как применяются настройки</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-amber-800">
          <li>
            Поля <strong>безопасности</strong> устройство <strong>зажимает</strong> в свои жёсткие
            пределы — портал показывает рекомендованные диапазоны, но финальное значение определяет
            прошивка (интерлоки §5 ослабить удалённо нельзя).
          </li>
          <li>
            Изменения вступают в силу <strong>после перезагрузки</strong> устройства. После
            сохранения здесь отображается уже эффективное (зажатое) значение с прибора.
          </li>
        </ul>
      </Card>

      {loading ? (
        <Card className="p-6 text-sm text-zinc-600">Загрузка конфигурации устройства…</Card>
      ) : loadError ? (
        <Card className="border-zinc-200 p-6">
          <p className="text-sm font-medium text-zinc-900">Не удалось получить настройки</p>
          <p className="mt-1 text-sm text-zinc-500">{loadError}</p>
          <p className="mt-1 text-xs text-zinc-400">
            Бэкап-профили ниже доступны и без связи с устройством.
          </p>
          <Button variant="outline" className="mt-3" onClick={() => void loadConfig()}>
            Повторить
          </Button>
        </Card>
      ) : draft ? (
        <>
          {GROUPS.map((group) => (
            <Card key={group.title} className="p-5">
              <h2 className="text-sm font-semibold text-zinc-900">{group.title}</h2>
              <div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
                {group.keys.map((key) => (
                  <ConfigField
                    key={key}
                    descriptor={CONFIG_FIELD_RANGES[key] as ConfigFieldDescriptor}
                    value={getAt(draft, key)}
                    onChange={(v) => update(key, v)}
                  />
                ))}
              </div>
            </Card>
          ))}

          {/* Калибровка датчиков — таблица из SENSOR_COUNT строк. */}
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-zinc-900">Калибровка датчиков</h2>
            <p className="mt-1 text-xs text-zinc-500">
              2-точечная калибровка каждого датчика: итог = измерение × масштаб + смещение.
            </p>
            <div className="mt-4 space-y-3">
              {Array.from({ length: SENSOR_COUNT }).map((_, i) => {
                const cal = draft.sensorCal[i] ?? { scale: 1, offset: 0 };
                const scaleD = CONFIG_FIELD_RANGES["sensorCal.scale"];
                const offsetD = CONFIG_FIELD_RANGES["sensorCal.offset"];
                return (
                  <div key={i} className="grid items-end gap-3 sm:grid-cols-[auto_1fr_1fr]">
                    <span className="pb-2 text-xs font-medium text-zinc-500">Датчик {i + 1}</span>
                    <NumberControl
                      label={scaleD.label}
                      min={scaleD.min}
                      max={scaleD.max}
                      step={scaleD.step}
                      value={typeof cal.scale === "number" ? cal.scale : 1}
                      onChange={(v) => updateSensor(i, "scale", v)}
                    />
                    <NumberControl
                      label={offsetD.label}
                      min={offsetD.min}
                      max={offsetD.max}
                      step={offsetD.step}
                      unit={offsetD.unit}
                      value={typeof cal.offset === "number" ? cal.offset : 0}
                      onChange={(v) => updateSensor(i, "offset", v)}
                    />
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Панель сохранения. */}
          <Card className="flex flex-wrap items-center gap-3 p-5">
            <Button onClick={() => void onSave()} disabled={saving || !dirty}>
              {saving ? "Сохранение…" : "Сохранить на устройство"}
            </Button>
            {dirty ? (
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => {
                  setDraft(baseline);
                  setSaveOk(false);
                  setSaveError(null);
                }}
              >
                Сбросить изменения
              </Button>
            ) : null}
            {!dirty && !saveOk ? (
              <span className="text-xs text-zinc-400">Нет несохранённых изменений</span>
            ) : null}
            {saveOk ? (
              <span className="text-sm text-emerald-700">
                Отправлено. Значения обновлены до эффективных (зажатых прошивкой); применятся после
                перезагрузки.
              </span>
            ) : null}
            {saveError ? <span className="text-sm text-red-600">{saveError}</span> : null}
          </Card>
        </>
      ) : null}

      {/* Бэкап / восстановление профилей. */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Бэкап и восстановление профилей</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Сохраните текущий конфиг как именованный профиль и при необходимости примените его к этому
          (или другому) устройству. Поля безопасности всё равно зажимаются прибором при применении.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
            Имя профиля
            <Input
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder={`напр. «${deviceName} — рабочий»`}
              className="w-64"
            />
          </label>
          <Button
            variant="outline"
            disabled={profileBusy || !draft}
            onClick={() => void onSaveProfile()}
          >
            {profileBusy ? "Сохранение…" : "Сохранить текущий конфиг"}
          </Button>
        </div>
        {!draft ? (
          <p className="mt-2 text-xs text-zinc-400">
            Сохранить можно только при доступном конфиге устройства.
          </p>
        ) : null}
        {profileOk ? <p className="mt-3 text-sm text-emerald-700">{profileOk}</p> : null}
        {profileError ? <p className="mt-3 text-sm text-red-600">{profileError}</p> : null}

        <div className="mt-4 space-y-2">
          {profiles.length === 0 ? (
            <p className="text-sm text-zinc-500">Сохранённых профилей пока нет.</p>
          ) : (
            profiles.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-900">{p.name}</p>
                  <p className="text-xs text-zinc-400">
                    Сохранён {new Date(p.createdAt).toLocaleString()}
                    {p.deviceId && p.deviceId !== deviceId ? " · с другого устройства" : ""}
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={applyingId !== null}
                  onClick={() => void onApplyProfile(p)}
                >
                  {applyingId === p.id ? "Применение…" : "Применить"}
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

// --- Рендер одного поля по дескриптору. ---------------------------------------
function ConfigField({
  descriptor,
  value,
  onChange
}: {
  descriptor: ConfigFieldDescriptor;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (descriptor.kind === "bool") {
    return (
      <label className="flex items-center justify-between gap-3 py-1">
        <span className="text-sm text-zinc-700">{descriptor.label}</span>
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-zinc-300"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
      </label>
    );
  }

  if (descriptor.kind === "enum") {
    return (
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
        {descriptor.label}
        <select
          className="h-10 w-full rounded-md border border-zinc-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
          value={String(typeof value === "number" ? value : "")}
          onChange={(e) => onChange(Number(e.target.value))}
        >
          {descriptor.options.map((opt) => (
            <option key={opt.value} value={String(opt.value)}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <NumberControl
      label={descriptor.label}
      min={descriptor.min}
      max={descriptor.max}
      step={descriptor.step}
      unit={descriptor.unit}
      value={typeof value === "number" ? value : descriptor.min}
      onChange={onChange}
    />
  );
}

// --- Числовое поле: слайдер + синхронный number-input с диапазоном. ------------
function NumberControl({
  label,
  min,
  max,
  step,
  unit,
  value,
  onChange
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-zinc-600">
          {label}
          {unit ? <span className="text-zinc-400"> ({unit})</span> : null}
        </span>
        <Input
          type="number"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isNaN(n)) onChange(n);
          }}
          className="h-8 w-24 text-right"
        />
      </div>
      <SliderScaffold
        value={[Math.min(Math.max(value, min), max)]}
        min={min}
        max={max}
        step={step}
        ariaLabel={label}
        onValueChange={(v) => {
          const n = v[0];
          if (typeof n === "number") onChange(n);
        }}
      />
      <div className="flex justify-between text-[10px] text-zinc-400">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
