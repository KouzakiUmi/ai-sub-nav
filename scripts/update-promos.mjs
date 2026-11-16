// ============================================================
// 官网优惠自动核对脚本（零依赖，Node >= 18）
// 读取 data/sites.js 中每个平台的 promoSources（官网活动 / 价格页），
// 抓取公开优惠文案写入 data/promos.js；页面「最新优惠」区消费该快照。
// 原则：
//  - 只抓公开营销页，低频（每日一次）、串行限流、带超时与一次重试；
//  - 动态渲染页（SPA）仅监测可达性与标题变化，不编造内容；
//  - 抓取失败保留上次快照并标记 stale / error，绝不写假数据；
//  - 人工核对字段（sites.js 的 freeTier / pricing）只提示变动、不自动改写。
// 用法：node scripts/update-promos.mjs
// ============================================================
import { createHash } from "node:crypto";
import { writeFile, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const TIMEOUT = 15000;
const CONC = 4;
const MAX_HTML = 3 * 1024 * 1024;

const KW =
  /免费|赠送|赠金|邀请|优惠|限时|新用户|代金券|福利|积分|额度|首月|折扣|立省|公测|free|trial|credit|discount|invite|allowance|\$\d|¥|￥|元\/月/i;
const STRONG =
  /免费|赠送|赠金|邀请|优惠|限时|首月|折扣|立省|公测|free|trial|discount|invite|allowance/i;
const JUNK = /^(Skip|复制页面|搜索|Sign in|Log in|登录|下载|Documentation Index|Fetch the complete)/;
// 文档站会把 MDX/JSX 源码嵌进 HTML，含代码标记的句子不是面向用户的优惠文案
const CODE_FRAG = /_jsx|_jsxs|_components|children:`|`/;

await import(new URL("../data/sites.js", import.meta.url).href);
const SITES = globalThis.SITES || [];
let PREV = null;
try {
  await import(new URL("../data/promos.js", import.meta.url).href);
  PREV = globalThis.PROMOS || null;
} catch {
  PREV = null;
}
const prevItems = (PREV && PREV.items) || [];

function normText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
function sentences(text) {
  return text
    .split(/(?<=[。！？；])|\n+|(?<=\.)\s(?=[A-Z0-9$])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 10 && s.length <= 140 && KW.test(s) && !JUNK.test(s) && !CODE_FRAG.test(s));
}
function pickSnippets(list, max = 4) {
  const uniq = [...new Set(list)];
  uniq.sort((a, b) => score(b) - score(a));
  return uniq.slice(0, max);
}
function score(s) {
  const m = s.match(new RegExp(STRONG.source, "gi"));
  return m ? m.length : 0;
}
function walkStrings(node, out, depth = 0) {
  if (depth > 8 || out.length > 300) return;
  if (typeof node === "string") {
    if (node.length >= 10 && node.length <= 140 && KW.test(node) && !JUNK.test(node) && !CODE_FRAG.test(node)) out.push(node.trim());
  } else if (Array.isArray(node)) {
    for (const v of node) walkStrings(v, out, depth + 1);
  } else if (node && typeof node === "object") {
    for (const v of Object.values(node)) walkStrings(v, out, depth + 1);
  }
}
async function fetchOnce(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      signal: ac.signal,
      redirect: "follow"
    });
    const html = (await res.text()).slice(0, MAX_HTML);
    return { status: res.status, html };
  } finally {
    clearTimeout(t);
  }
}
async function fetchRetry(url) {
  try {
    return await fetchOnce(url);
  } catch (e) {
    await new Promise((r) => setTimeout(r, 1500));
    return await fetchOnce(url);
  }
}
function sha(s) {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}

async function processSource(site, url) {
  const now = new Date().toISOString();
  const prev = prevItems.find((p) => p.siteId === site.id && p.url === url);
  try {
    const { status, html } = await fetchRetry(url);
    if (status >= 400) throw new Error("HTTP " + status);
    const title = ((html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "").trim().slice(0, 90);
    const text = normText(html);
    let snippets = [];
    let kind = "text";
    if (text.length >= 300) {
      snippets = pickSnippets(sentences(text));
    } else {
      const nextRaw = (html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i) || [])[1];
      if (nextRaw) {
        try {
          const out = [];
          walkStrings(JSON.parse(nextRaw), out);
          snippets = pickSnippets(out);
          kind = "next-data";
        } catch {}
      }
      if (!snippets.length) kind = "spa";
    }
    const hash = sha(kind === "spa" ? title : text.slice(0, 20000));
    const changed = !!(prev && prev.hash && prev.hash !== hash && kind !== "spa");
    return { siteId: site.id, url, status: "ok", kind, title, snippets, hash, changed, fetchedAt: now };
  } catch (e) {
    const msg = String((e && e.cause && e.cause.code) || (e && e.message) || e).slice(0, 90);
    if (prev && prev.snippets && prev.snippets.length) {
      return {
        siteId: site.id, url, status: "stale", kind: prev.kind || "text", title: prev.title || "",
        snippets: prev.snippets, hash: prev.hash || "", changed: false,
        fetchedAt: prev.fetchedAt || now, error: msg
      };
    }
    return { siteId: site.id, url, status: "error", kind: "text", title: "", snippets: [], hash: "", changed: false, fetchedAt: now, error: msg };
  }
}

const jobs = SITES.flatMap((s) => (s.promoSources || []).map((url) => ({ site: s, url })));
const items = [];
for (let i = 0; i < jobs.length; i += CONC) {
  const batch = jobs.slice(i, i + CONC);
  const out = await Promise.all(batch.map((j) => processSource(j.site, j.url)));
  items.push(...out);
  await new Promise((r) => setTimeout(r, 300));
}

const payload = {
  generatedAt: new Date().toISOString(),
  run: process.env.GITHUB_RUN_ID ? "actions-" + process.env.GITHUB_RUN_ID : "local",
  items
};
const file = fileURLToPath(new URL("../data/promos.js", import.meta.url));
const tmp = file + ".tmp";
const header =
  "// 自动生成，请勿手改：node scripts/update-promos.mjs / GitHub Actions 每日更新\n" +
  "// 生成时间 " + payload.generatedAt + " · run " + payload.run + "\n";
await writeFile(tmp, header + "globalThis.PROMOS = " + JSON.stringify(payload, null, 2) + ";\n", "utf8");
await rename(tmp, file);

const count = (st) => items.filter((x) => x.status === st).length;
const spa = items.filter((x) => x.status === "ok" && x.kind === "spa").length;
const changed = items.filter((x) => x.changed);
console.log("[update-promos] sources=" + items.length + " ok=" + count("ok") + " stale=" + count("stale") + " error=" + count("error") + " spa=" + spa);
for (const c of changed) console.log("[changed] " + c.siteId + " " + c.url);
for (const e of items.filter((x) => x.status !== "ok")) console.log("[" + e.status + "] " + e.siteId + " " + e.url + " " + (e.error || ""));
console.log("[update-promos] wrote data/promos.js");