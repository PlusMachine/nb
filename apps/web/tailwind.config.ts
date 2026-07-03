import type { Config } from "tailwindcss";

const config: Config = {
  // features/** обязателен: там живут клиентские компоненты фич (brew-batches и
  // др.) — без этого глоба их уникальные утилиты (напр. bottom-14 дока варки)
  // молча выпадают из собранного CSS, потому что JIT их не видит.
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}"
  ],
  theme: { extend: {} },
  plugins: []
};

export default config;
