/* ============================================================
   AI Governance Dashboard — prototype logic (no dependencies)
   ============================================================ */

const SVG_NS = "http://www.w3.org/2000/svg";
const state = { dept: "all" };

/* ---------- formatting ---------- */
const fmtMoney = (v) => {
  const a = Math.abs(v);
  if (a >= 10000) return "$" + (v / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  if (a >= 1000) return "$" + (v / 1000).toFixed(1) + "k";
  return "$" + Math.round(v).toLocaleString("en-US");
};
const fmtMoneyFull = (v) => "$" + Math.round(v).toLocaleString("en-US");
const fmtPct = (v) => Math.round(v * 100) + "%";
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

/* ---------- status ---------- */
const STATUS = {
  good:     { cls: "good",     icon: "✓", label: "On track" },
  warning:  { cls: "warning",  icon: "!", label: "At risk" },
  critical: { cls: "critical", icon: "×", label: "Over limit" },
  serious:  { cls: "serious",  icon: "?", label: "Unapproved" },
};
const chip = (key, label) => {
  const s = STATUS[key];
  return `<span class="chip ${s.cls}"><span class="dot" aria-hidden="true">${s.icon}</span>${label || s.label}</span>`;
};
const toolStatus = (t) => {
  if (!t.approved) return "serious";
  if (t.pctOfLimit > 1) return "critical";
  if (t.pctOfLimit >= 0.9) return "warning";
  return "good";
};

/* ============================================================
   Compute: turns raw data into what every view needs,
   for "all" or for a single department.
   ============================================================ */
function compute(deptId) {
  const D = PERIOD.day, N = PERIOD.daysInMonth;
  const di = deptId === "all" ? -1 : DEPTS.findIndex((d) => d.id === deptId);
  const pick = (arr) => (di < 0 ? sum(arr) : arr[di]);

  const tools = TOOLS.map((t) => {
    const totalUsers = sum(t.users);
    const users = pick(t.users);
    let forecastAll, forecast, mtd, daily;

    if (t.pricing === "usage") {
      const r = t.growth;
      const geo = (n) => (r * (Math.pow(r, n) - 1)) / (r - 1); // sum r^1..r^n
      const mtdAll = sum(t.spendMTD);
      mtd = pick(t.spendMTD);
      const base = mtd / geo(D);
      forecast = base * geo(N);
      forecastAll = (mtdAll / geo(D)) * geo(N);
      daily = Array.from({ length: N }, (_, i) => base * Math.pow(r, i + 1));
    } else {
      // seat & expensed: fixed monthly cost, accrued evenly, allocated by active users
      const monthlyAll = t.pricing === "seat" ? t.seats * t.price : totalUsers * t.price;
      forecastAll = monthlyAll;
      forecast = di < 0 ? monthlyAll : (totalUsers ? monthlyAll * (users / totalUsers) : 0);
      mtd = (forecast * D) / N;
      daily = Array.from({ length: N }, () => forecast / N);
    }

    const share = forecastAll ? forecast / forecastAll : 0;
    const limit = t.limit * share;
    const seatsUnused = t.pricing === "seat" ? Math.max(0, t.seats - totalUsers) : 0;
    const out = {
      ...t, usersInView: users, totalUsers, mtd, forecast, limit, daily,
      pctOfLimit: limit ? forecast / limit : null,
      utilization: t.pricing === "seat" ? totalUsers / t.seats : null,
      seatsUnused, unusedCost: seatsUnused * (t.price || 0),
    };
    out.status = toolStatus(out);
    return out;
  }).filter((t) => t.usersInView > 0 || t.mtd > 0);

  const depts = di < 0 ? DEPTS : [DEPTS[di]];
  const budget = sum(depts.map((d) => d.budget));
  const headcount = sum(depts.map((d) => d.headcount));
  const uniqueAI = sum(depts.map((d) => d.uniqueAI));

  const dailyTotal = Array.from({ length: N }, (_, i) => sum(tools.map((t) => t.daily[i])));
  const cumulative = [];
  dailyTotal.reduce((acc, v, i) => (cumulative[i] = acc + v), 0);

  const mtd = sum(tools.map((t) => t.mtd));
  const forecast = sum(tools.map((t) => t.forecast));
  const shadow = tools.filter((t) => !t.approved);
  const seatTools = TOOLS.map((t) => tools.find((x) => x.id === t.id) || null).filter((t) => t && t.pricing === "seat");

  return {
    deptId, di, tools, budget, headcount, uniqueAI, mtd, forecast,
    dailyTotal, cumulative,
    shadow: {
      count: shadow.length,
      accounts: sum(shadow.map((t) => t.usersInView)),
      monthly: sum(shadow.map((t) => t.forecast)),
    },
    unused: {
      seats: sum(seatTools.map((t) => t.seatsUnused)),
      cost: sum(seatTools.map((t) => t.unusedCost)),
    },
  };
}

/* ============================================================
   Tooltip
   ============================================================ */
const tip = document.getElementById("tooltip");
function showTip(evt, html) {
  tip.innerHTML = html;
  tip.classList.add("show");
  const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
  let x = evt.clientX + pad, y = evt.clientY + pad;
  if (x + w > window.innerWidth - 8) x = evt.clientX - w - pad;
  if (y + h > window.innerHeight - 8) y = evt.clientY - h - pad;
  tip.style.left = x + "px";
  tip.style.top = y + "px";
}
const hideTip = () => tip.classList.remove("show");
const ttRow = (k, v) => `<div class="tt-row"><span>${k}</span><b>${v}</b></div>`;

/* ---------- svg helper ---------- */
function el(name, attrs = {}, parent) {
  const n = document.createElementNS(SVG_NS, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}
function niceMax(v) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  const step = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return step * p;
}
function ticks(max, n = 5) {
  const step = niceMax(max / n);
  const out = [];
  for (let v = 0; v <= max + 1e-6; v += step) out.push(v);
  return out;
}
// rect with only the right end rounded (data-end), anchored flat at baseline
function barPath(x, y, w, h, r = 4) {
  if (w <= 0) return "";
  r = Math.min(r, w, h / 2);
  return `M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z`;
}

/* ============================================================
   KPI tiles
   ============================================================ */
function renderKPIs(m) {
  const pace = PERIOD.day / PERIOD.daysInMonth;
  const pctBudget = m.mtd / m.budget;
  const over = m.forecast - m.budget;
  const fcStatus = over > 0 ? "critical" : m.forecast / m.budget >= 0.9 ? "warning" : "good";
  const fcLabel = over > 0 ? `${fmtMoney(over)} over budget` : `${fmtMoney(-over)} under budget`;
  const scopeNote = m.deptId === "all" ? "org-wide" : "org-wide (seats aren't owned by one dept)";

  document.getElementById("kpis").innerHTML = `
    <div class="kpi">
      <div class="kpi-label">AI spend, month to date</div>
      <div class="kpi-value">${fmtMoney(m.mtd)}</div>
      <div class="meter" title="Spend vs. budget; black tick = where we'd be if spending evenly">
        <span style="width:${Math.min(100, pctBudget * 100)}%"></span>
        <i style="left:${pace * 100}%"></i>
      </div>
      <div class="kpi-sub">${fmtPct(pctBudget)} of ${fmtMoney(m.budget)} budget · even pace = ${fmtPct(pace)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Projected month-end spend</div>
      <div class="kpi-value">${fmtMoney(m.forecast)}</div>
      <div>${chip(fcStatus, fcLabel)}</div>
      <div class="kpi-sub">at current run rate</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Unused paid seats</div>
      <div class="kpi-value">${m.unused.seats}</div>
      <div class="kpi-sub"><b>${fmtMoney(m.unused.cost)}/mo</b> recoverable · ${scopeNote}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Shadow AI (unapproved tools)</div>
      <div class="kpi-value">${m.shadow.count} <span style="font-size:14px;font-weight:500;color:var(--ink-2)">tools</span></div>
      <div class="kpi-sub">${m.shadow.accounts} accounts · ${fmtMoney(m.shadow.monthly)}/mo outside any budget</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Employees using AI (30d)</div>
      <div class="kpi-value">${fmtPct(m.uniqueAI / m.headcount)}</div>
      <div class="meter"><span style="width:${(m.uniqueAI / m.headcount) * 100}%"></span></div>
      <div class="kpi-sub">${m.uniqueAI} of ${m.headcount} people · de-duplicated by email</div>
    </div>`;
}

/* ============================================================
   Chart 1 — Spend vs. limit by tool (bullet bars)
   ============================================================ */
function renderSpendVsLimit(m) {
  const host = document.getElementById("chart-limits");
  host.innerHTML = "";
  const W = host.clientWidth || 700;
  const narrow = W < 560;
  const labelW = narrow ? 120 : 176, statusW = narrow ? 86 : 110, right = 12;
  const plotX = labelW, plotW = Math.max(120, W - labelW - statusW - right);
  const rowH = 34, groupH = 28, axisH = 22;

  const approved = m.tools.filter((t) => t.approved).sort((a, b) => b.pctOfLimit - a.pctOfLimit);
  const shadow = m.tools.filter((t) => !t.approved).sort((a, b) => b.forecast - a.forecast);
  const groups = [
    { title: "Approved tools — sorted by projected % of limit", rows: approved },
    { title: "Unapproved (shadow AI) — no approved budget", rows: shadow },
  ].filter((g) => g.rows.length);

  const maxV = niceMax(Math.max(...m.tools.map((t) => Math.max(t.forecast, t.limit))) * 1.05);
  const x = (v) => plotX + (v / maxV) * plotW;

  const H = axisH + sum(groups.map((g) => groupH + g.rows.length * rowH)) + 6;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, height: H, role: "img",
    "aria-label": "Bullet chart: month-to-date spend, projected month-end spend, and spend limit per AI tool" }, host);

  // axis + gridlines
  const tks = ticks(maxV, narrow ? 3 : 5);
  tks.forEach((v) => {
    el("line", { x1: x(v), x2: x(v), y1: axisH - 4, y2: H, class: "gridline" }, svg);
    const t = el("text", { x: x(v), y: 12, "text-anchor": "middle", class: "axis-text" }, svg);
    t.textContent = fmtMoney(v);
  });

  let y = axisH;
  groups.forEach((g) => {
    const gt = el("text", { x: 0, y: y + 19, class: "group-text" }, svg);
    gt.textContent = g.title;
    y += groupH;
    g.rows.forEach((t) => {
      const row = el("g", { class: "row" }, svg);
      el("rect", { x: 0, y, width: W, height: rowH, class: "row-hover", rx: 4 }, row);
      const name = el("text", { x: 8, y: y + 15, class: "label-text" }, row);
      name.textContent = t.name;
      const sub = el("text", { x: 8, y: y + 28, class: "label-sub" }, row);
      sub.textContent = `${t.usersInView} users · ${t.pricing === "usage" ? "metered API" : t.pricing === "seat" ? "per seat" : "expensed"}`;

      const by = y + 11, bh = 12;
      // MTD actual
      el("path", { d: barPath(x(0), by, x(t.mtd) - x(0), bh), fill: "var(--series-1)" }, row);
      // projected remainder (2px surface gap)
      const fx0 = x(t.mtd) + 2, fw = x(t.forecast) - fx0;
      if (fw > 1) el("path", { d: barPath(fx0, by, fw, bh), fill: "var(--series-1-soft)" }, row);
      // limit marker
      if (t.limit > 0) {
        el("line", { x1: x(t.limit), x2: x(t.limit), y1: y + 5, y2: y + rowH - 5,
          stroke: "var(--surface)", "stroke-width": 6 }, row);
        el("line", { x1: x(t.limit), x2: x(t.limit), y1: y + 5, y2: y + rowH - 5,
          stroke: "var(--ink)", "stroke-width": 2 }, row);
      }
      // value label (selective: projected value)
      const endX = Math.max(x(t.forecast), t.limit ? x(t.limit) : 0) + 6;
      if (endX < plotX + plotW + 4) {
        const vt = el("text", { x: endX, y: by + 10, class: "value-text" }, row);
        vt.textContent = t.limit ? `${fmtPct(t.pctOfLimit)}` : fmtMoney(t.forecast) + "/mo";
      }
      // status
      const fo = el("foreignObject", { x: W - statusW, y: y + 7, width: statusW, height: 22 }, row);
      fo.innerHTML = `<div xmlns="http://www.w3.org/1999/xhtml">${chip(t.status)}</div>`;

      // hit target = whole row
      const hit = el("rect", { x: 0, y, width: W, height: rowH, class: "hit" }, row);
      hit.addEventListener("mousemove", (e) => showTip(e, `
        <h4>${t.name}</h4>
        ${ttRow("Spent so far (MTD)", fmtMoneyFull(t.mtd))}
        ${ttRow("Projected month-end", fmtMoneyFull(t.forecast))}
        ${ttRow("Monthly limit", t.limit ? fmtMoneyFull(t.limit) : "none — not approved")}
        ${t.limit ? ttRow("Projected % of limit", fmtPct(t.pctOfLimit)) : ""}
        ${ttRow("Active users", t.usersInView)}
        <div class="tt-row" style="margin-top:4px"><span>Source: ${t.source}</span></div>`));
      hit.addEventListener("mouseleave", hideTip);
      y += rowH;
    });
  });

  // insight line
  const worst = approved[0];
  const overCount = approved.filter((t) => t.status === "critical").length;
  document.getElementById("insight-limits").innerHTML = worst
    ? `<b>${overCount} approved tool${overCount === 1 ? "" : "s"} projected over limit.</b> Biggest risk: <b>${worst.name}</b> at ${fmtPct(worst.pctOfLimit)} of its ${fmtMoney(worst.limit)} limit.` +
      (shadow.length ? ` Plus <b>${fmtMoney(sum(shadow.map((t) => t.forecast)))}/mo</b> on ${shadow.length} unapproved tools with no budget at all.` : "")
    : "No approved tools in this view.";
}

