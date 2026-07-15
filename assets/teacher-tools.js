const STORAGE_KEY = "quiz_survivor_custom_questions";
const DRAFT_KEY = "quiz_survivor_teacher_draft";
const TITLE_KEY = "quiz_survivor_custom_title";
const AUTH_KEY = "quiz_survivor_teacher_auth_until";
const XLSX_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";

const state = {
  authed: Number(localStorage.getItem(AUTH_KEY) || 0) > Date.now(),
  questions: [],
  title: localStorage.getItem(TITLE_KEY) || "맞춤 퀴즈"
};

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (key === "className") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "html") node.innerHTML = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== undefined && value !== null) node.setAttribute(key, value);
  });
  children.forEach(child => node.append(child));
  return node;
}

function normalizeType(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (/ox|o\/x|참|거짓|진위/.test(raw)) return "ox";
  if (/단답|short|주관/.test(raw)) return "short";
  return "choice";
}

function cleanLines(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map(line => line.trim())
    .filter(line => line && !/^유사\s*문제\s*생성$/i.test(line) && !/^question-image$/i.test(line));
}

function isZepTypeLine(line) {
  return /^(선택형|단답형|OX형|O\/X형)$/i.test(String(line || "").trim());
}

function zepHeaderType(line) {
  const match = String(line || "").match(/^문제\s*\d+\s*(선택형|단답형|OX형|O\/X형)?$/i);
  return match?.[1] || "";
}

function zepBlocks(text) {
  const lines = cleanLines(text);
  const blocks = [];
  let current = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^문제\s*\d+/i.test(line)) {
      if (current?.length) blocks.push(current);
      current = [line];
      if (!zepHeaderType(line) && isZepTypeLine(lines[i + 1])) {
        current[0] = `${line}${lines[i + 1]}`;
        i += 1;
      }
      continue;
    }
    if (current) current.push(line);
  }

  if (current?.length) blocks.push(current);
  return blocks;
}

const ANSWER_LINE_RE = /^(정답|답)\s*[:：]?\s*/;
const OPTION_MARKER_RE = /^([①②③④⑤⑥]|[1-6][.)]\s*|[A-Da-d][.)]\s*)/;
const CIRCLED = "①②③④⑤⑥";

function stripAnswerPrefix(line) {
  return String(line || "").replace(ANSWER_LINE_RE, "").trim();
}

function stripOptionMarker(line) {
  return String(line || "").replace(OPTION_MARKER_RE, "").trim();
}

// 블록에서 '정답 …' 줄을 찾아 제거하고 그 값을 돌려준다 — 보기·문제에 답이 섞이는 것 방지
function extractAnswerLine(lines) {
  const index = lines.findIndex(line => ANSWER_LINE_RE.test(line) && stripAnswerPrefix(line).length <= 40);
  if (index < 0) return "";
  const value = stripAnswerPrefix(lines[index]);
  lines.splice(index, 1);
  return value;
}

