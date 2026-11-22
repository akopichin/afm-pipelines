---
name: ui-ux-pro-max
description: Query the bundled UI/UX Pro Max design-system generator and UX catalog for the product brief and the HTML/Tailwind prototype.
---

# UI/UX Pro Max в AFM

Определи тип продукта, аудиторию, рабочую задачу и плотность данных по утверждённому брифу. Перед разработкой концептов составь короткий поисковый запрос на английском по этим признакам и запусти локальный генератор:

```sh
search="$AFM_PIPELINE_DIR/skills/ui-ux-pro-max/scripts/search.py"
python3 -B "$search" "support operations ticket triage dashboard" --design-system -f markdown
python3 -B "$search" "keyboard focus dialog form validation" --domain ux -n 3
python3 -B "$search" "responsive layout visibility" --stack html-tailwind -n 3
```

Первый запрос подставь из брифа. Остальные используй по необходимости для конкретных пробелов. Также доступны домены `product`, `style`, `color`, `typography`, `chart`, `landing` и `gsap`.

В `design.md` запиши фактический запрос, применимые предложения по композиции, типографике, цвету или состояниям и то, как ты их адаптировал. Если рекомендация противоречит брифу, бренду или High-Craft HTML Prototyping, зафиксируй существенный компромисс и следуй согласованным требованиям. Например, рекомендации про маркетинговый CTA могут не подходить рабочему экрану очереди.

При сборке используй решения из `design.md` и точечный поиск по `ux` или `html-tailwind` для сложных состояний, клавиатуры и узких экранов. Подробные правила доступны в [quick-reference.md](references/quick-reference.md) и [pro-rules.md](references/pro-rules.md). [Версия и лицензия](UPSTREAM.md)
