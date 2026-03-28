#!/usr/bin/env node

// Скрипт загрузки конфигурации amoCRM через API v4
// Без внешних зависимостей — только нативный fetch и fs

const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, '..', 'docs', 'amocrm-config');

// Чтение .env вручную
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    console.error('Ошибка: файл .env не найден. Скопируй .env.example в .env и заполни.');
    process.exit(1);
  }
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    env[key] = value;
  }
  return env;
}

const env = loadEnv();
const TOKEN = env.AMOCRM_ACCESS_TOKEN;
const DOMAIN = env.AMOCRM_DOMAIN;

if (!TOKEN || !DOMAIN) {
  console.error('Ошибка: AMOCRM_ACCESS_TOKEN и AMOCRM_DOMAIN должны быть заполнены в .env');
  process.exit(1);
}

const BASE_URL = `https://${DOMAIN}`;

async function apiGet(endpoint) {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status} ${endpoint}: ${text}`);
  }
  return res.json();
}

// Пагинация для запросов с лимитом
async function apiGetAll(endpoint, key) {
  let page = 1;
  let all = [];
  while (true) {
    const separator = endpoint.includes('?') ? '&' : '?';
    const data = await apiGet(`${endpoint}${separator}page=${page}`);
    const embedded = data._embedded;
    if (!embedded || !embedded[key] || embedded[key].length === 0) break;
    all = all.concat(embedded[key]);
    if (!data._links || !data._links.next) break;
    page++;
  }
  return all;
}

function writeFile(filename, content) {
  fs.writeFileSync(path.join(CONFIG_DIR, filename), content, 'utf-8');
}

// ========== 1. account.md ==========
async function fetchAccount() {
  const data = await apiGet('/api/v4/account?with=users_groups,task_types,datetime_settings,amojo_id');

  let md = `# Аккаунт amoCRM\n\n`;
  md += `- **Название:** ${data.name}\n`;
  md += `- **Subdomain:** ${data.subdomain}\n`;
  md += `- **ID:** ${data.id}\n`;
  md += `- **Часовой пояс:** ${data.datetime_settings?.timezone || '—'}\n`;
  md += `- **Формат даты:** ${data.datetime_settings?.date_pattern || '—'}\n`;
  md += `- **Формат времени:** ${data.datetime_settings?.time_pattern || '—'}\n`;
  md += `- **Режим покупателей:** ${data.customers_mode || 'disabled'}\n`;
  md += `- **is_unsorted_on:** ${data.is_unsorted_on ?? '—'}\n`;
  md += `- **is_loss_reason_enabled:** ${data.is_loss_reason_enabled ?? '—'}\n`;
  md += `- **amojo_id:** ${data.amojo_id || '—'}\n`;

  const groups = data._embedded?.groups || [];
  if (groups.length > 0) {
    md += `\n## Группы пользователей\n\n`;
    md += `| ID | Название |\n`;
    md += `|----|----------|\n`;
    for (const g of groups) {
      md += `| ${g.id} | ${g.name} |\n`;
    }
  }

  writeFile('account.md', md);
  return data;
}

// ========== 2. pipelines.md ==========
async function fetchPipelines() {
  const data = await apiGet('/api/v4/leads/pipelines');
  const pipelines = data._embedded?.pipelines || [];

  let md = `# Воронки и этапы\n\n`;
  let totalStatuses = 0;

  for (const pipeline of pipelines) {
    md += `## ${pipeline.name}\n\n`;
    md += `- **ID:** ${pipeline.id}\n`;
    md += `- **is_main:** ${pipeline.is_main}\n`;
    md += `- **is_unsorted_on:** ${pipeline.is_unsorted_on}\n\n`;

    // Загружаем статусы с описаниями
    let statuses = [];
    try {
      const statusData = await apiGet(`/api/v4/leads/pipelines/${pipeline.id}/statuses`);
      statuses = statusData._embedded?.statuses || pipeline._embedded?.statuses || [];
    } catch {
      statuses = pipeline._embedded?.statuses || [];
    }

    totalStatuses += statuses.length;

    md += `| ID | Название | Цвет | Тип | Порядок |\n`;
    md += `|----|----------|------|-----|--------|\n`;
    for (const s of statuses) {
      md += `| ${s.id} | ${s.name} | ${s.color || '—'} | ${s.type || '—'} | ${s.sort ?? '—'} |\n`;
    }
    md += `\n`;

    // Описания ролей для этапов
    for (const s of statuses) {
      const descriptions = [];
      if (s.description_newbie) descriptions.push(`  - **Новичок:** ${s.description_newbie}`);
      if (s.description_candidate) descriptions.push(`  - **Кандидат:** ${s.description_candidate}`);
      if (s.description_master) descriptions.push(`  - **Мастер:** ${s.description_master}`);
      if (descriptions.length > 0) {
        md += `### ${s.name} (ID: ${s.id}) — описания ролей\n\n`;
        md += descriptions.join('\n') + '\n\n';
      }
    }
  }

  writeFile('pipelines.md', md);
  return { pipelinesCount: pipelines.length, statusesCount: totalStatuses };
}

