const GRID_RESOLUTION = 0.25;
const GRID_COLS = 360 / GRID_RESOLUTION;
const GRID_ROWS = 180 / GRID_RESOLUTION;

const NEIGHBORS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

// Major canals and narrow straits that texture sampling cannot resolve.
// Each entry is a corridor of forced-ocean cells between two lat/lon endpoints.
const FORCED_WATERWAYS = [
  // Suez Canal
  { from: { lat: 31.3, lon: 32.2 }, to: { lat: 30.0, lon: 32.55 }, halfWidth: 3 },
  // Panama Canal
  { from: { lat: 9.4, lon: -79.95 }, to: { lat: 8.9, lon: -79.5 }, halfWidth: 3 },
  // Kiel Canal
  { from: { lat: 54.4, lon: 9.1 }, to: { lat: 54.4, lon: 10.2 }, halfWidth: 2 },
  // Bosphorus
  { from: { lat: 41.35, lon: 28.95 }, to: { lat: 41.0, lon: 29.1 }, halfWidth: 3 },
  // Dardanelles
  { from: { lat: 40.45, lon: 26.2 }, to: { lat: 40.0, lon: 26.7 }, halfWidth: 3 },
  // Strait of Gibraltar
  { from: { lat: 36.1, lon: -5.6 }, to: { lat: 35.8, lon: -5.3 }, halfWidth: 3 },
  // Strait of Malacca (narrowest point)
  { from: { lat: 2.5, lon: 101.5 }, to: { lat: 1.2, lon: 103.8 }, halfWidth: 3 },
  // Strait of Hormuz
  { from: { lat: 26.6, lon: 56.0 }, to: { lat: 26.2, lon: 56.5 }, halfWidth: 3 },
  // Strait of Messina
  { from: { lat: 38.3, lon: 15.55 }, to: { lat: 38.1, lon: 15.7 }, halfWidth: 2 },
  // English Channel (Dover Strait)
  { from: { lat: 51.1, lon: 1.2 }, to: { lat: 50.9, lon: 1.6 }, halfWidth: 3 },
  // Strait of Taiwan
  { from: { lat: 25.5, lon: 119.5 }, to: { lat: 24.0, lon: 120.0 }, halfWidth: 4 },
  // Korea Strait
  { from: { lat: 34.5, lon: 128.5 }, to: { lat: 33.5, lon: 129.5 }, halfWidth: 4 },
  // Bab-el-Mandeb (Red Sea entrance)
  { from: { lat: 12.7, lon: 43.2 }, to: { lat: 12.3, lon: 43.5 }, halfWidth: 3 },
];

export function createOceanNavGrid({ isOcean }) {
  const grid = new Uint8Array(GRID_ROWS * GRID_COLS);

  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const lat = 90 - (row + 0.5) * GRID_RESOLUTION;
      const lon = -180 + (col + 0.5) * GRID_RESOLUTION;
      grid[row * GRID_COLS + col] = isOcean(lat, lon) ? 1 : 0;
    }
  }

  // Force canals and narrow straits as navigable
  for (const waterway of FORCED_WATERWAYS) {
    forceWaterwayOpen(grid, waterway);
  }

  return {
    findPath(startLat, startLon, endLat, endLon) {
      const start = latLonToCell(startLat, startLon);
      const end = latLonToCell(endLat, endLon);
      const startCell = findNearestOcean(grid, start.row, start.col);
      const endCell = findNearestOcean(grid, end.row, end.col);

      if (!startCell || !endCell) {
        return [];
      }

      const rawPath = astar(grid, startCell, endCell);
      if (rawPath.length === 0) {
        return [];
      }

      const smoothed = smoothPath(rawPath, grid);

      const waypoints = smoothed.map((cell) => ({
        lat: 90 - (cell.row + 0.5) * GRID_RESOLUTION,
        lon: -180 + (cell.col + 0.5) * GRID_RESOLUTION,
      }));

      waypoints[0] = { lat: startLat, lon: startLon };
      waypoints[waypoints.length - 1] = { lat: endLat, lon: endLon };

      return waypoints;
    },
    isNavigable(lat, lon) {
      const cell = latLonToCell(lat, lon);
      return grid[cell.row * GRID_COLS + cell.col] === 1;
    },
  };
}

function latLonToCell(lat, lon) {
  const row = Math.floor((90 - lat) / GRID_RESOLUTION);
  const col = Math.floor((lon + 180) / GRID_RESOLUTION);
  return {
    row: Math.max(0, Math.min(GRID_ROWS - 1, row)),
    col: ((col % GRID_COLS) + GRID_COLS) % GRID_COLS,
  };
}

function forceWaterwayOpen(grid, { from, to, halfWidth }) {
  const startCell = latLonToCell(from.lat, from.lon);
  const endCell = latLonToCell(to.lat, to.lon);
  const dr = endCell.row - startCell.row;
  const dc = endCell.col - startCell.col;
  const steps = Math.max(Math.abs(dr), Math.abs(dc));
  if (steps === 0) return;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const centerRow = Math.round(startCell.row + dr * t);
    const centerCol = Math.round(startCell.col + dc * t);

    for (let ro = -halfWidth; ro <= halfWidth; ro++) {
      for (let co = -halfWidth; co <= halfWidth; co++) {
        const r = centerRow + ro;
        const c = ((centerCol + co) % GRID_COLS + GRID_COLS) % GRID_COLS;
        if (r >= 0 && r < GRID_ROWS) {
          grid[r * GRID_COLS + c] = 1;
        }
      }
    }
  }
}

