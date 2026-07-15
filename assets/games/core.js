// 공용 게임 코어: 문제은행 로더, 퀴즈 모달, 스프라이트 로더, 사운드
// tower.html / lastwar.html 두 게임이 함께 사용한다.

const CUSTOM_QUESTIONS_KEY = "quiz_survivor_custom_questions";
const CUSTOM_TITLE_KEY = "quiz_survivor_custom_title";
const MUTE_KEY = "qq_games_muted";

/* ------------------------------------------------------------------ */
/* 문제은행                                                            */
/* ------------------------------------------------------------------ */

export async function loadQuestions() {
  try {
    const saved = JSON.parse(localStorage.getItem(CUSTOM_QUESTIONS_KEY) || "[]");
    if (Array.isArray(saved) && saved.length) {
      return {
        title: localStorage.getItem(CUSTOM_TITLE_KEY) || "맞춤 퀴즈",
        questions: saved,
        custom: true
      };
    }
  } catch {
    /* 손상된 저장값은 기본 문제은행으로 대체 */
  }
  const mod = await import("../g6-1-1-CLDU9m4L.js");
  const questions = mod.quizzes || mod.default?.quizzes || [];
  return { title: mod.title || "분수의 나눗셈", questions, custom: false };
}

export function createQuizPicker(questions) {
  let pool = [];
  const reshuffle = () => {
    pool = [...questions].sort(() => Math.random() - 0.5);
  };
  reshuffle();
  return {
    next() {
      if (!pool.length) reshuffle();
      return pool.pop() || null;
    },
    size: questions.length
  };
}

/* ------------------------------------------------------------------ */
/* 수식 렌더링: {3/4}, {1 2/3} → HTML 분수                              */
/* ------------------------------------------------------------------ */

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function formatMath(text) {
  return escapeHtml(text).replace(/\{(?:(\d+)\s+)?(\d+)\/(\d+)\}/g, (_, whole, top, bottom) => {
    const frac = `<span class="qc-frac"><span class="qc-top">${top}</span><span class="qc-bottom">${bottom}</span></span>`;
    return whole ? `<span class="qc-mixed">${whole}</span>${frac}` : frac;
  });
}

/* ------------------------------------------------------------------ */
/* 퀴즈 모달                                                           */
/* ------------------------------------------------------------------ */

let quizStyleInjected = false;

