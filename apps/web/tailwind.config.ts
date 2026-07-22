import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

// Семантические токены задаются CSS-переменными в app/globals.css (:root / .dark)
// как HSL-каналы, поэтому здесь оборачиваем их в hsl(var(--…) / <alpha-value>) —
// так работает и opacity-модификатор Tailwind (bg-card/50), и тёмная тема.
const token = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

const config: Config = {
  // class-based dark mode: класс .dark на <html> ставит инлайн-скрипт из
  // layout.tsx по cookie nb_theme (или системной теме) до пейнта.
  darkMode: "class",
  // features/** обязателен: там живут клиентские компоненты фич (brew-batches и
  // др.) — без этого глоба их уникальные утилиты (напр. bottom-14 дока варки)
  // молча выпадают из собранного CSS, потому что JIT их не видит.
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        background: token("background"),
        foreground: token("foreground"),
        card: {
          DEFAULT: token("card"),
          foreground: token("card-foreground")
        },
        popover: {
          DEFAULT: token("popover"),
          foreground: token("popover-foreground")
        },
        muted: {
          DEFAULT: token("muted"),
          foreground: token("muted-foreground")
        },
        accent: {
          DEFAULT: token("accent"),
          foreground: token("accent-foreground")
        },
        border: token("border"),
        input: token("input"),
        ring: token("ring"),
        primary: {
          DEFAULT: token("primary"),
          foreground: token("primary-foreground")
        },
        destructive: {
          DEFAULT: token("destructive"),
          foreground: token("destructive-foreground"),
          subtle: token("destructive-subtle"),
          "subtle-foreground": token("destructive-subtle-foreground"),
          border: token("destructive-border")
        },
        success: {
          DEFAULT: token("success"),
          foreground: token("success-foreground"),
          subtle: token("success-subtle"),
          "subtle-foreground": token("success-subtle-foreground")
        },
        warning: {
          DEFAULT: token("warning"),
          foreground: token("warning-foreground"),
          subtle: token("warning-subtle"),
          "subtle-foreground": token("warning-subtle-foreground")
        },
        link: token("link"),
        chart: {
          grid: token("chart-grid"),
          label: token("chart-label"),
          zebra: token("chart-zebra"),
          temp: token("chart-temp"),
          setpoint: token("chart-setpoint"),
          heater: token("chart-heater"),
          fault: token("chart-fault"),
          "fault-bg": token("chart-fault-bg")
        }
      }
    }
  },
  plugins: [
    // Вариант «скин»: skin-hop: применяет утилиту только при классе .skin-hop на
    // <html> (cookie nb_skin), skin-classic: — только без него. Так компоненты
    // несут оба оформления одновременно, а переключение — мгновенное, без JS.
    plugin(({ addVariant }) => {
      addVariant("skin-hop", ".skin-hop &");
      addVariant("skin-classic", "html:not(.skin-hop) &");
    })
  ]
};

export default config;
