/**
 * Публикация релиза прошивки BrewForge в реестр firmware_releases
 * (F2, docs/brewforge-firmware-releases.md §4). Admin-UI — v2, пока CLI.
 *
 * Запуск:  npm run firmware:publish -- --file ../brewforge/build/brewforge.bin \
 *            --version 2.1.0 --notes "Что нового…" [--channel stable] [--schema 1]
 * Отзыв:   npm run firmware:publish -- --yank --version 2.1.0
 *
 * Скрипт валидирует semver, считает sha256/size, копирует файл в стор
 * (FIRMWARE_STORAGE_DIR, дефолт <repo>/storage/firmware) и создаёт запись с
 * publishedAt=now. Повторная публикация той же версии — ошибка (защита от
 * подмены бинарника под тем же номером).
 */
import path from "node:path";

import { firmwareDownloadUrl, publishRelease, yankRelease } from "../features/firmware/service";
import { firmwareChannelSchema } from "../features/firmware/contracts";

type Args = {
  yank: boolean;
  file?: string;
  version?: string;
  notes?: string;
  channel: "stable" | "beta";
  schema: number;
};

const flagValue = (argv: string[], flag: string): string | undefined => {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`После ${flag} нужно значение.`);
  }
  return value;
};

const parseArgs = (argv: string[]): Args => {
  const channelRaw = flagValue(argv, "--channel") ?? "stable";
  const channel = firmwareChannelSchema.parse(channelRaw);
  const schemaRaw = flagValue(argv, "--schema") ?? "1";
  const schema = Number(schemaRaw);
  if (!Number.isInteger(schema) || schema <= 0) {
    throw new Error(`--schema должен быть положительным целым, а не "${schemaRaw}".`);
  }
  return {
    yank: argv.includes("--yank"),
    file: flagValue(argv, "--file"),
    version: flagValue(argv, "--version"),
    notes: flagValue(argv, "--notes"),
    channel,
    schema,
  };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));

  if (!args.version) {
    throw new Error("Нужен --version X.Y.Z.");
  }

  if (args.yank) {
    const release = await yankRelease(args.version);
    console.log(`🚫  Релиз ${release.providerId} ${release.version} отозван (${release.yankedAt?.toISOString()}).`);
    process.exit(0);
  }

  if (!args.file) throw new Error("Нужен --file <путь к .bin> (либо --yank для отзыва).");
  if (!args.notes) throw new Error("Нужен --notes \"Что нового…\" — changelog показывается пользователю.");

  const release = await publishRelease({
    filePath: path.resolve(args.file),
    version: args.version,
    notes: args.notes,
    channel: args.channel,
    protocolSchema: args.schema,
  });

  console.log(`✅  Опубликован ${release.providerId} ${release.version} (${release.channel})`);
  console.log(`    sha256: ${release.fileSha256}`);
  console.log(`    size:   ${release.fileSize} байт`);
  console.log(`    url:    ${firmwareDownloadUrl(release.version)}`);
  process.exit(0);
};

main().catch((error) => {
  console.error("❌  firmware:publish упал:", error instanceof Error ? error.message : error);
  process.exit(1);
});