/* ============================================================
   Chart 2 — Cumulative spend vs. budget (burn-up with forecast)
   ============================================================ */
function renderBurnUp(m) {
  const host = document.getElementById("chart-burn");
  host.innerHTML = "";
  const W = host.clientWidth || 600, H = 280;
  const pad = { l: 48, r: 92, t: 14, b: 28 };
  const N = PERIOD.daysInMonth, D = PERIOD.day;
  const maxV = niceMax(Math.max(m.budget, m.cumulative[N - 1]) * 1.08);
  const x = (d) => pad.l + (d / N) * (W - pad.l - pad.r);
  const y = (v) => H - pad.b - (v / maxV) * (H - pad.t - pad.b);

  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, height: H, role: "img",
    "aria-label": "Line chart: cumulative AI spend this month vs. monthly budget, with forecast to month end" }, host);

  ticks(maxV, 4).forEach((v) => {
    el("line", { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: v === 0 ? "baseline" : "gridline" }, svg);
    const t = el("text", { x: pad.l - 8, y: y(v) + 4, "text-anchor": "end", class: "axis-text" }, svg);
    t.textContent = fmtMoney(v);
  });
  (W < 520 ? [1, 15, 30] : [1, 5, 10, 15, 20, 25, 30]).forEach((d) => {
    const t = el("text", { x: x(d), y: H - 8, "text-anchor": "middle", class: "axis-text" }, svg);
    t.textContent = `Nov ${d}`;
  });

  // even-pace reference
  el("line", { x1: x(0), y1: y(0), x2: x(N), y2: y(m.budget), stroke: "var(--muted)", "stroke-width": 1.5, "stroke-dasharray": "2 4" }, svg);
  // budget line
  el("line", { x1: pad.l, x2: W - pad.r, y1: y(m.budget), y2: y(m.budget), stroke: "var(--ink)", "stroke-width": 2 }, svg);
  const bl = el("text", { x: W - pad.r + 6, y: y(m.budget) + 4, class: "label-sub" }, svg);
  bl.textContent = `Budget ${fmtMoney(m.budget)}`;

  // today marker
  el("line", { x1: x(D), x2: x(D), y1: pad.t, y2: H - pad.b, stroke: "var(--axis)", "stroke-width": 1 }, svg);
  const tl = el("text", { x: x(D) + 4, y: pad.t + 10, class: "axis-text" }, svg);
  tl.textContent = "Today";

  const pts = [[0, 0], ...m.cumulative.map((v, i) => [i + 1, v])];
  const line = (arr) => arr.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
  el("path", { d: line(pts.slice(0, D + 1)), fill: "none", stroke: "var(--series-1)", "stroke-width": 2.5, "stroke-linejoin": "round" }, svg);
  el("path", { d: line(pts.slice(D)), fill: "none", stroke: "var(--series-1)", "stroke-width": 2, "stroke-dasharray": "5 4" }, svg);

  // end label for forecast
  const endV = m.cumulative[N - 1];
  el("circle", { cx: x(N), cy: y(endV), r: 4, fill: "var(--series-1)", stroke: "var(--surface)", "stroke-width": 2 }, svg);
  let ly = y(endV) + 4;
  if (Math.abs(ly - (y(m.budget) + 4)) < 14) ly = y(endV) < y(m.budget) ? y(m.budget) - 12 : y(m.budget) + 18;
  const fl = el("text", { x: W - pad.r + 6, y: ly, class: "label-text", "font-weight": 650 }, svg);
  fl.textContent = `Proj. ${fmtMoney(endV)}`;

  // today dot
  el("circle", { cx: x(D), cy: y(m.cumulative[D - 1]), r: 4, fill: "var(--series-1)", stroke: "var(--surface)", "stroke-width": 2 }, svg);

  // crosshair
  const cross = el("line", { y1: pad.t, y2: H - pad.b, stroke: "var(--ink-2)", "stroke-width": 1, opacity: 0 }, svg);
  const dot = el("circle", { r: 5, fill: "var(--series-1)", stroke: "var(--surface)", "stroke-width": 2, opacity: 0 }, svg);
  const hit = el("rect", { x: pad.l, y: pad.t, width: W - pad.l - pad.r, height: H - pad.t - pad.b, class: "hit" }, svg);
  hit.addEventListener("mousemove", (e) => {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const d = Math.min(N, Math.max(1, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * N)));
    const v = m.cumulative[d - 1];
    cross.setAttribute("x1", x(d)); cross.setAttribute("x2", x(d)); cross.setAttribute("opacity", 1);
    dot.setAttribute("cx", x(d)); dot.setAttribute("cy", y(v)); dot.setAttribute("opacity", 1);
    const isFc = d > D;
    showTip(e, `<h4>Nov ${d}${isFc ? " · forecast" : ""}</h4>
      ${ttRow(isFc ? "Projected cumulative" : "Cumulative spend", fmtMoneyFull(v))}
      ${ttRow("Even-pace target", fmtMoneyFull((m.budget * d) / N))}
      ${ttRow("Daily spend", fmtMoneyFull(m.dailyTotal[d - 1]))}
      ${ttRow("% of monthly budget", fmtPct(v / m.budget))}`);
  });
  hit.addEventListener("mouseleave", () => { cross.setAttribute("opacity", 0); dot.setAttribute("opacity", 0); hideTip(); });

  // insight
  const over = endV - m.budget;
  let crossDay = m.cumulative.findIndex((v) => v > m.budget) + 1;
  document.getElementById("insight-burn").innerHTML = over > 0
    ? `<b>On pace to exceed budget by ${fmtMoney(over)}</b>${crossDay ? `, crossing the limit around <b>Nov ${crossDay}</b>` : ""}. Metered API usage is accelerating: daily spend goes from ${fmtMoney(m.dailyTotal[D - 1])} today to ${fmtMoney(m.dailyTotal[N - 1])} by month end (budget allows ${fmtMoney(m.budget / N)}/day).`
    : `<b>On pace to finish ${fmtMoney(-over)} under budget</b> (${fmtPct(endV / m.budget)} of ${fmtMoney(m.budget)}).`;
}