function parseZep(text) {
  return zepBlocks(text).map((lines, index) => {
    const header = lines.shift() || "";
    const typeMatch = header.match(/문제\s*\d+\s*(선택형|단답형|OX형|O\/X형)/i);
    const type = normalizeType(typeMatch?.[1] || "");
    let question = "";
    let options = [];
    let answer = extractAnswerLine(lines);

    if (type === "choice") {
      // ①②… / 1) / A. 같은 마커가 붙은 줄을 보기로 인식, 없으면 마지막 4줄 사용
      const markerLines = lines.filter(line => OPTION_MARKER_RE.test(line));
      if (markerLines.length >= 2) {
        options = markerLines.map(stripOptionMarker);
        question = lines.filter(line => !OPTION_MARKER_RE.test(line)).join("\n").trim();
      } else {
        options = lines.slice(-4);
        question = lines.slice(0, -4).join("\n").trim();
      }
      // 정답이 ② 처럼 번호로 적혀 있으면 해당 보기 텍스트로 변환
      const circledIndex = CIRCLED.indexOf(answer.trim().charAt(0));
      const numberedMatch = answer.trim().match(/^([1-6])(?:번)?$/);
      if (circledIndex >= 0 && options[circledIndex]) answer = options[circledIndex];
      else if (numberedMatch && options[Number(numberedMatch[1]) - 1]) answer = options[Number(numberedMatch[1]) - 1];
    } else if (type === "short") {
      if (!answer) {
        const maybeAnswer = lines.at(-1) || "";
        const hasLikelyAnswer = lines.length > 1 && maybeAnswer.length <= 40 && !/[?？.다까]$/.test(maybeAnswer);
        answer = hasLikelyAnswer ? stripAnswerPrefix(maybeAnswer) : "";
        if (hasLikelyAnswer) lines.pop();
      }
      question = lines.join("\n").trim();
    } else {
      if (!answer) {
        const maybeAnswer = normalizeAnswer("ox", lines.at(-1) || "");
        if (["O", "X"].includes(maybeAnswer) && lines.length > 1) {
          answer = maybeAnswer;
          lines.pop();
        }
      } else {
        answer = normalizeAnswer("ox", answer);
      }
      question = lines.join("\n").trim();
      options = ["O", "X"];
    }

    return normalizeQuestion({
      id: `zep-${Date.now()}-${index + 1}`,
      type,
      question,
      options,
      answer,
      explanation: ""
    });
  }).filter(item => item.question);
}

function csvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted && ch === '"' && next === '"') {
      cell += '"';
      i += 1;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (!quoted && ch === ",") {
      row.push(cell);
      cell = "";
    } else if (!quoted && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

function pick(row, names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null && String(row[name]).trim()) return String(row[name]).trim();
  }
  return "";
}

function rowsToQuestions(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map(value => String(value || "").trim());
  return rows.slice(1).map((values, index) => {
    const row = Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ""]));
    const options = [
      pick(row, ["선택지1", "보기1", "option1", "A"]),
      pick(row, ["선택지2", "보기2", "option2", "B"]),
      pick(row, ["선택지3", "보기3", "option3", "C"]),
      pick(row, ["선택지4", "보기4", "option4", "D"])
    ].filter(Boolean);
    return normalizeQuestion({
      id: `sheet-${Date.now()}-${index + 1}`,
      type: normalizeType(pick(row, ["유형", "type"])),
      question: pick(row, ["문제", "질문", "question"]),
      answer: pick(row, ["정답", "답", "answer", "correct"]),
      options,
      explanation: pick(row, ["해설", "설명", "explanation"]),
      difficulty: Number(pick(row, ["난이도", "difficulty"])) || 1
    });
  }).filter(item => item.question);
}

