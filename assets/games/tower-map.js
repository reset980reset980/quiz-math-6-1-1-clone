// 타워 디펜스 타일맵 정의 + 무결성 검증 (DOM 의존성 없음 — 스모크 테스트에서도 사용)
//
// 타일 문자:
//   .  잔디 (타워 건설 가능)
//   #  길   (몬스터 이동, 건설 불가)
//   b  덤불 / r  바위 / s  표지판  (장식, 건설 불가)
//
// 규칙: 길은 좌측 가장자리 입구 1개 → 우측 가장자리 출구 1개로 끊김 없이 이어져야 하며
//       갈림길(이웃 길 타일 3개 이상)이 있으면 안 된다.

export const TILE = 60;
export const COLS = 16;
export const ROWS = 10;

export const MAPS = [
  {
    name: "1스테이지 · 학교 앞 들판",
    grid: [
      "................",
      ".s.......b......",
      "####....#####...",
      "...#....#...#..b",
      "...#....#...#...",
      "...#.b..#...#...",
      "...#....#...#.r.",
      "...######...####",
      "..r.............",
      ".........b......"
    ]
  }
];

export function tileAt(grid, col, row) {
  if (row < 0 || row >= grid.length || col < 0 || col >= grid[row].length) return null;
  return grid[row][col];
}

export function isBuildable(grid, col, row) {
  return tileAt(grid, col, row) === ".";
}

function findEdgePathTiles(grid) {
  const entries = [];
  const exits = [];
  for (let row = 0; row < grid.length; row++) {
    if (grid[row][0] === "#") entries.push([0, row]);
    if (grid[row][COLS - 1] === "#") exits.push([COLS - 1, row]);
  }
  return { entries, exits };
}

function pathNeighbors(grid, col, row) {
  return [[col + 1, row], [col - 1, row], [col, row + 1], [col, row - 1]]
    .filter(([c, r]) => tileAt(grid, c, r) === "#");
}

// 맵 무결성 검사 — 문제가 있으면 사람이 읽을 수 있는 오류 목록을 반환
export function validateMap(grid) {
  const errors = [];
  if (grid.length !== ROWS) errors.push(`행 수가 ${ROWS}가 아님 (${grid.length})`);
  grid.forEach((rowText, row) => {
    if (rowText.length !== COLS) errors.push(`${row}행 길이가 ${COLS}가 아님 (${rowText.length})`);
    [...rowText].forEach((ch, col) => {
      if (!".#brs".includes(ch)) errors.push(`(${col},${row}) 알 수 없는 타일 '${ch}'`);
    });
  });
  if (errors.length) return errors;

  const { entries, exits } = findEdgePathTiles(grid);
  if (entries.length !== 1) errors.push(`좌측 입구가 1개여야 함 (${entries.length}개)`);
  if (exits.length !== 1) errors.push(`우측 출구가 1개여야 함 (${exits.length}개)`);
  if (errors.length) return errors;

  // BFS: 입구에서 도달 가능한 길 타일 수집
  const seen = new Set();
  const queue = [entries[0]];
  seen.add(entries[0].join(","));
  while (queue.length) {
    const [col, row] = queue.shift();
    for (const [c, r] of pathNeighbors(grid, col, row)) {
      const key = `${c},${r}`;
      if (!seen.has(key)) {
        seen.add(key);
        queue.push([c, r]);
      }
    }
  }
  if (!seen.has(exits[0].join(","))) {
    errors.push(`길이 끊겨 있음 — 입구 (0,${entries[0][1]})에서 출구 (${COLS - 1},${exits[0][1]})에 도달 불가`);
  }

  // 고아 길 타일 + 갈림길 검사
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (grid[row][col] !== "#") continue;
      if (!seen.has(`${col},${row}`)) errors.push(`(${col},${row}) 길 타일이 입구와 연결되지 않음`);
      const neighborCount = pathNeighbors(grid, col, row).length;
      const isEdge = col === 0 || col === COLS - 1;
      if (neighborCount > 2) errors.push(`(${col},${row}) 갈림길 — 몬스터 경로가 모호함`);
      if (!isEdge && neighborCount < 2) errors.push(`(${col},${row}) 막다른 길`);
    }
  }
  return errors;
}

// 입구→출구를 따라가며 픽셀 웨이포인트 생성 (직선 구간은 압축)
export function buildWaypoints(grid) {
  const { entries, exits } = findEdgePathTiles(grid);
  const entry = entries[0];
  const exit = exits[0];
  const center = ([col, row]) => [col * TILE + TILE / 2, row * TILE + TILE / 2];

  const tilePath = [entry];
  let prev = null;
  let current = entry;
  while (current[0] !== exit[0] || current[1] !== exit[1]) {
    const next = pathNeighbors(grid, current[0], current[1])
      .find(([c, r]) => !prev || c !== prev[0] || r !== prev[1]);
    if (!next) break; // validateMap에서 걸러지지만 방어적으로 중단
    prev = current;
    current = next;
    tilePath.push(current);
  }

  const points = tilePath.map(center);
  const compressed = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const [ax, ay] = compressed[compressed.length - 1];
    const [bx, by] = points[i];
    const [cx, cy] = points[i + 1];
    const collinear = (ax === bx && bx === cx) || (ay === by && by === cy);
    if (!collinear) compressed.push(points[i]);
  }
  compressed.push(points[points.length - 1]);

  // 화면 밖에서 등장하고 화면 밖으로 퇴장하도록 연장
  const first = compressed[0];
  const last = compressed[compressed.length - 1];
  return [[-TILE, first[1]], ...compressed, [COLS * TILE + TILE, last[1]]];
}