// ========== 3. fields.md ==========
async function fetchFields() {
  const entities = [
    { name: 'Сделки', endpoint: '/api/v4/leads/custom_fields', key: 'custom_fields' },
    { name: 'Контакты', endpoint: '/api/v4/contacts/custom_fields', key: 'custom_fields' },
    { name: 'Компании', endpoint: '/api/v4/companies/custom_fields', key: 'custom_fields' },
    { name: 'Покупатели', endpoint: '/api/v4/customers/custom_fields', key: 'custom_fields' },
  ];

  let md = `# Кастомные поля\n\n`;
  const counts = {};

  for (const entity of entities) {
    let fields = [];
    try {
      const data = await apiGet(entity.endpoint);
      fields = data._embedded?.custom_fields || [];
    } catch (e) {
      // Покупатели могут быть выключены
      fields = [];
    }

    counts[entity.name] = fields.length;
    md += `## ${entity.name}\n\n`;

    if (fields.length === 0) {
      md += `Нет кастомных полей.\n\n`;
      continue;
    }

    md += `| ID | Название | Код | Тип | Обязательное | Видимое | Только API |\n`;
    md += `|----|----------|-----|-----|-------------|---------|------------|\n`;
    for (const f of fields) {
      md += `| ${f.id} | ${f.name} | ${f.code || '—'} | ${f.type} | ${f.is_required ? 'да' : 'нет'} | ${f.is_visible ? 'да' : 'нет'} | ${f.is_api_only ? 'да' : 'нет'} |\n`;
    }
    md += `\n`;

    // Enum/multiselect значения
    for (const f of fields) {
      if ((f.type === 'select' || f.type === 'multiselect' || f.type === 'radiobutton') && f.enums) {
        md += `### ${f.name} (ID: ${f.id}) — значения\n\n`;
        md += `| ID | Значение |\n`;
        md += `|----|----------|\n`;
        for (const e of f.enums) {
          md += `| ${e.id} | ${e.value} |\n`;
        }
        md += `\n`;
      }
    }
  }

  writeFile('fields.md', md);
  return counts;
}

// ========== 4. users.md ==========
async function fetchUsers() {
  const data = await apiGet('/api/v4/users?with=role,group');
  const users = data._embedded?.users || [];

  const accessCodes = { A: 'все', G: 'группа', M: 'свои', D: 'нет доступа' };

  let md = `# Пользователи\n\n`;
  md += `| ID | Имя | Email | Группа/Отдел | Роль | Админ | Активен |\n`;
  md += `|----|-----|-------|-------------|------|-------|---------|\n`;

  for (const u of users) {
    const groupName = u._embedded?.groups?.[0]?.name || '—';
    const roleName = u._embedded?.roles?.[0]?.name || '—';
    md += `| ${u.id} | ${u.name || '—'} | ${u.email || '—'} | ${groupName} | ${roleName} | ${u.is_admin ? 'да' : 'нет'} | ${u.is_active ? 'да' : 'нет'} |\n`;
  }

  md += `\n## Расшифровка кодов доступа\n\n`;
  md += `- **A** = все\n- **G** = группа\n- **M** = свои\n- **D** = нет доступа\n\n`;

  // Детали прав
  md += `## Права пользователей\n\n`;
  for (const u of users) {
    const rights = u.rights || {};
    md += `### ${u.name || u.email} (ID: ${u.id})\n\n`;

    const entities = [
      { name: 'Сделки', key: 'leads' },
      { name: 'Контакты', key: 'contacts' },
      { name: 'Компании', key: 'companies' },
    ];

    for (const ent of entities) {
      const r = rights[ent.key] || {};
      const decode = (code) => accessCodes[code] || code || '—';
      md += `- **${ent.name}:** view: ${decode(r.view)} | edit: ${decode(r.edit)} | add: ${decode(r.add)} | delete: ${decode(r.delete)} | export: ${decode(r.export)}\n`;
    }

    md += `- **mail_access:** ${rights.mail_access ?? '—'}\n`;
    md += `- **catalog_access:** ${rights.catalog_access ?? '—'}\n\n`;
  }

  writeFile('users.md', md);
  return users.length;
}