function normalizeQuestion(item) {
  const type = normalizeType(item.type);
  const answer = normalizeAnswer(type, item.answer);
  return {
    id: item.id || `custom-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    question: String(item.question || "").trim(),
    options: Array.isArray(item.options) ? item.options.map(String).map(v => v.trim()).filter(Boolean) : [],
    answer,
    explanation: String(item.explanation || "").trim(),
    difficulty: Math.max(1, Math.min(3, Number(item.difficulty) || 1))
  };
}

function acceptedAnswers(type, value) {
  const raw = String(value || "").trim();
  if (!raw) return [];
  if (type === "ox") return [normalizeAnswer(type, raw)].filter(Boolean);
  if (type !== "short") return [raw];
  return [...new Set(raw
    .split(/[,，]/)
    .map(answer => answer.trim())
    .filter(Boolean))];
}

function normalizeAnswer(type, value) {
  const raw = String(value || "").trim();
  if (type !== "ox") return raw;
  const compact = raw.replace(/\s+/g, "").toLowerCase();
  if (["o", "○", "맞음", "맞다", "참", "true", "yes", "y"].includes(compact)) return "O";
  if (["x", "×", "틀림", "틀리다", "거짓", "false", "no", "n"].includes(compact)) return "X";
  return raw.toUpperCase();
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

// 단답형 → 객관식 변환용 오답 보기 생성
// 숫자·단위·분수는 값을 변형하고, 그 외에는 같은 세트의 다른 정답을 빌려온다
function makeDistractors(answer, answerPool = []) {
  const raw = String(answer).trim();
  const numeric = Number(raw.replace(/,/g, ""));
  if (raw !== "" && Number.isFinite(numeric)) {
    const candidates = [numeric + 1, numeric - 1, numeric * 10, numeric / 10, numeric + 10, numeric - 10]
      .filter(value => value !== numeric && Number.isFinite(value))
      .map(formatNumber);
    return [...new Set(candidates)].slice(0, 3);
  }
  // "5개", "12cm" 같은 숫자+단위
  const unitMatch = raw.match(/^(\d+(?:\.\d+)?)\s*([^\d\s.,]{1,6})$/);
  if (unitMatch) {
    const base = Number(unitMatch[1]);
    const unit = unitMatch[2];
    return [base + 1, Math.max(0, base - 1), base * 2]
      .map(value => `${formatNumber(value)}${unit}`)
      .filter(value => value !== raw)
      .slice(0, 3);
  }
  // "3/4" 또는 "{3/4}" 분수
  const fracMatch = raw.match(/^(\{?)(\d+)\/(\d+)\}?$/);
  if (fracMatch) {
    const [, brace, top, bottom] = fracMatch;
    const wrap = (a, b) => brace ? `{${a}/${b}}` : `${a}/${b}`;
    return [...new Set([wrap(bottom, top), wrap(Number(top) + 1, bottom), wrap(top, Number(bottom) + 1)])]
      .filter(value => value !== raw)
      .slice(0, 3);
  }
  // 텍스트 답: 같은 세트의 다른 문제 정답을 오답으로 사용
  const others = [...new Set(answerPool.map(value => String(value).trim()).filter(value => value && value !== raw))];
  const sampled = shuffle(others).slice(0, 3);
  if (sampled.length >= 2) return sampled;
  return [...sampled, "정답이 아니에요", "다시 생각해 보세요"].slice(0, 3);
}

function shuffle(values) {
  return values
    .map(value => [Math.random(), value])
    .sort((a, b) => a[0] - b[0])
    .map(([, value]) => value);
}

// 선택형 정답이 "1" / "②" / "3번" 처럼 번호로 적힌 경우 해당 보기 텍스트로 변환
// (그대로 두면 번호가 새 보기로 추가되고 실제 정답 문장은 오답 처리된다)
function resolveChoiceAnswer(item) {
  const raw = String(item.answer || "").trim();
  if (item.type !== "choice" || !item.options?.length) return raw;
  if (item.options.some(option => option.trim() === raw)) return raw;
  const circledIndex = CIRCLED.indexOf(raw.charAt(0));
  if (circledIndex >= 0 && item.options[circledIndex]) return item.options[circledIndex];
  const numbered = raw.match(/^([1-6])\s*번?$/);
  if (numbered && item.options[Number(numbered[1]) - 1]) return item.options[Number(numbered[1]) - 1];
  return raw;
}

function toRuntimeQuiz(item, index, answerPool = []) {
  const resolvedAnswer = resolveChoiceAnswer(item);
  const aliases = acceptedAnswers(item.type, resolvedAnswer);
  const answer = aliases[0] || normalizeAnswer(item.type, resolvedAnswer);
  let options = item.type === "ox" ? ["O", "X"] : item.options.slice();
  if (item.type === "short" && options.length < 2) {
    const oxAnswer = normalizeAnswer("ox", answer);
    if (["O", "X"].includes(oxAnswer)) {
      // 답이 O/X 계열인 단답형은 O/X 보기로 출제
      options = ["O", "X"];
      if (!aliases.includes(oxAnswer)) aliases.push(oxAnswer);
    } else {
      options = [answer, ...makeDistractors(answer, answerPool)];
    }
  }
  if (!options.some(option => aliases.includes(option.trim()))) options.push(answer);
  options = [...new Set(options.map(option => option.trim()).filter(Boolean))].slice(0, 6);
  if (options.length < 2) throw new Error(`${index + 1}번 문제의 보기가 부족합니다.`);
  const randomized = shuffle(options);
  const correctIndex = randomized.findIndex(option => aliases.includes(option));
  if (correctIndex < 0) throw new Error(`${index + 1}번 문제의 정답을 보기에서 찾지 못했습니다.`);
  return {
    id: `custom-${index + 1}`,
    type: item.type,
    difficulty: item.difficulty,
    question: item.question,
    options: randomized,
    correctIndex,
    acceptedAnswers: aliases,
    explanation: item.explanation || "교사가 등록한 맞춤 문제입니다."
  };
}

function activeQuestionCount() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved.length : 0;
  } catch {
    return 0;
  }
}

function saveDraft() {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(state.questions.map(normalizeQuestion)));
}

function saveRuntimeQuestions() {
  const candidates = state.questions
    .map((item, index) => ({ item: normalizeQuestion(item), index }))
    .filter(({ item }) => item.question.trim() && acceptedAnswers(item.type, item.answer).length > 0);
  if (!candidates.length) throw new Error("게임에 적용할 문제가 없습니다. 문제와 정답을 먼저 입력하세요.");
  // 텍스트 단답형의 오답 보기 재료: 같은 세트의 다른 단답형 정답들 (O/X 계열 제외)
  const answerPool = candidates
    .filter(({ item }) => item.type === "short" && !["O", "X"].includes(normalizeAnswer("ox", item.answer)))
    .map(({ item }) => item.answer);
  const runtime = candidates.map(({ item, index }) => toRuntimeQuiz(item, index, answerPool));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(runtime));
  localStorage.setItem(TITLE_KEY, state.title.trim() || "맞춤 퀴즈");
  saveDraft();
  return { saved: runtime.length, skipped: state.questions.length - runtime.length };
}

async function loadXlsx() {
  if (window.XLSX) return window.XLSX;
  await new Promise((resolve, reject) => {
    const script = el("script", { src: XLSX_URL, onload: resolve, onerror: reject });
    document.head.append(script);
  });
  return window.XLSX;
}

function styles() {
  const css = `
    .teacher-fab{position:fixed;right:18px;bottom:18px;z-index:2147483640;border:0;border-radius:999px;background:#14532d;color:white;font-weight:800;padding:12px 16px;box-shadow:0 12px 30px rgba(0,0,0,.28);cursor:pointer}
    .teacher-backdrop{position:fixed;inset:0;z-index:2147483641;background:rgba(15,23,42,.62);display:flex;align-items:center;justify-content:center;padding:18px}
    .teacher-modal{width:min(980px,100%);max-height:92vh;overflow:auto;background:#fff;color:#111827;border-radius:10px;box-shadow:0 22px 60px rgba(0,0,0,.35);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .teacher-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:16px 18px;border-bottom:1px solid #e5e7eb}
    .teacher-head h2{margin:0;font-size:20px}
    .teacher-body{padding:18px;display:grid;gap:14px}
    .teacher-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .teacher-field{display:grid;gap:6px}
    .teacher-field label{font-weight:700;font-size:13px;color:#374151}
    .teacher-field input,.teacher-field textarea,.teacher-field select{border:1px solid #cbd5e1;border-radius:8px;padding:10px;font:inherit;color:#111827;background:#fff}
    .teacher-field textarea{min-height:150px;resize:vertical}
    .teacher-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .teacher-btn{border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#111827;font-weight:700;padding:9px 12px;cursor:pointer}
    .teacher-btn.primary{background:#14532d;color:#fff;border-color:#14532d}
    .teacher-btn.danger{background:#991b1b;color:#fff;border-color:#991b1b}
    .teacher-list{display:grid;gap:10px}
    .teacher-card{border:1px solid #e5e7eb;border-radius:8px;padding:12px;display:grid;gap:8px;background:#f8fafc}
    .teacher-card textarea{min-height:72px}
    .teacher-small{font-size:12px;color:#64748b}
    .teacher-status{font-weight:700;color:#14532d}
    @media(max-width:720px){.teacher-grid{grid-template-columns:1fr}.teacher-modal{max-height:96vh}.teacher-fab{right:12px;bottom:12px}}
  `;
  document.head.append(el("style", { text: css }));
}

function questionCard(item, index) {
  const type = el("select", { onchange: event => { item.type = event.target.value; renderModal(); } }, [
    el("option", { value: "choice", text: "선다형" }),
    el("option", { value: "short", text: "단답형" }),
    el("option", { value: "ox", text: "OX형" })
  ]);
  type.value = item.type;

  return el("div", { className: "teacher-card" }, [
    el("div", { className: "teacher-row" }, [
      el("strong", { text: `${index + 1}번` }),
      type,
      el("button", { className: "teacher-btn danger", text: "삭제", onclick: () => { state.questions.splice(index, 1); saveDraft(); renderModal(); } })
    ]),
    el("div", { className: "teacher-field" }, [
      el("label", { text: "문제" }),
      el("textarea", { oninput: event => { item.question = event.target.value; saveDraft(); } }, [document.createTextNode(item.question)])
    ]),
    el("div", { className: "teacher-grid" }, [
      el("div", { className: "teacher-field" }, [
        el("label", { text: item.type === "choice" ? "보기, 줄바꿈 구분" : "보조 보기, 줄바꿈 구분" }),
        el("textarea", { oninput: event => { item.options = cleanLines(event.target.value); saveDraft(); } }, [document.createTextNode(item.options.join("\n"))])
      ]),
      el("div", { className: "teacher-field" }, [
        el("label", { text: "정답" }),
        el("input", { value: item.answer, placeholder: "정답을 입력하세요", oninput: event => { item.answer = event.target.value; saveDraft(); } }),
        el("span", { className: "teacher-small", text: "단답형은 콤마로 여러 정답을 넣을 수 있습니다. 예: 침식, 침식 작용, 침식작용" })
      ])
    ])
  ]);
}

let modalRoot;
function renderModal(message = "") {
  if (!modalRoot) return;
  modalRoot.innerHTML = "";
  const textarea = el("textarea", { placeholder: "ZEP Quiz에서 드래그 복사한 문제 텍스트를 붙여넣으세요." });
  const body = state.authed ? [
    el("div", { className: "teacher-grid" }, [
      el("div", { className: "teacher-field" }, [
        el("label", { text: "문제 세트 이름" }),
        el("input", { value: state.title, oninput: event => { state.title = event.target.value; localStorage.setItem(TITLE_KEY, state.title); } })
      ]),
      el("div", { className: "teacher-field" }, [
        el("label", { text: "엑셀/CSV 가져오기" }),
        el("input", { type: "file", accept: ".xlsx,.xls,.csv", onchange: async event => {
          const file = event.target.files?.[0];
          if (!file) return;
          if (/\.csv$/i.test(file.name)) {
            state.questions.push(...rowsToQuestions(csvRows(await file.text())));
          } else {
            const XLSX = await loadXlsx();
            const workbook = XLSX.read(await file.arrayBuffer());
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            state.questions.push(...rowsToQuestions(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" })));
          }
          saveDraft();
          renderModal(`${file.name}에서 편집 목록으로 가져왔습니다. 게임에는 아직 적용되지 않았습니다.`);
        } })
      ])
    ]),
    el("div", { className: "teacher-field" }, [
      el("label", { text: "드래그 복사 붙여넣기" }),
      textarea,
      el("div", { className: "teacher-row" }, [
        el("button", { className: "teacher-btn", text: "붙여넣기 가져오기", onclick: () => {
          const parsed = parseZep(textarea.value);
          state.questions.push(...parsed);
          saveDraft();
          renderModal(`${parsed.length}개 문제를 편집 목록으로 가져왔습니다. 정답 확인 후 게임에 적용하세요.`);
        } }),
        el("button", { className: "teacher-btn", text: "수동 문제 추가", onclick: () => {
          state.questions.push(normalizeQuestion({ type: "choice", question: "", options: ["", "", "", ""], answer: "" }));
          saveDraft();
          renderModal();
        } }),
        el("button", { className: "teacher-btn primary", text: "게임에 적용 후 새로고침", onclick: () => {
          try {
            const result = saveRuntimeQuestions();
            if (result.skipped > 0) {
              window.alert(`${result.saved}문제를 게임에 적용합니다. 정답이 비어 있는 ${result.skipped}문제는 제외했습니다.`);
            }
            location.reload();
          } catch (error) {
            renderModal(error.message);
          }
        } }),
        el("button", { className: "teacher-btn danger", text: "맞춤 문제 해제", onclick: () => {
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(TITLE_KEY);
          localStorage.removeItem(DRAFT_KEY);
          location.reload();
        } })
      ])
    ]),
    el("div", { className: "teacher-status", text: message || `편집 목록: ${state.questions.length}문제 / 현재 게임 적용: ${activeQuestionCount()}문제` }),
    el("div", { className: "teacher-list" }, state.questions.map(questionCard))
  ] : [
    el("div", { className: "teacher-field" }, [
      el("label", { text: "교사 비밀번호" }),
      el("input", { type: "password", autocomplete: "current-password", onkeydown: async event => {
        if (event.key !== "Enter") return;
        await authenticate(event.target.value);
      } })
    ]),
    el("div", { className: "teacher-row" }, [
      el("button", { className: "teacher-btn primary", text: "교사 모드 열기", onclick: async event => {
        const input = event.currentTarget.closest(".teacher-body").querySelector("input");
        await authenticate(input.value);
      } })
    ]),
    el("div", { className: "teacher-small", text: message || "비밀번호는 서버 환경변수로 확인합니다." })
  ];

  modalRoot.append(el("div", { className: "teacher-backdrop" }, [
    el("section", { className: "teacher-modal" }, [
      el("div", { className: "teacher-head" }, [
        el("h2", { text: "교사 문제 등록" }),
        el("button", { className: "teacher-btn", text: "닫기", onclick: closeModal })
      ]),
      el("div", { className: "teacher-body" }, body)
    ])
  ]));
}

async function authenticate(passcode) {
  try {
    const response = await fetch("/api/teacher-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode })
    });
    if (!response.ok) throw new Error("비밀번호가 맞지 않거나 서버 설정이 없습니다.");
    localStorage.setItem(AUTH_KEY, String(Date.now() + 1000 * 60 * 60 * 8));
    state.authed = true;
    renderModal("교사 모드가 열렸습니다.");
  } catch (error) {
    renderModal(error.message);
  }
}

function openModal() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "[]");
    if (Array.isArray(draft) && draft.length) {
      state.questions = draft.map(normalizeQuestion);
    } else {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    state.questions = Array.isArray(saved) ? saved.map(item => normalizeQuestion({
      type: item.type,
      question: item.question,
      options: item.options,
      answer: Array.isArray(item.acceptedAnswers) && item.acceptedAnswers.length ? item.acceptedAnswers.join(", ") : item.options?.[item.correctIndex] || "",
      explanation: item.explanation,
      difficulty: item.difficulty
    })) : [];
    }
  } catch {
    state.questions = [];
  }
  modalRoot = el("div");
  document.body.append(modalRoot);
  renderModal();
}

function closeModal() {
  modalRoot?.remove();
  modalRoot = null;
}

styles();
document.addEventListener("DOMContentLoaded", () => {
  document.body.append(el("button", { className: "teacher-fab", text: "교사 모드", onclick: openModal }));
});