function ensureQuizStyle() {
  if (quizStyleInjected) return;
  quizStyleInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    .qc-overlay { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center;
      justify-content: center; padding: 16px; background: rgba(60, 45, 24, 0.55); }
    .qc-card { width: min(560px, 100%); padding: 22px 20px 18px; background: #fffdf6;
      border: 3px solid #292524; border-radius: 18px; box-shadow: 6px 6px 0 rgba(41,37,36,.85);
      color: #292524; font-family: "Plus Jakarta Sans", system-ui, sans-serif; }
    .qc-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
    .qc-tag { padding: 3px 12px; font-family: "Jua", sans-serif; font-size: 13px; color: #292524;
      background: #fbbf24; border: 2px solid #292524; border-radius: 999px; }
    .qc-timer { flex: 1; height: 12px; margin-left: 8px; background: #f0e4cd;
      border: 2px solid #292524; border-radius: 999px; overflow: hidden; }
    .qc-timer i { display: block; height: 100%; background: linear-gradient(90deg, #4ade80, #16a34a);
      transition: width .2s linear; }
    .qc-question { min-height: 52px; margin: 4px 0 14px; font-size: 16.5px; line-height: 1.55; font-weight: 600; }
    .qc-options { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .qc-option { padding: 12px 10px; font: inherit; font-weight: 700; font-size: 15px; color: #292524;
      background: #fff; border: 3px solid rgba(41,37,36,.45); border-radius: 14px; cursor: pointer;
      transition: transform .12s ease, box-shadow .12s ease; }
    .qc-option:hover { transform: translate(-1px,-1px); box-shadow: 4px 4px 0 rgba(41,37,36,.85); }
    .qc-option.correct { background: #dcfce7; border-color: #16a34a; }
    .qc-option.wrong { background: #fee2e2; border-color: #e11d48; }
    .qc-option:disabled { cursor: default; }
    .qc-explain { margin-top: 12px; padding: 10px 12px; font-size: 13px; line-height: 1.5;
      background: #fff7e6; border: 2px dashed rgba(41,37,36,.4); border-radius: 12px; }
    .qc-frac { display: inline-flex; flex-direction: column; align-items: center; vertical-align: middle;
      margin: 0 2px; line-height: 1.05; font-weight: 800; }
    .qc-frac .qc-top { padding: 0 4px; border-bottom: 2px solid currentColor; }
    .qc-frac .qc-bottom { padding: 0 4px; }
    .qc-mixed { margin-right: 2px; font-weight: 800; }
    @media (max-width: 480px) { .qc-options { grid-template-columns: 1fr; } }
  `;
  document.head.appendChild(style);
}

// 퀴즈 하나를 모달로 출제한다. resolve: { correct, timedOut }
export function showQuiz(question, { timeLimit = 20, tag = "퀴즈 찬스!" } = {}) {
  ensureQuizStyle();
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "qc-overlay";
    overlay.innerHTML = `
      <div class="qc-card" role="dialog" aria-modal="true">
        <div class="qc-head">
          <span class="qc-tag">${escapeHtml(tag)}</span>
          <div class="qc-timer"><i style="width:100%"></i></div>
        </div>
        <div class="qc-question">${formatMath(question.question)}</div>
        <div class="qc-options">
          ${question.options.map((option, index) =>
            `<button type="button" class="qc-option" data-index="${index}">${formatMath(option)}</button>`
          ).join("")}
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const bar = overlay.querySelector(".qc-timer i");
    const buttons = [...overlay.querySelectorAll(".qc-option")];
    const startedAt = performance.now();
    let settled = false;

    const timer = setInterval(() => {
      const remain = Math.max(0, 1 - (performance.now() - startedAt) / (timeLimit * 1000));
      bar.style.width = `${remain * 100}%`;
      if (remain <= 0) finish(-1, true);
    }, 200);

    function finish(chosenIndex, timedOut = false) {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      const correct = chosenIndex === question.correctIndex;
      buttons.forEach((button, index) => {
        button.disabled = true;
        if (index === question.correctIndex) button.classList.add("correct");
        else if (index === chosenIndex) button.classList.add("wrong");
      });
      if (!correct && question.explanation) {
        const explain = document.createElement("div");
        explain.className = "qc-explain";
        explain.innerHTML = `💡 ${formatMath(question.explanation)}`;
        overlay.querySelector(".qc-card").appendChild(explain);
      }
      setTimeout(() => {
        overlay.remove();
        resolve({ correct, timedOut });
      }, correct ? 900 : 2600);
    }

    buttons.forEach(button => {
      button.addEventListener("click", () => finish(Number(button.dataset.index)));
    });
  });
}

/* ------------------------------------------------------------------ */
/* 스프라이트                                                          */
/* ------------------------------------------------------------------ */

class Sprite {
  constructor(image, frames, frameWidth, frameHeight) {
    this.image = image;
    this.frames = frames;
    this.frameWidth = frameWidth;
    this.frameHeight = frameHeight;
  }

  draw(ctx, x, y, { frame = 0, scale = 1, flipX = false, rotate = 0, alpha = 1 } = {}) {
    const f = Math.floor(frame) % this.frames;
    const w = this.frameWidth * scale;
    const h = this.frameHeight * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    if (rotate) ctx.rotate(rotate);
    if (flipX) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      this.image,
      f * this.frameWidth, 0, this.frameWidth, this.frameHeight,
      -w / 2, -h / 2, w, h
    );
    ctx.restore();
  }
}

// defs: { key: [file, frames, frameW, frameH] } — frameW/H 생략 시 이미지에서 계산
export async function loadSprites(defs) {
  const entries = Object.entries(defs);
  const sprites = {};
  await Promise.all(entries.map(([key, [file, frames = 1, frameWidth, frameHeight]]) =>
    new Promise((resolvePromise, rejectPromise) => {
      const image = new Image();
      image.onload = () => {
        sprites[key] = new Sprite(
          image,
          frames,
          frameWidth || Math.floor(image.width / frames),
          frameHeight || image.height
        );
        resolvePromise();
      };
      image.onerror = () => rejectPromise(new Error(`sprite load failed: ${file}`));
      image.src = `./assets/generated/${file}`;
    })
  ));
  return sprites;
}

/* ------------------------------------------------------------------ */
/* 사운드                                                              */
/* ------------------------------------------------------------------ */

const soundCache = new Map();

export const sound = {
  get muted() {
    return localStorage.getItem(MUTE_KEY) === "1";
  },
  toggle() {
    localStorage.setItem(MUTE_KEY, this.muted ? "0" : "1");
    return this.muted;
  },
  play(file, volume = 0.5) {
    if (this.muted) return;
    let base = soundCache.get(file);
    if (!base) {
      base = new Audio(`./assets/audio/${file}`);
      soundCache.set(file, base);
    }
    const node = base.cloneNode();
    node.volume = volume;
    node.play().catch(() => {});
  }
};

/* ------------------------------------------------------------------ */
/* 유틸                                                                */
/* ------------------------------------------------------------------ */

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function distance(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

export function formatClock(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