// ========== 5. tags.md ==========
async function fetchTags() {
  const entities = [
    { name: 'Сделки', endpoint: '/api/v4/leads/tags?limit=250', key: 'tags' },
    { name: 'Контакты', endpoint: '/api/v4/contacts/tags?limit=250', key: 'tags' },
    { name: 'Компании', endpoint: '/api/v4/companies/tags?limit=250', key: 'tags' },
  ];

  let md = `# Теги\n\n`;
  const counts = {};

  for (const entity of entities) {
    const tags = await apiGetAll(entity.endpoint, entity.key);
    counts[entity.name] = tags.length;

    md += `## ${entity.name}\n\n`;
    if (tags.length === 0) {
      md += `Нет тегов.\n\n`;
      continue;
    }
    md += `| ID | Название |\n`;
    md += `|----|----------|\n`;
    for (const t of tags) {
      md += `| ${t.id} | ${t.name} |\n`;
    }
    md += `\n`;
  }

  writeFile('tags.md', md);
  return counts;
}

// ========== 6. task-types.md ==========
function writeTaskTypes(accountData) {
  const taskTypes = accountData._embedded?.task_types || accountData.task_types || [];

  let md = `# Типы задач\n\n`;
  md += `| ID | Название | Код | Цвет |\n`;
  md += `|----|----------|-----|------|\n`;
  for (const t of taskTypes) {
    md += `| ${t.id} | ${t.name} | ${t.code || '—'} | ${t.color || '—'} |\n`;
  }

  writeFile('task-types.md', md);
  return taskTypes.length;
}

// ========== 7. webhooks-active.md ==========
async function fetchWebhooks() {
  let webhooks = [];
  try {
    const data = await apiGet('/api/v4/webhooks');
    webhooks = data._embedded?.webhooks || [];
  } catch {
    webhooks = [];
  }

  let md = `# Активные вебхуки\n\n`;
  if (webhooks.length === 0) {
    md += `Нет настроенных вебхуков.\n`;
  } else {
    md += `| ID | URL назначения | Подписки (events) | Активен | Дата создания |\n`;
    md += `|----|---------------|-------------------|---------|---------------|\n`;
    for (const w of webhooks) {
      const events = (w.settings || []).join(', ');
      const createdAt = w.created_at ? new Date(w.created_at * 1000).toISOString().slice(0, 10) : '—';
      md += `| ${w.id} | ${w.destination} | ${events} | ${w.disabled ? 'нет' : 'да'} | ${createdAt} |\n`;
    }
  }

  writeFile('webhooks-active.md', md);
  return webhooks.length;
}

// ========== 8. salesbots.md ==========
function writeSalesbots() {
  const md = `# Сейлзботы

Заполняется вручную — у amoCRM нет публичного API для сейлзботов.

Как найти ID бота: Настройки → Salesbot → открыть бота → ID в URL браузера.

| ID | Название | Воронка | Этапы запуска | Что делает | Статус |
|----|----------|---------|---------------|------------|--------|
|    |          |         |               |            |        |
`;
  // Не перезаписываем если файл уже существует
  const filepath = path.join(CONFIG_DIR, 'salesbots.md');
  if (!fs.existsSync(filepath)) {
    writeFile('salesbots.md', md);
  }
}

// ========== Запуск ==========
async function main() {
  console.log(`Загружаю конфигурацию amoCRM с ${DOMAIN}...\n`);

  // Убедимся что папка существует
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  try {
    // 1. Аккаунт
    const accountData = await fetchAccount();
    console.log(`✓ account.md          — аккаунт: ${accountData.name}`);

    // 2. Воронки
    const pipelineStats = await fetchPipelines();
    console.log(`✓ pipelines.md        — воронок: ${pipelineStats.pipelinesCount}, этапов всего: ${pipelineStats.statusesCount}`);

    // 3. Поля
    const fieldCounts = await fetchFields();
    console.log(`✓ fields.md           — полей: сделки ${fieldCounts['Сделки'] || 0}, контакты ${fieldCounts['Контакты'] || 0}, компании ${fieldCounts['Компании'] || 0}, покупатели ${fieldCounts['Покупатели'] || 0}`);

    // 4. Пользователи
    const usersCount = await fetchUsers();
    console.log(`✓ users.md            — пользователей: ${usersCount}`);

    // 5. Теги
    const tagCounts = await fetchTags();
    console.log(`✓ tags.md             — тегов: сделки ${tagCounts['Сделки'] || 0}, контакты ${tagCounts['Контакты'] || 0}, компании ${tagCounts['Компании'] || 0}`);

    // 6. Типы задач (из данных аккаунта)
    const taskTypesCount = writeTaskTypes(accountData);
    console.log(`✓ task-types.md       — типов задач: ${taskTypesCount}`);

    // 7. Вебхуки
    const webhooksCount = await fetchWebhooks();
    console.log(`✓ webhooks-active.md  — вебхуков: ${webhooksCount}`);

    // 8. Сейлзботы
    writeSalesbots();
    console.log(`! salesbots.md        — заполни вручную`);

    console.log(`\nКонфиг сохранён в docs/amocrm-config/`);
  } catch (error) {
    console.error(`\nОшибка: ${error.message}`);
    process.exit(1);
  }
}

main();
