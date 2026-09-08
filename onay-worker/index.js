/**
 * Onay Worker — bağımsız Cloudflare Worker.
 *
 * Ajanların oluşturduğu tek kullanımlık onay/red bağlantılarını KV'de tutar.
 * Yalnızca ALLOWED_REPO için sınırlı PR merge / issue kapatma işlemleri yapar.
 */

const ACTION_TYPES = new Set(["merge_pr", "close_issue", "info_only"]);
const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TITLE_LENGTH = 240;
const MAX_DESCRIPTION_LENGTH = 4000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/create-approval" && request.method === "POST") {
      return await createApproval(request, url, env);
    }

    const approvalMatch = url.pathname.match(/^\/(onay|red)\/([^/]+)$/);
    if (approvalMatch && request.method === "GET") {
      return await processDecision(approvalMatch[2], approvalMatch[1] === "onay", env);
    }

    return new Response("Bulunamadı", { status: 404 });
  },
};

async function createApproval(request, url, env) {
  if (!env.ONAY_WORKER_SECRET || request.headers.get("x-onay-secret") !== env.ONAY_WORKER_SECRET) {
    return new Response("Yetkisiz", { status: 401 });
  }
  if (!env.ONAY_KV || !env.ALLOWED_REPO) {
    return Response.json({ error: "Onay Worker yapılandırması eksik." }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Geçersiz JSON." }, { status: 400 });
  }

  const title = stringValue(body?.title).trim();
  const description = stringValue(body?.description).trim();
  const repo = stringValue(body?.repo).trim();
  const actionType = stringValue(body?.action_type).trim();
  const refText = stringValue(body?.ref_number).trim();
  const refNumber = refText === "" ? null : Number(refText);

  if (!title || title.length > MAX_TITLE_LENGTH) {
    return Response.json({ error: `title 1-${MAX_TITLE_LENGTH} karakter olmalı.` }, { status: 400 });
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return Response.json({ error: `description en fazla ${MAX_DESCRIPTION_LENGTH} karakter olabilir.` }, { status: 400 });
  }
  if (repo !== env.ALLOWED_REPO) {
    return Response.json({ error: "Bu repo için işlem yapılamaz." }, { status: 403 });
  }
  if (!ACTION_TYPES.has(actionType)) {
    return Response.json({ error: "Geçersiz action_type." }, { status: 400 });
  }
  if (actionType !== "info_only" && (!Number.isSafeInteger(refNumber) || refNumber < 1)) {
    return Response.json({ error: "PR/Issue numarası geçerli bir pozitif tam sayı olmalı." }, { status: 400 });
  }

  const token = crypto.randomUUID();
  await env.ONAY_KV.put(
    token,
    JSON.stringify({
      title,
      description,
      repo,
      action_type: actionType,
      ref_number: refNumber,
      status: "bekliyor",
      createdAt: Date.now(),
    }),
    { expirationTtl: 60 * 60 * 24 },
  );

  return Response.json({
    onay_link: `${url.origin}/onay/${token}`,
    red_link: `${url.origin}/red/${token}`,
  });
}

async function processDecision(token, approved, env) {
  if (!TOKEN_PATTERN.test(token)) {
    return htmlResponse("Bu link geçersiz.", false);
  }

  const raw = await env.ONAY_KV?.get(token);
  if (!raw) {
    return htmlResponse("Bu link süresi dolmuş ya da geçersiz.", false);
  }

  let record;
  try {
    record = JSON.parse(raw);
  } catch {
    return htmlResponse("Onay kaydı okunamadı.", false);
  }
  if (record.status !== "bekliyor") {
    return htmlResponse(`Bu talep zaten "${record.status}" olarak işaretlenmiş.`, true);
  }

  if (!approved) {
    record.status = "reddedildi";
    record.decidedAt = Date.now();
    await saveRecord(env, token, record);
    return htmlResponse(`❌ Reddedildi: ${record.title}`, true);
  }

  if (record.action_type !== "info_only") {
    try {
      await performGithubAction(record, env);
    } catch (error) {
      record.lastError = error instanceof Error ? error.message : "GitHub işlemi başarısız.";
      await saveRecord(env, token, record);
      return htmlResponse(`⚠️ İşlem gerçekleştirilemedi: ${record.lastError}`, false);
    }
  }

  record.status = "onaylandi";
  record.decidedAt = Date.now();
  await saveRecord(env, token, record);
  return htmlResponse(`✅ Onaylandı: ${record.title}`, true);
}

async function performGithubAction(record, env) {
  if (!env.GITHUB_TOKEN || record.repo !== env.ALLOWED_REPO) {
    throw new Error("GitHub onay yapılandırması eksik.");
  }

  const endpoint = record.action_type === "merge_pr"
    ? `https://api.github.com/repos/${record.repo}/pulls/${record.ref_number}/merge`
    : `https://api.github.com/repos/${record.repo}/issues/${record.ref_number}`;
  const options = {
    method: record.action_type === "merge_pr" ? "PUT" : "PATCH",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "anunex-onay-worker",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(record.action_type === "merge_pr" ? { merge_method: "squash" } : { state: "closed" }),
  };

  const response = await fetch(endpoint, options);
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${responseText.slice(0, 300)}`);
  }
  if (record.action_type === "merge_pr") {
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      throw new Error("GitHub merge yanıtı geçersiz.");
    }
    if (result.merged !== true) {
      throw new Error(`PR merge edilmedi: ${result.message || "bilinmeyen neden"}`);
    }
  }
}

async function saveRecord(env, token, record) {
  await env.ONAY_KV.put(token, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 });
}

function stringValue(value) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function escapeHtml(value) {
  return stringValue(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}

function htmlResponse(message, success) {
  const color = success ? "#16a34a" : "#dc2626";
  const safeMessage = escapeHtml(message);
  return new Response(`<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Onay Sonucu</title></head>
<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f172a">
<div style="text-align:center;color:white;padding:2rem"><h1 style="color:${color}">${safeMessage}</h1><p style="color:#94a3b8">Bu sekmeyi kapatabilirsin.</p></div>
</body></html>`, { headers: { "content-type": "text/html; charset=utf-8" } });
}
