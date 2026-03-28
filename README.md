# n8n + amoCRM Automation Template

Шаблон проекта для автоматизаций amoCRM через n8n.

## Быстрый старт

### 1. Создать репозиторий

```bash
# Создать новый репо из шаблона
gh repo create mycompany/project-n8n --template permitin1/n8n-amocrm-template --private
git clone https://github.com/mycompany/project-n8n
cd project-n8n
```

### 2. Настроить переменные

```bash
cp .env.example .env
# Заполнить .env: токен amoCRM, URL n8n, API-ключ n8n, Telegram
```

### 3. Заменить код проекта

В `CLAUDE.md` заменить `PROJECT` на код проекта (например `SE`, `RN`, `MT`).
Этот код будет использоваться:
- В именах воркфлоу: `SE | [BT-001] Название`
- В тегах n8n: `se`
- В execution data: `project = se`

### 4. Инициализировать конфиг amoCRM

```bash
node scripts/init-amocrm-config.js
```

### 5. Создать тег в n8n

```bash
source .env
# Создать тег
TAG_ID=$(curl -s -X POST "${N8N_URL}api/v1/tags" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"name": "project-code"}' | jq -r '.id')
# Записать в .env
echo "N8N_TAG_ID=$TAG_ID" >> .env
```

### 6. Задеплоить Error Handler

```bash
source .env
WF_ID=$(curl -s -X POST "${N8N_URL}api/v1/workflows" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$(jq '{name, nodes, connections, settings}' workflows/utils/error-handler.json)" | jq -r '.id')
echo "N8N_ERROR_WORKFLOW_ID=$WF_ID" >> .env
```

### 7. Готово — создавайте BT-задачи

Работайте с Claude Code:
- Опишите задачу
- Claude создаст spec, workflow, задеплоит, протестирует
- Документация обновится автоматически

## Структура проекта

```
.env.example              <- шаблон переменных окружения
CLAUDE.md                 <- инструкции для Claude Code
CHANGELOG.md              <- лог изменений
docs/
  automations.md          <- описание всех автоматизаций (для людей)
  amocrm-config/          <- конфиг amoCRM (поля, воронки, теги)
  business-tasks/
    _template/            <- шаблон BT-задачи
    BT-001-название/
      spec.md             <- ТЗ (пишет человек)
      workflow.json       <- воркфлоу (генерирует Claude)
      log.md              <- история версий
      howto.md            <- как работает и как тестировать
workflows/
  entry/                  <- entry-роутеры (вебхуки amoCRM)
  utils/                  <- утилиты (error handler и т.д.)
scripts/
  init-amocrm-config.js  <- инициализация конфига amoCRM
```
