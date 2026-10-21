# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mobile-audit.spec.ts >> M03/M06: admin navigation and table do not widen document
- Location: e2e/mobile-audit.spec.ts:72:1

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e4]:
    - complementary [ref=e5]:
      - link "NB АДМИНКА" [ref=e7]:
        - /url: /admin
        - text: NB
        - generic [ref=e8]: АДМИНКА
      - generic [ref=e9]:
        - navigation "Навигация админки" [ref=e10]:
          - link "Обзор" [ref=e11]:
            - /url: /admin
            - img [ref=e12]
            - text: Обзор
          - paragraph [ref=e17]: Каталог
          - link "Ингредиенты" [ref=e18]:
            - /url: /admin/ingredients
            - img [ref=e19]
            - generic [ref=e29]: Ингредиенты
          - link "Модерация ингредиентов" [ref=e30]:
            - /url: /admin/ingredients/moderation
            - img [ref=e31]
            - generic [ref=e35]: Модерация ингредиентов
          - link "Объединение дублей" [ref=e36]:
            - /url: /admin/ingredients/merge
            - img [ref=e37]
            - generic [ref=e41]: Объединение дублей
          - paragraph [ref=e42]: Сообщество
          - link "Пользователи" [ref=e43]:
            - /url: /admin/users
            - img [ref=e44]
            - generic [ref=e49]: Пользователи
          - link "Рецепты" [ref=e50]:
            - /url: /admin/recipes
            - img [ref=e51]
            - generic [ref=e53]: Рецепты
          - link "Обратная связь" [ref=e54]:
            - /url: /admin/feedback
            - img [ref=e55]
            - generic [ref=e57]: Обратная связь
          - link "Маркет" [ref=e58]:
            - /url: /admin/masters
            - img [ref=e59]
            - generic [ref=e64]: Маркет
          - paragraph [ref=e65]: Контент
          - link "Статьи" [ref=e66]:
            - /url: /admin/articles
            - img [ref=e67]
            - generic [ref=e69]: Статьи
          - paragraph [ref=e70]: Устройства
          - link "Устройства" [ref=e71]:
            - /url: /admin/devices
            - img [ref=e72]
            - generic [ref=e75]: Устройства
          - link "Прошивки" [ref=e76]:
            - /url: /admin/firmware
            - img [ref=e77]
            - generic [ref=e81]: Прошивки
          - link "Пуш-уведомления" [ref=e82]:
            - /url: /admin/push
            - img [ref=e83]
            - generic [ref=e86]: Пуш-уведомления
          - paragraph [ref=e87]: Система
          - link "Журнал действий" [ref=e88]:
            - /url: /admin/audit
            - img [ref=e89]
            - generic [ref=e92]: Журнал действий
          - link "Курсы валют" [ref=e93]:
            - /url: /admin/settings/currency
            - img [ref=e94]
            - generic [ref=e99]: Курсы валют
        - generic [ref=e100]:
          - link "В приложение" [ref=e101]:
            - /url: /app
            - img [ref=e102]
            - text: В приложение
          - generic [ref=e104]:
            - generic [ref=e105]: Тема
            - generic [ref=e106]:
              - radiogroup "Тема оформления" [ref=e107]:
                - radio "Светлая тема" [ref=e108] [cursor=pointer]:
                  - img [ref=e109]
                - radio "Тёмная тема" [ref=e115] [cursor=pointer]:
                  - img [ref=e116]
                - radio "Как в системе" [checked] [ref=e118] [cursor=pointer]:
                  - img [ref=e119]
              - 'button "Скин «Хмель»: выключен" [ref=e121] [cursor=pointer]':
                - img [ref=e122]
    - main [ref=e131]:
      - generic [ref=e133]:
        - heading "Рецепты" [level=1] [ref=e137]
        - navigation "Статус" [ref=e138]:
          - link "Все 126" [ref=e139]:
            - /url: /admin/recipes
            - text: Все
            - generic [ref=e140]: "126"
          - link "Опубликованные 46" [ref=e141]:
            - /url: /admin/recipes?status=published
            - text: Опубликованные
            - generic [ref=e142]: "46"
          - link "Приватные 78" [ref=e143]:
            - /url: /admin/recipes?status=private
            - text: Приватные
            - generic [ref=e144]: "78"
          - link "Черновики 2" [ref=e145]:
            - /url: /admin/recipes?status=draft
            - text: Черновики
            - generic [ref=e146]: "2"
          - link "Скрытые 0" [ref=e147]:
            - /url: /admin/recipes?status=hidden
            - text: Скрытые
            - generic [ref=e148]: "0"
        - generic [ref=e149]:
          - generic [ref=e150]:
            - generic [ref=e151]: Поиск
            - textbox "Поиск" [ref=e153]:
              - /placeholder: Название или автор
          - generic [ref=e154]:
            - generic [ref=e155]: Сортировка
            - generic [ref=e156]:
              - combobox "Сортировка" [ref=e157]:
                - option "По обновлению" [selected]
                - option "По дате создания"
                - option "По рейтингу"
                - option "По названию"
              - img
        - table [ref=e161]:
          - rowgroup [ref=e162]:
            - row "Выбрать все Рецепт Автор Стиль Статус Рейтинг Обновлён Действия" [ref=e163]:
              - columnheader "Выбрать все" [ref=e164]:
                - generic [ref=e165]:
                  - checkbox "Выбрать все" [ref=e166] [cursor=pointer]
                  - generic:
                    - img
              - columnheader "Рецепт" [ref=e167]
              - columnheader "Автор" [ref=e168]
              - columnheader "Стиль" [ref=e169]
              - columnheader "Статус" [ref=e170]
              - columnheader "Рейтинг" [ref=e171]
              - columnheader "Обновлён" [ref=e172]
              - columnheader "Действия" [ref=e173]:
                - generic [ref=e174]: Действия
          - rowgroup [ref=e175]:
            - row "Выбрать «QA mobile audit 21.10» QA mobile audit 21.10 qa.mobile.20261021 21A Американский IPA Приватный — 22 окт. 2026 г. Действия с «QA mobile audit 21.10»" [ref=e176]:
              - cell "Выбрать «QA mobile audit 21.10»" [ref=e177]:
                - generic [ref=e178]:
                  - checkbox "Выбрать «QA mobile audit 21.10»" [ref=e179] [cursor=pointer]
                  - generic:
                    - img
              - cell "QA mobile audit 21.10" [ref=e180]:
                - generic [ref=e183]: QA mobile audit 21.10
              - cell "qa.mobile.20261021" [ref=e184]
              - cell "21A Американский IPA" [ref=e185]:
                - generic [ref=e186]: 21A Американский IPA
              - cell "Приватный" [ref=e187]:
                - generic [ref=e188]: Приватный
              - cell "—" [ref=e189]
              - cell "22 окт. 2026 г." [ref=e190]
              - cell "Действия с «QA mobile audit 21.10»" [ref=e191]:
                - button "Действия с «QA mobile audit 21.10»" [active] [ref=e192] [cursor=pointer]:
                  - img [ref=e193]
            - row "Выбрать «Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия)» Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия) qa.deep.main.20261020 18B Американский пейл-эль Приватный — 20 окт. 2026 г. Действия с «Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия)»" [ref=e197]:
              - cell "Выбрать «Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия)»" [ref=e198]:
                - generic [ref=e199]:
                  - checkbox "Выбрать «Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия)»" [ref=e200] [cursor=pointer]
                  - generic:
                    - img
              - cell "Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия)" [ref=e201]:
                - generic [ref=e204]: Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия)
              - cell "qa.deep.main.20261020" [ref=e205]
              - cell "18B Американский пейл-эль" [ref=e206]:
                - generic [ref=e207]: 18B Американский пейл-эль
              - cell "Приватный" [ref=e208]:
                - generic [ref=e209]: Приватный
              - cell "—" [ref=e210]
              - cell "20 окт. 2026 г." [ref=e211]
              - cell "Действия с «Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия)»" [ref=e212]:
                - button "Действия с «Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия)»" [ref=e213] [cursor=pointer]:
                  - img [ref=e214]
            - row "Выбрать «Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия)» Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия) qa.deep.main.20261020 18B Американский пейл-эль Приватный — 20 окт. 2026 г. Действия с «Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия)»" [ref=e218]:
              - cell "Выбрать «Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия)»" [ref=e219]:
                - generic [ref=e220]:
                  - checkbox "Выбрать «Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия)»" [ref=e221] [cursor=pointer]
                  - generic:
                    - img
              - cell "Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия)" [ref=e222]:
                - generic [ref=e225]: Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия)
              - cell "qa.deep.main.20261020" [ref=e226]
              - cell "18B Американский пейл-эль" [ref=e227]:
                - generic [ref=e228]: 18B Американский пейл-эль
              - cell "Приватный" [ref=e229]:
                - generic [ref=e230]: Приватный
              - cell "—" [ref=e231]
              - cell "20 окт. 2026 г." [ref=e232]
              - cell "Действия с «Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия)»" [ref=e233]:
                - button "Действия с «Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия)»" [ref=e234] [cursor=pointer]:
                  - img [ref=e235]
            - row "Выбрать «QA integration flow» QA integration flow qa.integration.aaf5d019-b78b-4d29-a075-bd5de8a22ede — Приватный — 20 окт. 2026 г. Действия с «QA integration flow»" [ref=e239]:
              - cell "Выбрать «QA integration flow»" [ref=e240]:
                - generic [ref=e241]:
                  - checkbox "Выбрать «QA integration flow»" [ref=e242] [cursor=pointer]
                  - generic:
                    - img
              - cell "QA integration flow" [ref=e243]:
                - generic [ref=e246]: QA integration flow
              - cell "qa.integration.aaf5d019-b78b-4d29-a075-bd5de8a22ede" [ref=e247]
              - cell "—" [ref=e248]
              - cell "Приватный" [ref=e249]:
                - generic [ref=e250]: Приватный
              - cell "—" [ref=e251]
              - cell "20 окт. 2026 г." [ref=e252]
              - cell "Действия с «QA integration flow»" [ref=e253]:
                - button "Действия с «QA integration flow»" [ref=e254] [cursor=pointer]:
                  - img [ref=e255]
            - row "Выбрать «Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия)» Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия) qa.flow.fixed.20261020 18B Американский пейл-эль Приватный — 20 окт. 2026 г. Действия с «Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия)»" [ref=e259]:
              - cell "Выбрать «Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия)»" [ref=e260]:
                - generic [ref=e261]:
                  - checkbox "Выбрать «Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия)»" [ref=e262] [cursor=pointer]
                  - generic:
                    - img
              - cell "Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия)" [ref=e263]:
                - generic [ref=e266]: Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия)
              - cell "qa.flow.fixed.20261020" [ref=e267]
              - cell "18B Американский пейл-эль" [ref=e268]:
                - generic [ref=e269]: 18B Американский пейл-эль
              - cell "Приватный" [ref=e270]:
                - generic [ref=e271]: Приватный
              - cell "—" [ref=e272]
              - cell "20 окт. 2026 г." [ref=e273]
              - cell "Действия с «Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия)»" [ref=e274]:
                - button "Действия с «Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия)»" [ref=e275] [cursor=pointer]:
                  - img [ref=e276]
            - row "Выбрать «QA Brewfather audit 2026-10-20» QA Brewfather audit 2026-10-20 QA Admin 18B Американский пейл-эль Приватный — 20 окт. 2026 г. Действия с «QA Brewfather audit 2026-10-20»" [ref=e280]:
              - cell "Выбрать «QA Brewfather audit 2026-10-20»" [ref=e281]:
                - generic [ref=e282]:
                  - checkbox "Выбрать «QA Brewfather audit 2026-10-20»" [ref=e283] [cursor=pointer]
                  - generic:
                    - img
              - cell "QA Brewfather audit 2026-10-20" [ref=e284]:
                - generic [ref=e287]: QA Brewfather audit 2026-10-20
              - cell "QA Admin" [ref=e288]
              - cell "18B Американский пейл-эль" [ref=e289]:
                - generic [ref=e290]: 18B Американский пейл-эль
              - cell "Приватный" [ref=e291]:
                - generic [ref=e292]: Приватный
              - cell "—" [ref=e293]
              - cell "20 окт. 2026 г." [ref=e294]
              - cell "Действия с «QA Brewfather audit 2026-10-20»" [ref=e295]:
                - button "Действия с «QA Brewfather audit 2026-10-20»" [ref=e296] [cursor=pointer]:
                  - img [ref=e297]
            - row "Выбрать «Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия)» Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия) qa.flow.20261020 18B Американский пейл-эль Приватный — 20 окт. 2026 г. Действия с «Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия)»" [ref=e301]:
              - cell "Выбрать «Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия)»" [ref=e302]:
                - generic [ref=e303]:
                  - checkbox "Выбрать «Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия)»" [ref=e304] [cursor=pointer]
                  - generic:
                    - img
              - cell "Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия)" [ref=e305]:
                - generic [ref=e308]: Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия)
              - cell "qa.flow.20261020" [ref=e309]
              - cell "18B Американский пейл-эль" [ref=e310]:
                - generic [ref=e311]: 18B Американский пейл-эль
              - cell "Приватный" [ref=e312]:
                - generic [ref=e313]: Приватный
              - cell "—" [ref=e314]
              - cell "20 окт. 2026 г." [ref=e315]
              - cell "Действия с «Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия)»" [ref=e316]:
                - button "Действия с «Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф) (копия)»" [ref=e317] [cursor=pointer]:
                  - img [ref=e318]
            - row "Выбрать «Новый рецепт 5» Новый рецепт 5 QA Admin 1A Американский лёгкий лагер Приватный — 25 сент. 2026 г. Действия с «Новый рецепт 5»" [ref=e322]:
              - cell "Выбрать «Новый рецепт 5»" [ref=e323]:
                - generic [ref=e324]:
                  - checkbox "Выбрать «Новый рецепт 5»" [ref=e325] [cursor=pointer]
                  - generic:
                    - img
              - cell "Новый рецепт 5" [ref=e326]:
                - generic [ref=e329]: Новый рецепт 5
              - cell "QA Admin" [ref=e330]
              - cell "1A Американский лёгкий лагер" [ref=e331]:
                - generic [ref=e332]: 1A Американский лёгкий лагер
              - cell "Приватный" [ref=e333]:
                - generic [ref=e334]: Приватный
              - cell "—" [ref=e335]
              - cell "25 сент. 2026 г." [ref=e336]
              - cell "Действия с «Новый рецепт 5»" [ref=e337]:
                - button "Действия с «Новый рецепт 5»" [ref=e338] [cursor=pointer]:
                  - img [ref=e339]
            - row "Выбрать «Новый рецепт 1» Новый рецепт 1 QA Admin 2 21C Хейзи IPA Приватный — 28 июл. 2026 г. Действия с «Новый рецепт 1»" [ref=e343]:
              - cell "Выбрать «Новый рецепт 1»" [ref=e344]:
                - generic [ref=e345]:
                  - checkbox "Выбрать «Новый рецепт 1»" [ref=e346] [cursor=pointer]
                  - generic:
                    - img
              - cell "Новый рецепт 1" [ref=e347]:
                - generic [ref=e350]: Новый рецепт 1
              - cell "QA Admin 2" [ref=e351]
              - cell "21C Хейзи IPA" [ref=e352]:
                - generic [ref=e353]: 21C Хейзи IPA
              - cell "Приватный" [ref=e354]:
                - generic [ref=e355]: Приватный
              - cell "—" [ref=e356]
              - cell "28 июл. 2026 г." [ref=e357]
              - cell "Действия с «Новый рецепт 1»" [ref=e358]:
                - button "Действия с «Новый рецепт 1»" [ref=e359] [cursor=pointer]:
                  - img [ref=e360]
            - row "Выбрать «Моя APA Amarillo+Cascade» Моя APA Amarillo+Cascade QA Admin 2 18B Американский пейл-эль Опубликован — 23 июл. 2026 г. Действия с «Моя APA Amarillo+Cascade»" [ref=e364]:
              - cell "Выбрать «Моя APA Amarillo+Cascade»" [ref=e365]:
                - generic [ref=e366]:
                  - checkbox "Выбрать «Моя APA Amarillo+Cascade»" [ref=e367] [cursor=pointer]
                  - generic:
                    - img
              - cell "Моя APA Amarillo+Cascade" [ref=e368]:
                - link "Моя APA Amarillo+Cascade" [ref=e371]:
                  - /url: /recipes/moya-apa-amarillo-cascade-2
              - cell "QA Admin 2" [ref=e372]
              - cell "18B Американский пейл-эль" [ref=e373]:
                - generic [ref=e374]: 18B Американский пейл-эль
              - cell "Опубликован" [ref=e375]:
                - generic [ref=e376]: Опубликован
              - cell "—" [ref=e377]
              - cell "23 июл. 2026 г." [ref=e378]
              - cell "Действия с «Моя APA Amarillo+Cascade»" [ref=e379]:
                - button "Действия с «Моя APA Amarillo+Cascade»" [ref=e380] [cursor=pointer]:
                  - img [ref=e381]
            - row "Выбрать «Моя APA Amarillo+Cascade» Моя APA Amarillo+Cascade QA Admin 2 18B Американский пейл-эль Опубликован — 23 июл. 2026 г. Действия с «Моя APA Amarillo+Cascade»" [ref=e385]:
              - cell "Выбрать «Моя APA Amarillo+Cascade»" [ref=e386]:
                - generic [ref=e387]:
                  - checkbox "Выбрать «Моя APA Amarillo+Cascade»" [ref=e388] [cursor=pointer]
                  - generic:
                    - img
              - cell "Моя APA Amarillo+Cascade" [ref=e389]:
                - link "Моя APA Amarillo+Cascade" [ref=e392]:
                  - /url: /recipes/moya-apa-amarillo-cascade
              - cell "QA Admin 2" [ref=e393]
              - cell "18B Американский пейл-эль" [ref=e394]:
                - generic [ref=e395]: 18B Американский пейл-эль
              - cell "Опубликован" [ref=e396]:
                - generic [ref=e397]: Опубликован
              - cell "—" [ref=e398]
              - cell "23 июл. 2026 г." [ref=e399]
              - cell "Действия с «Моя APA Amarillo+Cascade»" [ref=e400]:
                - button "Действия с «Моя APA Amarillo+Cascade»" [ref=e401] [cursor=pointer]:
                  - img [ref=e402]
            - row "Выбрать «Sample · American Pale Ale (черновик)» Sample · American Pale Ale (черновик) QA Admin 18B Американский пейл-эль Черновик — 17 июл. 2026 г. Действия с «Sample · American Pale Ale (черновик)»" [ref=e406]:
              - cell "Выбрать «Sample · American Pale Ale (черновик)»" [ref=e407]:
                - generic [ref=e408]:
                  - checkbox "Выбрать «Sample · American Pale Ale (черновик)»" [ref=e409] [cursor=pointer]
                  - generic:
                    - img
              - cell "Sample · American Pale Ale (черновик)" [ref=e410]:
                - generic [ref=e413]: Sample · American Pale Ale (черновик)
              - cell "QA Admin" [ref=e414]
              - cell "18B Американский пейл-эль" [ref=e415]:
                - generic [ref=e416]: 18B Американский пейл-эль
              - cell "Черновик" [ref=e417]:
                - generic [ref=e418]: Черновик
              - cell "—" [ref=e419]
              - cell "17 июл. 2026 г." [ref=e420]
              - cell "Действия с «Sample · American Pale Ale (черновик)»" [ref=e421]:
                - button "Действия с «Sample · American Pale Ale (черновик)»" [ref=e422] [cursor=pointer]:
                  - img [ref=e423]
            - row "Выбрать «Sample · Saison» Sample · Saison QA Admin 25B Сэзон Опубликован — 17 июл. 2026 г. Действия с «Sample · Saison»" [ref=e427]:
              - cell "Выбрать «Sample · Saison»" [ref=e428]:
                - generic [ref=e429]:
                  - checkbox "Выбрать «Sample · Saison»" [ref=e430] [cursor=pointer]
                  - generic:
                    - img
              - cell "Sample · Saison" [ref=e431]:
                - link "Sample · Saison" [ref=e434]:
                  - /url: /recipes/sample-saison
              - cell "QA Admin" [ref=e435]
              - cell "25B Сэзон" [ref=e436]:
                - generic [ref=e437]: 25B Сэзон
              - cell "Опубликован" [ref=e438]:
                - generic [ref=e439]: Опубликован
              - cell "—" [ref=e440]
              - cell "17 июл. 2026 г." [ref=e441]
              - cell "Действия с «Sample · Saison»" [ref=e442]:
                - button "Действия с «Sample · Saison»" [ref=e443] [cursor=pointer]:
                  - img [ref=e444]
            - row "Выбрать «Sample · Hefeweizen» Sample · Hefeweizen QA Admin 10A Вайсбир Приватный — 17 июл. 2026 г. Действия с «Sample · Hefeweizen»" [ref=e448]:
              - cell "Выбрать «Sample · Hefeweizen»" [ref=e449]:
                - generic [ref=e450]:
                  - checkbox "Выбрать «Sample · Hefeweizen»" [ref=e451] [cursor=pointer]
                  - generic:
                    - img
              - cell "Sample · Hefeweizen" [ref=e452]:
                - generic [ref=e455]: Sample · Hefeweizen
              - cell "QA Admin" [ref=e456]
              - cell "10A Вайсбир" [ref=e457]:
                - generic [ref=e458]: 10A Вайсбир
              - cell "Приватный" [ref=e459]:
                - generic [ref=e460]: Приватный
              - cell "—" [ref=e461]
              - cell "17 июл. 2026 г." [ref=e462]
              - cell "Действия с «Sample · Hefeweizen»" [ref=e463]:
                - button "Действия с «Sample · Hefeweizen»" [ref=e464] [cursor=pointer]:
                  - img [ref=e465]
            - row "Выбрать «Sample · American Stout» Sample · American Stout QA Admin 20B Американский стаут Опубликован — 17 июл. 2026 г. Действия с «Sample · American Stout»" [ref=e469]:
              - cell "Выбрать «Sample · American Stout»" [ref=e470]:
                - generic [ref=e471]:
                  - checkbox "Выбрать «Sample · American Stout»" [ref=e472] [cursor=pointer]
                  - generic:
                    - img
              - cell "Sample · American Stout" [ref=e473]:
                - link "Sample · American Stout" [ref=e476]:
                  - /url: /recipes/sample-american-stout
              - cell "QA Admin" [ref=e477]
              - cell "20B Американский стаут" [ref=e478]:
                - generic [ref=e479]: 20B Американский стаут
              - cell "Опубликован" [ref=e480]:
                - generic [ref=e481]: Опубликован
              - cell "—" [ref=e482]
              - cell "17 июл. 2026 г." [ref=e483]
              - cell "Действия с «Sample · American Stout»" [ref=e484]:
                - button "Действия с «Sample · American Stout»" [ref=e485] [cursor=pointer]:
                  - img [ref=e486]
            - row "Выбрать «Sample · Czech Premium Pale Lager» Sample · Czech Premium Pale Lager QA Admin 3B Чешский премиальный светлый лагер Приватный — 17 июл. 2026 г. Действия с «Sample · Czech Premium Pale Lager»" [ref=e490]:
              - cell "Выбрать «Sample · Czech Premium Pale Lager»" [ref=e491]:
                - generic [ref=e492]:
                  - checkbox "Выбрать «Sample · Czech Premium Pale Lager»" [ref=e493] [cursor=pointer]
                  - generic:
                    - img
              - cell "Sample · Czech Premium Pale Lager" [ref=e494]:
                - generic [ref=e497]: Sample · Czech Premium Pale Lager
              - cell "QA Admin" [ref=e498]
              - cell "3B Чешский премиальный светлый лагер" [ref=e499]:
                - generic [ref=e500]: 3B Чешский премиальный светлый лагер
              - cell "Приватный" [ref=e501]:
                - generic [ref=e502]: Приватный
              - cell "—" [ref=e503]
              - cell "17 июл. 2026 г." [ref=e504]
              - cell "Действия с «Sample · Czech Premium Pale Lager»" [ref=e505]:
                - button "Действия с «Sample · Czech Premium Pale Lager»" [ref=e506] [cursor=pointer]:
                  - img [ref=e507]
            - row "Выбрать «Sample · American IPA» Sample · American IPA QA Admin 21A Американский IPA Опубликован — 17 июл. 2026 г. Действия с «Sample · American IPA»" [ref=e511]:
              - cell "Выбрать «Sample · American IPA»" [ref=e512]:
                - generic [ref=e513]:
                  - checkbox "Выбрать «Sample · American IPA»" [ref=e514] [cursor=pointer]
                  - generic:
                    - img
              - cell "Sample · American IPA" [ref=e515]:
                - link "Sample · American IPA" [ref=e518]:
                  - /url: /recipes/sample-american-ipa
              - cell "QA Admin" [ref=e519]
              - cell "21A Американский IPA" [ref=e520]:
                - generic [ref=e521]: 21A Американский IPA
              - cell "Опубликован" [ref=e522]:
                - generic [ref=e523]: Опубликован
              - cell "—" [ref=e524]
              - cell "17 июл. 2026 г." [ref=e525]
              - cell "Действия с «Sample · American IPA»" [ref=e526]:
                - button "Действия с «Sample · American IPA»" [ref=e527] [cursor=pointer]:
                  - img [ref=e528]
            - row "Выбрать «[тест] Мохнатый шмель (Ам. амбер)» [тест] Мохнатый шмель (Ам. амбер) QA Admin — Приватный — 16 июл. 2026 г. Действия с «[тест] Мохнатый шмель (Ам. амбер)»" [ref=e532]:
              - cell "Выбрать «[тест] Мохнатый шмель (Ам. амбер)»" [ref=e533]:
                - generic [ref=e534]:
                  - checkbox "Выбрать «[тест] Мохнатый шмель (Ам. амбер)»" [ref=e535] [cursor=pointer]
                  - generic:
                    - img
              - cell "[тест] Мохнатый шмель (Ам. амбер)" [ref=e536]:
                - generic [ref=e539]: "[тест] Мохнатый шмель (Ам. амбер)"
              - cell "QA Admin" [ref=e540]
              - cell "—" [ref=e541]
              - cell "Приватный" [ref=e542]:
                - generic [ref=e543]: Приватный
              - cell "—" [ref=e544]
              - cell "16 июл. 2026 г." [ref=e545]
              - cell "Действия с «[тест] Мохнатый шмель (Ам. амбер)»" [ref=e546]:
                - button "Действия с «[тест] Мохнатый шмель (Ам. амбер)»" [ref=e547] [cursor=pointer]:
                  - img [ref=e548]
            - row "Выбрать «[тест] правка-удаление» [тест] правка-удаление QA Admin — Приватный — 16 июл. 2026 г. Действия с «[тест] правка-удаление»" [ref=e552]:
              - cell "Выбрать «[тест] правка-удаление»" [ref=e553]:
                - generic [ref=e554]:
                  - checkbox "Выбрать «[тест] правка-удаление»" [ref=e555] [cursor=pointer]
                  - generic:
                    - img
              - cell "[тест] правка-удаление" [ref=e556]:
                - generic [ref=e559]: "[тест] правка-удаление"
              - cell "QA Admin" [ref=e560]
              - cell "—" [ref=e561]
              - cell "Приватный" [ref=e562]:
                - generic [ref=e563]: Приватный
              - cell "—" [ref=e564]
              - cell "16 июл. 2026 г." [ref=e565]
              - cell "Действия с «[тест] правка-удаление»" [ref=e566]:
                - button "Действия с «[тест] правка-удаление»" [ref=e567] [cursor=pointer]:
                  - img [ref=e568]
            - row "Выбрать «[тест] Каскад цветочно-ванильный» [тест] Каскад цветочно-ванильный QA Admin — Приватный — 16 июл. 2026 г. Действия с «[тест] Каскад цветочно-ванильный»" [ref=e572]:
              - cell "Выбрать «[тест] Каскад цветочно-ванильный»" [ref=e573]:
                - generic [ref=e574]:
                  - checkbox "Выбрать «[тест] Каскад цветочно-ванильный»" [ref=e575] [cursor=pointer]
                  - generic:
                    - img
              - cell "[тест] Каскад цветочно-ванильный" [ref=e576]:
                - generic [ref=e579]: "[тест] Каскад цветочно-ванильный"
              - cell "QA Admin" [ref=e580]
              - cell "—" [ref=e581]
              - cell "Приватный" [ref=e582]:
                - generic [ref=e583]: Приватный
              - cell "—" [ref=e584]
              - cell "16 июл. 2026 г." [ref=e585]
              - cell "Действия с «[тест] Каскад цветочно-ванильный»" [ref=e586]:
                - button "Действия с «[тест] Каскад цветочно-ванильный»" [ref=e587] [cursor=pointer]:
                  - img [ref=e588]
        - generic [ref=e592]:
          - generic [ref=e593]:
            - generic [ref=e594]: 126 записей
            - generic [ref=e596]:
              - combobox "Записей на странице" [ref=e597]:
                - option "20 на странице" [selected]
                - option "50 на странице"
                - option "100 на странице"
              - img
          - navigation "Страницы" [ref=e598]:
            - generic:
              - img
            - link "1" [ref=e599]:
              - /url: /admin/recipes
            - link "2" [ref=e600]:
              - /url: /admin/recipes?page=2
            - generic [ref=e601]: …
            - link "7" [ref=e602]:
              - /url: /admin/recipes?page=7
            - link "Следующая страница" [ref=e603]:
              - /url: /admin/recipes?page=2
              - img [ref=e604]
  - region "Уведомления (F8)":
    - list
  - button "Open Next.js Dev Tools" [ref=e611] [cursor=pointer]:
    - img [ref=e612]
  - alert [ref=e617]
