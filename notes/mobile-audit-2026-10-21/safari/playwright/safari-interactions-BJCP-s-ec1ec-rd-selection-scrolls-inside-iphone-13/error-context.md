# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: safari-interactions.spec.ts >> BJCP suggestions fit the viewport and keyboard selection scrolls inside
- Location: e2e/safari-interactions.spec.ts:119:1

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.tap: Test timeout of 60000ms exceeded.
Call log:
  - waiting for getByRole('listbox', { name: 'Подсказки BJCP', exact: true }).getByRole('option', { name: /^IPA, APA и хмелевые стили/ })
    - locator resolved to <button type="button" role="option" tabindex="-1" aria-selected="false" id="bjcp-suggestion-family-ipa_hoppy" class="flex w-full items-start justify-between gap-4 px-4 py-3 text-left transition hover:bg-accent bg-card">…</button>
  - attempting tap action
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <span class="inline-flex items-center gap-1.5 font-medium">…</span> from <div class="fixed bottom-[calc(1rem+var(--nb-cookie-banner-h,0px)+var(--nb-bottom-nav-h,0px))] left-1/2 z-[100] -translate-x-1/2">…</div> subtree intercepts pointer events
  - retrying tap action
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <button type="button" class="rounded-full px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-60 border border-amber-900/40 bg-amber-900/10 text-amber-900 hover:bg-amber-900/20 dark:text-amber-100">qa.deep.main.20261020</button> from <div class="fixed bottom-[calc(1rem+var(--nb-cookie-banner-h,0px)+var(--nb-bottom-nav-h,0px))] left-1/2 z-[100] -translate-x-1/2">…</div> subtree intercepts pointer events
  - retrying tap action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <span class="inline-flex items-center gap-1.5 font-medium">…</span> from <div class="fixed bottom-[calc(1rem+var(--nb-cookie-banner-h,0px)+var(--nb-bottom-nav-h,0px))] left-1/2 z-[100] -translate-x-1/2">…</div> subtree intercepts pointer events
    - retrying tap action
      - waiting 100ms
    25 × waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <span class="inline-flex items-center gap-1.5 font-medium">…</span> from <div class="fixed bottom-[calc(1rem+var(--nb-cookie-banner-h,0px)+var(--nb-bottom-nav-h,0px))] left-1/2 z-[100] -translate-x-1/2">…</div> subtree intercepts pointer events
     - retrying tap action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <button type="button" class="rounded-full px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-60 border border-amber-900/40 bg-amber-900/10 text-amber-900 hover:bg-amber-900/20 dark:text-amber-100">qa.deep.main.20261020</button> from <div class="fixed bottom-[calc(1rem+var(--nb-cookie-banner-h,0px)+var(--nb-bottom-nav-h,0px))] left-1/2 z-[100] -translate-x-1/2">…</div> subtree intercepts pointer events
     - retrying tap action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <span class="inline-flex items-center gap-1.5 font-medium">…</span> from <div class="fixed bottom-[calc(1rem+var(--nb-cookie-banner-h,0px)+var(--nb-bottom-nav-h,0px))] left-1/2 z-[100] -translate-x-1/2">…</div> subtree intercepts pointer events
     - retrying tap action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <span class="inline-flex items-center gap-1.5 font-medium">…</span> from <div class="fixed bottom-[calc(1rem+var(--nb-cookie-banner-h,0px)+var(--nb-bottom-nav-h,0px))] left-1/2 z-[100] -translate-x-1/2">…</div> subtree intercepts pointer events
     - retrying tap action
       - waiting 500ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <span class="inline-flex items-center gap-1.5 font-medium">…</span> from <div class="fixed bottom-[calc(1rem+var(--nb-cookie-banner-h,0px)+var(--nb-bottom-nav-h,0px))] left-1/2 z-[100] -translate-x-1/2">…</div> subtree intercepts pointer events
  - retrying tap action
    - waiting 500ms

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e4]:
    - banner [ref=e5]:
      - generic [ref=e6]:
        - link "NB" [ref=e8]:
          - /url: /
        - generic [ref=e9]:
          - link "Войти" [ref=e10]:
            - /url: /login
          - button "Открыть меню" [ref=e11] [cursor=pointer]:
            - img [ref=e12]
    - main [ref=e14]:
      - generic [ref=e15]:
        - generic [ref=e16]:
          - navigation "Навигационная цепочка" [ref=e17]:
            - list [ref=e18]:
              - listitem [ref=e19]:
                - link "Главная" [ref=e20]:
                  - /url: /
              - listitem [ref=e21]: /
              - listitem [ref=e22]: Стили пива по BJCP
          - heading "Стили пива по BJCP" [level=1] [ref=e23]
          - generic [ref=e24]:
            - generic [ref=e25]:
              - generic [ref=e26]: Поиск стилей BJCP
              - img
              - combobox "Поиск стилей BJCP" [expanded] [active] [ref=e27]: IPA
              - button "Очистить поиск" [ref=e28] [cursor=pointer]:
                - img [ref=e29]
            - generic [ref=e32]:
              - generic [ref=e33]:
                - button "Семейства" [ref=e34] [cursor=pointer]:
                  - img [ref=e35]
                  - text: Семейства
                - button "Категории BJCP" [ref=e40] [cursor=pointer]:
                  - img [ref=e41]
                  - text: Категории BJCP
              - button "Фильтры" [ref=e42] [cursor=pointer]:
                - img [ref=e43]
                - text: Фильтры
          - generic [ref=e45]:
            - button "Светлое" [ref=e46] [cursor=pointer]
            - button "Тёмное" [ref=e47] [cursor=pointer]
            - button "IPA / Хмелевое" [ref=e48] [cursor=pointer]
            - button "Лагер" [ref=e49] [cursor=pointer]
            - button "Лёгкое" [ref=e50] [cursor=pointer]
            - button "Крепкое" [ref=e51] [cursor=pointer]
            - button "Кислое" [ref=e52] [cursor=pointer]
        - generic [ref=e53]:
          - complementary [ref=e54]:
            - heading "Семейства" [level=2] [ref=e56]
            - generic [ref=e57]:
              - button "Светлое и питкое 18" [ref=e58] [cursor=pointer]:
                - generic [ref=e59]: Светлое и питкое
                - generic [ref=e60]: "18"
              - button "Янтарные, тёмные и крепкие лагеры 13" [ref=e61] [cursor=pointer]:
                - generic [ref=e62]: Янтарные, тёмные и крепкие лагеры
                - generic [ref=e63]: "13"
              - button "Пшеничное и зерновое 12" [ref=e64] [cursor=pointer]:
                - generic [ref=e65]: Пшеничное и зерновое
                - generic [ref=e66]: "12"
              - button "IPA, APA и хмелевые стили 14" [ref=e67] [cursor=pointer]:
                - generic [ref=e68]: IPA, APA и хмелевые стили
                - generic [ref=e69]: "14"
              - button "Американская классика 9" [ref=e70] [cursor=pointer]:
                - generic [ref=e71]: Американская классика
                - generic [ref=e72]: "9"
              - button "Британские и ирландские эли 15" [ref=e73] [cursor=pointer]:
                - generic [ref=e74]: Британские и ирландские эли
                - generic [ref=e75]: "15"
              - button "Портеры и стауты 12" [ref=e76] [cursor=pointer]:
                - generic [ref=e77]: Портеры и стауты
                - generic [ref=e78]: "12"
              - button "Бельгийские и фермерские стили 11" [ref=e79] [cursor=pointer]:
                - generic [ref=e80]: Бельгийские и фермерские стили
                - generic [ref=e81]: "11"
              - button "Кислые и дикие стили 13" [ref=e82] [cursor=pointer]:
                - generic [ref=e83]: Кислые и дикие стили
                - generic [ref=e84]: "13"
              - button "Фруктовые, пряные и специальные стили 21" [ref=e85] [cursor=pointer]:
                - generic [ref=e86]: Фруктовые, пряные и специальные стили
                - generic [ref=e87]: "21"
              - button "Исторические стили 9" [ref=e88] [cursor=pointer]:
                - generic [ref=e89]: Исторические стили
                - generic [ref=e90]: "9"
              - button "Локальные стили 5" [ref=e91] [cursor=pointer]:
                - generic [ref=e92]: Локальные стили
                - generic [ref=e93]: "5"
          - generic [ref=e94]:
            - generic [ref=e95]:
              - 'heading "Результаты поиска: IPA" [level=2] [ref=e96]'
              - generic [ref=e97]: 14 стилей
            - generic [ref=e98]:
              - link "Открыть стиль X2 IPA Аргента" [ref=e99]:
                - /url: /bjcp/bjcp-x2-ipa-argenta
                - article [ref=e100]:
                  - generic [ref=e104]:
                    - generic [ref=e106]: BJCP X2
                    - generic [ref=e107]:
                      - heading "IPA Аргента" [level=3] [ref=e108]
                      - paragraph [ref=e109]: IPA Argenta
                  - generic [ref=e110]:
                    - generic [ref=e111]:
                      - paragraph [ref=e112]: кат. Аргентинские стили
                      - paragraph [ref=e113]: "Аргентинская версия IPA: заметно хмелевая и горькая, но при этом освежающая, умеренно крепкая и без жёсткости; ключевой признак стиля — высокая питкость при хорошем балансе."
                    - generic [ref=e114]:
                      - generic [ref=e115]:
                        - generic [ref=e116]: ABV
                        - generic [ref=e117]: 5.0 – 6.5%
                      - generic [ref=e118]:
                        - generic [ref=e119]: IBU
                        - generic [ref=e120]: 35 – 60
                      - generic [ref=e121]:
                        - generic [ref=e123]: SRM
                        - generic [ref=e124]: 6 – 15
                      - generic [ref=e125]:
                        - generic [ref=e126]: Брожение
                        - generic [ref=e127]: Эль
                    - generic [ref=e128]:
                      - generic [ref=e129]: Локальный стиль
                      - generic [ref=e130]: IPA
              - link "Открыть стиль 12C Английский IPA" [ref=e131]:
                - /url: /bjcp/bjcp-12c-english-ipa
                - article [ref=e132]:
                  - generic [ref=e136]:
                    - generic [ref=e138]: BJCP 12C
                    - generic [ref=e139]:
                      - heading "Английский IPA" [level=3] [ref=e140]
                      - paragraph [ref=e141]: English IPA
                  - generic [ref=e142]:
                    - generic [ref=e143]:
                      - paragraph [ref=e144]: кат. Светлое пиво стран Содружества
                      - paragraph [ref=e145]: Горький, умеренно крепкий, очень хорошо выброженный британский светлый эль с сухим финишем и выраженным хмелевым ароматом и вкусом.
                    - generic [ref=e146]:
                      - generic [ref=e147]:
                        - generic [ref=e148]: ABV
                        - generic [ref=e149]: 5.0-7.5%
                      - generic [ref=e150]:
                        - generic [ref=e151]: IBU
                        - generic [ref=e152]: 40-60
                      - generic [ref=e153]:
                        - generic [ref=e155]: SRM
                        - generic [ref=e156]: 6-14
                      - generic [ref=e157]:
                        - generic [ref=e158]: Брожение
                        - generic [ref=e159]: Эль
                    - generic [ref=e160]:
                      - generic [ref=e161]: Крепкое
                      - generic [ref=e162]: Светлое
                      - generic [ref=e163]: Эль
              - link "Открыть стиль 21A Американский IPA" [ref=e164]:
                - /url: /bjcp/bjcp-21a-american-ipa
                - article [ref=e165]:
                  - generic [ref=e169]:
                    - generic [ref=e171]: BJCP 21A
                    - generic [ref=e172]:
                      - heading "Американский IPA" [level=3] [ref=e173]
                      - paragraph [ref=e174]: American IPA
                  - generic [ref=e175]:
                    - generic [ref=e176]:
                      - paragraph [ref=e177]: кат. IPA
                      - paragraph [ref=e178]: Явно хмелевой и горький светлый американский эль умеренно высокой крепости, где чистое брожение и суховатый финиш позволяют раскрыться яркому хмелевому профилю.
                    - generic [ref=e179]:
                      - generic [ref=e180]:
                        - generic [ref=e181]: ABV
                        - generic [ref=e182]: 5.5 – 7.5%
                      - generic [ref=e183]:
                        - generic [ref=e184]: IBU
                        - generic [ref=e185]: 40 – 70
                      - generic [ref=e186]:
                        - generic [ref=e188]: SRM
                        - generic [ref=e189]: 6 – 14
                      - generic [ref=e190]:
                        - generic [ref=e191]: Брожение
                        - generic [ref=e192]: Эль
                    - generic [ref=e193]:
                      - generic [ref=e194]: Крепкое
                      - generic [ref=e195]: Светлое
                      - generic [ref=e196]: Эль
              - link "Открыть стиль 21B Специальный IPA" [ref=e197]:
                - /url: /bjcp/bjcp-21b-specialty-ipa
                - article [ref=e198]:
                  - generic [ref=e202]:
                    - generic [ref=e204]: BJCP 21B
                    - generic [ref=e205]:
                      - heading "Специальный IPA" [level=3] [ref=e206]
                      - paragraph [ref=e207]: Specialty IPA
                  - generic [ref=e208]:
                    - generic [ref=e209]:
                      - paragraph [ref=e210]: кат. IPA
                      - paragraph [ref=e211]: Категория для IPA-вариаций, которые по балансу узнаются как IPA — хмелевые, горькие и суховатые, — но отличаются от базовых подстилей дополнительной идеей или стилистическим сдвигом.
                    - generic [ref=e212]:
                      - generic [ref=e213]:
                        - generic [ref=e214]: ABV
                        - generic [ref=e215]: по подстилю
                      - generic [ref=e216]:
                        - generic [ref=e217]: IBU
                        - generic [ref=e218]: по подстилю
                      - generic [ref=e219]:
                        - generic [ref=e221]: SRM
                        - generic [ref=e222]: по подстилю
                      - generic [ref=e223]:
                        - generic [ref=e224]: Брожение
                        - generic [ref=e225]: Эль
              - link "Открыть стиль 21B-Belgian IPA Бельгийский IPA" [ref=e226]:
                - /url: /bjcp/bjcp-21b-belgian-ipa
                - article [ref=e227]:
                  - generic [ref=e231]:
                    - generic [ref=e233]: BJCP 21B-Belgian IPA
                    - generic [ref=e234]:
                      - heading "Бельгийский IPA" [level=3] [ref=e235]
                      - paragraph [ref=e236]: Belgian IPA
                  - generic [ref=e237]:
                    - generic [ref=e238]:
                      - paragraph [ref=e239]: кат. IPA
                      - paragraph [ref=e240]: Сухой и хмелевой IPA, в котором яркий аромат хмеля сочетается с фруктово-пряным профилем бельгийских дрожжей.
                    - generic [ref=e241]:
                      - generic [ref=e242]:
                        - generic [ref=e243]: ABV
                        - generic [ref=e244]: 6.2 – 9.5%
                      - generic [ref=e245]:
                        - generic [ref=e246]: IBU
                        - generic [ref=e247]: 50 – 100
                      - generic [ref=e248]:
                        - generic [ref=e250]: SRM
                        - generic [ref=e251]: 5 – 8
                      - generic [ref=e252]:
                        - generic [ref=e253]: Брожение
                        - generic [ref=e254]: Эль
                    - generic [ref=e255]:
                      - generic [ref=e256]: Крепкое
                      - generic [ref=e257]: Светлое
                      - generic [ref=e258]: Эль
              - link "Открыть стиль 21B-Black IPA Чёрный IPA" [ref=e259]:
                - /url: /bjcp/bjcp-21b-black-ipa
                - article [ref=e260]:
                  - generic [ref=e264]:
                    - generic [ref=e266]: BJCP 21B-Black IPA
                    - generic [ref=e267]:
                      - heading "Чёрный IPA" [level=3] [ref=e268]
                      - paragraph [ref=e269]: Black IPA
                  - generic [ref=e270]:
                    - generic [ref=e271]:
                      - paragraph [ref=e272]: кат. IPA
                      - paragraph [ref=e273]: Тёмный IPA с сухим, хмелевым балансом и мягкой, поддерживающей обжаренностью без грубой жжёности.
                    - generic [ref=e274]:
                      - generic [ref=e275]:
                        - generic [ref=e276]: ABV
                        - generic [ref=e277]: 5.5 – 9.0%
                      - generic [ref=e278]:
                        - generic [ref=e279]: IBU
                        - generic [ref=e280]: 50 – 90
                      - generic [ref=e281]:
                        - generic [ref=e283]: SRM
                        - generic [ref=e284]: 25 – 40
                      - generic [ref=e285]:
                        - generic [ref=e286]: Брожение
                        - generic [ref=e287]: Эль
                    - generic [ref=e288]:
                      - generic [ref=e289]: Крепкое
                      - generic [ref=e290]: Тёмное
                      - generic [ref=e291]: Эль
              - link "Открыть стиль 21B-Brown IPA Коричневый IPA" [ref=e292]:
                - /url: /bjcp/bjcp-21b-brown-ipa
                - article [ref=e293]:
                  - generic [ref=e297]:
                    - generic [ref=e299]: BJCP 21B-Brown IPA
                    - generic [ref=e300]:
                      - heading "Коричневый IPA" [level=3] [ref=e301]
                      - paragraph [ref=e302]: Brown IPA
                  - generic [ref=e303]:
                    - generic [ref=e304]:
                      - paragraph [ref=e305]: кат. IPA
                      - paragraph [ref=e306]: Более солодовая и тёмная вариация IPA с оттенками тёмной карамели, ириса, шоколада и сухофруктов, но всё ещё с узнаваемым хмелевым балансом.
                    - generic [ref=e307]:
                      - generic [ref=e308]:
                        - generic [ref=e309]: ABV
                        - generic [ref=e310]: 5.5 – 7.5%
                      - generic [ref=e311]:
                        - generic [ref=e312]: IBU
                        - generic [ref=e313]: 40 – 70
                      - generic [ref=e314]:
                        - generic [ref=e316]: SRM
                        - generic [ref=e317]: 18 – 35
                      - generic [ref=e318]:
                        - generic [ref=e319]: Брожение
                        - generic [ref=e320]: Эль
                    - generic [ref=e321]:
                      - generic [ref=e322]: Крепкое
                      - generic [ref=e323]: Тёмное
                      - generic [ref=e324]: Эль
              - link "Открыть стиль 21B-Brut IPA Брют IPA" [ref=e325]:
                - /url: /bjcp/bjcp-21b-brut-ipa
                - article [ref=e326]:
                  - generic [ref=e330]:
                    - generic [ref=e332]: BJCP 21B-Brut IPA
                    - generic [ref=e333]:
                      - heading "Брют IPA" [level=3] [ref=e334]
                      - paragraph [ref=e335]: Brut IPA
                  - generic [ref=e336]:
                    - generic [ref=e337]:
                      - paragraph [ref=e338]: кат. IPA
                      - paragraph [ref=e339]: Очень светлый и предельно сухой IPA с высокой карбонизацией, ярким современным хмелем и винно-игристым впечатлением.
                    - generic [ref=e340]:
                      - generic [ref=e341]:
                        - generic [ref=e342]: ABV
                        - generic [ref=e343]: 6.0 – 7.5%
                      - generic [ref=e344]:
                        - generic [ref=e345]: IBU
                        - generic [ref=e346]: 20 – 30
                      - generic [ref=e347]:
                        - generic [ref=e349]: SRM
                        - generic [ref=e350]: 2 – 4
                      - generic [ref=e351]:
                        - generic [ref=e352]: Брожение
                        - generic [ref=e353]: Эль
                    - generic [ref=e354]:
                      - generic [ref=e355]: Крепкое
                      - generic [ref=e356]: Светлое
                      - generic [ref=e357]: Эль
              - link "Открыть стиль 21B-Red IPA Красный IPA" [ref=e358]:
                - /url: /bjcp/bjcp-21b-red-ipa
                - article [ref=e359]:
                  - generic [ref=e363]:
                    - generic [ref=e365]: BJCP 21B-Red IPA
                    - generic [ref=e366]:
                      - heading "Красный IPA" [level=3] [ref=e367]
                      - paragraph [ref=e368]: Red IPA
                  - generic [ref=e369]:
                    - generic [ref=e370]:
                      - paragraph [ref=e371]: кат. IPA
                      - paragraph [ref=e372]: IPA с карамельно-ирисочными и иногда фруктовыми оттенками, но с горьким, хмелевым и суховатым балансом.
                    - generic [ref=e373]:
                      - generic [ref=e374]:
                        - generic [ref=e375]: ABV
                        - generic [ref=e376]: 5.5 – 7.5%
                      - generic [ref=e377]:
                        - generic [ref=e378]: IBU
                        - generic [ref=e379]: 40 – 70
                      - generic [ref=e380]:
                        - generic [ref=e382]: SRM
                        - generic [ref=e383]: 11 – 17
                      - generic [ref=e384]:
                        - generic [ref=e385]: Брожение
                        - generic [ref=e386]: Эль
                    - generic [ref=e387]:
                      - generic [ref=e388]: Крепкое
                      - generic [ref=e389]: Янтарное
                      - generic [ref=e390]: Эль
              - link "Открыть стиль 21B-Rye IPA Ржаной IPA" [ref=e391]:
                - /url: /bjcp/bjcp-21b-rye-ipa
                - article [ref=e392]:
                  - generic [ref=e396]:
                    - generic [ref=e398]: BJCP 21B-Rye IPA
                    - generic [ref=e399]:
                      - heading "Ржаной IPA" [level=3] [ref=e400]
                      - paragraph [ref=e401]: Rye IPA
                  - generic [ref=e402]:
                    - generic [ref=e403]:
                      - paragraph [ref=e404]: кат. IPA
                      - paragraph [ref=e405]: "Американский IPA с заметным вкладом ржаного солода: пряный, зерновой, слегка перечный и более сухой по финишу."
                    - generic [ref=e406]:
                      - generic [ref=e407]:
                        - generic [ref=e408]: ABV
                        - generic [ref=e409]: 5.5 – 8.0%
                      - generic [ref=e410]:
                        - generic [ref=e411]: IBU
                        - generic [ref=e412]: 50 – 75
                      - generic [ref=e413]:
                        - generic [ref=e415]: SRM
                        - generic [ref=e416]: 6 – 14
                      - generic [ref=e417]:
                        - generic [ref=e418]: Брожение
                        - generic [ref=e419]: Эль
                    - generic [ref=e420]:
                      - generic [ref=e421]: Крепкое
                      - generic [ref=e422]: Янтарное
                      - generic [ref=e423]: Эль
              - link "Открыть стиль 21B-White IPA Белый IPA" [ref=e424]:
                - /url: /bjcp/bjcp-21b-white-ipa
                - article [ref=e425]:
                  - generic [ref=e429]:
                    - generic [ref=e431]: BJCP 21B-White IPA
                    - generic [ref=e432]:
                      - heading "Белый IPA" [level=3] [ref=e433]
                      - paragraph [ref=e434]: White IPA
                  - generic [ref=e435]:
                    - generic [ref=e436]:
                      - paragraph [ref=e437]: кат. IPA
                      - paragraph [ref=e438]: Освежающая фруктово-пряная версия IPA с более светлым цветом, меньшим телом и чертами, характерными для Witbier.
                    - generic [ref=e439]:
                      - generic [ref=e440]:
                        - generic [ref=e441]: ABV
                        - generic [ref=e442]: 5.5 – 7.0%
                      - generic [ref=e443]:
                        - generic [ref=e444]: IBU
                        - generic [ref=e445]: 40 – 70
                      - generic [ref=e446]:
                        - generic [ref=e448]: SRM
                        - generic [ref=e449]: 5 – 6
                      - generic [ref=e450]:
                        - generic [ref=e451]: Брожение
                        - generic [ref=e452]: Эль
                    - generic [ref=e453]:
                      - generic [ref=e454]: Крепкое
                      - generic [ref=e455]: Светлое
                      - generic [ref=e456]: Эль
              - link "Открыть стиль 21C Хейзи IPA" [ref=e457]:
                - /url: /bjcp/bjcp-21c-hazy-ipa
                - article [ref=e458]:
                  - generic [ref=e462]:
                    - generic [ref=e464]: BJCP 21C
                    - generic [ref=e465]:
                      - heading "Хейзи IPA" [level=3] [ref=e466]
                      - paragraph [ref=e467]: Hazy IPA
                  - generic [ref=e468]:
                    - generic [ref=e469]:
                      - paragraph [ref=e470]: кат. IPA
                      - paragraph [ref=e471]: American IPA с очень интенсивным фруктовым хмелем, мягким телом, гладкой текстурой и выраженной мутностью; горечь ощущается мягче, чем у традиционных IPA, но хмель остаётся безусловной доминантой.
                    - generic [ref=e472]:
                      - generic [ref=e473]:
                        - generic [ref=e474]: ABV
                        - generic [ref=e475]: 6.0 – 9.0%
                      - generic [ref=e476]:
                        - generic [ref=e477]: IBU
                        - generic [ref=e478]: 25 – 60
                      - generic [ref=e479]:
                        - generic [ref=e481]: SRM
                        - generic [ref=e482]: 3 – 7
                      - generic [ref=e483]:
                        - generic [ref=e484]: Брожение
                        - generic [ref=e485]: Эль
                    - generic [ref=e486]:
                      - generic [ref=e487]: Крепкое
                      - generic [ref=e488]: Светлое
                      - generic [ref=e489]: Эль
              - link "Открыть стиль 22A Двойной IPA" [ref=e490]:
                - /url: /bjcp/bjcp-22a-double-ipa
                - article [ref=e491]:
                  - generic [ref=e495]:
                    - generic [ref=e497]: BJCP 22A
                    - generic [ref=e498]:
                      - heading "Двойной IPA" [level=3] [ref=e499]
                      - paragraph [ref=e500]: Double IPA
                  - generic [ref=e501]:
                    - generic [ref=e502]:
                      - paragraph [ref=e503]: кат. Крепкий американский эль
                      - paragraph [ref=e504]: Очень хмелевой, крепкий и заметно горький светлый эль с сухим финишем и высокой, но контролируемой интенсивностью. Сила должна ощущаться, но питкость остаётся важной частью стиля.
                    - generic [ref=e505]:
                      - generic [ref=e506]:
                        - generic [ref=e507]: ABV
                        - generic [ref=e508]: 7.5 – 10.0%
                      - generic [ref=e509]:
                        - generic [ref=e510]: IBU
                        - generic [ref=e511]: 60 – 100
                      - generic [ref=e512]:
                        - generic [ref=e514]: SRM
                        - generic [ref=e515]: 6 – 14
                      - generic [ref=e516]:
                        - generic [ref=e517]: Брожение
                        - generic [ref=e518]: Эль
                    - generic [ref=e519]:
                      - generic [ref=e520]: Очень крепкое
                      - generic [ref=e521]: Светлое
                      - generic [ref=e522]: Эль
              - link "Открыть стиль 18B Американский пейл-эль" [ref=e523]:
                - /url: /bjcp/bjcp-18b-american-pale-ale
                - article [ref=e524]:
                  - generic [ref=e528]:
                    - generic [ref=e530]: BJCP 18B
                    - generic [ref=e531]:
                      - heading "Американский пейл-эль" [level=3] [ref=e532]
                      - paragraph [ref=e533]: American Pale Ale
                  - generic [ref=e534]:
                    - generic [ref=e535]:
                      - paragraph [ref=e536]: кат. Светлый американский эль
                      - paragraph [ref=e537]: Американский крафтовый эль средней крепости, светлый и заметно хмелевой, но при этом достаточно солодовый, чтобы оставаться сбалансированным и питким.
                    - generic [ref=e538]:
                      - generic [ref=e539]:
                        - generic [ref=e540]: ABV
                        - generic [ref=e541]: 4.5 - 6.2%
                      - generic [ref=e542]:
                        - generic [ref=e543]: IBU
                        - generic [ref=e544]: 30 - 50
                      - generic [ref=e545]:
                        - generic [ref=e547]: SRM
                        - generic [ref=e548]: 5 - 10
                      - generic [ref=e549]:
                        - generic [ref=e550]: Брожение
                        - generic [ref=e551]: Эль
                    - generic [ref=e552]:
                      - generic [ref=e553]: Стандартная крепость
                      - generic [ref=e554]: Светлое
                      - generic [ref=e555]: Эль
      - generic [ref=e556]:
        - heading "Указатель стилей" [level=2] [ref=e557]
        - generic [ref=e558]:
          - generic [ref=e559]:
            - heading "1. Стандартное американское пиво" [level=3] [ref=e560]
            - list [ref=e561]:
              - listitem [ref=e562]:
                - link "1A · Американский лёгкий лагер" [ref=e563]:
                  - /url: /bjcp/bjcp-1a-american-light-lager
              - listitem [ref=e564]:
                - link "1B · Американский лагер" [ref=e565]:
                  - /url: /bjcp/bjcp-1b-american-lager
              - listitem [ref=e566]:
                - link "1C · Крим-эль" [ref=e567]:
                  - /url: /bjcp/bjcp-1c-cream-ale
              - listitem [ref=e568]:
                - link "1D · Американское пшеничное пиво" [ref=e569]:
                  - /url: /bjcp/bjcp-1d-american-wheat-beer
          - generic [ref=e570]:
            - heading "2. Международный лагер" [level=3] [ref=e571]
            - list [ref=e572]:
              - listitem [ref=e573]:
                - link "2A · Международный светлый лагер" [ref=e574]:
                  - /url: /bjcp/bjcp-2a-international-pale-lager
              - listitem [ref=e575]:
                - link "2B · Международный янтарный лагер" [ref=e576]:
                  - /url: /bjcp/bjcp-2b-international-amber-lager
              - listitem [ref=e577]:
                - link "2C · Международный тёмный лагер" [ref=e578]:
                  - /url: /bjcp/bjcp-2c-international-dark-lager
          - generic [ref=e579]:
            - heading "3. Чешский лагер" [level=3] [ref=e580]
            - list [ref=e581]:
              - listitem [ref=e582]:
                - link "3A · Чешский светлый лагер" [ref=e583]:
                  - /url: /bjcp/bjcp-3a-czech-pale-lager
              - listitem [ref=e584]:
                - link "3B · Чешский премиальный светлый лагер" [ref=e585]:
                  - /url: /bjcp/bjcp-3b-czech-premium-pale-lager
              - listitem [ref=e586]:
                - link "3C · Чешский янтарный лагер" [ref=e587]:
                  - /url: /bjcp/bjcp-3c-czech-amber-lager
              - listitem [ref=e588]:
                - link "3D · Чешский тёмный лагер" [ref=e589]:
                  - /url: /bjcp/bjcp-3d-czech-dark-lager
          - generic [ref=e590]:
            - heading "4. Светлый солодовый европейский лагер" [level=3] [ref=e591]
            - list [ref=e592]:
              - listitem [ref=e593]:
                - link "4A · Мюнхенский хеллес" [ref=e594]:
                  - /url: /bjcp/bjcp-4a-munich-helles
              - listitem [ref=e595]:
                - link "4B · Фестбир" [ref=e596]:
                  - /url: /bjcp/bjcp-4b-festbier
              - listitem [ref=e597]:
                - link "4C · Хеллес бок" [ref=e598]:
                  - /url: /bjcp/bjcp-4c-helles-bock
          - generic [ref=e599]:
            - heading "5. Светлое горькое европейское пиво" [level=3] [ref=e600]
            - list [ref=e601]:
              - listitem [ref=e602]:
                - link "5A · Немецкий ляйхтбир" [ref=e603]:
                  - /url: /bjcp/bjcp-5a-german-leichtbier
              - listitem [ref=e604]:
                - link "5B · Кёльш" [ref=e605]:
                  - /url: /bjcp/bjcp-5b-k-lsch
              - listitem [ref=e606]:
                - link "5C · Немецкий хеллес экспортбир" [ref=e607]:
                  - /url: /bjcp/bjcp-5c-german-helles-exportbier
              - listitem [ref=e608]:
                - link "5D · Немецкий пилс" [ref=e609]:
                  - /url: /bjcp/bjcp-5d-german-pils
          - generic [ref=e610]:
            - heading "6. Янтарный солодовый европейский лагер" [level=3] [ref=e611]
            - list [ref=e612]:
              - listitem [ref=e613]:
                - link "6A · Мэрцен" [ref=e614]:
                  - /url: /bjcp/bjcp-6a-m-rzen
              - listitem [ref=e615]:
                - link "6B · Раухбир" [ref=e616]:
                  - /url: /bjcp/bjcp-6b-rauchbier
              - listitem [ref=e617]:
                - link "6C · Дунклес бок" [ref=e618]:
                  - /url: /bjcp/bjcp-6c-dunkles-bock
          - generic [ref=e619]:
            - heading "7. Янтарное горькое европейское пиво" [level=3] [ref=e620]
            - list [ref=e621]:
              - listitem [ref=e622]:
                - link "7A · Венский лагер" [ref=e623]:
                  - /url: /bjcp/bjcp-7a-vienna-lager
              - listitem [ref=e624]:
                - link "7B · Альтбир" [ref=e625]:
                  - /url: /bjcp/bjcp-7b-altbier
          - generic [ref=e626]:
            - heading "8. Тёмный европейский лагер" [level=3] [ref=e627]
            - list [ref=e628]:
              - listitem [ref=e629]:
                - link "8A · Мюнхенский дункель" [ref=e630]:
                  - /url: /bjcp/bjcp-8a-munich-dunkel
              - listitem [ref=e631]:
                - link "8B · Шварцбир" [ref=e632]:
                  - /url: /bjcp/bjcp-8b-schwarzbier
          - generic [ref=e633]:
            - heading "9. Крепкое европейское пиво" [level=3] [ref=e634]
            - list [ref=e635]:
              - listitem [ref=e636]:
                - link "9A · Доппельбок" [ref=e637]:
                  - /url: /bjcp/bjcp-9a-doppelbock
              - listitem [ref=e638]:
                - link "9B · Айсбок" [ref=e639]:
                  - /url: /bjcp/bjcp-9b-eisbock
              - listitem [ref=e640]:
                - link "9C · Балтийский портер" [ref=e641]:
                  - /url: /bjcp/bjcp-9c-baltic-porter
          - generic [ref=e642]:
            - heading "10. Немецкое пшеничное пиво" [level=3] [ref=e643]
            - list [ref=e644]:
              - listitem [ref=e645]:
                - link "10A · Вайсбир" [ref=e646]:
                  - /url: /bjcp/bjcp-10a-weissbier
              - listitem [ref=e647]:
                - link "10B · Тёмный вайсбир" [ref=e648]:
                  - /url: /bjcp/bjcp-10b-dunkles-weissbier
              - listitem [ref=e649]:
                - link "10C · Вайценбок" [ref=e650]:
                  - /url: /bjcp/bjcp-10c-weizenbock
          - generic [ref=e651]:
            - heading "11. Британский биттер" [level=3] [ref=e652]
            - list [ref=e653]:
              - listitem [ref=e654]:
                - link "11A · Ординари биттер" [ref=e655]:
                  - /url: /bjcp/bjcp-11a-ordinary-bitter
              - listitem [ref=e656]:
                - link "11B · Бест биттер" [ref=e657]:
                  - /url: /bjcp/bjcp-11b-best-bitter
              - listitem [ref=e658]:
                - link "11C · Стронг биттер" [ref=e659]:
                  - /url: /bjcp/bjcp-11c-strong-bitter
          - generic [ref=e660]:
            - heading "12. Светлое пиво стран Содружества" [level=3] [ref=e661]
            - list [ref=e662]:
              - listitem [ref=e663]:
                - link "12A · Британский голден-эль" [ref=e664]:
                  - /url: /bjcp/bjcp-12a-british-golden-ale
              - listitem [ref=e665]:
                - link "12B · Австралийский спарклинг-эль" [ref=e666]:
                  - /url: /bjcp/bjcp-12b-australian-sparkling-ale
              - listitem [ref=e667]:
                - link "12C · Английский IPA" [ref=e668]:
                  - /url: /bjcp/bjcp-12c-english-ipa
          - generic [ref=e669]:
            - heading "13. Коричневое британское пиво" [level=3] [ref=e670]
            - list [ref=e671]:
              - listitem [ref=e672]:
                - link "13A · Тёмный майлд" [ref=e673]:
                  - /url: /bjcp/bjcp-13a-dark-mild
              - listitem [ref=e674]:
                - link "13B · Британский браун-эль" [ref=e675]:
                  - /url: /bjcp/bjcp-13b-british-brown-ale
              - listitem [ref=e676]:
                - link "13C · Английский портер" [ref=e677]:
                  - /url: /bjcp/bjcp-13c-english-porter
          - generic [ref=e678]:
            - heading "14. Шотландский эль" [level=3] [ref=e679]
            - list [ref=e680]:
              - listitem [ref=e681]:
                - link "14A · Шотландский лайт" [ref=e682]:
                  - /url: /bjcp/bjcp-14a-scottish-light
              - listitem [ref=e683]:
                - link "14B · Шотландский хэви" [ref=e684]:
                  - /url: /bjcp/bjcp-14b-scottish-heavy
              - listitem [ref=e685]:
                - link "14C · Шотландский экспорт" [ref=e686]:
                  - /url: /bjcp/bjcp-14c-scottish-export
          - generic [ref=e687]:
            - heading "15. Ирландское пиво" [level=3] [ref=e688]
            - list [ref=e689]:
              - listitem [ref=e690]:
                - link "15A · Ирландский красный эль" [ref=e691]:
                  - /url: /bjcp/bjcp-15a-irish-red-ale
              - listitem [ref=e692]:
                - link "15B · Ирландский стаут" [ref=e693]:
                  - /url: /bjcp/bjcp-15b-irish-stout
              - listitem [ref=e694]:
                - link "15C · Ирландский экстра-стаут" [ref=e695]:
                  - /url: /bjcp/bjcp-15c-irish-extra-stout
          - generic [ref=e696]:
            - heading "16. Тёмное британское пиво" [level=3] [ref=e697]
            - list [ref=e698]:
              - listitem [ref=e699]:
                - link "16A · Сладкий стаут" [ref=e700]:
                  - /url: /bjcp/bjcp-16a-sweet-stout
              - listitem [ref=e701]:
                - link "16B · Овсяный стаут" [ref=e702]:
                  - /url: /bjcp/bjcp-16b-oatmeal-stout
              - listitem [ref=e703]:
                - link "16C · Тропический стаут" [ref=e704]:
                  - /url: /bjcp/bjcp-16c-tropical-stout
              - listitem [ref=e705]:
                - link "16D · Иностранный экстра-стаут" [ref=e706]:
                  - /url: /bjcp/bjcp-16d-foreign-extra-stout
          - generic [ref=e707]:
            - heading "17. Крепкий британский эль" [level=3] [ref=e708]
            - list [ref=e709]:
              - listitem [ref=e710]:
                - link "17A · Крепкий британский эль" [ref=e711]:
                  - /url: /bjcp/bjcp-17a-british-strong-ale
              - listitem [ref=e712]:
                - link "17B · Старый эль" [ref=e713]:
                  - /url: /bjcp/bjcp-17b-old-ale
              - listitem [ref=e714]:
                - link "17C · Уи-хэви" [ref=e715]:
                  - /url: /bjcp/bjcp-17c-wee-heavy
              - listitem [ref=e716]:
                - link "17D · Английский барливайн" [ref=e717]:
                  - /url: /bjcp/bjcp-17d-english-barley-wine
          - generic [ref=e718]:
            - heading "18. Светлый американский эль" [level=3] [ref=e719]
            - list [ref=e720]:
              - listitem [ref=e721]:
                - link "18A · Блонд-эль" [ref=e722]:
                  - /url: /bjcp/bjcp-18a-blonde-ale
              - listitem [ref=e723]:
                - link "18B · Американский пейл-эль" [ref=e724]:
                  - /url: /bjcp/bjcp-18b-american-pale-ale
          - generic [ref=e725]:
            - heading "19. Янтарное и коричневое американское пиво" [level=3] [ref=e726]
            - list [ref=e727]:
              - listitem [ref=e728]:
                - link "19A · Американский янтарный эль" [ref=e729]:
                  - /url: /bjcp/bjcp-19a-american-amber-ale
              - listitem [ref=e730]:
                - link "19B · Калифорнийский коммон" [ref=e731]:
                  - /url: /bjcp/bjcp-19b-california-common
              - listitem [ref=e732]:
                - link "19C · Американский браун-эль" [ref=e733]:
                  - /url: /bjcp/bjcp-19c-american-brown-ale
          - generic [ref=e734]:
            - heading "20. Американский портер и стаут" [level=3] [ref=e735]
            - list [ref=e736]:
              - listitem [ref=e737]:
                - link "20A · Американский портер" [ref=e738]:
                  - /url: /bjcp/bjcp-20a-american-porter
              - listitem [ref=e739]:
                - link "20B · Американский стаут" [ref=e740]:
                  - /url: /bjcp/bjcp-20b-american-stout
              - listitem [ref=e741]:
                - link "20C · Имперский стаут" [ref=e742]:
                  - /url: /bjcp/bjcp-20c-imperial-stout
          - generic [ref=e743]:
            - heading "21. IPA" [level=3] [ref=e744]
            - list [ref=e745]:
              - listitem [ref=e746]:
                - link "21A · Американский IPA" [ref=e747]:
                  - /url: /bjcp/bjcp-21a-american-ipa
              - listitem [ref=e748]:
                - link "21B · Специальный IPA" [ref=e749]:
                  - /url: /bjcp/bjcp-21b-specialty-ipa
              - listitem [ref=e750]:
                - link "21B-Belgian IPA · Бельгийский IPA" [ref=e751]:
                  - /url: /bjcp/bjcp-21b-belgian-ipa
              - listitem [ref=e752]:
                - link "21B-Black IPA · Чёрный IPA" [ref=e753]:
                  - /url: /bjcp/bjcp-21b-black-ipa
              - listitem [ref=e754]:
                - link "21B-Brown IPA · Коричневый IPA" [ref=e755]:
                  - /url: /bjcp/bjcp-21b-brown-ipa
              - listitem [ref=e756]:
                - link "21B-Brut IPA · Брют IPA" [ref=e757]:
                  - /url: /bjcp/bjcp-21b-brut-ipa
              - listitem [ref=e758]:
                - link "21B-Red IPA · Красный IPA" [ref=e759]:
                  - /url: /bjcp/bjcp-21b-red-ipa
              - listitem [ref=e760]:
                - link "21B-Rye IPA · Ржаной IPA" [ref=e761]:
                  - /url: /bjcp/bjcp-21b-rye-ipa
              - listitem [ref=e762]:
                - link "21B-White IPA · Белый IPA" [ref=e763]:
                  - /url: /bjcp/bjcp-21b-white-ipa
              - listitem [ref=e764]:
                - link "21C · Хейзи IPA" [ref=e765]:
                  - /url: /bjcp/bjcp-21c-hazy-ipa
          - generic [ref=e766]:
            - heading "22. Крепкий американский эль" [level=3] [ref=e767]
            - list [ref=e768]:
              - listitem [ref=e769]:
                - link "22A · Двойной IPA" [ref=e770]:
                  - /url: /bjcp/bjcp-22a-double-ipa
              - listitem [ref=e771]:
                - link "22B · Американский крепкий эль" [ref=e772]:
                  - /url: /bjcp/bjcp-22b-american-strong-ale
              - listitem [ref=e773]:
                - link "22C · Американский барли вайн" [ref=e774]:
                  - /url: /bjcp/bjcp-22c-american-barleywine
              - listitem [ref=e775]:
                - link "22D · Уитвайн" [ref=e776]:
                  - /url: /bjcp/bjcp-22d-wheatwine
          - generic [ref=e777]:
            - heading "23. Европейский кислый эль" [level=3] [ref=e778]
            - list [ref=e779]:
              - listitem [ref=e780]:
                - link "23A · Берлинер вайссе" [ref=e781]:
                  - /url: /bjcp/bjcp-23a-berliner-weisse
              - listitem [ref=e782]:
                - link "23B · Фламандский красный эль" [ref=e783]:
                  - /url: /bjcp/bjcp-23b-flanders-red-ale
              - listitem [ref=e784]:
                - link "23C · Оуд браун" [ref=e785]:
                  - /url: /bjcp/bjcp-23c-oud-bruin
              - listitem [ref=e786]:
                - link "23D · Ламбик" [ref=e787]:
                  - /url: /bjcp/bjcp-23d-lambic
              - listitem [ref=e788]:
                - link "23E · Гёз" [ref=e789]:
                  - /url: /bjcp/bjcp-23e-gueuze
              - listitem [ref=e790]:
                - link "23F · Фруктовый ламбик" [ref=e791]:
                  - /url: /bjcp/bjcp-23f-fruit-lambic
              - listitem [ref=e792]:
                - link "23G · Гозе" [ref=e793]:
                  - /url: /bjcp/bjcp-23g-gose
          - generic [ref=e794]:
            - heading "24. Бельгийский эль" [level=3] [ref=e795]
            - list [ref=e796]:
              - listitem [ref=e797]:
                - link "24A · Витбир" [ref=e798]:
                  - /url: /bjcp/bjcp-24a-witbier
              - listitem [ref=e799]:
                - link "24B · Бельгийский светлый эль" [ref=e800]:
                  - /url: /bjcp/bjcp-24b-belgian-pale-ale
              - listitem [ref=e801]:
                - link "24C · Бьер де гард" [ref=e802]:
                  - /url: /bjcp/bjcp-24c-bi-re-de-garde
          - generic [ref=e803]:
            - heading "25. Крепкий бельгийский эль" [level=3] [ref=e804]
            - list [ref=e805]:
              - listitem [ref=e806]:
                - link "25A · Бельгийский блонд-эль" [ref=e807]:
                  - /url: /bjcp/bjcp-25a-belgian-blond-ale
              - listitem [ref=e808]:
                - link "25B · Сэзон" [ref=e809]:
                  - /url: /bjcp/bjcp-25b-saison
              - listitem [ref=e810]:
                - link "25C · Бельгийский крепкий золотой эль" [ref=e811]:
                  - /url: /bjcp/bjcp-25c-belgian-golden-strong-ale
          - generic [ref=e812]:
            - heading "26. Монастырский эль" [level=3] [ref=e813]
            - list [ref=e814]:
              - listitem [ref=e815]:
                - link "26A · Бельгийский сингл" [ref=e816]:
                  - /url: /bjcp/bjcp-26a-belgian-single
              - listitem [ref=e817]:
                - link "26B · Бельгийский дуббель" [ref=e818]:
                  - /url: /bjcp/bjcp-26b-belgian-dubbel
              - listitem [ref=e819]:
                - link "26C · Бельгийский трипель" [ref=e820]:
                  - /url: /bjcp/bjcp-26c-belgian-tripel
              - listitem [ref=e821]:
                - link "26D · Бельгийский крепкий тёмный эль" [ref=e822]:
                  - /url: /bjcp/bjcp-26d-belgian-dark-strong-ale
          - generic [ref=e823]:
            - heading "27. Историческое пиво" [level=3] [ref=e824]
            - list [ref=e825]:
              - listitem [ref=e826]:
                - link "27-Kellerbier · Келлербир" [ref=e827]:
                  - /url: /bjcp/bjcp-27-kellerbier
              - listitem [ref=e828]:
                - link "27-Kentucky-Common · Кентукки коммон" [ref=e829]:
                  - /url: /bjcp/bjcp-27-kentucky-common
              - listitem [ref=e830]:
                - link "27-Lichtenhainer · Лихтенхайнер" [ref=e831]:
                  - /url: /bjcp/bjcp-27-lichtenhainer
              - listitem [ref=e832]:
                - link "27-London-Brown-Ale · Лондонский браун-эль" [ref=e833]:
                  - /url: /bjcp/bjcp-27-london-brown-ale
              - listitem [ref=e834]:
                - link "27-Piwo-Grodziskie · Пиво гродзиске" [ref=e835]:
                  - /url: /bjcp/bjcp-27-piwo-grodziskie
              - listitem [ref=e836]:
                - link "27-Pre-Prohibition-Lager · Лагер эпохи до сухого закона" [ref=e837]:
                  - /url: /bjcp/bjcp-27-pre-prohibition-lager
              - listitem [ref=e838]:
                - link "27-Pre-Prohibition-Porter · Портер эпохи до сухого закона" [ref=e839]:
                  - /url: /bjcp/bjcp-27-pre-prohibition-porter
              - listitem [ref=e840]:
                - link "27-Roggenbier · Роггенбир" [ref=e841]:
                  - /url: /bjcp/bjcp-27-roggenbier
              - listitem [ref=e842]:
                - link "27-Sahti · Сахти" [ref=e843]:
                  - /url: /bjcp/bjcp-27-sahti
          - generic [ref=e844]:
            - heading "28. Американский вайлд-эль" [level=3] [ref=e845]
            - list [ref=e846]:
              - listitem [ref=e847]:
                - link "28A · Бретт-пиво" [ref=e848]:
                  - /url: /bjcp/bjcp-28a-brett-beer
              - listitem [ref=e849]:
                - link "28B · Кислое пиво смешанного брожения" [ref=e850]:
                  - /url: /bjcp/bjcp-28b-mixed-fermentation-sour-beer
              - listitem [ref=e851]:
                - link "28C · Специальное дикое пиво" [ref=e852]:
                  - /url: /bjcp/bjcp-28c-wild-specialty-beer
              - listitem [ref=e853]:
                - link "28D · Чисто кислое пиво" [ref=e854]:
                  - /url: /bjcp/bjcp-28d-straight-sour-beer
          - generic [ref=e855]:
            - heading "29. Фруктовое пиво" [level=3] [ref=e856]
            - list [ref=e857]:
              - listitem [ref=e858]:
                - link "29A · Фруктовое пиво" [ref=e859]:
                  - /url: /bjcp/bjcp-29a-fruit-beer
              - listitem [ref=e860]:
                - link "29B · Фруктово-пряное пиво" [ref=e861]:
                  - /url: /bjcp/bjcp-29b-fruit-and-spice-beer
              - listitem [ref=e862]:
                - link "29C · Специальное фруктовое пиво" [ref=e863]:
                  - /url: /bjcp/bjcp-29c-specialty-fruit-beer
              - listitem [ref=e864]:
                - link "29D · Виноградный эль" [ref=e865]:
                  - /url: /bjcp/bjcp-29d-grape-ale
          - generic [ref=e866]:
            - heading "30. Пиво со специями, травами и овощами" [level=3] [ref=e867]
            - list [ref=e868]:
              - listitem [ref=e869]:
                - link "30A · Пиво со специями, травами или овощами" [ref=e870]:
                  - /url: /bjcp/bjcp-30a-spice-herb-or-vegetable-beer
              - listitem [ref=e871]:
                - link "30B · Осеннее сезонное пиво" [ref=e872]:
                  - /url: /bjcp/bjcp-30b-autumn-seasonal-beer
              - listitem [ref=e873]:
                - link "30C · Зимнее сезонное пиво" [ref=e874]:
                  - /url: /bjcp/bjcp-30c-winter-seasonal-beer
              - listitem [ref=e875]:
                - link "30D · Специальное пиво со специями, травами или овощами" [ref=e876]:
                  - /url: /bjcp/bjcp-30d-specialty-spice-beer
          - generic [ref=e877]:
            - heading "31. Пиво с альтернативными зерновыми и сахарами" [level=3] [ref=e878]
            - list [ref=e879]:
              - listitem [ref=e880]:
                - link "31A · Пиво с альтернативными зерновыми" [ref=e881]:
                  - /url: /bjcp/bjcp-31a-alternative-grain-beer
              - listitem [ref=e882]:
                - link "31B · Пиво с альтернативными сахарами" [ref=e883]:
                  - /url: /bjcp/bjcp-31b-alternative-sugar-beer
          - generic [ref=e884]:
            - heading "32. Копчёное пиво" [level=3] [ref=e885]
            - list [ref=e886]:
              - listitem [ref=e887]:
                - link "32A · Копчёная версия классического стиля" [ref=e888]:
                  - /url: /bjcp/bjcp-32a-classic-style-smoked-beer
              - listitem [ref=e889]:
                - link "32B · Специальное копчёное пиво" [ref=e890]:
                  - /url: /bjcp/bjcp-32b-specialty-smoked-beer
          - generic [ref=e891]:
            - heading "33. Пиво с древесной выдержкой" [level=3] [ref=e892]
            - list [ref=e893]:
              - listitem [ref=e894]:
                - link "33A · Пиво с древесной выдержкой" [ref=e895]:
                  - /url: /bjcp/bjcp-33a-wood-aged-beer
              - listitem [ref=e896]:
                - link "33B · Специальное пиво с древесной выдержкой" [ref=e897]:
                  - /url: /bjcp/bjcp-33b-specialty-wood-aged-beer
          - generic [ref=e898]:
            - heading "34. Специальное пиво" [level=3] [ref=e899]
            - list [ref=e900]:
              - listitem [ref=e901]:
                - link "34A · Специальное пиво по коммерческому образцу" [ref=e902]:
                  - /url: /bjcp/bjcp-34a-commercial-specialty-beer
              - listitem [ref=e903]:
                - link "34B · Пиво смешанного стилевого типа" [ref=e904]:
                  - /url: /bjcp/bjcp-34b-mixed-style-beer
              - listitem [ref=e905]:
                - link "34C · Экспериментальное пиво" [ref=e906]:
                  - /url: /bjcp/bjcp-34c-experimental-beer
          - generic [ref=e907]:
            - heading "X-AR. Аргентинские стили" [level=3] [ref=e908]
            - list [ref=e909]:
              - listitem [ref=e910]:
                - link "X1 · Дорада Пампеана" [ref=e911]:
                  - /url: /bjcp/bjcp-x1-dorada-pampeana
              - listitem [ref=e912]:
                - link "X2 · IPA Аргента" [ref=e913]:
                  - /url: /bjcp/bjcp-x2-ipa-argenta
          - generic [ref=e914]:
            - heading "X-BR. Бразильские стили" [level=3] [ref=e915]
            - list [ref=e916]:
              - listitem [ref=e917]:
                - link "X4 · Катарина сауэр" [ref=e918]:
                  - /url: /bjcp/bjcp-x4-catharina-sour
          - generic [ref=e919]:
            - heading "X-IT. Итальянские стили" [level=3] [ref=e920]
            - list [ref=e921]:
              - listitem [ref=e922]:
                - link "X3 · Итальянский виноградный эль" [ref=e923]:
                  - /url: /bjcp/bjcp-x3-italian-grape-ale
          - generic [ref=e924]:
            - heading "X-NZ. Новозеландские стили" [level=3] [ref=e925]
            - list [ref=e926]:
              - listitem [ref=e927]:
                - link "X5 · Новозеландский пилснер" [ref=e928]:
                  - /url: /bjcp/bjcp-x5-new-zealand-pilsner
    - contentinfo [ref=e929]:
      - generic [ref=e930]:
        - generic [ref=e931]:
          - paragraph [ref=e932]: NB
          - paragraph [ref=e933]: "Платформа для домашних пивоваров: каталог ингредиентов, склад, рецепты и BJCP в одном месте."
          - paragraph [ref=e934]: 18+ · Материалы носят информационный характер. Чрезмерное употребление алкоголя вредит вашему здоровью.
        - generic [ref=e935]:
          - paragraph [ref=e936]: Разделы
          - list [ref=e937]:
            - listitem [ref=e938]:
              - link "Рецепты" [ref=e939]:
                - /url: /recipes
            - listitem [ref=e940]:
              - link "Стили пива" [ref=e941]:
                - /url: /bjcp
            - listitem [ref=e942]:
              - link "Калькуляторы" [ref=e943]:
                - /url: /calculators
            - listitem [ref=e944]:
              - link "Статьи" [ref=e945]:
                - /url: /articles
            - listitem [ref=e946]:
              - link "Каталог" [ref=e947]:
                - /url: /catalog
            - listitem [ref=e948]:
              - link "Маркет" [ref=e949]:
                - /url: /market
            - listitem [ref=e950]:
              - link "BrewForge" [ref=e951]:
                - /url: /brewforge
        - generic [ref=e952]:
          - paragraph [ref=e953]: Правовая информация
          - list [ref=e954]:
            - listitem [ref=e955]:
              - link "Пользовательское соглашение" [ref=e956]:
                - /url: /legal/terms
            - listitem [ref=e957]:
              - link "Политика конфиденциальности" [ref=e958]:
                - /url: /legal/privacy
            - listitem [ref=e959]:
              - link "Согласие на обработку данных" [ref=e960]:
                - /url: /legal/consent
            - listitem [ref=e961]:
              - link "Использование cookie" [ref=e962]:
                - /url: /legal/cookies
        - generic [ref=e963]:
          - paragraph [ref=e964]: Аккаунт
          - list [ref=e965]:
            - listitem [ref=e966]:
              - link "Войти" [ref=e967]:
                - /url: /login
      - paragraph [ref=e969]: © 2026 NB — платформа для домашних пивоваров
  - generic [ref=e971]:
    - generic [ref=e972]:
      - img [ref=e973]
      - text: Гостевой просмотр (dev)
    - generic [ref=e976]:
      - generic [ref=e977]: "Вернуться в:"
      - button "qa.mobile.20261021" [ref=e978] [cursor=pointer]
      - button "qa.deep.main.20261020" [ref=e979] [cursor=pointer]
      - button "qa.admin" [ref=e980] [cursor=pointer]
  - button "Обратная связь" [ref=e981] [cursor=pointer]:
    - img [ref=e982]
  - region "Уведомления (F8)":
    - list
  - button "Open Next.js Dev Tools" [ref=e989] [cursor=pointer]:
    - img [ref=e990]
  - alert [ref=e995]
  - listbox "Подсказки BJCP" [ref=e997]:
    - generic [ref=e998]:
      - generic [ref=e999]: Стили
      - option "X2 · IPA Аргента IPA Argenta · Локальные стили" [selected] [ref=e1000] [cursor=pointer]:
        - generic [ref=e1001]:
          - paragraph [ref=e1002]: X2 · IPA Аргента
          - paragraph [ref=e1003]: IPA Argenta · Локальные стили
        - img [ref=e1004]
      - option "12C · Английский IPA English IPA · IPA, APA и хмелевые стили" [ref=e1006] [cursor=pointer]:
        - generic [ref=e1007]:
          - paragraph [ref=e1008]: 12C · Английский IPA
          - paragraph [ref=e1009]: English IPA · IPA, APA и хмелевые стили
        - img [ref=e1010]
      - option "21A · Американский IPA American IPA · IPA, APA и хмелевые стили" [ref=e1012] [cursor=pointer]:
        - generic [ref=e1013]:
          - paragraph [ref=e1014]: 21A · Американский IPA
          - paragraph [ref=e1015]: American IPA · IPA, APA и хмелевые стили
        - img [ref=e1016]
      - option "21B · Специальный IPA Specialty IPA · IPA, APA и хмелевые стили" [ref=e1018] [cursor=pointer]:
        - generic [ref=e1019]:
          - paragraph [ref=e1020]: 21B · Специальный IPA
          - paragraph [ref=e1021]: Specialty IPA · IPA, APA и хмелевые стили
        - img [ref=e1022]
      - option "21B-Belgian IPA · Бельгийский IPA Belgian IPA · IPA, APA и хмелевые стили" [ref=e1024] [cursor=pointer]:
        - generic [ref=e1025]:
          - paragraph [ref=e1026]: 21B-Belgian IPA · Бельгийский IPA
          - paragraph [ref=e1027]: Belgian IPA · IPA, APA и хмелевые стили
        - img [ref=e1028]
      - option "21B-Black IPA · Чёрный IPA Black IPA · IPA, APA и хмелевые стили" [ref=e1030] [cursor=pointer]:
        - generic [ref=e1031]:
          - paragraph [ref=e1032]: 21B-Black IPA · Чёрный IPA
          - paragraph [ref=e1033]: Black IPA · IPA, APA и хмелевые стили
        - img [ref=e1034]
    - generic [ref=e1036]:
      - generic [ref=e1037]: Семейства
      - 'option "IPA, APA и хмелевые стили Стилей: 14" [ref=e1038] [cursor=pointer]':
        - generic [ref=e1039]:
          - paragraph [ref=e1040]: IPA, APA и хмелевые стили
          - paragraph [ref=e1041]: "Стилей: 14"
        - img [ref=e1042]
    - generic [ref=e1044]:
      - generic [ref=e1045]: Категории BJCP
      - 'option "21 · IPA Стилей: 10" [ref=e1046] [cursor=pointer]':
        - generic [ref=e1047]:
          - paragraph [ref=e1048]: 21 · IPA
          - paragraph [ref=e1049]: "Стилей: 10"
        - img [ref=e1050]
