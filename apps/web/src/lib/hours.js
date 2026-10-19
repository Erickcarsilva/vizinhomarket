// Horário de funcionamento: converte o texto que o lojista digita ("Seg–Sáb, 8h–18h")
// em linhas estruturadas (dia da semana + abre + fecha) e o caminho inverso para exibir.
// weekday: 0 = domingo ... 6 = sábado (mesma convenção do banco).

const DAY_ALIASES = [
  ["dom", 0], ["domingo", 0],
  ["seg", 1], ["segunda", 1],
  ["ter", 2], ["terca", 2], ["terça", 2],
  ["qua", 3], ["quarta", 3],
  ["qui", 4], ["quinta", 4],
  ["sex", 5], ["sexta", 5],
  ["sab", 6], ["sáb", 6], ["sabado", 6], ["sábado", 6],
];
const SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[–—]/g, "-").trim();
const dayOf = (token) => {
  const t = norm(token).replace(/[^a-z]/g, "");
  if (!t) return null;
  const hit = DAY_ALIASES.find(([k]) => norm(k) === t) || DAY_ALIASES.find(([k]) => t.startsWith(norm(k).slice(0, 3)));
  return hit ? hit[1] : null;
};
const timeOf = (token) => {
  const m = norm(token).match(/^(\d{1,2})(?:[:h](\d{2}))?h?$/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2] || 0);
  if (h > 24 || min > 59) return null;
  return `${String(h % 24).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
};

function parseDays(text) {
  const t = norm(text);
  if (!t || /todos|diariamente|todo dia|todos os dias/.test(t)) return [0, 1, 2, 3, 4, 5, 6];
  const days = new Set();
  for (const part of t.split(/,|\be\b|\//).map((x) => x.trim()).filter(Boolean)) {
    const range = part.split(/\s*(?:-|a|ate|até)\s+|\s*-\s*/).filter(Boolean);
    if (range.length === 2 && dayOf(range[0]) !== null && dayOf(range[1]) !== null) {
      let d = dayOf(range[0]); const end = dayOf(range[1]);
      for (let i = 0; i < 7; i++) { days.add(d); if (d === end) break; d = (d + 1) % 7; }
    } else if (dayOf(part) !== null) {
      days.add(dayOf(part));
    } else {
      return null;
    }
  }
  return days.size ? [...days].sort() : null;
}

// Aceita blocos separados por ";" ou quebra de linha. Ex.:
// "Seg–Sex, 11h–14h e 18h–23h; Sáb, 18h–00h" | "Todos os dias 8:00-18:00"
export function parseHours(text) {
  if (!text || !text.trim()) return [];
  const rows = [];
  for (const block of text.split(/;|\n/).map((b) => b.trim()).filter(Boolean)) {
    const times = [...norm(block).matchAll(/(\d{1,2}(?:[:h]\d{2})?h?)\s*(?:-|as|às|a|ate|até)\s*(\d{1,2}(?:[:h]\d{2})?h?)/g)];
    if (!times.length) return null;
    const firstTime = norm(block).search(/\d/);
    const days = parseDays(norm(block).slice(0, firstTime).replace(/[,:]\s*$/, ""));
    if (!days) return null;
    for (const [, a, b] of times) {
      const opens = timeOf(a), closes = timeOf(b);
      if (!opens || !closes || opens === closes) return null;
      for (const d of days) rows.push({ weekday: d, opens, closes });
    }
  }
  return rows;
}

const hhmm = (t) => {
  const [h, m] = String(t).split(":");
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`;
};

export function hoursText(rows) {
  if (!rows || !rows.length) return "";
  const byDay = Array.from({ length: 7 }, (_, d) =>
    rows.filter((r) => r.weekday === d).sort((a, b) => String(a.opens).localeCompare(String(b.opens)))
      .map((r) => `${hhmm(r.opens)}–${hhmm(r.closes)}`).join(" e "));
  const groups = [];
  for (const d of [1, 2, 3, 4, 5, 6, 0]) {
    if (!byDay[d]) continue;
    const last = groups[groups.length - 1];
    const prev = last && last.days[last.days.length - 1];
    if (last && last.text === byDay[d] && ((prev + 1) % 7) === d) last.days.push(d);
    else groups.push({ text: byDay[d], days: [d] });
  }
  if (groups.length === 1 && groups[0].days.length === 7) return `Todos os dias, ${groups[0].text}`;
  return groups.map((g) => {
    const label = g.days.length === 1 ? SHORT[g.days[0]] : `${SHORT[g.days[0]]}–${SHORT[g.days[g.days.length - 1]]}`;
    return `${label}, ${g.text}`;
  }).join("; ");
}

// Aberto agora? Mesmo critério do servidor (is_store_open): fuso da cidade e horários que passam da meia-noite.
export function isOpenNow(rows, timeZone = "America/Campo_Grande", at = new Date()) {
  if (!rows || !rows.length) return false;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(at).map((p) => [p.type, p.value]));
  const d = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  const t = `${parts.hour}:${parts.minute}`;
  const s = (x) => String(x).slice(0, 5);
  return rows.some((h) => {
    const o = s(h.opens), c = s(h.closes);
    if (o < c) return h.weekday === d && t >= o && t < c;
    return (h.weekday === d && t >= o) || (h.weekday === (d + 6) % 7 && t < c);
  });
}
