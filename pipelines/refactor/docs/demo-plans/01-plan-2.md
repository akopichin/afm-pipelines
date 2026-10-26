# 01 · Общий расчёт

Убрать копии расчёта цены. Сохранить округление и контракты API.

Source revision: illustrative-example-not-a-real-scan
Proposal revision: 2
Approval event: 8

## Required plans

None.

## Constraints

- Не менять HTTP-контракт.
- Сохранить скидки и округление до копейки.
- Сначала тесты, затем перенос.

## Steps

### 1. Вынести чистый расчёт цены (extract-pricing)

**Why**

Менять правила цены без риска для оформления заказа.

**Problem**

HTTP-обработчик смешивает валидацию, скидки и сохранение. Расчёт нельзя проверить отдельно.

**Before**

HTTP checkout сам считает скидки и округляет сумму.
- api/orders.go → checkout

**After**

CalculatePrice() в orders/pricing.go считает цену. HTTP только вызывает её.
- orders/pricing.go → CalculatePrice()

Effort: small
Prerequisites: None

1. Зафиксировать текущие скидки и округление тестами.
2. Вынести CalculatePrice в orders/pricing.go.
3. Переключить HTTP checkout на общую функцию.

**Verification**

- Одинаковые суммы на граничных примерах.
- HTTP-контракт не изменился.

**Risks**

- Не менять порядок скидок и округления.

## Architecture snapshots

- [Before](01-plan-2.before.json)
- [After](01-plan-2.after.json)

Snapshots follow the full execution order in index.json, including earlier independent plans. Revalidate the source and tests before each implementation.

This is an approved plan; no code has been changed.
