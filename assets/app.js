/* ============================================================
   AI 订阅手账 · 应用逻辑（公开视图 + 站长编辑模式）
   数据源：data/sites.js（人工维护） + data/promos.js（脚本自动更新）
   ============================================================ */
(function () {
  "use strict";

  var SITES = Array.isArray(globalThis.SITES) ? globalThis.SITES : [];
  var PROMOS = globalThis.PROMOS && Array.isArray(globalThis.PROMOS.items) ? globalThis.PROMOS : null;
  var EDIT_MODE = new URLSearchParams(location.search).has("edit");
  var DRAFT_KEY = "zine-draft-v1";
  var THEME_KEY = "zine-theme";
  var REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

  var CATS = [
    { id: "all", label: "全部" },
    { id: "coding", label: "编程订阅" },
    { id: "api", label: "模型 API" },
    { id: "work", label: "办公与设计" }
  ];
  var state = { q: "", cat: "all", onlyReviewed: false, onlyInvite: false };

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    stats: $("stats"), chips: $("chips"), q: $("q"), finderNote: $("finderNote"),
    empty: $("empty"), emptyClear: $("emptyClear"),
    promosList: $("promosList"), promosWhen: $("promosWhen"), promosNote: $("promosNote"),
    promosFail: $("promosFail"), promosFailSum: $("promosFailSum"), promosFailList: $("promosFailList"),
    toast: $("toast"), themeBtn: $("themeBtn"),
    heroDate: $("heroDate"), footChecked: $("footChecked"), footYear: $("footYear"),
    editBanner: $("editBanner"), draftNote: $("draftNote"), exportBtn: $("exportBtn"), resetBtn: $("resetBtn"),
    dlg: $("editDlg"), dlgTitle: $("dlgTitle"), dlgClose: $("dlgClose"), dlgCancel: $("dlgCancel"),
    editForm: $("editForm"), fRating: $("fRating"), fVerdict: $("fVerdict"), fPros: $("fPros"),
    fCons: $("fCons"), fScene: $("fScene"), fBody: $("fBody"), fCode: $("fCode"),
    fInviteUrl: $("fInviteUrl"), fBonus: $("fBonus"), fFree: $("fFree"), fPricing: $("fPricing")
  };

  /* ---------- 工具 ---------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function pad(n) { return String(n).padStart(2, "0"); }
  function fmtTime(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  var toastTimer = null;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.classList.remove("show"); }, 2400);
  }
  function splitList(s) {
    return String(s || "").split(/[,，、;；]/).map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function hasReview(s) {
    var r = s.review || {};
    return (r.rating > 0) || !!r.verdict || !!r.body;
  }
  function hasInvite(s) {
    var i = s.invite || {};
    return !!(i.code || i.url || i.bonus);
  }

  /* ---------- 草稿（站长模式） ---------- */
  function loadDraft() {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}") || {}; } catch (e) { return {}; }
  }
  function saveDraft(d) {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch (e) { toast("草稿保存失败：浏览器存储不可用"); }
  }
  function applyDraft() {
    var d = loadDraft();
    Object.keys(d).forEach(function (id) {
      var site = SITES.find(function (s) { return s.id === id; });
      if (!site) return;
      var p = d[id];
      if (p.review) site.review = Object.assign({}, site.review, p.review);
      if (p.invite) site.invite = Object.assign({}, site.invite, p.invite);
      if (typeof p.freeTier === "string") site.freeTier = p.freeTier;
      if (typeof p.pricing === "string") site.pricing = p.pricing;
    });
    return d;
  }
  function draftCount() { return Object.keys(loadDraft()).length; }
  function refreshDraftNote() {
    var n = draftCount();
    els.draftNote.textContent = n ? n + " 处未发布修改" : "暂无未发布修改";
  }

  /* ---------- 筛选 ---------- */
  function matches(s) {
    if (state.cat !== "all" && s.category !== state.cat) return false;
    if (state.onlyReviewed && !hasReview(s)) return false;
    if (state.onlyInvite && !hasInvite(s)) return false;
    if (!state.q) return true;
    var r = s.review || {};
    var hay = [s.name, s.vendor, s.tagline, (s.tags || []).join(" "), s.freeTier, s.pricing,
      (s.invite || {}).bonus, r.verdict, r.body, r.scene].join(" ").toLowerCase();
    return state.q.toLowerCase().split(/\s+/).filter(Boolean).every(function (t) { return hay.indexOf(t) !== -1; });
  }

  /* ---------- 卡片 ---------- */
  function starsHtml(rating) {
    var on = "★".repeat(rating), off = "★".repeat(5 - rating);
    return '<span class="stars" role="img" aria-label="评分 ' + rating + ' / 5">' +
      '<span aria-hidden="true">' + on + '</span><span class="off" aria-hidden="true">' + off + "</span></span>";
  }
  function tagsHtml(s) {
    var tags = (s.tags || []).slice();
    if (hasReview(s)) tags.push("已评测");
    var out = tags.map(function (t) {
      var cls = "tag";
      if (/免费|赠送|公测|试用/.test(t)) cls += " tag-free";
      else if (/邀请/.test(t)) cls += " tag-invite";
      else if (t === "已评测") cls += " tag-reviewed";
      return '<span class="' + cls + '">' + esc(t) + "</span>";
    });
    return out.length ? '<div class="tags">' + out.join("") + "</div>" : "";
  }
  function inviteHtml(s) {
    if (!hasInvite(s)) return "";
    var i = s.invite || {};
    var row = [];
    if (i.code) {
      row.push('<span class="code-chip">' + esc(i.code) + "</span>");
      row.push('<button class="copy-btn" type="button" data-copy="' + esc(i.code) + '" data-name="' + esc(s.name) + '">' +
        '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M15.5 5.5h-9a2 2 0 0 0-2 2v9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>复制</button>');
    }
    if (i.url) row.push('<a class="invite-link" href="' + esc(i.url) + '" target="_blank" rel="noopener">走我的邀请链接 ↗</a>');
    if (i.programUrl) row.push('<a class="rules-link" href="' + esc(i.programUrl) + '" target="_blank" rel="noopener">官方邀请规则</a>');
    return '<div class="invite">' +
      (i.bonus ? '<p class="invite-bonus">邀请福利 · ' + esc(i.bonus) + "</p>" : "") +
      (row.length ? '<div class="invite-row">' + row.join("") + "</div>" : "") +
      "</div>";
  }
  function reviewHtml(s) {
    var r = s.review || {};
    if (!hasReview(s)) {
      return '<div class="review"><div class="review-empty">' +
        '<span class="seal" aria-hidden="true">评测撰写中</span>' +
        "<p>站长还在整理使用体验；客观资料与官方入口见上。</p></div></div>";
    }
    var parts = [];
    parts.push('<div class="review"><div class="review-head"><span class="review-label">我的评测</span>' +
      (r.rating > 0 ? starsHtml(r.rating) : "") + "</div>");
    if (r.verdict) parts.push('<p class="verdict">' + esc(r.verdict) + "</p>");
    var pc = (r.pros || []).map(function (t) { return '<span class="pc-chip pro">+ ' + esc(t) + "</span>"; })
      .concat((r.cons || []).map(function (t) { return '<span class="pc-chip con">− ' + esc(t) + "</span>"; }));
    if (pc.length) parts.push('<div class="proscons">' + pc.join("") + "</div>");
    if (r.body) {
      var paras = String(r.body).split(/\n+/).filter(Boolean).map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("");
      var long = String(r.body).length > 120;
      parts.push('<div class="review-body" data-body>' + paras + "</div>");
      if (long) parts.push('<button class="review-more" type="button" data-more>展开全文</button>');
    }
    var meta = [r.scene, r.updatedAt ? "评测于 " + r.updatedAt : ""].filter(Boolean).join(" · ");
    if (meta) parts.push('<span class="review-meta">' + esc(meta) + "</span>");
    parts.push("</div>");
    return parts.join("");
  }
  function cardHtml(s, idx) {
    var changed = promoChanged(s.id);
    var foot = ['<a class="btn" href="' + esc(s.url) + '" target="_blank" rel="noopener">注册入口 ↗</a>'];
    if (s.freeSource) foot.push('<a class="src-link" href="' + esc(s.freeSource) + '" target="_blank" rel="noopener">额度来源</a>');
    if (changed) foot.push('<a class="upd-pill" href="#promos">官网有更新</a>');
    if (EDIT_MODE) foot.push('<button class="btn btn-ghost btn-sm edit-btn" type="button" data-edit="' + esc(s.id) + '">写评测 / 填邀请码</button>');
    foot.push('<span class="checked">核对 ' + esc(s.checkedAt || "") + (s.freeKind === "measured" ? " · 含实测" : "") + "</span>");
    return '<article class="card reveal" style="--h:' + Number(s.hue || 210) + ';--d:' + Math.min(idx * 45, 240) + 'ms" data-id="' + esc(s.id) + '">' +
      '<div class="card-head">' +
      '<span class="mono-tile" aria-hidden="true">' + esc(s.monogram || s.name.slice(0, 2)) + "</span>" +
      '<div class="card-title"><h3>' + esc(s.name) + '</h3><span class="card-vendor">' + esc(s.vendor) + "</span></div>" +
      '<span class="card-idx">' + pad(idx + 1) + "</span></div>" +
      '<p class="card-tagline">' + esc(s.tagline) + "</p>" +
      tagsHtml(s) +
      '<div class="facts">' +
      '<div class="fact fact-free"><span class="fact-label">免费额度</span><p class="fact-text">' + esc(s.freeTier) + "</p></div>" +
      '<div class="fact"><span class="fact-label">价格 / 订阅</span><p class="fact-text">' + esc(s.pricing) + "</p></div>" +
      "</div>" +
      (s.note ? '<p class="card-tagline">' + esc(s.note) + "</p>" : "") +
      inviteHtml(s) +
      reviewHtml(s) +
      '<div class="card-foot">' + foot.join("") + "</div>" +
      "</article>";
  }

  /* ---------- 优惠快照 ---------- */
  function promoChanged(id) {
    if (!PROMOS) return false;
    return PROMOS.items.some(function (it) { return it.siteId === id && it.changed && it.status === "ok"; });
  }
  function siteById(id) { return SITES.find(function (s) { return s.id === id; }); }
  function renderPromos() {
    if (!PROMOS) {
      els.promosWhen.textContent = "快照未生成";
      els.promosList.innerHTML = '<div class="empty"><p class="empty-title">还没有优惠快照</p>' +
        "<p>推送到 GitHub 后，Actions 每日 06:00（北京时间）自动生成；也可先在本地运行 <code>node scripts/update-promos.mjs</code>。</p></div>";
      els.promosNote.textContent = "";
      return;
    }
    els.promosWhen.textContent = "快照 " + fmtTime(PROMOS.generatedAt) + " · " + (PROMOS.run || "local");
    var rows = [], fails = [], spa = 0, ok = 0;
    PROMOS.items.forEach(function (it) {
      var s = siteById(it.siteId);
      var name = s ? s.name : it.siteId;
      var hue = s ? s.hue : 210;
      var mono = s ? s.monogram : "?";
      if (it.status === "ok") ok++;
      if (it.status === "ok" && (!it.snippets || !it.snippets.length)) { spa++; return; }
      if (it.status === "error") {
        fails.push("<li>" + esc(name) + ' · <a href="' + esc(it.url) + '" target="_blank" rel="noopener">' + esc(it.url) + "</a> · " + esc(it.error || "抓取失败") + "</li>");
        return;
      }
      if (!it.snippets || !it.snippets.length) return;
      var badge = it.changed ? '<span class="badge badge-new">官网有更新</span>'
        : it.status === "stale" ? '<span class="badge badge-stale">保留上次快照</span>' : "";
      rows.push('<div class="promo-row reveal" style="--h:' + Number(hue) + '">' +
        '<span class="promo-tile" aria-hidden="true">' + esc(mono) + "</span>" +
        '<div class="promo-main"><div class="promo-site">' + esc(name) + badge + "</div>" +
        '<ul class="promo-snips">' + it.snippets.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" +
        '<div class="promo-meta"><a href="' + esc(it.url) + '" target="_blank" rel="noopener">来源官网 ↗</a>' +
        "<span>抓取 " + esc(fmtTime(it.fetchedAt)) + "</span></div></div></div>");
    });
    els.promosList.innerHTML = rows.length ? rows.join("") :
      '<div class="empty"><p class="empty-title">本轮没有可展示的优惠条目</p><p>官网活动页暂无新的公开优惠文案，或均为动态渲染页面；详见下方监测说明。</p></div>';
    if (fails.length) {
      els.promosFail.hidden = false;
      els.promosFailSum.textContent = fails.length + " 个官网本轮抓取失败（不影响其余快照）";
      els.promosFailList.innerHTML = fails.join("");
    } else {
      els.promosFail.hidden = true;
    }
    els.promosNote.textContent = "共监测 " + PROMOS.items.length + " 个官网页面：" + ok + " 个可达，其中 " + spa +
      " 个本轮无可提取的公开优惠文案（动态渲染页或无优惠 wording），仅监测可达性与标题变化；抓取失败保留上次快照并列入上方清单。免费额度等人工核对字段只提示变动、不自动改写。";
  }

  /* ---------- 渲染 ---------- */
  var io = ("IntersectionObserver" in window) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }) : null;

  function observeReveals(root) {
    var nodes = (root || document).querySelectorAll(".reveal:not(.in)");
    nodes.forEach(function (n) {
      if (REDUCED || !io) n.classList.add("in");
      else io.observe(n);
    });
  }

  function renderStats() {
    var reviewed = SITES.filter(hasReview).length;
    var coding = SITES.filter(function (s) { return s.category === "coding"; }).length;
    var snap = PROMOS ? fmtTime(PROMOS.generatedAt) : "待生成";
    els.stats.innerHTML =
      '<div class="stat"><span class="stat-n">' + SITES.length + "</span><span class=\"stat-l\">收录平台</span></div>" +
      '<div class="stat"><span class="stat-n">' + coding + "</span><span class=\"stat-l\">编程订阅</span></div>" +
      '<div class="stat"><span class="stat-n">' + reviewed + "<small> / " + SITES.length + "</small></span><span class=\"stat-l\">已写评测</span></div>" +
      '<div class="stat"><span class="stat-n" style="font-size:16px;padding-top:5px">' + esc(snap) + "</span><span class=\"stat-l\">优惠快照更新</span></div>";
  }

  function renderChips() {
    var html = CATS.map(function (c) {
      return '<button class="chip" type="button" data-cat="' + c.id + '" aria-pressed="' + (state.cat === c.id) + '">' + c.label + "</button>";
    }).join("");
    html += '<button class="chip chip-toggle" type="button" data-toggle="onlyReviewed" aria-pressed="' + state.onlyReviewed + '">只看已评测</button>';
    html += '<button class="chip chip-toggle" type="button" data-toggle="onlyInvite" aria-pressed="' + state.onlyInvite + '">只看邀请福利</button>';
    els.chips.innerHTML = html;
  }

  function render() {
    var visibleTotal = 0;
    document.querySelectorAll(".group[data-cat]").forEach(function (sec) {
      var cat = sec.dataset.cat;
      var list = SITES.filter(function (s) { return s.category === cat && matches(s); });
      var box = sec.querySelector("[data-cards]");
      box.innerHTML = list.map(function (s, i) { return cardHtml(s, SITES.indexOf(s)); }).join("");
      sec.hidden = list.length === 0;
      sec.querySelector("[data-count]").textContent = list.length + " 个平台";
      visibleTotal += list.length;
    });
    var filtering = !!(state.q || state.cat !== "all" || state.onlyReviewed || state.onlyInvite);
    els.empty.hidden = visibleTotal !== 0;
    els.finderNote.textContent = filtering ? "匹配 " + visibleTotal + " / " + SITES.length + " 个平台" : "";
    renderChips();
    renderStats();
    observeReveals();
    if (EDIT_MODE) refreshDraftNote();
  }

  /* ---------- 交互 ---------- */
  function copyText(text, name) {
    function done(ok) { toast(ok ? "已复制邀请码：" + text : "复制失败，请长按手动复制"); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { fallback(); });
    } else fallback();
    function fallback() {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(ta);
        done(ok);
      } catch (e) { done(false); }
    }
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-copy],[data-more],[data-edit],[data-cat],[data-toggle]");
    if (!t) return;
    if (t.hasAttribute("data-copy")) { copyText(t.getAttribute("data-copy"), t.getAttribute("data-name")); return; }
    if (t.hasAttribute("data-more")) {
      var body = t.parentElement.querySelector("[data-body]");
      var open = body.classList.toggle("open");
      t.textContent = open ? "收起" : "展开全文";
      return;
    }
    if (t.hasAttribute("data-edit")) { openEditor(t.getAttribute("data-edit")); return; }
    if (t.hasAttribute("data-cat")) { state.cat = t.getAttribute("data-cat"); render(); return; }
    if (t.hasAttribute("data-toggle")) {
      var k = t.getAttribute("data-toggle");
      state[k] = !state[k];
      render();
    }
  });

  els.q.addEventListener("input", function () { state.q = els.q.value.trim(); render(); });
  els.emptyClear.addEventListener("click", function () {
    state = { q: "", cat: "all", onlyReviewed: false, onlyInvite: false };
    els.q.value = "";
    render();
    els.q.focus();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && !/^(input|textarea|select)$/i.test(document.activeElement.tagName)) {
      e.preventDefault();
      els.q.focus();
    }
  });

  els.themeBtn.addEventListener("click", function () {
    var next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  });

  /* 导航 scrollspy */
  if ("IntersectionObserver" in window) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        document.querySelectorAll("[data-spy]").forEach(function (a) {
          if (a.getAttribute("data-spy") === en.target.id) a.setAttribute("aria-current", "true");
          else a.removeAttribute("aria-current");
        });
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    ["coding", "api", "work", "promos"].forEach(function (id) {
      var n = $(id);
      if (n) spy.observe(n);
    });
    window.addEventListener("scroll", function () {
      if (window.scrollY < 160) {
        document.querySelectorAll("[data-spy]").forEach(function (a) { a.removeAttribute("aria-current"); });
      }
    }, { passive: true });
  }

  /* ---------- 站长编辑模式 ---------- */
  var editingId = null;
  var dlgRating = 0;
  function buildStars() {
    els.fRating.innerHTML = [1, 2, 3, 4, 5].map(function (n) {
      return '<button type="button" role="radio" aria-checked="false" data-star="' + n + '" aria-label="' + n + ' 星">★</button>';
    }).join("");
    els.fRating.addEventListener("click", function (e) {
      var b = e.target.closest("[data-star]");
      if (!b) return;
      dlgRating = Number(b.getAttribute("data-star"));
      paintStars();
    });
  }
  function paintStars() {
    els.fRating.querySelectorAll("[data-star]").forEach(function (b) {
      b.setAttribute("aria-checked", String(Number(b.getAttribute("data-star")) <= dlgRating));
    });
  }
  function openEditor(id) {
    var s = siteById(id);
    if (!s) return;
    editingId = id;
    var r = s.review || {}, i = s.invite || {};
    els.dlgTitle.textContent = "编辑档案 · " + s.name;
    dlgRating = r.rating || 0;
    paintStars();
    els.fVerdict.value = r.verdict || "";
    els.fPros.value = (r.pros || []).join(", ");
    els.fCons.value = (r.cons || []).join(", ");
    els.fScene.value = r.scene || "";
    els.fBody.value = r.body || "";
    els.fCode.value = i.code || "";
    els.fInviteUrl.value = i.url || "";
    els.fBonus.value = i.bonus || "";
    els.fFree.value = s.freeTier || "";
    els.fPricing.value = s.pricing || "";
    els.dlg.showModal();
    els.fVerdict.focus();
  }
  els.editForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var s = siteById(editingId);
    if (!s) { els.dlg.close(); return; }
    s.review = {
      rating: dlgRating,
      verdict: els.fVerdict.value.trim(),
      pros: splitList(els.fPros.value),
      cons: splitList(els.fCons.value),
      scene: els.fScene.value.trim(),
      body: els.fBody.value.trim(),
      updatedAt: today()
    };
    s.invite = Object.assign({}, s.invite, {
      code: els.fCode.value.trim(),
      url: els.fInviteUrl.value.trim(),
      bonus: els.fBonus.value.trim()
    });
    s.freeTier = els.fFree.value.trim();
    s.pricing = els.fPricing.value.trim();
    var d = loadDraft();
    d[s.id] = { review: s.review, invite: s.invite, freeTier: s.freeTier, pricing: s.pricing };
    saveDraft(d);
    els.dlg.close();
    render();
    renderPromos();
    observeReveals();
    toast("已保存到草稿（未发布）· 记得导出 sites.js");
  });
  els.dlgClose.addEventListener("click", function () { els.dlg.close(); });
  els.dlgCancel.addEventListener("click", function () { els.dlg.close(); });

  els.exportBtn.addEventListener("click", function () {
    var header = "// 由站长编辑模式导出于 " + new Date().toISOString() + "\n" +
      "// 覆盖仓库 data/sites.js 后提交推送即发布。\n";
    var text = header + "globalThis.SITES = " + JSON.stringify(SITES, null, 2) + ";\n";
    var blob = new Blob([text], { type: "text/javascript;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sites.js";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    toast("已导出 sites.js：覆盖 data/sites.js 并推送即发布");
  });
  els.resetBtn.addEventListener("click", function () {
    if (!confirm("清空本浏览器的未发布草稿，恢复为仓库已发布版本？")) return;
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
    location.reload();
  });

  /* ---------- 启动 ---------- */
  if (EDIT_MODE) {
    applyDraft();
    els.editBanner.hidden = false;
    buildStars();
  }
  var checked = SITES.map(function (s) { return s.checkedAt; }).filter(Boolean).sort().pop() || today();
  els.heroDate.textContent = checked.slice(0, 7);
  els.footChecked.textContent = "免费额度与价格人工核对日期：" + checked + "（卡片右下角逐平台标注，含「实测」标记的为站长账号实测）；优惠快照由脚本每日自动更新。";
  els.footYear.textContent = String(new Date().getFullYear());
  renderPromos();
  render();
  observeReveals();
})();