```

# Test source

```ts
  40  |     await expect(disclosure).toBeHidden();
  41  |     await expect(description).toBeVisible();
  42  |   }
  43  |   const originalViewport = page.viewportSize()!;
  44  |   await page.setViewportSize({ width: 375, height: 715 });
  45  |   await expect(disclosure.locator("summary")).toBeVisible();
  46  |   expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(717);
  47  |   await page.setViewportSize(originalViewport);
  48  |   // WebKit updates its touch coordinates after the viewport's next paint.
  49  |   await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  50  |   await expect(page.getByRole("link", { name: "Рецепт этого пива", exact: true })).toBeInViewport();
  51  |   await page.getByRole("link", { name: "Рецепт этого пива", exact: true }).tap();
  52  |   await expect(page).toHaveURL(/\/recipes\/pilsner-urquell$/);
  53  | });
  54  | 
  55  | test("QR feedback leaves recipe actions uncovered and can be opened twice", async ({ page }) => {
  56  |   await openBeer(page);
  57  |   const feedback = page.getByRole("button", { name: "Обратная связь", exact: true });
  58  |   const recipe = page.getByRole("link", { name: "Рецепт этого пива", exact: true });
  59  |   const [fab, link] = await Promise.all([feedback.boundingBox(), recipe.boundingBox()]);
  60  |   expect(fab).not.toBeNull();
  61  |   expect(link).not.toBeNull();
  62  |   const overlap = Math.max(0, Math.min(fab!.x + fab!.width, link!.x + link!.width) - Math.max(fab!.x, link!.x))
  63  |     * Math.max(0, Math.min(fab!.y + fab!.height, link!.y + link!.height) - Math.max(fab!.y, link!.y));
  64  |   expect(overlap).toBe(0);
  65  |   expect(fab!.width).toBeGreaterThanOrEqual(44);
  66  |   expect(fab!.height).toBeGreaterThanOrEqual(44);
  67  |   const submissions: string[] = [];
  68  |   page.on("request", request => {
  69  |     if (request.method() === "POST" && new URL(request.url()).pathname === "/api/feedback") submissions.push(request.url());
  70  |   });
  71  |   for (let cycle = 0; cycle < 2; cycle++) {
  72  |     await feedback.tap();
  73  |     const dialog = page.getByRole("dialog", { name: "Обратная связь", exact: true });
  74  |     await expect(dialog).toBeVisible();
  75  |     await dialog.getByRole("textbox", { name: "Сообщение", exact: true }).fill("ab");
  76  |     await dialog.getByRole("button", { name: "Отправить", exact: true }).tap();
  77  |     await expect(dialog.getByRole("alert")).toContainText("минимум 5 символов");
  78  |     await dialog.getByRole("button", { name: "Отмена", exact: true }).tap();
  79  |     await expect(dialog).toBeHidden();
  80  |   }
  81  |   expect(submissions).toEqual([]);
  82  | });
  83  | 
  84  | test("label date and description remain editable with readable touch fields", async ({ page }) => {
  85  |   await page.goto("/labels");
  86  |   await page.waitForFunction(() => !window.history.pushState.toString().includes("[native code]"));
  87  |   await page.addStyleTag({ content: "body > div.fixed:has(.bg-warning-subtle) { display: none !important; }" });
  88  |   await page.getByRole("button", { name: "75×120 мм", exact: true }).tap();
  89  |   const date = page.getByLabel("Дата розлива", { exact: true });
  90  |   await date.tap();
  91  |   await date.fill("2026-02-28");
  92  |   await date.press("Tab");
  93  |   await expect(date).toHaveValue("2026-02-28");
  94  |   const description = page.getByRole("textbox", { name: "Описание", exact: true });
  95  |   await description.tap();
  96  |   await description.fill("Проверка описания в WebKit");
  97  |   await description.press("Tab");
  98  |   await expect(page.getByRole("link", { name: "Скачать PNG", exact: true })).toHaveAttribute("href", /bottlingDate=2026-02-28/);
  99  |   const smallFields = await page.locator("input:visible:not([type=checkbox]),textarea:visible").evaluateAll(elements =>
  100 |     elements.filter(element => parseFloat(getComputedStyle(element).fontSize) < 16).map(element => element.id)
  101 |   );
  102 |   expect(smallFields).toEqual([]);
  103 |   expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  104 | });
  105 | 
  106 | test("BJCP waits for its handlers before accepting the first query", async ({ page }) => {
  107 |   let releaseScripts!: () => void;
  108 |   const scriptsReady = new Promise<void>(resolve => { releaseScripts = resolve; });
  109 |   await page.route("**/_next/static/**/*.js*", async route => {
  110 |     await scriptsReady;
  111 |     await route.continue();
  112 |   });
  113 |   try {
  114 |     await page.goto("/bjcp", { waitUntil: "commit" });
  115 |     const search = page.getByRole("combobox", { name: "Поиск стилей BJCP", exact: true });
  116 |     await expect(search).toBeVisible();
  117 |     await expect(search).toBeDisabled();
  118 |     releaseScripts();
  119 |     await expect(search).toBeEnabled({ timeout: 20_000 });
  120 |     await search.tap();
  121 |     await search.pressSequentially("IPA");
  122 |     await expect(search).toHaveValue("IPA");
  123 |     await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("IPA");
  124 |   } finally {
  125 |     releaseScripts();
  126 |   }
  127 | });
  128 | 
  129 | test("BJCP suggestions fit the viewport and keyboard selection scrolls inside", async ({ page }) => {
  130 |   await page.goto("/bjcp");
  131 |   const search = page.getByRole("combobox", { name: "Поиск стилей BJCP", exact: true });
  132 |   await search.fill("IPA");
  133 |   const list = page.getByRole("listbox", { name: "Подсказки BJCP", exact: true });
  134 |   await expect(list).toBeVisible();
  135 |   const viewport = page.viewportSize()!;
  136 |   await expect.poll(async () => {
  137 |     const box = await list.boundingBox();
  138 |     return !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1;
  139 |   }).toBe(true);
> 140 |   expect((await list.boundingBox())!.height).toBeLessThanOrEqual(320);
      |                                                                          ^ Error: locator.tap: Test timeout of 60000ms exceeded.
  141 |   const options = list.getByRole("option");
  142 |   for (let index = 1; index < await options.count(); index++) await search.press("ArrowDown");
  143 |   await expect(options.last()).toHaveAttribute("aria-selected", "true");
  144 |   await expect(options.last()).toBeInViewport({ ratio: 0.95 });
  145 |   await search.press("Escape");
  146 |   await expect(list).toBeHidden();
  147 |   await expect(search).toBeFocused();
  148 |   await search.press("ArrowDown");
  149 |   await expect(list).toBeVisible();
  150 |   await list.getByRole("option", { name: /^IPA, APA и хмелевые стили/ }).tap();
  151 |   await expect(list).toBeHidden();
  152 |   await expect.poll(() => new URL(page.url()).searchParams.get("family")).not.toBeNull();
  153 |   await search.fill("pilsner");
  154 |   await expect(list).toBeVisible();
  155 |   await page.getByRole("button", { name: "Очистить поиск", exact: true }).tap();
  156 |   await expect(search).toHaveValue("");
  157 |   await expect(list).toBeHidden();
  158 | });
  159 | 
  160 | test("cookie choice closes the banner and survives a reload", async ({ page, context }) => {
  161 |   await context.clearCookies();
  162 |   await page.goto("/bjcp");
  163 |   const banner = page.getByRole("region", { name: "Использование файлов cookie", exact: true });
  164 |   await expect(banner).toBeVisible();
  165 |   await banner.getByRole("button", { name: "Только необходимые", exact: true }).tap();
  166 |   await expect(banner).toBeHidden();
  167 |   const consent = (await context.cookies()).find(cookie => cookie.name === "nb_cookie_consent");
  168 |   expect(decodeURIComponent(consent!.value)).toBe("1:necessary");
  169 |   await page.reload();
  170 |   const search = page.getByRole("combobox", { name: "Поиск стилей BJCP", exact: true });
  171 |   await search.fill("IPA");
  172 |   await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("IPA");
  173 |   await expect(banner).toBeHidden();
  174 | });
  175 | 
```