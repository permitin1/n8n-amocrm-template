# CLAUDE.md

## Проект
Автоматизации amoCRM через N8N + микросервисы. Каждая бизнес-задача — отдельная папка с ТЗ, воркфлоу и логом.

## Стек
- N8N Community Edition (self-hosted)
- amoCRM API v4
- Fastify (микросервис для веб-страниц: лендинги, выбор мессенджера и т.д.)
- Docker (деплой сервиса)
- Переменные окружения из .env

## Переменные окружения
- AMOCRM_ACCESS_TOKEN — токен amoCRM
- AMOCRM_DOMAIN — домен аккаунта (например: company.amocrm.ru)
- N8N_URL — URL N8N инстанса
- N8N_API_KEY — API ключ N8N (Settings → API → Create API Key)
- N8N_TAG_ID — ID тега `{код проекта}` в N8N, которым маркируются все воркфлоу проекта
- N8N_ERROR_WORKFLOW_ID — ID воркфлоу [UTIL] Error Handler → Telegram (заполняется после первого деплоя)
- TELEGRAM_BOT_TOKEN — токен Telegram-бота для уведомлений
- TELEGRAM_CHAT_ID — ID чата/группы для уведомлений об ошибках

## Архитектура

```
workflows/entry/          ← входные вебхуки amoCRM (только роутинг, нулевая логика)
    ↓ Execute Workflow
docs/business-tasks/BT-NNN/workflow.json   ← бизнес-логика
    ↓ Execute Workflow (если нужно)
workflows/utils/          ← переиспользуемые блоки

services/web/             ← микросервис: веб-страницы (выбор мессенджера, лендинги)
    routes/               ← роуты (каждая BT-задача типа service/both — отдельный файл)
    templates/            ← EJS-шаблоны страниц
```

## Правило конфига
Перед созданием или изменением любого воркфлоу — читать docs/amocrm-config/.
Использовать только реальные ID из этих файлов.
Никогда не писать ID из головы.

## Типы BT-задач

Каждая BT-задача имеет тип, указанный в spec.md:
- **n8n** — только воркфлоу в N8N (стандартная автоматизация)
- **service** — только роут в services/web/ (веб-страница, лендинг)
- **both** — и воркфлоу N8N, и роут в сервисе (например: страница выбора мессенджера + N8N-связка для склейки контакта)

## Правила при создании новой BT-задачи
1. Определить следующий номер — последний BT-NNN в docs/business-tasks/ + 1
2. Создать папку docs/business-tasks/BT-NNN-название/
3. Создать spec.md по шаблону из docs/business-tasks/_template/ (указать тип: n8n / service / both)
4. **Если тип n8n или both:**
   - Создать workflow.json на основе spec.md, используя реальные ID из amocrm-config/
   - Задеплоить: `node scripts/deploy.js docs/business-tasks/BT-NNN-название`
   - Обновить entry-роутер — добавить ветку на новую BT
   - Задеплоить роутер: `node scripts/deploy.js workflows/entry/webhook-{event}.json`
5. **Если тип service или both:**
   - Создать роут в services/web/routes/ (файл: bt-nnn-название.js)
   - Создать шаблон(ы) в services/web/templates/
   - Зарегистрировать роут в services/web/routes/index.js
   - Пересобрать и задеплоить контейнер
6. Создать log.md с записью v1.0.0
7. Создать howto.md
8. Дописать в корневой CHANGELOG.md
9. Обновить docs/automations.md

## Документация проекта
При создании, обновлении или удалении BT-задачи — обязательно обновить `docs/automations.md`.
Этот файл содержит актуальное описание всех автоматизаций для людей (не для Claude).

## Правила при обновлении BT-задачи
1. Прочитать spec.md — понять что изменилось
2. Обновить workflow.json согласно новому spec.md
3. Задеплоить: `node scripts/deploy.js docs/business-tasks/BT-NNN-название` (обновит, синхронизирует)
4. Если изменился триггер — обновить и задеплоить entry-роутер: `node scripts/deploy.js workflows/entry/webhook-{event}.json`
5. Дописать новую версию в log.md (SemVer)
6. Обновить howto.md
7. Дописать в корневой CHANGELOG.md
8. Обновить docs/automations.md

