#!/usr/bin/env node

// Универсальный скрипт деплоя воркфлоу в n8n
// Создание (POST) или обновление (PUT) — определяется по наличию Workflow ID в spec.md
//
// Использование:
//   node scripts/deploy.js docs/business-tasks/BT-001-deeplink-utm
//   node scripts/deploy.js workflows/entry/webhook-deal.json

const fs = require('fs');
const path = require('path');

// --- Загрузка .env ---

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    console.error('Ошибка: файл .env не найден.');
    process.exit(1);
  }
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return env;
}

// --- Помощники ---

async function n8nRequest(env, method, endpoint, body) {
  const url = env.N8N_URL.replace(/\/$/, '') + endpoint;
  const opts = {
    method,
    headers: {
      'X-N8N-API-KEY': env.N8N_API_KEY,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

function readSpec(dir) {
  const specPath = path.join(dir, 'spec.md');
  if (!fs.existsSync(specPath)) return null;
  return fs.readFileSync(specPath, 'utf-8');
}

function getWorkflowIdFromSpec(specContent) {
  if (!specContent) return null;
  const match = specContent.match(/\*\*N8N Workflow ID:\*\*\s*`([^`]+)`/);
  if (!match) return null;
  const id = match[1].trim();
  if (id.includes('заполняет') || id.includes('after') || !id) return null;
  return id;
}

function writeWorkflowIdToSpec(dir, workflowId) {
  const specPath = path.join(dir, 'spec.md');
  let content = fs.readFileSync(specPath, 'utf-8');
  content = content.replace(
    /(\*\*N8N Workflow ID:\*\*\s*`)([^`]*)(`)/,
    `$1${workflowId}$3`
  );
  content = content.replace(
    /(\*\*Статус:\*\*\s*)draft/,
    '$1deployed'
  );
  fs.writeFileSync(specPath, content);
}

// --- Основная логика ---

async function deploy(targetPath) {
  const env = loadEnv();

  if (!env.N8N_URL || !env.N8N_API_KEY) {
    console.error('Ошибка: N8N_URL и N8N_API_KEY обязательны в .env');
    process.exit(1);
  }

  // Определяем что деплоим: папку BT или отдельный json
  let workflowJsonPath;
  let btDir = null;
  const resolved = path.resolve(targetPath);

  if (fs.statSync(resolved).isDirectory()) {
    btDir = resolved;
    workflowJsonPath = path.join(resolved, 'workflow.json');
  } else if (resolved.endsWith('.json')) {
    workflowJsonPath = resolved;
  } else {
    console.error('Укажите папку BT-задачи или путь к workflow.json');
    process.exit(1);
  }

  if (!fs.existsSync(workflowJsonPath)) {
    console.error(`Файл не найден: ${workflowJsonPath}`);
    process.exit(1);
  }

  const workflow = JSON.parse(fs.readFileSync(workflowJsonPath, 'utf-8'));
  const payload = {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: workflow.settings || {},
  };

  // Добавить errorWorkflow если есть
  if (env.N8N_ERROR_WORKFLOW_ID && !payload.settings.errorWorkflow) {
    payload.settings.errorWorkflow = env.N8N_ERROR_WORKFLOW_ID;
  }

  // Определяем: создание или обновление
  let workflowId = null;

  if (btDir) {
    const spec = readSpec(btDir);
    workflowId = getWorkflowIdFromSpec(spec);
  }

  if (workflowId) {
    // --- ОБНОВЛЕНИЕ ---
    console.log(`Обновляю воркфлоу ${workflowId}...`);
    const result = await n8nRequest(env, 'PUT', `/api/v1/workflows/${workflowId}`, payload);

    if (result.id) {
      console.log(`✓ Обновлено: ${result.name} (${result.id})`);
    } else {
      console.error('✗ Ошибка обновления:', result.message || result);
      process.exit(1);
    }
  } else {
    // --- СОЗДАНИЕ ---
    console.log(`Создаю воркфлоу "${payload.name}"...`);
    const result = await n8nRequest(env, 'POST', '/api/v1/workflows', payload);

    if (!result.id) {
      console.error('✗ Ошибка создания:', result.message || result);
      process.exit(1);
    }

    workflowId = result.id;
    console.log(`✓ Создано: ${result.name} (${workflowId})`);

    // Записать ID в spec.md
    if (btDir) {
      writeWorkflowIdToSpec(btDir, workflowId);
      console.log(`✓ Workflow ID записан в spec.md`);
    }
  }

  // --- ТЕГ ---
  if (env.N8N_TAG_ID) {
    const tagResult = await n8nRequest(env, 'PUT', `/api/v1/workflows/${workflowId}/tags`, [{ id: env.N8N_TAG_ID }]);
    if (Array.isArray(tagResult) && tagResult.length) {
      console.log(`✓ Тег: ${tagResult[0].name}`);
    } else {
      console.warn('⚠ Не удалось назначить тег:', tagResult.message || tagResult);
    }
  }

  // --- АКТИВАЦИЯ ---
  const activateResult = await n8nRequest(env, 'POST', `/api/v1/workflows/${workflowId}/activate`);
  if (activateResult.active) {
    console.log(`✓ Активирован`);
  } else {
    console.warn('⚠ Не удалось активировать:', activateResult.message || activateResult);
  }

  // --- СИНХРОНИЗАЦИЯ: скачать актуальную версию из n8n ---
  const deployed = await n8nRequest(env, 'GET', `/api/v1/workflows/${workflowId}`);
  if (deployed.id) {
    const synced = {
      name: deployed.name,
      nodes: deployed.nodes,
      connections: deployed.connections,
      settings: deployed.settings,
      active: deployed.active,
    };
    fs.writeFileSync(workflowJsonPath, JSON.stringify(synced, null, 2) + '\n');
    console.log(`✓ workflow.json синхронизирован с n8n`);
  }

  console.log(`\nГотово: ${env.N8N_URL.replace(/\/$/, '')}/workflow/${workflowId}`);
}

// --- Запуск ---

const target = process.argv[2];
if (!target) {
  console.log('Использование:');
  console.log('  node scripts/deploy.js docs/business-tasks/BT-001-название');
  console.log('  node scripts/deploy.js workflows/entry/webhook-deal.json');
  process.exit(0);
}

deploy(target).catch(err => {
  console.error('Ошибка:', err.message);
  process.exit(1);
});