function findNearestOcean(grid, row, col) {
  if (grid[row * GRID_COLS + col] === 1) {
    return { row, col };
  }

  const visited = new Set();
  const queue = [{ row, col }];
  visited.add(row * GRID_COLS + col);

  while (queue.length > 0) {
    const current = queue.shift();
    for (const [dr, dc] of NEIGHBORS) {
      const nr = current.row + dr;
      const nc = ((current.col + dc) % GRID_COLS + GRID_COLS) % GRID_COLS;
      if (nr < 0 || nr >= GRID_ROWS) {
        continue;
      }
      const key = nr * GRID_COLS + nc;
      if (visited.has(key)) {
        continue;
      }
      visited.add(key);
      if (grid[key] === 1) {
        return { row: nr, col: nc };
      }
      queue.push({ row: nr, col: nc });
    }
  }

  return null;
}

function astar(grid, start, end) {
  const openSet = new MinHeap();
  const cameFrom = new Map();
  const gScore = new Map();

  const startKey = start.row * GRID_COLS + start.col;
  const endKey = end.row * GRID_COLS + end.col;

  gScore.set(startKey, 0);
  const startH = heuristic(start, end);
  openSet.push({ key: startKey, row: start.row, col: start.col, f: startH });

  let iterations = 0;
  const maxIterations = 800_000;

  while (openSet.size() > 0 && iterations < maxIterations) {
    iterations++;
    const current = openSet.pop();

    if (current.key === endKey) {
      return reconstructPath(cameFrom, current);
    }

    const currentG = gScore.get(current.key) ?? Infinity;

    for (const [dr, dc] of NEIGHBORS) {
      const nr = current.row + dr;
      const nc = ((current.col + dc) % GRID_COLS + GRID_COLS) % GRID_COLS;

      if (nr < 0 || nr >= GRID_ROWS) {
        continue;
      }
      if (grid[nr * GRID_COLS + nc] !== 1) {
        continue;
      }

      const neighborKey = nr * GRID_COLS + nc;
      const isDiag = dr !== 0 && dc !== 0;
      const moveCost = isDiag ? 1.414 : 1.0;
      const tentativeG = currentG + moveCost;

      if (tentativeG < (gScore.get(neighborKey) ?? Infinity)) {
        cameFrom.set(neighborKey, current);
        gScore.set(neighborKey, tentativeG);
        const f = tentativeG + heuristic({ row: nr, col: nc }, end);
        openSet.push({ key: neighborKey, row: nr, col: nc, f });
      }
    }
  }

  return [];
}

function heuristic(a, b) {
  const dr = a.row - b.row;
  const dc1 = Math.abs(a.col - b.col);
  const dc2 = GRID_COLS - dc1;
  const dc = Math.min(dc1, dc2);
  return Math.sqrt(dr * dr + dc * dc);
}

function reconstructPath(cameFrom, current) {
  const path = [{ row: current.row, col: current.col }];
  let key = current.key;
  while (cameFrom.has(key)) {
    const node = cameFrom.get(key);
    path.unshift({ row: node.row, col: node.col });
    key = node.key;
  }
  return path;
}

// String-pulling with conservative line-of-sight.
// Limits jump distance so the A* land-avoidance is preserved over long stretches.
function smoothPath(path, grid) {
  if (path.length <= 2) {
    return path;
  }

  const MAX_JUMP = 60;
  const result = [path[0]];
  let current = 0;

  while (current < path.length - 1) {
    let farthest = current + 1;
    const limit = Math.min(path.length - 1, current + MAX_JUMP);
    for (let i = limit; i > current + 1; i--) {
      if (hasLineOfSight(grid, path[current], path[i])) {
        farthest = i;
        break;
      }
    }
    result.push(path[farthest]);
    current = farthest;
  }

  return result;
}

// Checks every cell the line passes through (supercover / fat line).
// Uses floor+ceil at each sample to catch all cells the line crosses,
// preventing shortcuts that squeeze between diagonal land cells.
function hasLineOfSight(grid, from, to) {
  const dr = to.row - from.row;
  let dc = to.col - from.col;
  if (dc > GRID_COLS / 2) dc -= GRID_COLS;
  if (dc < -GRID_COLS / 2) dc += GRID_COLS;

  const steps = Math.max(Math.abs(dr), Math.abs(dc));
  if (steps === 0) return true;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const exactRow = from.row + dr * t;
    const exactCol = from.col + dc * t;

    const r0 = Math.floor(exactRow);
    const r1 = Math.ceil(exactRow);
    const c0 = Math.floor(exactCol);
    const c1 = Math.ceil(exactCol);

    const rows = r0 === r1 ? [r0] : [r0, r1];
    const cols = c0 === c1 ? [c0] : [c0, c1];

    for (const r of rows) {
      if (r < 0 || r >= GRID_ROWS) return false;
      for (const c of cols) {
        const wc = ((c % GRID_COLS) + GRID_COLS) % GRID_COLS;
        if (grid[r * GRID_COLS + wc] !== 1) return false;
      }
    }
  }

  return true;
}

class MinHeap {
  constructor() {
    this.data = [];
  }
  size() {
    return this.data.length;
  }
  push(item) {
    this.data.push(item);
    this._bubbleUp(this.data.length - 1);
  }
  pop() {
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0) {
      this.data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }
  _bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[i].f >= this.data[parent].f) {
        break;
      }
      [this.data[i], this.data[parent]] = [this.data[parent], this.data[i]];
      i = parent;
    }
  }
  _sinkDown(i) {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this.data[l].f < this.data[smallest].f) {
        smallest = l;
      }
      if (r < n && this.data[r].f < this.data[smallest].f) {
        smallest = r;
      }
      if (smallest === i) {
        break;
      }
      [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
      i = smallest;
    }
  }
}