/* ============================================================
   Chart 3 — Who uses what: dept x tool adoption heatmap
   ============================================================ */
function renderHeatmap(m) {
  const approved = TOOLS.filter((t) => t.approved);
  const shadow = TOOLS.filter((t) => !t.approved);
  const short = {
    "chatgpt-ent": "ChatGPT<br>Ent.", "claude-ent": "Claude<br>Ent.", "gh-copilot": "GitHub<br>Copilot",
    "m365-copilot": "M365<br>Copilot", "openai-api": "OpenAI<br>API", "anthropic-api": "Anthro&shy;pic<br>API",
    cursor: "Cursor", "chatgpt-plus": "ChatGPT<br>Plus", perplexity: "Perplex&shy;ity", otter: "Otter.ai",
    midjourney: "Midjour&shy;ney", jasper: "Jasper",
  };
  const bin = (p) => (p <= 0 ? 0 : p < 0.1 ? 1 : p < 0.25 ? 2 : p < 0.5 ? 3 : p < 0.75 ? 4 : 5);

  const cell = (t, d, di) => {
    const u = t.users[di];
    if (!u) return `<td class="zero" data-t="${t.id}" data-d="${di}">–</td>`;
    const p = u / d.headcount, b = bin(p);
    const ink = b >= 4 ? "var(--seq-ink-dark)" : "var(--seq-ink-light)";
    return `<td style="background:var(--seq-${b});color:${ink}" data-t="${t.id}" data-d="${di}">${u}</td>`;
  };

  const head = `
    <colgroup><col style="width:118px">${approved.map(() => "<col>").join("")}<col style="width:8px">${shadow.map(() => "<col>").join("")}</colgroup>
    <thead>
      <tr><th></th><th class="group" colspan="${approved.length}">Approved</th><th class="gap"></th>
          <th class="group" colspan="${shadow.length}">Unapproved ⚠</th></tr>
      <tr><th style="text-align:left">Department</th>
        ${approved.map((t) => `<th>${short[t.id]}</th>`).join("")}<th class="gap"></th>
        ${shadow.map((t) => `<th>${short[t.id]}</th>`).join("")}</tr>
    </thead>`;
  const body = DEPTS.map((d, di) => `
    <tr class="${m.di >= 0 && m.di !== di ? "dim" : ""}">
      <th title="${d.name} (${d.headcount} people)">${d.name}<div class="muted" style="font-size:10.5px;font-weight:400">${d.headcount} people</div></th>
      ${approved.map((t) => cell(t, d, di)).join("")}<td class="gap"></td>
      ${shadow.map((t) => cell(t, d, di)).join("")}
    </tr>`).join("");

  const host = document.getElementById("chart-heat");
  host.innerHTML = `<div class="table-wrap"><table class="heatmap">${head}<tbody>${body}</tbody></table></div>`;

  host.querySelectorAll("td[data-t]").forEach((td) => {
    td.addEventListener("mousemove", (e) => {
      const t = TOOLS.find((x) => x.id === td.dataset.t);
      const d = DEPTS[+td.dataset.d];
      const u = t.users[+td.dataset.d];
      const mm = compute(d.id).tools.find((x) => x.id === t.id);
      showTip(e, `<h4>${d.name} · ${t.name}</h4>
        ${ttRow("Active users (30d)", u)}
        ${ttRow("% of department", fmtPct(u / d.headcount))}
        ${ttRow("Projected spend / mo", mm ? fmtMoneyFull(mm.forecast) : "$0")}
        ${ttRow("Status", t.approved ? "Approved" : "Unapproved")}`);
    });
    td.addEventListener("mouseleave", hideTip);
  });

  // insight: biggest shadow cluster in view
  const scope = m.di >= 0 ? [m.di] : DEPTS.map((_, i) => i);
  let best = null;
  shadow.forEach((t) => scope.forEach((i) => {
    if (t.users[i] && (!best || t.users[i] > best.u)) best = { t, d: DEPTS[i], u: t.users[i] };
  }));
  document.getElementById("insight-heat").innerHTML = best
    ? `Largest shadow-AI cluster: <b>${best.u} people in ${best.d.name} on ${best.t.name}</b>${best.t.note ? ` — ${best.t.note.charAt(0).toLowerCase() + best.t.note.slice(1)}` : ""}.`
    : "No unapproved tool usage detected in this department.";
}

