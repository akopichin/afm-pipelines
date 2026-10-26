# 02 · Подключение каналов

Убрать копии расчёта цены. Сохранить округление и контракты API.

Source revision: illustrative-example-not-a-real-scan
Proposal revision: 2
Approval event: 8

## Required plans

- [01 · Общий расчёт](01-plan-2.md)

## Constraints

- Не менять HTTP-контракт.
- Сохранить скидки и округление до копейки.
- Сначала тесты, затем перенос.

## Steps

### 1. Переключить каналы на общие правила (reuse-pricing)

**Why**

Исправлять цену один раз для всех каналов.

**Problem**

Импорт, подписки и партнёры содержат свои копии расчёта. Они могут разойтись после правки.

**Before**

Три канала вызывают ImportTotal, RenewalTotal и PartnerTotal.
- ImportTotal()
- RenewalTotal()
- PartnerTotal()

**After**

Все четыре канала вызывают CalculatePrice. Три старых модуля удаляем после тестов.
- orders/pricing.go → CalculatePrice()

Effort: small
Prerequisites: extract-pricing

1. Сравнить политики скидок всех четырёх каналов.
2. Переключить импорт, подписки и партнёров на CalculatePrice.
3. Удалить три копии только после проверки итогов.

**Verification**

- HTTP, CSV, подписки и партнёры дают одинаковую сумму.
- Проверены границы скидок, нулевая корзина и округление.

**Risks**

- У подписок может быть особая политика скидок; проверить её до объединения.

## Architecture snapshots

- [Before](02-plan-3.before.json)
- [After](02-plan-3.after.json)

Snapshots follow the full execution order in index.json, including earlier independent plans. Revalidate the source and tests before each implementation.

This is an approved plan; no code has been changed.
