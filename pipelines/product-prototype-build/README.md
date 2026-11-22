# Product Prototype Build

Интерактивный пакет AFM формата v2. Пользователь подтверждает сценарии, выбирает визуальное направление, комментирует работающий прототип и утверждает комплект для передачи разработчику.

## Запуск

Нужны AFM с поддержкой пакетов v2, Docker autoShim, управляемый браузер, Python 3, авторизованный Codex с доступом к `gpt-6.1-sol` и переменная окружения `CLAUDE_CODE_OAUTH_TOKEN` с доступом к `claude-sonnet-5-5`. AFM Desktop открывает управляемый браузер во вкладке. При запуске из CLI используется Chrome.

В рабочей папке продукта проверьте пакет и запустите его с Git-тега `v2.4.0`.

```sh
pipeline='github.com/akopichin/afm-pipelines//pipelines/product-prototype-build@v2.4.0'
AFM_COLLABORATION=1 afm pipelines inspect "$pipeline"
AFM_COLLABORATION=1 afm run --pipeline "$pipeline"
```

Для запуска из локальной копии репозитория укажите путь к пакету.

```sh
AFM_COLLABORATION=1 afm run --pipeline "$HOME/work/personal/afm-pipelines/pipelines/product-prototype-build"
```

Для возобновления повторите команду с тем же источником из той же рабочей папки. Чтобы изменить модель или reasoning, скопируйте [options.example.yaml](options.example.yaml), отредактируйте нужные роли и передайте путь к файлу.

```sh
AFM_COLLABORATION=1 afm run --pipeline "$pipeline" --pipeline-options "$HOME/.afm/prototype-options.yaml"
```

## Работа с прототипом

1. Аналитик согласует задачу и проверяемые сценарии. Если доступны целевые пользователи или материалы исследований, он разбирает конкретные случаи их работы. В бриф попадают источники выводов и гипотезы, которые ещё предстоит проверить.
2. Дизайнер ищет референсы по задаче на Dribbble и Awwwards и записывает в `design.md`, какие приёмы переносит в продукт и зачем. Он показывает 2–3 концепта ключевого экрана с одинаковыми данными, разной композицией и гипотезой для каждого. Можно выбрать вариант, объединить детали или запросить ещё одну итерацию. Когда доступны целевые пользователи, проверка концепта помогает понять, видят ли они его назначение, а задания в прототипе показывают, как они справляются с работой.
3. Прототипист показывает работающие экраны. В режиме «Разметка» протяните стрелку, добавьте комментарий, нажмите «Добавить». Кнопка «Отправить» передаст пачку замечаний с координатами, снимками и адресом экрана. Для обычных кликов выключите разметку. После исправлений нажмите «Утвердить версию». Техническая стадия live-qa проверяет её в отдельном CDP-сеансе. Два verify проверяют поведение и UX/UI по материалам этого прохода.
4. Писатель показывает две спецификации и две HTML-версии. Комплект находится в каталоге стадии delivery: behavior.md, design-system.md, prototype/ и design-system/. Сохраняйте папки вместе, каталог элементов может использовать CSS прототипа.

Авторы работают на `gpt-6.1-sol`. Аналитик, дизайнер и frontend-прототипист используют `high`, писатель и помощник для косметических правок используют `medium`. Независимые ревью всех четырёх этапов и живой QA выполняет `claude-sonnet-5-5` с `high`. Для отдельного визуального ревью Sonnet использует `medium`.

В пакет входят Anthropic Frontend Design и навык `product-visual-design` с разбором референсов и критериями визуальной критики по Impeccable. Дизайнер проверяет свёрстанные концепты через CDP и использует доступный imagegen для иллюстраций и фотографий, если они нужны по брифу. Если внешние галереи недоступны, он продолжает на доступных материалах и указывает это в `design.md`. [Anthropic Frontend Design](skills/frontend-design/UPSTREAM.md) · [Impeccable](https://impeccable.style/docs/)

Инструкции по интервью и юзабилити-тестам опираются на следующие источники. [grill-me](https://github.com/mattpocock/skills) · [Интервью о прошлом опыте](https://www.producttalk.org/best-customer-interview-questions/) · [JTBD switch interview](https://jobstobedone.org/) · [Методы UX-исследований](https://www.nngroup.com/articles/which-ux-research-methods/) · [Модерируемые юзабилити-тесты](https://www.gov.uk/service-manual/user-research/using-moderated-usability-testing) · [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines)

Панель использует локальную копию html2canvas 1.4.1 под лицензией MIT. [Лицензия](studio/vendor/LICENSE)
