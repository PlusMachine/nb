"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { homeLoginHref } from "@/features/home/landing-model";
const links = [["Склад", homeLoginHref("/app/ingredients")], ["Рецепты", "/recipes"], ["Ингредиенты", "/catalog"], ["Стили пива", "/bjcp"], ["Калькуляторы", "/calculators"], ["Статьи", "/articles"]];
export function HomeHeader() {
  const [open, setOpen] = useState(false);
  return <header className="home-header" onKeyDown={event => {
    if (event.key === "Escape") setOpen(false);
  }}>
    <div className="home-header-inner"><Link href="/" className="home-logo" aria-label="NB — главная">N B</Link>
      <nav id="home-navigation" aria-label="Разделы сайта" data-open={open}>{links.map(([label, href]) => <Link key={label} href={href!} onClick={() => setOpen(false)}>{label}</Link>)}<div className="home-mobile-theme"><span>Тема</span><ThemeToggle /></div></nav>
      <div className="home-header-actions"><div className="home-theme"><ThemeToggle /></div><button className="home-menu" type="button" aria-label={open ? "Закрыть меню" : "Открыть меню"} aria-expanded={open} aria-controls="home-navigation" onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}<span>Меню</span></button><Link href="/login" className="home-button">Войти</Link></div>
    </div>
  </header>;
}