```

# Test source

```ts
  1   | import { expect, test, type Page } from "@playwright/test";
  2   | 
  3   | const recipeId = process.env.MOBILE_QA_RECIPE_ID;
  4   | 
  5   | async function open(page: Page, path: string) {
  6   |   const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  7   |   expect(response?.status()).toBe(200);
  8   |   await expect(page.locator("main").first()).toBeVisible();
  9   |   // Wait for Next to attach the client router before exercising server-rendered controls.
  10  |   await page.waitForFunction(() => !window.history.pushState.toString().includes("[native code]"));
  11  | }
  12  | 
  13  | async function expectDocumentFits(page: Page) {
  14  |   const width = page.viewportSize()!.width;
  15  |   const size = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  16  |   expect(size.client).toBe(width);
  17  |   expect(size.scroll).toBeLessThanOrEqual(width + 1);
  18  | }
  19  | 
  20  | async function expectControlFits(page: Page, control: ReturnType<Page["getByRole"]>) {
  21  |   const box = await control.boundingBox();
  22  |   expect(box).not.toBeNull();
  23  |   expect(box!.x).toBeGreaterThanOrEqual(0);
  24  |   expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  25  | }
  26  | 
  27  | test.beforeEach(async ({ context, baseURL }) => {
  28  |   await context.addCookies([
  29  |     { name: "nb_cookie_consent", value: encodeURIComponent("1:necessary"), url: baseURL! },
  30  |     { name: "nb_age_ok", value: "1", url: baseURL! }
  31  |   ]);
  32  | });
  33  | 
  34  | test("M01: label preview leaves data fields clickable in every format", async ({ page }) => {
  35  |   await open(page, "/labels");
  36  |   await page.getByRole("button", { name: "Крафт", exact: true }).click();
  37  |   for (const format of ["43×25 мм", "58×40 мм", "75×120 мм", "120×75 мм", "Лист A4"]) {
  38  |     await page.getByRole("button", { name: format, exact: true }).first().click();
  39  |     const preview = page.getByRole("img", { name: /Превью наклейки/ });
  40  |     await expect(preview).toBeVisible({ timeout: 20_000 });
  41  |     await expect.poll(() => preview.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  42  |     for (const field of ["Название", "Стиль", "Автор"]) {
  43  |       const input = page.getByRole("textbox", { name: field, exact: true });
  44  |       // fill() alone can focus a field covered by a sticky sibling: require a real click.
  45  |       await input.click();
  46  |       await input.fill(`QA ${field} ${format}`);
  47  |       await expect(input).toBeFocused();
  48  |     }
  49  |     await expectDocumentFits(page);
  50  |   }
  51  | });
  52  | 
  53  | test("M02: public navigation and sign-in fit, including tablet breakpoint", async ({ page, context, baseURL }) => {
  54  |   await context.addCookies([{ name: "nb_dev_guest", value: "1", url: baseURL! }]);
  55  |   await open(page, "/calculators/abv-attenuation");
  56  |   await expectDocumentFits(page);
  57  |   await expectControlFits(page, page.getByRole("banner").getByRole("link", { name: "Войти", exact: true }));
  58  |   await expectControlFits(page, page.getByRole("button", { name: "Открыть меню", exact: true }));
  59  |   await page.getByRole("button", { name: "Открыть меню", exact: true }).click();
  60  |   await expect(page.getByRole("navigation", { name: "Разделы сайта" }).last()).toBeVisible();
  61  |   await page.setViewportSize({ width: 1280, height: 800 });
  62  |   await expect(page.getByRole("button", { name: "Закрыть меню", exact: true })).toBeHidden();
  63  |   await expectDocumentFits(page);
  64  |   await expectControlFits(page, page.getByRole("banner").getByRole("link", { name: "Войти", exact: true }));
  65  |   await page.setViewportSize({ width: 844, height: 390 });
  66  |   await page.getByRole("button", { name: "Открыть меню", exact: true }).click();
  67  |   const theme = page.getByRole("radio", { name: "Тёмная тема", exact: true }).last();
  68  |   await theme.click();
  69  |   await expect(theme).toHaveAttribute("aria-checked", "true");
  70  | });
  71  | 
  72  | test("M03/M06: admin navigation and table do not widen document", async ({ page, context, baseURL }) => {
  73  |   await context.addCookies([{ name: "nb_dev_account", value: "qa.admin@localhost", url: baseURL! }]);
  74  |   await open(page, "/admin/recipes");
  75  |   await expectDocumentFits(page);
  76  |   if (page.viewportSize()!.width < 1024) {
  77  |     const menu = page.getByRole("button", { name: "Открыть меню", exact: true });
  78  |     await expectControlFits(page, menu);
  79  |     await menu.click();
  80  |     await expect(page.getByRole("dialog")).toBeVisible();
  81  |     if (page.viewportSize()!.width < 640) {
  82  |       const theme = page.getByRole("dialog").getByRole("radio", { name: "Тёмная тема", exact: true });
  83  |       await theme.click();
  84  |       await expect(theme).toHaveAttribute("aria-checked", "true");
  85  |     }
  86  |     await page.getByRole("dialog").getByRole("button", { name: "Закрыть", exact: true }).click();
  87  |     await expect(page.getByRole("dialog")).toBeHidden();
  88  |   } else {
  89  |     const table = page.getByRole("table");
  90  |     await expect(table.getByRole("columnheader", { name: "Действия", exact: true })).toBeAttached();
  91  |     const scroller = table.locator("..");
  92  |     // Mobile WebKit has no mouse wheel. Reaching the last column through an
  93  |     // actual action also verifies that the clipped table controls remain usable.
  94  |     await table.getByRole("button", { name: /^Действия с/ }).first().click();
  95  |     await expect(page.getByRole("menu")).toBeVisible();
  96  |     await page.keyboard.press("Escape");
> 97  |     await expect.poll(() => scroller.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
      |                                                                     ^ Error: expect(received).toBeGreaterThan(expected)
  98  |     await expectDocumentFits(page);
  99  |   }
  100 | });
  101 | 
  102 | test("M04: filled recipe has compact metrics and working actions", async ({ page }) => {
  103 |   test.skip(!recipeId, "Set MOBILE_QA_RECIPE_ID to a saved QA recipe with calculated OG/FG and BJCP style");
  104 |   await open(page, `/app/recipes/${recipeId}/edit`);
  105 |   const toolbar = page.getByTestId("recipe-toolbar");
  106 |   await expect(toolbar).toBeVisible({ timeout: 30_000 });
  107 |   await expectDocumentFits(page);
  108 |   expect((await toolbar.boundingBox())!.height).toBeLessThanOrEqual(130);
  109 |   if (page.viewportSize()!.width < 640) {
  110 |     expect((await toolbar.locator("dl").boundingBox())!.height).toBeLessThanOrEqual(24);
  111 |   }
  112 |   for (let cycle = 0; cycle < 2; cycle++) {
  113 |     if (page.viewportSize()!.width < 640) {
  114 |       await toolbar.getByRole("button", { name: "Действия с рецептом", exact: true }).click();
  115 |       await page.getByRole("menuitem", { name: "Импорт / экспорт", exact: true }).click();
  116 |     } else {
  117 |       await toolbar.getByRole("button", { name: "Импорт / экспорт", exact: true }).click();
  118 |     }
  119 |     await expect(page.getByRole("dialog")).toBeVisible();
  120 |     await page.getByRole("dialog").getByRole("button", { name: "Закрыть", exact: true }).click();
  121 |     await expect(page.getByRole("dialog")).toBeHidden();
  122 |   }
  123 |   await toolbar.getByRole("button", { name: "Сварить", exact: true }).click();
  124 |   await expect(page.getByRole("dialog", { name: "Сварить рецепт", exact: true })).toBeVisible({ timeout: 30_000 });
  125 | });
  126 | 
  127 | test("M05: every dilution operation fits on the narrow screen", async ({ page }) => {
  128 |   await open(page, "/calculators/dilution-boiloff");
  129 |   const operations = page.getByRole("group", { name: "Что делаем", exact: true });
  130 |   for (const operation of ["Разбавить", "Уварить", "Добавить"]) {
  131 |     const operationButton = operations.getByRole("button", { name: operation, exact: true });
  132 |     await operationButton.click();
  133 |     await expect(operationButton).toHaveAttribute("aria-pressed", "true");
  134 |     const choices = page.getByRole("group", { name: "Что рассчитать", exact: true }).getByRole("button");
  135 |     for (let index = 0; index < await choices.count(); index++) {
  136 |       await choices.nth(index).click();
  137 |       await expect(choices.nth(index)).toHaveAttribute("aria-pressed", "true");
  138 |       await expectDocumentFits(page);
  139 |       for (const input of await page.locator("main input:visible").all()) {
  140 |         await expectControlFits(page, input);
  141 |       }
  142 |     }
  143 |     await expectDocumentFits(page);
  144 |   }
  145 | });
  146 | 
```