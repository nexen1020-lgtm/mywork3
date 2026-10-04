// 공강 매니저: 시간표 + 할 일 -> 공강에 자동 배치
const DAYS = ['월', '화', '수', '목', '금'];
const DAY_START = 9 * 60;   // 하루 시작 09:00
const DAY_END = 18 * 60;    // 하루 끝 18:00
const MIN_SLOT = 20;        // 이보다 짧은 공강은 사용하지 않음
const BUFFER = 10;          // 할 일 사이 휴식(분)
const KEY = 'gonggang-v1';

let state = load();

function load() {
  const empty = { classes: [], tasks: [], plan: [], unplaced: [] };
  try { return Object.assign(empty, JSON.parse(localStorage.getItem(KEY))); }
  catch (e) { return empty; }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

// "10:30" <-> 630(분)
const toMin = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const toStr = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const $ = (id) => document.getElementById(id);

function el(tag, text, cls) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}
function setStatus(msg) { $('status').textContent = msg; }

// 하루의 공강 구간 계산
function freeSlots(day) {
  const list = state.classes.filter((c) => c.day === day).sort((a, b) => a.start - b.start);
  const slots = [];
  let cursor = DAY_START;
  for (const c of list) {
    if (c.start > cursor) slots.push({ day, start: cursor, end: Math.min(c.start, DAY_END) });
    cursor = Math.max(cursor, c.end);
  }
  if (cursor < DAY_END) slots.push({ day, start: cursor, end: DAY_END });
  return slots.filter((s) => s.end > s.start);
}

// 자동 배치 (탐욕 방식: 마감 빠른 순 -> 중요도 높은 순)
function autoPlace() {
  const slots = DAYS.flatMap((_, d) => freeSlots(d));
  const tasks = state.tasks.filter((t) => !t.done).sort((a, b) => {
    const da = a.due || '9999-99-99', db = b.due || '9999-99-99';
    return da < db ? -1 : da > db ? 1 : b.priority - a.priority;
  });
  state.plan = [];
  state.unplaced = [];
  for (const t of tasks) {
    let rem = t.minutes;
    for (const s of slots) {
      if (rem <= 0) break;
      const len = s.end - s.start;
      if (len < MIN_SLOT) continue;
      const chunk = Math.min(rem, len);
      state.plan.push({ day: s.day, start: s.start, end: s.start + chunk, title: t.title });
      rem -= chunk;
      s.start += chunk + BUFFER;
    }
    if (rem > 0) state.unplaced.push(t.title + ' (' + rem + '분 부족)');
  }
  save();
  render();
  const placed = state.plan.length;
  setStatus(state.unplaced.length
    ? '일부 할 일을 배치하지 못했어요: ' + state.unplaced.join(', ')
    : (placed ? '모든 할 일을 공강에 배치했어요.' : '배치할 할 일이 없어요.'));
}

function removeItem(list, id) {
  state[list] = state[list].filter((x) => x.id !== id);
  state.plan = []; state.unplaced = [];
  save(); render();
  setStatus('목록이 바뀌어서 배치를 지웠어요. 자동 배치를 다시 눌러 주세요.');
}

function makeItem(text, onDelete, label) {
  const li = el('li');
  li.append(el('span', text));
  const b = el('button', '삭제', 'del');
  b.type = 'button';
  b.setAttribute('aria-label', label + ' 삭제');
  b.addEventListener('click', onDelete);
  li.append(b);
  return li;
}

function render() {
  const cl = $('class-list'); cl.replaceChildren();
  state.classes.slice().sort((a, b) => a.day - b.day || a.start - b.start).forEach((c) =>
    cl.append(makeItem(`${DAYS[c.day]} ${toStr(c.start)}~${toStr(c.end)} ${c.name}`, () => removeItem('classes', c.id), c.name)));

  const tl = $('task-list'); tl.replaceChildren();
  state.tasks.forEach((t) => {
    const li = makeItem(`${t.title} · ${t.minutes}분${t.due ? ' · ~' + t.due.slice(5) : ''}`, () => removeItem('tasks', t.id), t.title);
    const box = document.createElement('input');
    box.type = 'checkbox'; box.checked = t.done;
    box.setAttribute('aria-label', t.title + ' 완료');
    box.addEventListener('change', () => { t.done = box.checked; state.plan = []; save(); render(); setStatus('완료 상태가 바뀌었어요. 자동 배치를 다시 눌러 주세요.'); });
    li.prepend(box);
    if (t.done) li.classList.add('done');
    tl.append(li);
  });

  const week = $('week'); week.replaceChildren();
  DAYS.forEach((name, d) => {
    const col = el('section', undefined, 'day');
    col.setAttribute('aria-label', name + '요일');
    const free = freeSlots(d).reduce((sum, s) => sum + (s.end - s.start), 0);
    col.append(el('h4', name + '요일'));
    const items = [
      ...state.classes.filter((c) => c.day === d).map((c) => ({ ...c, title: c.name, type: 'class' })),
      ...state.plan.filter((p) => p.day === d).map((p) => ({ ...p, type: 'task' }))
    ].sort((a, b) => a.start - b.start);
    const ul = el('ul', undefined, 'slots');
    items.forEach((it) => {
      const li = el('li', undefined, it.type);
      li.append(el('span', toStr(it.start) + '~' + toStr(it.end), 'time'), el('span', (it.type === 'class' ? '수업 ' : '할 일 ') + it.title));
      ul.append(li);
    });
    if (!items.length) ul.append(el('li', '비어 있어요', 'empty'));
    col.append(ul, el('p', '공강 합계 ' + free + '분', 'free'));
    week.append(col);
  });
}

$('class-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const start = toMin($('c-start').value), end = toMin($('c-end').value);
  if (end <= start) { setStatus('종료 시간이 시작 시간보다 늦어야 해요.'); return; }
  state.classes.push({ id: Date.now(), name: $('c-name').value.trim(), day: Number($('c-day').value), start, end });
  state.plan = []; state.unplaced = [];
  e.target.reset(); save(); render();
  setStatus('수업을 추가했어요.');
});

$('task-form').addEventListener('submit', (e) => {
  e.preventDefault();
  state.tasks.push({ id: Date.now(), title: $('t-name').value.trim(), minutes: Number($('t-min').value),
    due: $('t-due').value, priority: Number($('t-pri').value), done: false });
  state.plan = []; state.unplaced = [];
  e.target.reset(); save(); render();
  setStatus('할 일을 추가했어요.');
});

$('plan-btn').addEventListener('click', autoPlace);
render();
