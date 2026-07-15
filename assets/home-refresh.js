const replacements = new Map([
  ["Quiz Survivor", "Quiz Quest Arena"],
  ["Survivor", "Quest Arena"],
  ["퀴즈를 맞혀 무기를 강화하고\n몬스터의 파도에서 살아남으세요!", "문제를 풀어 스킬을 강화하고\n클래스 챌린지를 돌파하세요!"],
  ["퀴즈를 맞혀 무기를 강화하고", "문제를 풀어 스킬을 강화하고"],
  ["몬스터의 파도에서 살아남으세요!", "클래스 챌린지를 돌파하세요!"],
  ["© 2026 Quiz Survivor", "© 2026 Quiz Quest Arena"]
]);

const wordReplacements = [
  [/몬스터/g, "챌린지"],
  [/무기/g, "스킬"],
  [/수정/g, "코어"],
  [/최종 보스/g, "최종 챌린지"],
  [/무기 도감/g, "스킬 도감"],
  [/생존/g, "도전"],
  [/처치/g, "해결"]
];

const HERO_CLASS_KEY = "qq_hero_class";
const heroClasses = [
  { id: "mage", name: "마법사", sprite: "./assets/generated/hero_mage_idle_strip.png", desc: "화력과 쿨다운이 조금 좋고 체력이 낮음", stats: "공격 +7% · 쿨다운 -4% · 체력 -4%" },
  { id: "knight", name: "검사", sprite: "./assets/generated/hero_knight_idle_strip.png", desc: "체력이 조금 높고 안정적인 기본형", stats: "체력 +8% · 공격 +2% · 속도 -2%" },
  { id: "archer", name: "궁수", sprite: "./assets/generated/hero_archer_idle_strip.png", desc: "이동과 회수가 조금 빠른 기동형", stats: "속도 +6% · 쿨다운 -3% · 공격 -2%" }
];

const gameModes = [
  { id: "survivor", emoji: "⚔️", name: "퀘스트 서바이버", desc: "문제를 풀어 스킬을 모으고 파도를 버텨요", tag: "지금 플레이", playable: true },
  { id: "tower", emoji: "🏰", name: "타워 디펜스", desc: "퀴즈 코인으로 타워를 세워 교실을 지켜요", tag: "지금 플레이", playable: true, href: "./tower.html" },
  { id: "lastwar", emoji: "🛡️", name: "라스트 워: 서바이벌", desc: "정답 게이트로 부대를 키워 대군을 막아요", tag: "지금 플레이", playable: true, href: "./lastwar.html" }
];

const paradeSprites = [
  "slime_green.png", "monster_fox.png", "slime_blue.png", "monster_bat.png",
  "monster_boar.png", "slime_red.png", "monster_ghost.png", "monster_wasp.png",
  "monster_crow.png", "monster_badger.png", "monster_elite_crowned.png"
];

// 다크 테마용 인라인 글자색 → 라이트 테마 잉크색 매핑
const inkColorMap = new Map([
  ["165,180,252", "#c2410c"],
  ["34,211,238", "#0369a1"],
  ["103,232,249", "#0369a1"],
  ["251,191,36", "#b45309"],
  ["252,211,77", "#b45309"],
  ["110,231,183", "#047857"],
  ["52,211,153", "#047857"],
  ["248,113,113", "#be123c"],
  ["251,113,133", "#be123c"],
  ["196,181,253", "#7c3aed"],
  ["94,234,212", "#0f766e"],
  ["163,230,53", "#4d7c0f"],
  ["250,204,21", "#a16207"],
  ["156,163,175", "#78716c"],
  ["161,161,170", "#78716c"],
  ["148,163,184", "#57534e"],
  ["107,114,128", "#57534e"],
  ["113,113,122", "#57534e"]
]);

