# CLAUDE.md

## Проект
Автоматизации amoCRM через N8N. Каждая бизнес-задача — отдельная папка с ТЗ, воркфлоу и логом.

**Код проекта (для именования в n8n):** `PROJECT` (заменить на реальный код при инициализации)

## Стек
- N8N Community Edition (self-hosted)
- amoCRM API v4
- Переменные окружения из .env

## Переменные окружения
- AMOCRM_ACCESS_TOKEN — токен amoCRM
- AMOCRM_DOMAIN — домен аккаунта (например: company.amocrm.ru)
- N8N_URL — URL N8N инстанса
- N8N_API_KEY — API ключ N8N (Settings → API → Create API Key)
- N8N_TAG_ID — ID тега проекта в N8N, которым маркируются все воркфлоу
- N8N_ERROR_WORKFLOW_ID — ID воркфлоу Error Handler → Telegram (заполняется после первого деплоя)
- TELEGRAM_BOT_TOKEN — токен Telegram-бота для уведомлений
- TELEGRAM_CHAT_ID — ID чата/группы для уведомлений об ошибках

## Архитектура воркфлоу

```
workflows/entry/          <- входные вебхуки amoCRM (только роутинг, нулевая логика)
    | Execute Workflow
docs/business-tasks/BT-NNN/workflow.json   <- бизнес-логика
    | Execute Workflow (если нужно)
workflows/utils/          <- переиспользуемые блоки
```

## Правило конфига
Перед созданием или изменением любого воркфлоу — читать docs/amocrm-config/.
Использовать только реальные ID из этих файлов.
Никогда не писать ID из головы.

## Правила при создании новой BT-задачи
1. Определить следующий номер — последний BT-NNN в docs/business-tasks/ + 1
2. Создать папку docs/business-tasks/BT-NNN-название/
3. Создать spec.md по шаблону из docs/business-tasks/_template/
4. Создать workflow.json на основе spec.md, используя реальные ID из amocrm-config/
5. Задеплоить в N8N: POST {N8N_URL}/api/v1/workflows с заголовком X-N8N-API-KEY и `"settings": {"errorWorkflow": "{N8N_ERROR_WORKFLOW_ID}"}` в теле запроса
6. Назначить тег: PUT {N8N_URL}/api/v1/workflows/{id}/tags с телом `[{"id": "{N8N_TAG_ID}"}]`
7. Сохранить полученный N8N Workflow ID в поле spec.md
8. Обновить entry-роутер — добавить ветку на новую BT
9. Задеплоить обновлённый роутер: PATCH {N8N_URL}/api/v1/workflows/{id}
10. Активировать воркфлоу: POST {N8N_URL}/api/v1/workflows/{id}/activate
11. Создать log.md с записью v1.0.0
12. Дописать в корневой CHANGELOG.md
13. Обновить docs/automations.md
14. Создать howto.md

## Документация проекта
При создании, обновлении или удалении BT-задачи — обязательно обновить `docs/automations.md`.
Этот файл содержит актуальное описание всех автоматизаций для людей (не для Claude).

## Правила при обновлении BT-задачи
1. Прочитать spec.md — понять что изменилось
2. Обновить workflow.json согласно новому spec.md
3. Задеплоить: PATCH {N8N_URL}/api/v1/workflows/{N8N Workflow ID}
4. Если изменился триггер — обновить и задеплоить entry-роутер
5. Дописать новую версию в log.md (SemVer)
6. Дописать в корневой CHANGELOG.md
7. Обновить docs/automations.md
8. Обновить howto.md

## Тегирование в N8N
Все воркфлоу проекта маркируются тегом проекта (ID в переменной N8N_TAG_ID).
После создания воркфлоу — назначить тег: PUT /api/v1/workflows/{id}/tags с телом `[{"id": "{N8N_TAG_ID}"}]`.

## Execution Data (Custom Data)
Каждый воркфлоу обязан записывать custom execution data для фильтрации в UI.
Ограничения N8N: максимум 10 ключей, ключ <= 50 символов, значение <= 255 символов.

Обязательные ключи:
- `project` = `{код проекта}` — первая нода после триггера (Code node, Run Once)
- `bt` = `BT-NNN` — номер бизнес-задачи, ставится там же

Ключи на развилках и ключевых шагах (добавлять по ситуации):
- `event` — тип входного события
- `branch` — какая ветка логики сработала
- `entity_id` — ID основной сущности (сделка, контакт)
- `result` — итог выполнения

Реализация — Code node (Run Once Mode):
```javascript
$execution.customData.set("project", "PROJECT");
$execution.customData.set("bt", "BT-001");
```

## Обработка ошибок
Все воркфлоу проекта используют единый Error Handler.
При ошибке — в Telegram-чат улетает сообщение с именем воркфлоу, нодой, текстом ошибки и ссылкой на execution.
Каждый воркфлоу при деплое получает `"settings": {"errorWorkflow": "{N8N_ERROR_WORKFLOW_ID}"}`.

## N8N API эндпоинты
- Создание: POST /api/v1/workflows (в теле: `"settings": {"errorWorkflow": "{N8N_ERROR_WORKFLOW_ID}"}`)
- Назначение тега: PUT /api/v1/workflows/{id}/tags (в теле: `[{"id": "{N8N_TAG_ID}"}]`)
- Обновление: PUT /api/v1/workflows/{id}
- Активация: POST /api/v1/workflows/{id}/activate
- Заголовок: X-N8N-API-KEY: {N8N_API_KEY}

## Технические особенности n8n
- executeWorkflowTrigger: typeVersion 1 (не 1.1)
- httpRequest: typeVersion 4.2, без credential — токен inline в headerParameters
- Обязательно: `options.response.response.responseFormat: "json"` в HTTP-нодах для amoCRM API
- Data Table нода: `n8n-nodes-base.dataTable` (с большой T), typeVersion 1
- При добавлении нод: разносить по вертикали минимум на 150px
- После PUT обновления entry-роутера — деактивировать/активировать для перерегистрации вебхука
- amoCRM удаляет вебхуки после серии ошибок — при отладке проверять наличие

## Версионирование SemVer
- PATCH (1.0.X) — правка текста, мелкие исправления
- MINOR (1.X.0) — новая ветка логики, новое условие
- MAJOR (X.0.0) — смена триггера, полная переработка

## Соглашения по именованию
- Папки задач: BT-NNN-kebab-case (только латиница и дефисы)
- Имена воркфлоу в N8N: PROJECT | [BT-NNN] Название задачи на русском
- Entry-воркфлоу: PROJECT | [ENTRY] Deal Events
- Утилиты: PROJECT | [UTIL] Error Handler
- Webhook-ноды: PROJECT — Webhook {event_type}
- Webhook path: UUID формат
- Credential: PROJECT — amoCRM Bearer

## Файлы задачи
- spec.md — пишет и правит только человек
- workflow.json — генерирует и обновляет только Claude
- log.md — ведёт только Claude
- howto.md — описание на человеческом языке: что делает, как работает, как тестировать. Ведёт Claude, обновляет при каждом изменении задачи