/* ============================================================
   Needs attention (action list — not a chart)
   ============================================================ */
function renderAlerts(m) {
  const items = [];
  m.tools.forEach((t) => {
    if (t.approved && t.status === "critical") items.push({
      sev: "critical", title: `${t.name} projected over limit`,
      body: `${fmtMoney(t.forecast)} projected vs. ${fmtMoney(t.limit)} limit (${fmtPct(t.pctOfLimit)}).`,
      impact: `+${fmtMoney(t.forecast - t.limit)} over`, action: t.pricing === "usage" ? "Set hard cap" : "Review seats",
    });
    if (t.approved && t.status === "warning") items.push({
      sev: "warning", title: `${t.name} near limit`,
      body: `${fmtPct(t.pctOfLimit)} of limit projected by month end.`,
      impact: `${fmtMoney(t.limit - t.forecast)} headroom`, action: "Notify owner",
    });
    if (t.pricing === "seat" && t.seats > t.approvedSeats) items.push({
      sev: "serious", title: `${t.name}: seat creep`,
      body: `${t.seats} seats provisioned vs. ${t.approvedSeats} approved — auto-provisioning is on.`,
      impact: `+${fmtMoney((t.seats - t.approvedSeats) * t.price)}/mo`, action: "Require approval",
    });
    if (t.pricing === "seat" && t.utilization < 0.7) items.push({
      sev: "warning", title: `${t.name}: low utilization`,
      body: `${t.seatsUnused} of ${t.seats} seats inactive for 30+ days (${fmtPct(t.utilization)} used).`,
      impact: `${fmtMoney(t.unusedCost)}/mo recoverable`, action: "Reclaim seats",
    });
    if (!t.approved && t.note) items.push({
      sev: "serious", title: `Shadow AI: ${t.name}`,
      body: `${t.usersInView} users. ${t.note}.`,
      impact: `${fmtMoney(t.forecast)}/mo`, action: t.overlapsWith ? "Migrate users" : "Start review",
    });
  });
  const order = { critical: 0, serious: 1, warning: 2 };
  items.sort((a, b) => order[a.sev] - order[b.sev]);
  const sevLabel = { critical: "Critical", serious: "Needs review", warning: "Watch" };

  document.getElementById("alerts").innerHTML = items.length
    ? items.slice(0, 4).map((a) => `
      <li class="alert">
        <div class="alert-top">${chip(a.sev, sevLabel[a.sev])}<span class="impact">${a.impact}</span></div>
        <h3>${a.title}</h3>
        <p>${a.body}</p>
        <button class="btn" type="button" title="Prototype — not wired up">${a.action}</button>
      </li>`).join("") +
      (items.length > 4 ? `<li class="sub" style="text-align:center">+ ${items.length - 4} more · <a href="#dashboard" onclick="return false">View all</a></li>` : "")
    : `<li class="muted">Nothing needs attention in this view.</li>`;
  document.getElementById("alert-count").textContent = items.length;
}