function parseColor(value) {
  if (!value) return null;
  const rgb = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?/);
  if (rgb) return { rgb: [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])], alpha: rgb[4] === undefined ? 1 : Number(rgb[4]) };
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], alpha: 1 };
  }
  return null;
}

function luminanceOf(rgb) {
  return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
}

function remapInlineColors(root) {
  for (const el of root.querySelectorAll("[style]")) {
    const parsedText = parseColor(el.style.color);
    if (parsedText && parsedText.alpha >= 0.99) {
      const key = parsedText.rgb.join(",");
      let next = inkColorMap.get(key);
      if (!next && luminanceOf(parsedText.rgb) > 0.62) next = "#292524";
      if (next && el.style.color !== next) el.style.color = next;
    }
    // 다크 테마용 인라인 배경(불투명 초저휘도)만 투명 처리 — 반투명 백드롭은 유지
    const bgValue = el.style.backgroundColor || el.style.background;
    const parsedBg = parseColor(bgValue);
    if (parsedBg && parsedBg.alpha >= 0.99 && luminanceOf(parsedBg.rgb) < 0.12) {
      if (el.style.backgroundColor) el.style.backgroundColor = "transparent";
      else el.style.background = "transparent";
    } else if (parsedBg && parsedBg.alpha <= 0.2 && luminanceOf(parsedBg.rgb) > 0.9) {
      // 다크 테마용 흰색 반투명 카드 배경 → 라이트 테마에서 보이도록 강화
      const next = "rgba(255, 255, 255, 0.65)";
      if (el.style.backgroundColor) el.style.backgroundColor = next;
      else el.style.background = next;
    }
    // 흰색 반투명 테두리 → 잉크색 반투명 테두리
    const parsedBorder = parseColor(el.style.borderColor);
    if (parsedBorder && parsedBorder.alpha < 0.99 && luminanceOf(parsedBorder.rgb) > 0.5) {
      el.style.borderColor = "rgba(41, 37, 36, 0.35)";
    }
  }
}

function rewriteTextNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const original = node.nodeValue || "";
    let value = original;
    const next = replacements.get(node.nodeValue);
    if (next) value = next;
    else if (/학년\s+학기\s+「맞춤 퀴즈」/.test(value)) {
      value = value.replace(/학년\s+학기\s+「맞춤 퀴즈」/, "맞춤 퀴즈");
    }
    for (const [pattern, replacement] of wordReplacements) {
      value = value.replace(pattern, replacement);
    }
    if (value !== original) {
      node.nodeValue = value;
    }
  }
}

function markHome() {
  const root = document.getElementById("root");
  if (!root) return;
  document.body.classList.add("qq-redesign");
  const inGame = Boolean(root.querySelector("canvas"));
  document.body.classList.toggle("qq-ingame", inGame);
  rewriteTextNodes(root);
  if (inGame) {
    document.body.classList.remove("qq-home");
    return;
  }
  ensureHeroClassPicker(root);
  ensureBadgeChip(root);
  ensureModeHub(root);
  ensureParade();
  remapInlineColors(root);
  const text = root.textContent || "";
  document.body.classList.toggle("qq-home", text.includes("Quest Arena") || text.includes("맞춤 퀴즈"));
}

function currentHeroClass() {
  const saved = localStorage.getItem(HERO_CLASS_KEY);
  return heroClasses.some(item => item.id === saved) ? saved : "knight";
}