## Тегирование в N8N
Все воркфлоу проекта маркируются тегом проекта (ID в переменной N8N_TAG_ID).
После создания воркфлоу — назначить тег: PUT /api/v1/workflows/{id}/tags с телом `[{"id": "{N8N_TAG_ID}"}]`.

## Execution Data (Custom Data)
Каждый воркфлоу обязан записывать custom execution data для фильтрации в UI.
Ограничения N8N: максимум 10 ключей, ключ ≤ 50 символов, значение ≤ 255 символов.

Обязательные ключи:
- `project` = `{код проекта}` — первая нода после триггера (Code node, Run Once)
- `bt` = `BT-NNN` — номер бизнес-задачи, ставится там же

Ключи на развилках и ключевых шагах (добавлять по ситуации):
- `event` — тип входного события (например: `lead_status_changed`, `deal_created`)
- `branch` — какая ветка логики сработала (например: `qualified`, `rejected`)
- `entity_id` — ID основной сущности (сделка, контакт)
- `result` — итог выполнения (например: `task_created`, `skipped`, `notification_sent`)

Реализация — Code node (Run Once Mode), вставляется после триггера и на ключевых развилках:
```javascript
$execution.customData.set("project", "PROJECT");
$execution.customData.set("bt", "BT-001");
```
На развилке/ключевом шаге — отдельный Code node:
```javascript
$execution.customData.set("branch", "qualified");
```

## Обработка ошибок
Все воркфлоу проекта используют единый Error Handler (`[UTIL] Error Handler → Telegram`).
При ошибке или остановке воркфлоу — в Telegram-чат улетает сообщение с именем воркфлоу, нодой, текстом ошибки и ссылкой на execution.
Каждый воркфлоу при деплое получает `"settings": {"errorWorkflow": "{N8N_ERROR_WORKFLOW_ID}"}`.

## Технические особенности n8n
- executeWorkflowTrigger: typeVersion 1 (не 1.1)
- httpRequest: typeVersion 4.2, без credential — токен inline в headerParameters
- HTTP-ноды обязательно: `options.response.response.responseFormat: "json"`
- HTTP-ноды обязательно: `retryOnFail: true, maxTries: 3, waitBetweenTries: 2000`
- Data Table нода: `n8n-nodes-base.dataTable` (с большой T), typeVersion 1
- При добавлении нод: разносить по вертикали минимум на 150px
- После PUT обновления entry-роутера — деактивировать/активировать для перерегистрации вебхука
- amoCRM удаляет вебхуки после серии ошибок — при отладке проверять наличие

## Деплой

### N8N воркфлоу
```bash
node scripts/deploy.js docs/business-tasks/BT-NNN-название   # BT-задача
node scripts/deploy.js workflows/entry/webhook-deal.json      # entry-роутер
node scripts/deploy.js workflows/utils/error-handler.json     # утилита
```
Скрипт автоматически: создаёт или обновляет, назначает тег, активирует, синхронизирует workflow.json.

### Веб-сервис
```bash
cd services/web
docker compose up -d --build   # первый запуск или после изменений
docker compose logs -f          # логи
```
Сервис деплоится как Docker-контейнер на поддомен клиента.

## Версионирование SemVer
- PATCH (1.0.X) — правка текста, мелкие исправления
- MINOR (1.X.0) — новая ветка логики, новое условие
- MAJOR (X.0.0) — смена триггера, полная переработка

## Соглашения по именованию
- Папки задач: BT-NNN-kebab-case (только латиница и дефисы)
- Имена воркфлоу в N8N: PROJECT | [BT-NNN] Название задачи на русском
- Entry-воркфлоу: PROJECT | [ENTRY] Deal Events
- Утилиты: PROJECT | [UTIL] Send Telegram Alert

## Файлы задачи
- spec.md — пишет и правит только человек
- workflow.json — генерирует и обновляет только Claude (тип n8n / both)
- log.md — ведёт только Claude
- howto.md — описание на человеческом языке: что делает, как работает, как тестировать. Ведёт Claude, обновляет при каждом изменении задачи

## Веб-сервис (services/web/)
- Один Fastify-сервер, один Docker-контейнер на клиента
- Каждая BT-задача типа service/both — отдельный файл роута в routes/
- Шаблоны страниц — EJS в templates/
- Роут регистрируется в routes/index.js
- Конфиг сервиса — services/web/.env (не коммитить)
