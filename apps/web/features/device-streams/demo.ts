/** Признак синтетических данных не зависит от редактируемого названия устройства. */
export const isDemoStreamDevice = (device: { hardwareId: string }): boolean =>
  device.hardwareId.startsWith("st-demo-");