/* ============================================================
   Inventory table (also the accessible table view of Chart 1)
   ============================================================ */
function renderTable(m) {
  const row = (t) => `
    <tr>
      <td><b>${t.name}</b><div class="sub">${t.vendor} · ${t.pricing === "usage" ? "metered API" : t.pricing === "seat" ? `$${t.price}/seat` : `~$${t.price}/user, expensed`}</div></td>
      <td>${chip(t.status)}</td>
      <td class="num">${t.usersInView}</td>
      <td class="num">${t.utilization != null
        ? `<span class="util-bar"><span style="width:${Math.min(100, t.utilization * 100)}%"></span></span>${t.totalUsers}/${t.seats}`
        : `<span class="muted">—</span>`}</td>
      <td class="num">${fmtMoneyFull(t.mtd)}</td>
      <td class="num">${fmtMoneyFull(t.forecast)}</td>
      <td class="num">${t.limit ? fmtMoneyFull(t.limit) : `<span class="muted">none</span>`}</td>
      <td class="num">${t.limit ? fmtPct(t.pctOfLimit) : `<span class="muted">—</span>`}</td>
      <td><div class="src">${t.source}</div><div class="muted" style="font-size:11.5px">Synced ${t.synced}</div></td>
    </tr>`;
  const approved = m.tools.filter((t) => t.approved);
  const shadow = m.tools.filter((t) => !t.approved);
  document.getElementById("inventory").innerHTML = `
    <thead><tr>
      <th>Tool</th><th>Status</th><th class="num">Users</th><th class="num">Seat use (org)</th>
      <th class="num">MTD spend</th><th class="num">Projected</th><th class="num">Limit</th><th class="num">% limit</th><th>Data source</th>
    </tr></thead>
    <tbody>
      ${approved.length ? `<tr class="group-row"><td colspan="9">Approved · ${approved.length}</td></tr>${approved.map(row).join("")}` : ""}
      ${shadow.length ? `<tr class="group-row"><td colspan="9">Unapproved · ${shadow.length}</td></tr>${shadow.map(row).join("")}` : ""}
    </tbody>`;
}

