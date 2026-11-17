/* 쇠질 노트 — 개인용 헬스 기록 앱. 데이터는 이 기기의 localStorage에만 저장된다. */
'use strict';
const KEY = 'gymnote.v1';
const DAY = 86400000;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const clone = o => JSON.parse(JSON.stringify(o));
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };

/* ---------- 상태 ---------- */
const fresh = () => ({ settings: { weeklyGoal: 4, defaultRest: 90, sound: true, vibrate: true }, routines: clone(PRESET_ROUTINES), customExercises: [], sessions: [], active: null });
let state = fresh();
try {
  const raw = JSON.parse(localStorage.getItem(KEY));
  if (raw && raw.routines) state = { ...fresh(), ...raw, settings: { ...fresh().settings, ...raw.settings } };
} catch (e) { /* 저장소를 못 쓰는 환경이면 메모리로만 동작 */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };
const ui = { sheets: [], month: null, statEx: null, open: 0 };

/* ---------- 날짜·형식 ---------- */
const d0 = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const weekStart = t => { const d = new Date(d0(t)); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d.getTime(); };
const addDays = (t, n) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); };
const clock = s => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const dateLabel = t => { const d = new Date(t); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WD[d.getDay()]}요일`; };
const kg = n => (Math.round(n * 10) / 10).toLocaleString('ko-KR');

/* ---------- 운동 조회·계산 ---------- */
const allEx = () => EXERCISES.concat(state.customExercises);
const ex = id => allEx().find(e => e.id === id) || { id, name: '삭제된 운동', part: '기타', equip: '', kind: 'w' };
const doneSets = item => item.sets.filter(s => s.done);
const sessVolume = s => s.items.reduce((a, i) => a + (ex(i.exId).kind === 'time' ? 0 : doneSets(i).reduce((b, x) => b + num(x.w) * num(x.r), 0)), 0);
const sessSets = s => s.items.reduce((a, i) => a + doneSets(i).length, 0);
const e1rm = s => num(s.w) * (1 + num(s.r) / 30);
const bestE1rm = item => Math.max(0, ...doneSets(item).map(e1rm));
const sorted = () => [...state.sessions].sort((a, b) => b.start - a.start);
const lastPerf = exId => { for (const s of sorted()) { const i = s.items.find(i => i.exId === exId && doneSets(i).length); if (i) return { sets: doneSets(i), at: s.start }; } return null; };
const trainedDays = () => new Set(state.sessions.map(s => dayKey(s.start)));
const weekCount = ws => new Set(state.sessions.filter(s => s.start >= ws && s.start < addDays(ws, 7)).map(s => dayKey(s.start))).size;

/* 다음 중량 제안: 지난번 모든 세트가 목표 횟수를 채웠으면 한 단계 올린다 */
function overload(exId, targetReps) {
  const e = ex(exId), p = lastPerf(exId);
  if (e.kind !== 'w' || !p || !targetReps) return null;
  const w = Math.max(...p.sets.map(s => num(s.w)));
  if (!w || !p.sets.every(s => num(s.r) >= targetReps)) return null;
  return { from: w, to: w + (e.part === '하체' || e.id === 'deadlift' ? 5 : 2.5) };
}

/* 오늘 추천 루틴: 마지막으로 한 루틴의 다음 순서 */
function recommend() {
  if (!state.routines.length) return null;
  const last = sorted().find(s => state.routines.some(r => r.id === s.routineId));
  if (!last) return { routine: state.routines[0], why: '첫 운동입니다. 이 루틴부터 시작해 보세요.' };
  const idx = state.routines.findIndex(r => r.id === last.routineId);
  const days = Math.round((d0(Date.now()) - d0(last.start)) / DAY);
  const when = days === 0 ? '오늘' : days === 1 ? '어제' : `${days}일 전`;
  return { routine: state.routines[(idx + 1) % state.routines.length], why: `${when} ‘${state.routines[idx].name}’를 했으니 다음 순서입니다.` };
}

function partSets(sinceTs) {
  const m = {}; PARTS.forEach(p => m[p] = 0);
  state.sessions.filter(s => s.start >= sinceTs).forEach(s => s.items.forEach(i => { const p = ex(i.exId).part; if (p in m) m[p] += doneSets(i).length; }));
  return m;
}

function insights(rec) {
  const out = [], now = Date.now(), today = d0(now), days = trainedDays();
  const ws = weekStart(now), cnt = weekCount(ws), goal = state.settings.weeklyGoal;
  const left = goal - cnt, daysLeft = 7 - Math.round((today - ws) / DAY) - (days.has(dayKey(now)) ? 1 : 0);
  if (left <= 0) out.push({ tone: 'good', t: '이번 주 목표 달성', b: `주 ${goal}회를 채웠습니다. 추가 운동은 가볍게, 회복도 챙기세요.` });
  else if (left > daysLeft) out.push({ tone: 'warn', t: `목표까지 ${left}회, 남은 날은 ${daysLeft}일`, b: '이번 주 목표는 빠듯합니다. 오늘은 짧은 전신 루틴이라도 해 두세요.' });
  else out.push({ tone: '', t: `이번 주 ${left}회 더 하면 목표 달성`, b: `남은 ${daysLeft}일 중 ${left}일만 나오면 됩니다.` });

  let run = 0; for (let t = days.has(dayKey(now)) ? today : addDays(today, -1); days.has(dayKey(t)); t = addDays(t, -1)) run++;
  if (run >= 3) out.push({ tone: 'warn', t: `${run}일 연속 운동 중`, b: '근육은 쉴 때 자랍니다. 오늘은 휴식이나 가벼운 유산소를 권합니다.' });

  const lastS = sorted()[0];
  if (lastS && today - d0(lastS.start) >= 5 * DAY) out.push({ tone: 'warn', t: `${Math.round((today - d0(lastS.start)) / DAY)}일 만의 운동`, b: '오래 쉬었으니 지난 중량의 80~90%로 시작하세요.' });

  if (state.sessions.filter(s => s.start >= now - 14 * DAY).length >= 2) {
    const m = partSets(now - 10 * DAY), miss = ['가슴', '등', '어깨', '하체'].filter(p => !m[p]);
    if (miss.length) {
      const r = state.routines.find(r => r.items.some(i => ex(i.exId).part === miss[0]));
      out.push({ tone: '', t: `최근 10일간 ${miss.join('·')} 운동이 없습니다`, b: r ? `‘${r.name}’ 루틴으로 채울 수 있습니다.` : '해당 부위 운동을 루틴에 추가해 보세요.' });
    }
  }
  if (rec) rec.routine.items.map(i => ({ i, o: overload(i.exId, i.reps) })).filter(x => x.o).slice(0, 2)
    .forEach(({ i, o }) => out.push({ tone: 'good', t: `${ex(i.exId).name} 증량할 때입니다`, b: `지난번 ${kg(o.from)}kg으로 전 세트 ${i.reps}회를 채웠습니다. 오늘은 ${kg(o.to)}kg에 도전하세요.` }));
  return out;
}

/* ---------- 아이콘 ---------- */
const svg = (p, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${p}</svg>`;
const IC = {
  today: svg('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>'),
  routines: svg('<path d="M4 9v6M8 6v12M16 6v12M20 9v6M8 12h8"/>'),
  history: svg('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  stats: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.100 4.9L17 7M7 17l-2.100 2.100"/>'),
  check: svg('<path d="M5 12.500l4.500 4.500L19 7"/>', 'stroke-width="3"'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  left: svg('<path d="M15 5l-7 7 7 7"/>'), right: svg('<path d="M9 5l7 7-7 7"/>'),
  up: svg('<path d="M6 15l6-6 6 6"/>'), down: svg('<path d="M6 9l6 6 6-6"/>'),
};

/* ---------- 화면 ---------- */
const route = () => { const h = location.hash.slice(1); return ['today', 'routines', 'history', 'stats', 'workout'].includes(h) ? h : 'today'; };
const routineSummary = r => `${r.items.length}종목 · ${r.items.reduce((a, i) => a + i.sets, 0)}세트 · 약 ${Math.round(r.items.reduce((a, i) => a + i.sets * (i.rest + 45), 0) / 60)}분`;

function viewToday() {
  const now = Date.now(), ws = weekStart(now), days = trainedDays(), rec = recommend(), goal = state.settings.weeklyGoal;
  const cnt = weekCount(ws);
  let streak = 0; for (let w = cnt >= goal ? ws : addDays(ws, -7); weekCount(w) >= goal; w = addDays(w, -7)) streak++;
  const vol = state.sessions.filter(s => s.start >= ws).reduce((a, s) => a + sessVolume(s), 0);
  const week = [...Array(7)].map((_, i) => { const t = addDays(ws, i); return `<div class="day ${days.has(dayKey(t)) ? 'done' : ''} ${dayKey(t) === dayKey(now) ? 'today' : ''}"><span>${WD[(i + 1) % 7]}</span><span class="dot">${days.has(dayKey(t)) ? IC.check : new Date(t).getDate()}</span></div>`; }).join('');
  const tips = insights(rec);
  return `
  <div class="top"><div><div class="sub">${dateLabel(now)}</div><h1>오늘의 운동</h1></div><button class="icon-btn" data-act="settings" aria-label="설정">${IC.gear}</button></div>
  <section class="card"><div class="row between"><h2>이번 주 출석</h2><span class="muted small">목표 주 ${goal}회</span></div><div class="week">${week}</div></section>
  <div class="tiles">
    <div class="tile"><div class="num">${cnt}<small> / ${goal}</small></div><div class="lbl">이번 주 운동</div></div>
    <div class="tile"><div class="num">${streak}<small> 주</small></div><div class="lbl">목표 연속 달성</div></div>
    <div class="tile"><div class="num">${vol >= 1000 ? kg(vol / 1000) : kg(vol)}<small> ${vol >= 1000 ? 't' : 'kg'}</small></div><div class="lbl">이번 주 볼륨</div></div>
  </div>
  ${rec ? `<section class="card hero"><div class="eyebrow">오늘의 추천 루틴</div><h2>${esc(rec.routine.name)}</h2><div class="muted small">${esc(rec.why)} ${routineSummary(rec.routine)}. 운동 이름을 누르면 운동법이 나옵니다.</div>
    <div class="chips">${rec.routine.items.map(i => `<button class="chip" data-act="guide" data-id="${i.exId}">${esc(ex(i.exId).name)}</button>`).join('')}</div>
    <button class="btn primary block" data-act="start" data-id="${rec.routine.id}">${state.active ? '진행 중인 운동이 있습니다' : '운동 시작'}</button></section>` : ''}
  <div class="row"><button class="btn ghost grow" data-act="start" data-id="">빈 운동으로 시작</button><a class="btn ghost grow" href="#routines" style="text-decoration:none">다른 루틴 고르기</a></div>
  <section class="card"><h2>코치 메모</h2><div>${tips.map(t => `<div class="tip ${t.tone}"><span class="bar"></span><div><b>${esc(t.t)}</b><span class="muted small">${esc(t.b)}</span></div></div>`).join('')}</div></section>`;
}

function viewRoutines() {
  return `<div class="top"><div><div class="sub">추천은 위에서부터 순서대로 돌아갑니다</div><h1>루틴</h1></div><button class="icon-btn" data-act="newRoutine" aria-label="새 루틴">${IC.plus}</button></div>
  ${state.routines.map((r, n) => `<section class="card"><div class="row between"><h2>${esc(r.name)}</h2><span class="muted small">${routineSummary(r)}</span></div>
    <div>${r.items.map(i => `<div class="ex-line"><button class="ex-link" data-act="guide" data-id="${i.exId}">${esc(ex(i.exId).name)}</button><span>${i.sets} × ${i.reps}${ex(i.exId).kind === 'time' ? '분' : ''}</span></div>`).join('') || '<div class="muted small">운동을 추가해 주세요.</div>'}</div>
    <div class="row"><button class="btn primary grow" data-act="start" data-id="${r.id}">시작</button><button class="btn" data-act="editRoutine" data-id="${r.id}">수정</button>
    <button class="icon-btn" data-act="moveRoutine" data-n="${n}" data-d="-1" aria-label="위로" ${n ? '' : 'disabled'}>${IC.up}</button></div></section>`).join('') || '<div class="empty">루틴이 없습니다. 오른쪽 위 + 버튼으로 만들어 보세요.</div>'}`;
}

function viewHistory() {
  const now = new Date(); ui.month = ui.month || { y: now.getFullYear(), m: now.getMonth() };
  const { y, m } = ui.month, first = new Date(y, m, 1), n = new Date(y, m + 1, 0).getDate(), days = trainedDays();
  const cells = [...Array((first.getDay() + 6) % 7)].map(() => '<span></span>').concat([...Array(n)].map((_, i) => { const k = `${y}-${m + 1}-${i + 1}`; return `<span class="c ${days.has(k) ? 'done' : ''} ${k === dayKey(now) ? 'today' : ''}">${i + 1}</span>`; })).join('');
  const list = sorted().filter(s => { const d = new Date(s.start); return d.getFullYear() === y && d.getMonth() === m; });
  return `<div class="top"><div><div class="sub">이 달 ${new Set(list.map(s => dayKey(s.start))).size}일 운동</div><h1>기록</h1></div></div>
  <section class="card"><div class="row between"><button class="icon-btn" data-act="month" data-d="-1" aria-label="이전 달">${IC.left}</button><h2 class="num" style="font-size:22px">${y}. ${String(m + 1).padStart(2, '0')}</h2><button class="icon-btn" data-act="month" data-d="1" aria-label="다음 달">${IC.right}</button></div>
    <div class="cal">${['월', '화', '수', '목', '금', '토', '일'].map(w => `<span class="wd">${w}</span>`).join('')}${cells}</div></section>
  <section class="card"><h2>운동 내역</h2><div>${list.map(s => { const d = new Date(s.start); return `<button class="sess" data-act="session" data-id="${s.id}"><span class="d"><span class="num">${d.getDate()}</span><span class="muted small">${WD[d.getDay()]}</span></span>
    <span class="grow"><b>${esc(s.name)}</b><br><span class="muted small">${clock((s.end - s.start) / 1000)} · ${sessSets(s)}세트 · ${kg(sessVolume(s))}kg</span></span>${IC.right.replace('<svg', '<svg width="18" height="18" style="color:var(--muted)"')}</button>`; }).join('') || '<div class="empty">이 달에는 기록이 없습니다.</div>'}</div></section>`;
}

function viewStats() {
  const now = Date.now(), m = partSets(now - 7 * DAY), max = Math.max(10, ...Object.values(m)), goal = state.settings.weeklyGoal;
  const weeks = [...Array(8)].map((_, i) => { const w = addDays(weekStart(now), -7 * (7 - i)); return { w, c: weekCount(w) }; });
  const top = Math.max(goal, ...weeks.map(w => w.c), 1), H = 120, bw = 28, gap = 12, W = 8 * bw + 7 * gap + 30;
  const bars = weeks.map((w, i) => { const h = w.c / top * H, x = 30 + i * (bw + gap), d = new Date(w.w);
    return `<rect x="${x}" y="${22 + H - h}" width="${bw}" height="${Math.max(h, 2)}" rx="5" fill="${w.c >= goal ? 'var(--good)' : 'var(--accent)'}" opacity="${w.c ? 1 : .25}"/><text x="${x + bw / 2}" y="${H + 40}" text-anchor="middle">${d.getMonth() + 1}/${d.getDate()}</text>${w.c ? `<text x="${x + bw / 2}" y="${16 + H - h}" text-anchor="middle" style="fill:var(--ink);font-size:14px">${w.c}</text>` : ''}`; }).join('');
  const gy = 22 + H - goal / top * H;
  const done = [...new Set(state.sessions.flatMap(s => s.items.filter(i => ex(i.exId).kind !== 'time' && bestE1rm(i) > 0).map(i => i.exId)))];
  if (!done.includes(ui.statEx)) ui.statEx = done[0] || null;
  let prog = '<div class="empty">중량 운동을 기록하면 종목별 성장 그래프가 나타납니다.</div>';
  if (ui.statEx) {
    const pts = sorted().reverse().map(s => { const i = s.items.find(i => i.exId === ui.statEx); return i && bestE1rm(i) ? { t: s.start, v: bestE1rm(i), top: doneSets(i).reduce((a, b) => num(b.w) > num(a.w) ? b : a) } : null; }).filter(Boolean).slice(-12);
    const lo = Math.min(...pts.map(p => p.v)), hi = Math.max(...pts.map(p => p.v)), span = hi - lo || 1, CW = 320, CH = 130;
    const X = i => 36 + (pts.length > 1 ? i / (pts.length - 1) : .5) * (CW - 52), Y = v => 14 + (1 - (v - lo) / span) * (CH - 44);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.v).toFixed(1)}`).join(' ');
    const lastP = pts[pts.length - 1], best = pts.reduce((a, b) => b.v > a.v ? b : a);
    prog = `<svg class="chart" viewBox="0 0 ${CW} ${CH}" role="img" aria-label="추정 1RM 추이">
      <line x1="36" x2="${CW - 16}" y1="${Y(hi)}" y2="${Y(hi)}" stroke="var(--line)"/><line x1="36" x2="${CW - 16}" y1="${Y(lo)}" y2="${Y(lo)}" stroke="var(--line)"/>
      <text x="30" y="${Y(hi) + 4}" text-anchor="end">${Math.round(hi)}</text>${hi !== lo ? `<text x="30" y="${Y(lo) + 4}" text-anchor="end">${Math.round(lo)}</text>` : ''}
      ${pts.length > 1 ? `<path d="${line} L${X(pts.length - 1)} ${CH - 30} L${X(0)} ${CH - 30} Z" fill="var(--accent)" opacity=".12"/><path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.500" stroke-linejoin="round"/>` : ''}
      ${pts.map((p, i) => `<circle cx="${X(i)}" cy="${Y(p.v)}" r="${i === pts.length - 1 ? 5 : 3}" fill="var(--accent)"/>`).join('')}
      <text x="${X(0)}" y="${CH - 8}" text-anchor="middle">${new Date(pts[0].t).getMonth() + 1}/${new Date(pts[0].t).getDate()}</text>
      ${pts.length > 1 ? `<text x="${X(pts.length - 1)}" y="${CH - 8}" text-anchor="middle">${new Date(lastP.t).getMonth() + 1}/${new Date(lastP.t).getDate()}</text>` : ''}</svg>
      <div class="tiles"><div class="tile"><div class="num">${kg(lastP.v)}<small> kg</small></div><div class="lbl">최근 추정 1RM</div></div>
      <div class="tile"><div class="num">${kg(best.v)}<small> kg</small></div><div class="lbl">최고 추정 1RM</div></div>
      <div class="tile"><div class="num">${kg(num(best.top.w))}<small> ×${best.top.r}</small></div><div class="lbl">최고 기록 세트</div></div></div>`;
  }
  return `<div class="top"><div><div class="sub">누적 ${state.sessions.length}회 운동</div><h1>통계</h1></div></div>
  <section class="card"><div class="row between"><h2>최근 7일 부위별 세트</h2><span class="muted small">부위당 주 10세트 이상 권장</span></div>
    ${PARTS.slice(0, 6).map(p => `<div class="hbar"><span>${p}</span><span class="track"><i style="width:${m[p] / max * 100}%;${m[p] >= 10 ? 'background:var(--good)' : ''}"></i></span><span class="num">${m[p]}</span></div>`).join('')}</section>
  <section class="card"><div class="row between"><h2>주별 운동 횟수</h2><span class="muted small">점선 = 목표 ${goal}회</span></div>
    <svg class="chart" viewBox="0 0 ${W} ${H + 48}" role="img" aria-label="최근 8주 운동 횟수"><line x1="24" x2="${W}" y1="${gy}" y2="${gy}" stroke="var(--muted)" stroke-dasharray="4 4"/><text x="18" y="${gy + 4}" text-anchor="end">${goal}</text>${bars}</svg></section>
  <section class="card"><h2>종목별 성장 (추정 1RM)</h2>${done.length ? `<select class="text-in" id="stat-ex" data-in="statEx">${done.map(id => `<option value="${id}" ${id === ui.statEx ? 'selected' : ''}>${esc(ex(id).name)}</option>`).join('')}</select>` : ''}${prog}</section>`;
}

/* ---------- 운동 진행 ---------- */
function startWorkout(routineId) {
  if (state.active) { location.hash = 'workout'; return; }
  const r = state.routines.find(r => r.id === routineId);
  state.active = { id: uid(), routineId: r ? r.id : null, name: r ? r.name : '자유 운동', start: Date.now(), items: r ? r.items.map(makeItem) : [], rest: null, lastDone: null };
  ui.open = 0; save(); unlockAudio(); location.hash = 'workout'; render();
}
function makeItem(i) {
  const p = lastPerf(i.exId), prev = p ? p.sets.map(s => ({ w: s.w, r: s.r })) : [];
  const sets = [...Array(i.sets)].map((_, j) => { const b = prev[j] || prev[prev.length - 1]; return { w: b ? b.w : (i.weight || ''), r: i.reps, done: false }; });
  return { exId: i.exId, rest: i.rest, target: i.reps, prev, sets, sug: overload(i.exId, i.reps) };
}
function viewWorkout() {
  const a = state.active;
  if (!a) return `<div class="top"><h1>진행 중인 운동이 없습니다</h1></div><a class="btn primary" href="#today" style="text-decoration:none">오늘 화면으로</a>`;
  const total = a.items.reduce((n, i) => n + i.sets.length, 0), dn = a.items.reduce((n, i) => n + doneSets(i).length, 0);
  return `<div class="wk-head"><div class="grow"><div class="muted small">${esc(a.name)}</div><div class="num" id="elapsed">${clock((Date.now() - a.start) / 1000)}</div></div>
    <a class="btn sm ghost" href="#today" style="text-decoration:none">나가기</a><button class="btn sm primary" data-act="finishAsk">운동 종료</button></div>
  <div><div class="row between small muted" style="margin-bottom:6px"><span>진행률</span><span class="num" style="font-size:16px">${dn} / ${total} 세트</span></div><div class="progress"><i style="width:${total ? dn / total * 100 : 0}%"></i></div></div>
  ${a.items.map((it, i) => {
    const e = ex(it.exId), d = doneSets(it).length, open = ui.open === i, time = e.kind === 'time';
    return `<section class="card ex-card ${open ? 'cur' : ''} ${d === it.sets.length && d ? 'alldone' : ''}">
      <header role="button" tabindex="0" data-act="openEx" data-i="${i}"><div class="grow"><h2>${esc(e.name)}</h2><span class="muted small">${e.part} · 휴식 ${clock(it.rest)}</span></div><span class="count">${d}/${it.sets.length}</span>${open ? IC.up.replace('<svg', '<svg width="18" height="18"') : IC.down.replace('<svg', '<svg width="18" height="18"')}</header>
      ${open ? `<div class="ex-body">
        ${it.sug ? `<div class="suggest"><span>지난번 ${kg(it.sug.from)}kg 전 세트 성공. <b>${kg(it.sug.to)}kg</b> 도전?</span><button class="btn sm primary" data-act="applySug" data-i="${i}">적용</button></div>` : ''}
        <div class="set set-head ${time ? 'time' : ''}"><span>세트</span><span>지난 기록</span>${time ? '<span>분</span>' : '<span>kg</span><span>횟수</span>'}<span>완료</span></div>
        ${it.sets.map((s, j) => { const p = it.prev[j]; return `<div class="set ${time ? 'time' : ''} ${s.done ? 'done' : ''}"><span class="n">${j + 1}</span><span class="prev">${p ? (time ? `${p.r}분` : `${kg(num(p.w))}×${p.r}`) : '-'}</span>
          ${time ? '' : `<span class="field"><input id="w-${i}-${j}" type="number" inputmode="decimal" step="0.5" min="0" aria-label="${j + 1}세트 중량" placeholder="${e.kind === 'bw' ? '맨몸' : '0'}" value="${esc(s.w)}" data-in="set" data-k="w" data-i="${i}" data-j="${j}"></span>`}
          <span class="field"><input id="r-${i}-${j}" type="number" inputmode="decimal" min="0" aria-label="${j + 1}세트 ${time ? '시간(분)' : '횟수'}" value="${esc(s.r)}" data-in="set" data-k="r" data-i="${i}" data-j="${j}"></span>
          <button class="check" data-act="toggleSet" data-i="${i}" data-j="${j}" aria-label="${j + 1}세트 완료" aria-pressed="${s.done}">${IC.check}</button></div>`; }).join('')}
        <div class="row wrap"><button class="btn sm guide-btn" data-act="guide" data-id="${it.exId}">운동법 보기</button><button class="btn sm" data-act="addSet" data-i="${i}">+ 세트</button><button class="btn sm" data-act="delSet" data-i="${i}">− 세트</button>
          <span class="grow"></span><button class="btn sm" data-act="restAdj" data-i="${i}" data-d="-15">휴식 −15초</button><button class="btn sm" data-act="restAdj" data-i="${i}" data-d="15">+15초</button>
          <button class="btn sm danger" data-act="delEx" data-i="${i}">종목 빼기</button></div></div>` : ''}</section>`; }).join('')}
  <button class="btn ghost block" data-act="pickForWorkout">${IC.plus.replace('<svg', '<svg width="18" height="18"')} 운동 추가</button>`;
}
const dockMode = () => { const r = state.active.rest; return !r ? 'idle' : Date.now() >= r.end ? 'over' : 'rest'; };
function dockHtml() {
  const mode = dockMode(), C = (2 * Math.PI * 40).toFixed(1), over = mode === 'over';
  if (mode === 'idle') return `<div class="dock" data-mode="idle"><div><div class="grow"><b id="dock-since"></b><div class="muted small">완료 체크와 동시에 휴식 타이머가 시작됩니다.</div></div></div></div>`;
  return `<div class="dock ${over ? 'over' : ''}" data-mode="${mode}"><div><div class="ring"><svg viewBox="0 0 92 92"><circle cx="46" cy="46" r="40"/><circle class="fg" id="dock-ring" cx="46" cy="46" r="40" stroke-dasharray="${C}" stroke-dashoffset="${C}"/></svg><div class="num" id="dock-num"></div></div>
    <div class="grow" style="display:flex;flex-direction:column;gap:8px"><b>${over ? '휴식 끝. 다음 세트 시작하세요' : '휴식 중'}</b>
    <div class="ctl">${over ? '' : '<button class="btn" data-act="restTime" data-d="-10">−10초</button><button class="btn" data-act="restTime" data-d="10">+10초</button>'}<button class="btn ${over ? 'primary' : ''}" data-act="restSkip">${over ? '확인' : '건너뛰기'}</button></div></div></div></div>`;
}
/* 독은 상태가 바뀔 때만 다시 그리고, 그 외에는 숫자만 갱신한다(버튼 터치가 끊기지 않도록) */
function paintDock() {
  const a = state.active, host = $('#chrome'), mode = dockMode(), now = Date.now();
  if (host.firstElementChild?.dataset.mode !== mode) host.innerHTML = dockHtml();
  if (mode === 'idle') { $('#dock-since').innerHTML = a.lastDone ? `마지막 세트 후 <span class="num" style="font-size:20px">${clock((now - a.lastDone) / 1000)}</span>` : '세트를 마치면 ✓를 누르세요'; return; }
  const left = (a.rest.end - now) / 1000, C = 2 * Math.PI * 40;
  $('#dock-num').textContent = left <= 0 ? '+' + clock(-left) : clock(Math.ceil(left));
  $('#dock-ring').setAttribute('stroke-dashoffset', (left <= 0 ? 0 : C * Math.min(1, left / a.rest.total)).toFixed(1));
}

/* ---------- 소리·진동·화면 켜짐 ---------- */
let actx = null, beepNodes = [], wake = null;
function unlockAudio() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) {} }
function scheduleBeep(sec) {
  beepNodes.forEach(n => { try { n.stop(); } catch (e) {} }); beepNodes = [];
  if (!actx || !state.settings.sound || sec == null) return;
  [0, .25, .5].forEach((off, k) => { try {
    const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + Math.max(0, sec) + off;
    o.frequency.value = k === 2 ? 1175 : 880; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.35, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + (k === 2 ? .45 : .18));
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + .5); beepNodes.push(o);
  } catch (e) {} });
}
function setRest(sec) {
  const a = state.active; if (!a) return;
  a.rest = sec == null ? null : { end: Date.now() + sec * 1000, total: Math.max(sec, a.rest && sec > 0 ? a.rest.total : sec), fired: false };
  scheduleBeep(sec); save();
}
async function keepAwake() { try { if (state.active && 'wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => wake = null); } } catch (e) {} }
document.addEventListener('visibilitychange', () => { if (!document.hidden) { keepAwake(); tick(); } });

let frameN = 0;
function tick() {
  const fr = $('#frames'); if (fr && !ui.framePaused && ++frameN % 2 === 0) fr.dataset.f = fr.dataset.f === '0' ? '1' : '0';
  const a = state.active; if (!a) return;
  if (a.rest && !a.rest.fired && Date.now() >= a.rest.end) { a.rest.fired = true; save(); if (state.settings.vibrate && navigator.vibrate) { try { navigator.vibrate([200, 100, 200, 100, 400]); } catch (e) {} } }
  const el = $('#elapsed'); if (el) el.textContent = clock((Date.now() - a.start) / 1000);
  const b = $('#banner-time'); if (b) b.textContent = clock((Date.now() - a.start) / 1000);
  if (route() === 'workout') paintDock();
}
setInterval(tick, 500);

/* ---------- 시트 ---------- */
const sheet = (title, body, foot = '', full = false) => `<div class="scrim" data-act="scrim"><div class="sheet ${full ? 'full' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h2>${esc(title)}</h2><button class="icon-btn" data-act="close" aria-label="닫기">${IC.x}</button></header><div class="body">${body}</div>${foot ? `<footer>${foot}</footer>` : ''}</div></div>`;
const push = s => { ui.framePaused = false; ui.sheets.push(s); renderSheet(); };
const pop = () => { ui.sheets.pop(); renderSheet(); };
const ask = (msg, label, yes) => push({ type: 'confirm', msg, label, yes });
function toast(msg) { document.querySelectorAll('.toast').forEach(t => t.remove()); const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg; document.body.append(t); setTimeout(() => t.remove(), 2400); }

const stepper = (key, val, label) => `<div class="stepper"><button data-act="setting" data-k="${key}" data-d="-1" aria-label="${label} 줄이기">−</button><span class="num">${val}</span><button data-act="setting" data-k="${key}" data-d="1" aria-label="${label} 늘리기">+</button></div>`;
const SHEETS = {
  confirm: s => sheet('확인', `<p>${esc(s.msg)}</p>`, `<button class="btn" data-act="close">취소</button><button class="btn primary" data-act="confirmYes">${esc(s.label)}</button>`),
  settings: () => { const c = state.settings; return sheet('설정', `<div class="card" style="gap:0">
      <div class="setting"><div><b>주간 목표</b><div class="muted small">일주일에 운동할 횟수</div></div>${stepper('weeklyGoal', c.weeklyGoal + '회', '주간 목표')}</div>
      <div class="setting"><div><b>기본 휴식 시간</b><div class="muted small">새로 추가하는 운동에 적용</div></div>${stepper('defaultRest', clock(c.defaultRest), '기본 휴식')}</div>
      <div class="setting"><div><b>휴식 종료 알림음</b></div><button class="switch" role="switch" aria-checked="${c.sound}" aria-label="알림음" data-act="toggle" data-k="sound"></button></div>
      <div class="setting"><div><b>휴식 종료 진동</b><div class="muted small">안드로이드 기기에서 동작</div></div><button class="switch" role="switch" aria-checked="${c.vibrate}" aria-label="진동" data-act="toggle" data-k="vibrate"></button></div></div>
    <div class="card"><h2>데이터 백업</h2><p class="muted small">기록은 이 기기의 브라우저에만 저장됩니다. 기기를 바꾸거나 브라우저 데이터를 지우기 전에 백업 파일을 받아 두세요.</p>
      <div class="row wrap"><button class="btn grow" data-act="export">백업 파일 받기</button><button class="btn grow" data-act="import">백업 불러오기</button></div>
      <button class="btn ghost danger" data-act="resetAsk">모든 데이터 지우기</button></div>`); },
  editor: s => { const r = s.draft; return sheet(s.isNew ? '새 루틴' : '루틴 수정', `<label class="lbl" for="rt-name">루틴 이름<input class="text-in" id="rt-name" data-in="rtName" value="${esc(r.name)}" placeholder="예: 가슴·삼두"></label>
      ${r.items.map((i, n) => { const e = ex(i.exId), time = e.kind === 'time'; return `<div class="card"><div class="row between"><button class="ex-link" data-act="guide" data-id="${i.exId}"><b>${esc(e.name)}</b><div class="muted small">${e.part} · ${e.equip} · 운동법 보기</div></button>
        <div class="row" style="gap:6px"><button class="icon-btn" data-act="edMove" data-n="${n}" data-d="-1" aria-label="위로" ${n ? '' : 'disabled'}>${IC.up}</button><button class="icon-btn" data-act="edMove" data-n="${n}" data-d="1" aria-label="아래로" ${n < r.items.length - 1 ? '' : 'disabled'}>${IC.down}</button><button class="icon-btn" data-act="edDel" data-n="${n}" aria-label="삭제">${IC.x}</button></div></div>
        <div class="grid4">${[['sets', '세트'], ['reps', time ? '분' : '횟수'], ['weight', '시작 kg'], ['rest', '휴식(초)']].filter(f => !(time && f[0] === 'weight')).map(([k, l]) => `<label class="lbl field" for="ed-${n}-${k}">${l}<input id="ed-${n}-${k}" type="number" inputmode="decimal" min="0" value="${i[k] || (k === 'weight' ? '' : 0)}" data-in="ed" data-n="${n}" data-k="${k}"></label>`).join('')}</div></div>`; }).join('')}
      <button class="btn ghost block" data-act="pickForEditor">${IC.plus.replace('<svg', '<svg width="18" height="18"')} 운동 추가</button>
      ${s.isNew ? '' : '<button class="btn ghost danger block" data-act="delRoutineAsk">이 루틴 삭제</button>'}`, `<button class="btn" data-act="close">취소</button><button class="btn primary" data-act="saveRoutine">저장</button>`, true); },
  picker: s => sheet('운동 선택', `<input class="text-in" id="pick-q" type="search" placeholder="운동 이름 검색" aria-label="운동 검색" data-in="pickQ" value="${esc(s.q)}">
      <div class="muted small">사진을 누르면 운동법, 이름을 누르면 추가됩니다.</div><div class="scroll-x">${['전체', ...PARTS].map(p => `<button class="chip ${s.part === p ? 'on' : ''}" data-act="pickPart" data-p="${p}">${p}</button>`).join('')}</div>
      <div id="pick-list" style="display:flex;flex-direction:column;gap:8px">${pickList(s)}</div>`, '', true),
  session: s => { const x = state.sessions.find(q => q.id === s.id); if (!x) return ''; return sheet(x.name, `<div class="muted small">${dateLabel(x.start)} · ${new Date(x.start).toTimeString().slice(0, 5)} 시작</div>
      <div class="tiles"><div class="tile"><div class="num">${clock((x.end - x.start) / 1000)}</div><div class="lbl">운동 시간</div></div><div class="tile"><div class="num">${sessSets(x)}</div><div class="lbl">완료 세트</div></div><div class="tile"><div class="num">${kg(sessVolume(x))}<small> kg</small></div><div class="lbl">총 볼륨</div></div></div>
      ${(s.prs || []).length ? `<div class="chips">${s.prs.map(p => `<span class="chip good">신기록 · ${esc(p)}</span>`).join('')}</div>` : ''}
      ${x.items.map(i => `<div class="card"><b>${esc(ex(i.exId).name)}</b><div class="chips">${doneSets(i).map(q => `<span class="chip num" style="font-size:16px">${ex(i.exId).kind === 'time' ? `${q.r}분` : `${kg(num(q.w))}kg × ${q.r}`}</span>`).join('')}</div></div>`).join('')}
      <button class="btn ghost danger block" data-act="delSessionAsk" data-id="${x.id}">이 기록 삭제</button>`); },
  guide: s => { const e = ex(s.id), g = GUIDE[s.id];
    const yt = `<a class="btn ghost block" style="text-decoration:none" target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=${encodeURIComponent(e.name + ' 자세')}">유튜브에서 영상으로 보기</a>`;
    if (!g) return sheet(e.name, `<p class="muted">직접 추가한 운동이라 준비된 설명이 없습니다. 영상 검색으로 자세를 확인하세요.</p>${yt}`);
    return sheet(e.name, `<div class="frames" id="frames" data-f="0"><img src="img/${e.id}-0.jpg" alt="${esc(e.name)} 시작 자세"><img src="img/${e.id}-1.jpg" alt="${esc(e.name)} 마무리 자세"><span class="frame-lbl"><i>시작 자세</i><i>마무리 자세</i></span></div>
      <div class="row between"><div class="chips"><span class="chip">${e.part}</span><span class="chip">${e.equip}</span></div><button class="btn sm" data-act="framePause" aria-pressed="false">동작 멈춤</button></div>
      <div class="card"><div class="eyebrow">자극 부위</div><b>${esc(g[0])}</b></div>
      <div class="card"><div class="eyebrow">운동 순서</div><ol class="steps">${g[1].map(t => `<li>${esc(t)}</li>`).join('')}</ol></div>
      <div class="tip warn"><span class="bar"></span><div><b>주의할 점</b><span class="muted small">${esc(g[2])}</span></div></div>${yt}`, '', true); },
  finish: () => { const a = state.active, n = sessSets(a); return sheet('운동을 마칠까요?', `<div class="tiles"><div class="tile"><div class="num">${clock((Date.now() - a.start) / 1000)}</div><div class="lbl">운동 시간</div></div><div class="tile"><div class="num">${n}</div><div class="lbl">완료 세트</div></div><div class="tile"><div class="num">${kg(sessVolume(a))}<small> kg</small></div><div class="lbl">총 볼륨</div></div></div>
      <p class="muted small">${n ? '체크한 세트만 기록에 남습니다.' : '완료한 세트가 없어 기록은 남지 않습니다.'}</p>`, `<button class="btn" data-act="close">계속하기</button><button class="btn primary" data-act="finish">${n ? '저장하고 종료' : '기록 없이 종료'}</button>`); },
};
function pickList(s) {
  const q = s.q.trim(), list = allEx().filter(e => (s.part === '전체' || e.part === s.part) && (!q || e.name.includes(q)));
  return list.map(e => `<div class="pick"><button class="thumb" data-act="guide" data-id="${e.id}" aria-label="${esc(e.name)} 운동법 보기">${GUIDE[e.id] ? `<img src="img/${e.id}-1.jpg" alt="" loading="lazy">` : '?'}</button>
      <button class="grow pick-main" data-act="pick" data-id="${e.id}"><span><b>${esc(e.name)}</b><br><span class="muted small">${e.part} · ${e.equip}</span></span>${IC.plus.replace('<svg', '<svg width="20" height="20"')}</button></div>`).join('')
    + (q && !allEx().some(e => e.name === q) ? `<button class="pick" data-act="pickCustom"><span><b>‘${esc(q)}’ 새 운동으로 추가</b><br><span class="muted small">${s.part === '전체' ? '부위를 먼저 고르면 해당 부위로 등록됩니다' : s.part + ' 부위로 등록'}</span></span>${IC.plus.replace('<svg', '<svg width="20" height="20"')}</button>` : (!list.length ? '<div class="empty">검색 결과가 없습니다.</div>' : ''));
}
function renderSheet() { const s = ui.sheets[ui.sheets.length - 1]; $('#overlay').innerHTML = s ? SHEETS[s.type](s) : ''; }

/* ---------- 렌더 ---------- */
function render() {
  const r = route(), app = $('#app');
  app.className = r === 'workout' && state.active ? 'in-workout' : '';
  app.innerHTML = { today: viewToday, routines: viewRoutines, history: viewHistory, stats: viewStats, workout: viewWorkout }[r]();
  if (r === 'workout' && state.active) { if (!$('#chrome .dock')) $('#chrome').innerHTML = ''; paintDock(); keepAwake(); }
  else $('#chrome').innerHTML = (state.active ? `<div class="banner"><button data-act="resume"><span>운동 진행 중 · ${esc(state.active.name)}</span><span class="num" id="banner-time" style="font-size:20px">${clock((Date.now() - state.active.start) / 1000)}</span></button></div>` : '')
    + `<nav class="tabs" aria-label="주요 메뉴"><div>${[['today', '오늘'], ['routines', '루틴'], ['history', '기록'], ['stats', '통계']].map(([k, l]) => `<a href="#${k}" class="${r === k ? 'on' : ''}" ${r === k ? 'aria-current="page"' : ''}>${IC[k]}<span>${l}</span></a>`).join('')}</div></nav>`;
}
window.addEventListener('hashchange', () => { ui.sheets = ui.pending ? [ui.pending] : []; ui.pending = null; renderSheet(); render(); window.scrollTo(0, 0); });

/* ---------- 동작 ---------- */
const topSheet = () => ui.sheets[ui.sheets.length - 1];
const editor = () => ui.sheets.find(s => s.type === 'editor');
function addExercise(exId) {
  const p = topSheet(), base = { exId, sets: 3, reps: ex(exId).kind === 'time' ? 10 : 10, rest: state.settings.defaultRest, weight: 0 };
  if (p.target === 'editor') editor().draft.items.push(base);
  else { state.active.items.push(makeItem(base)); ui.open = state.active.items.length - 1; save(); render(); }
  pop(); toast(`${ex(exId).name} 추가됨`);
}
function finishWorkout() {
  const a = state.active; scheduleBeep(null);
  const items = a.items.map(i => ({ exId: i.exId, sets: doneSets(i).map(s => ({ w: num(s.w), r: num(s.r), done: true })) })).filter(i => i.sets.length);
  state.active = null; if (wake) { try { wake.release(); } catch (e) {} }
  ui.sheets = [];
  if (!items.length) { save(); location.hash = 'today'; render(); renderSheet(); return; }
  const prs = items.filter(i => ex(i.exId).kind !== 'time').filter(i => { const old = Math.max(0, ...state.sessions.map(s => { const o = s.items.find(o => o.exId === i.exId); return o ? bestE1rm(o) : 0; })); return old > 0 && bestE1rm(i) > old; }).map(i => ex(i.exId).name);
  const sess = { id: a.id, routineId: a.routineId, name: a.name, start: a.start, end: Date.now(), items };
  state.sessions.push(sess); save(); ui.month = null;
  const done = { type: 'session', id: sess.id, prs };
  if (location.hash === '#history') { render(); push(done); } else { ui.pending = done; location.hash = 'history'; }
}
const A = {
  settings: () => push({ type: 'settings' }),
  close: pop,
  scrim: (d, el, e) => { if (e.target === el) pop(); },
  confirmYes: () => { const s = topSheet(); pop(); s.yes(); },
  start: d => { unlockAudio(); startWorkout(d.id); },
  resume: () => { location.hash = 'workout'; },
  month: d => { const m = ui.month.m + +d.d; ui.month = { y: ui.month.y + Math.floor(m / 12), m: (m + 12) % 12 }; render(); },
  session: d => push({ type: 'session', id: d.id }),
  delSessionAsk: d => ask('이 운동 기록을 삭제할까요? 되돌릴 수 없습니다.', '삭제', () => { state.sessions = state.sessions.filter(s => s.id !== d.id); save(); ui.sheets = []; renderSheet(); render(); }),
  setting: d => { const c = state.settings; if (d.k === 'weeklyGoal') c.weeklyGoal = Math.min(7, Math.max(1, c.weeklyGoal + +d.d)); else c.defaultRest = Math.min(600, Math.max(15, c.defaultRest + 15 * +d.d)); save(); renderSheet(); render(); },
  toggle: d => { state.settings[d.k] = !state.settings[d.k]; save(); renderSheet(); },
  export: () => {
    const text = JSON.stringify(state, null, 1);
    try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = `gymnote-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); } catch (e) {}
    navigator.clipboard?.writeText(text).then(() => toast('백업 내용을 클립보드에도 복사했습니다'), () => toast('백업 파일을 내려받았습니다'));
  },
  import: () => $('#import-file').click(),
  resetAsk: () => ask('루틴과 운동 기록을 모두 지웁니다. 되돌릴 수 없습니다.', '모두 지우기', () => { state = fresh(); save(); ui.sheets = []; renderSheet(); render(); toast('초기화했습니다'); }),
  // 루틴
  newRoutine: () => push({ type: 'editor', isNew: true, draft: { id: uid(), name: '', items: [] } }),
  editRoutine: d => push({ type: 'editor', draft: clone(state.routines.find(r => r.id === d.id)) }),
  moveRoutine: d => { const n = +d.n; if (n > 0) { const r = state.routines; [r[n - 1], r[n]] = [r[n], r[n - 1]]; save(); render(); } },
  edMove: d => { const it = topSheet().draft.items, n = +d.n, m = n + +d.d; if (m >= 0 && m < it.length) { [it[n], it[m]] = [it[m], it[n]]; renderSheet(); } },
  edDel: d => { topSheet().draft.items.splice(+d.n, 1); renderSheet(); },
  saveRoutine: () => { const s = topSheet(), r = s.draft; r.name = r.name.trim() || '이름 없는 루틴'; r.items.forEach(i => { i.sets = Math.max(1, Math.round(num(i.sets))); i.reps = Math.max(1, num(i.reps)); i.rest = Math.max(0, Math.round(num(i.rest))); i.weight = num(i.weight); });
    const n = state.routines.findIndex(q => q.id === r.id); if (n >= 0) state.routines[n] = r; else state.routines.push(r); save(); pop(); render(); toast('루틴을 저장했습니다'); },
  delRoutineAsk: () => { const id = topSheet().draft.id; ask('이 루틴을 삭제할까요? 지난 운동 기록은 남습니다.', '삭제', () => { state.routines = state.routines.filter(r => r.id !== id); save(); ui.sheets = []; renderSheet(); render(); }); },
  pickForEditor: () => push({ type: 'picker', target: 'editor', part: '전체', q: '' }),
  pickForWorkout: () => push({ type: 'picker', target: 'workout', part: '전체', q: '' }),
  pickPart: d => { topSheet().part = d.p; renderSheet(); },
  pick: d => addExercise(d.id),
  pickCustom: () => { const s = topSheet(), e = { id: 'c-' + uid(), name: s.q.trim(), part: s.part === '전체' ? '가슴' : s.part, equip: '직접 추가', kind: s.part === '유산소' ? 'time' : 'w' }; state.customExercises.push(e); save(); addExercise(e.id); },
  // 운동 진행
  openEx: d => { ui.open = ui.open === +d.i ? -1 : +d.i; render(); },
  toggleSet: d => {
    unlockAudio(); const a = state.active, it = a.items[+d.i], s = it.sets[+d.j]; s.done = !s.done;
    if (s.done) {
      a.lastDone = Date.now(); a.rest = null;
      const lastOfAll = a.items.every(i => i.sets.every(x => x.done));
      if (!lastOfAll && it.rest > 0) setRest(it.rest);
      if (it.sets.every(x => x.done)) { const nx = a.items.findIndex(i => i.sets.some(x => !x.done)); if (nx >= 0) ui.open = nx; }
      if (lastOfAll) { scheduleBeep(null); toast('모든 세트 완료. 운동 종료를 눌러 저장하세요'); }
    }
    save(); render();
  },
  addSet: d => { const it = state.active.items[+d.i], l = it.sets[it.sets.length - 1]; it.sets.push({ w: l ? l.w : '', r: l ? l.r : it.target, done: false }); save(); render(); },
  delSet: d => { const it = state.active.items[+d.i]; if (it.sets.length > 1) { it.sets.pop(); save(); render(); } },
  delEx: d => ask(`‘${ex(state.active.items[+d.i].exId).name}’을(를) 오늘 운동에서 뺄까요?`, '빼기', () => { state.active.items.splice(+d.i, 1); ui.open = -1; save(); render(); }),
  restAdj: d => { const it = state.active.items[+d.i]; it.rest = Math.max(0, it.rest + +d.d); save(); render(); },
  applySug: d => { const it = state.active.items[+d.i]; it.sets.forEach(s => { if (!s.done) s.w = it.sug.to; }); it.sug = null; save(); render(); },
  restTime: d => { const r = state.active.rest; if (r) { const left = Math.max(0, (r.end - Date.now()) / 1000 + +d.d); r.end = Date.now() + left * 1000; r.total = Math.max(r.total, left); scheduleBeep(left); save(); paintDock(); } },
  restSkip: () => { setRest(null); paintDock(); },
  guide: d => push({ type: 'guide', id: d.id }),
  framePause: (d, el) => { ui.framePaused = !ui.framePaused; el.setAttribute('aria-pressed', ui.framePaused); el.textContent = ui.framePaused ? '동작 재생' : '동작 멈춤'; if (ui.framePaused) { const f = $('#frames'); f.dataset.f = f.dataset.f === '0' ? '1' : '0'; } },
  finishAsk: () => push({ type: 'finish' }),
  finish: finishWorkout,
};
document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (el && !el.disabled && A[el.dataset.act]) A[el.dataset.act](el.dataset, el, e); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && ui.sheets.length) pop();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('header[data-act]')) { e.preventDefault(); e.target.click(); }
});
document.addEventListener('input', e => {
  const d = e.target.dataset, v = e.target.value;
  if (d.in === 'set') { state.active.items[+d.i].sets[+d.j][d.k] = v; save(); }
  else if (d.in === 'ed') topSheet().draft.items[+d.n][d.k] = v;
  else if (d.in === 'rtName') topSheet().draft.name = v;
  else if (d.in === 'pickQ') { topSheet().q = v; $('#pick-list').innerHTML = pickList(topSheet()); }
  else if (d.in === 'statEx') { ui.statEx = v; render(); }
});
$('#import-file').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!Array.isArray(d.routines) || !Array.isArray(d.sessions)) throw 0;
    ask(`백업의 루틴 ${d.routines.length}개, 운동 기록 ${d.sessions.length}건으로 현재 데이터를 바꿉니다.`, '불러오기', () => { state = { ...fresh(), ...d, settings: { ...fresh().settings, ...d.settings } }; save(); ui.sheets = []; renderSheet(); render(); toast('백업을 불러왔습니다'); });
  } catch (err) { toast('쇠질 노트 백업 파일이 아닙니다'); }
});

render();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