function ensureHeroClassPicker(root) {
  if (!root.querySelector("#nickname-input") || root.querySelector(".qq-class-picker")) return;
  const difficultyLabel = [...root.querySelectorAll("label")].find(label => label.textContent.trim() === "난이도");
  const difficultyBlock = difficultyLabel?.parentElement;
  if (!difficultyBlock?.parentElement) return;

  const picker = document.createElement("div");
  picker.className = "qq-class-picker";
  picker.innerHTML = `
    <div class="qq-class-title">캐릭터</div>
    <div class="qq-class-grid">
      ${heroClasses.map(item => `
        <button type="button" class="qq-class-card" data-hero-class="${item.id}">
          <span class="qq-class-sprite" style="background-image:url('${item.sprite}')"></span>
          <strong>${item.name}</strong>
          <small>${item.desc}</small>
          <em>${item.stats}</em>
        </button>
      `).join("")}
    </div>
  `;
  difficultyBlock.parentElement.insertBefore(picker, difficultyBlock);

  const sync = () => {
    const selected = currentHeroClass();
    picker.querySelectorAll("[data-hero-class]").forEach(button => {
      button.classList.toggle("selected", button.dataset.heroClass === selected);
    });
  };
  picker.addEventListener("click", event => {
    const button = event.target.closest("[data-hero-class]");
    if (!button) return;
    localStorage.setItem(HERO_CLASS_KEY, button.dataset.heroClass);
    sync();
  });
  sync();
}

function findHomeStartButton(root) {
  return [...root.querySelectorAll("button")].find(button =>
    button.textContent.includes("시작하기") && button.textContent.includes("닉네임"));
}

function ensureBadgeChip(root) {
  if (root.querySelector(".qq-badge-chip")) return;
  const startButton = findHomeStartButton(root);
  if (!startButton) return;
  const title = root.querySelector("h1");
  if (!title?.parentElement) return;
  const chip = document.createElement("div");
  chip.className = "qq-badge-chip";
  chip.textContent = "📚 초등 수학 · 교사 맞춤 문제 지원";
  title.parentElement.insertBefore(chip, title);
}

function ensureModeHub(root) {
  if (root.querySelector(".qq-mode-hub")) return;
  const startButton = findHomeStartButton(root);
  const cardRow = startButton?.parentElement;
  if (!cardRow?.parentElement) return;

  const hub = document.createElement("div");
  hub.className = "qq-mode-hub";
  hub.innerHTML = `
    <div class="qq-mode-title">🎮 어떤 게임으로 문제를 풀까?</div>
    <div class="qq-mode-grid">
      ${gameModes.map(mode => mode.playable ? `
        <button type="button" class="qq-mode-card" data-game-mode="${mode.id}">
          <span class="qq-mode-emoji">${mode.emoji}</span>
          <strong>${mode.name}</strong>
          <small>${mode.desc}</small>
          <span class="qq-mode-tag play">${mode.tag}</span>
        </button>
      ` : `
        <div class="qq-mode-card locked">
          <span class="qq-mode-emoji">${mode.emoji}</span>
          <strong>${mode.name}</strong>
          <small>${mode.desc}</small>
          <span class="qq-mode-tag soon">${mode.tag}</span>
        </div>
      `).join("")}
    </div>
  `;
  cardRow.parentElement.insertBefore(hub, cardRow);
  hub.addEventListener("click", event => {
    const card = event.target.closest("[data-game-mode]");
    if (!card) return;
    const mode = gameModes.find(item => item.id === card.dataset.gameMode);
    if (mode?.href) {
      window.location.href = mode.href;
      return;
    }
    const root = document.getElementById("root");
    const start = root && findHomeStartButton(root);
    if (start) start.click();
  });
}

function ensureParade() {
  if (document.querySelector(".qq-parade")) return;
  const parade = document.createElement("div");
  parade.className = "qq-parade";
  parade.setAttribute("aria-hidden", "true");
  parade.innerHTML = `
    <div class="qq-parade-track">
      ${paradeSprites.map(file => `<img src="./assets/generated/${file}" alt="">`).join("")}
    </div>
  `;
  document.body.appendChild(parade);
}

document.addEventListener("DOMContentLoaded", () => {
  document.body.classList.add("qq-redesign");
  markHome();
  const root = document.getElementById("root");
  if (!root) return;
  let scheduled = false;
  const scheduleMark = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      markHome();
    });
  };
  new MutationObserver(scheduleMark).observe(root, { childList: true, subtree: true, characterData: true });
});