/* ============================================================
   Wiring
   ============================================================ */
function renderDashboard() {
  const m = compute(state.dept);
  renderKPIs(m);
  renderSpendVsLimit(m);
  renderBurnUp(m);
  renderHeatmap(m);
  renderAlerts(m);
  renderTable(m);
}

function initFilters() {
  const sel = document.getElementById("dept");
  sel.innerHTML = `<option value="all">All departments (${sum(DEPTS.map((d) => d.headcount))} people)</option>` +
    DEPTS.map((d) => `<option value="${d.id}">${d.name} (${d.headcount})</option>`).join("");
  sel.addEventListener("change", () => { state.dept = sel.value; renderDashboard(); });
}

function initTabs() {
  const tabs = [...document.querySelectorAll(".tab")];
  const show = (id) => {
    tabs.forEach((t) => t.setAttribute("aria-selected", t.dataset.view === id));
    document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== id));
    if (id === "dashboard") renderDashboard();
    window.scrollTo(0, 0);
  };
  tabs.forEach((t) => t.addEventListener("click", () => { location.hash = t.dataset.view; }));
  const fromHash = () => show(["dashboard", "sources", "charts"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "dashboard");
  window.addEventListener("hashchange", fromHash);
  fromHash();
}

function initTheme() {
  const btn = document.getElementById("theme");
  const root = document.documentElement;
  const isDark = () => root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  const label = () => (btn.textContent = isDark() ? "☀ Light" : "☾ Dark");
  btn.addEventListener("click", () => { root.dataset.theme = isDark() ? "light" : "dark"; label(); renderDashboard(); });
  label();
}

let resizeT;
window.addEventListener("resize", () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => { if (!document.getElementById("dashboard").hidden) renderDashboard(); }, 120);
});

document.getElementById("period").textContent = `${PERIOD.label} · day ${PERIOD.day} of ${PERIOD.daysInMonth}`;
initFilters();
initTheme();
initTabs();
