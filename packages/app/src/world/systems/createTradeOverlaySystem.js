import * as THREE from 'three';
import { latLonToVector3 } from '../geo/geoMath.js';

// --- Colors ---
const PORT_COLOR_PLAYER = 'rgba(100, 210, 160, 0.92)';
const PORT_COLOR_AI = 'rgba(140, 160, 180, 0.60)';
const PORT_RING_PLAYER = '100, 210, 160';
const PORT_RING_AI = '140, 160, 180';
const LANE_COLOR_RGB = '80, 140, 220';
const LANE_DISRUPTED_RGB = '255, 90, 70';
const CARGO_LADEN = 'rgba(255, 210, 80, 0.92)';
const CARGO_BALLAST = 'rgba(130, 155, 180, 0.45)';
const CARGO_BLOCKED = 'rgba(255, 60, 60, 0.9)';
const WAKE_COLOR = 'rgba(180, 210, 255, 0.18)';

// --- Sizes ---
const PORT_SIZE = 10;
const SHIP_SIZE = 5;    // chevron half-length
const WAKE_LENGTH = 12; // pixels behind ship
const PULSE_SPEED = 2.0;
const HORIZON_CUTOFF = 0.08;
const MAX_SEG_DEG = 1.0;

// --- Animated flow ---
// Dash pattern scrolls along lanes to show direction of oil flow.
// Speed is pixels per second of dash offset.
const FLOW_DASH_ON = 6;
const FLOW_DASH_OFF = 10;
const FLOW_SCROLL_SPEED = 30; // px/s

export function createTradeOverlaySystem({
  document,
  mountNode,
  renderer,
  camera,
  earthGroup,
  worldConfig,
}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'trade-overlay';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:3;';
  mountNode.parentElement.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const _lv = new THREE.Vector3();
  const _wp = new THREE.Vector3();
  const _wn = new THREE.Vector3();
  const _tc = new THREE.Vector3();
  const _pr = new THREE.Vector3();

  let cw = 0;
  let ch = 0;
  let portHitRegions = [];

  function syncSize() {
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const w = renderer.domElement.clientWidth;
    const h = renderer.domElement.clientHeight;
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    if (pw !== cw || ph !== ch) {
      cw = pw;
      ch = ph;
      canvas.width = pw;
      canvas.height = ph;
    }
  }

  function project(lat, lon) {
    latLonToVector3({ lat, lon, radius: worldConfig.earthRadius * 1.0015, out: _lv });
    _wp.copy(_lv).applyQuaternion(earthGroup.quaternion);
    _wn.copy(_lv).normalize().applyQuaternion(earthGroup.quaternion).normalize();
    _tc.copy(camera.position).sub(_wp).normalize();
    if (_wn.dot(_tc) < HORIZON_CUTOFF) return null;
    _pr.copy(_wp).project(camera);
    if (_pr.z < -1 || _pr.z > 1 || Math.abs(_pr.x) > 1.08 || Math.abs(_pr.y) > 1.08) return null;
    return { x: (_pr.x + 1) * 0.5 * cw, y: (1 - _pr.y) * 0.5 * ch };
  }

  // ================================================================
  //  SHIPPING LANES — animated flowing dashes showing oil direction
  // ================================================================

  function renderLanes(routes, elapsed) {
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const dashOffset = (elapsed * FLOW_SCROLL_SPEED * dpr) % ((FLOW_DASH_ON + FLOW_DASH_OFF) * dpr);

    for (const route of routes) {
      const wps = route.waypoints;
      if (!wps || wps.length < 2) continue;

      const disrupted = route.disrupted;
      const rgb = disrupted ? LANE_DISRUPTED_RGB : LANE_COLOR_RGB;
      const alpha = disrupted ? 0.35 : Math.min(0.35, 0.08 + route.volumeBpd / 5_000_000);
      const lineW = Math.max(0.7, Math.min(2.2, route.volumeBpd / 1_500_000)) * dpr;

      // Solid faint base line
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${rgb}, ${alpha * 0.5})`;
      ctx.lineWidth = lineW;
      let drawing = false;
      emitInterpolatedPath(wps, (pos) => {
        if (!drawing) { ctx.moveTo(pos.x, pos.y); drawing = true; }
        else ctx.lineTo(pos.x, pos.y);
      }, () => { drawing = false; });
      ctx.stroke();

      // Animated dash layer on top — scrolls to show flow direction
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${rgb}, ${alpha})`;
      ctx.lineWidth = lineW;
      ctx.setLineDash([FLOW_DASH_ON * dpr, FLOW_DASH_OFF * dpr]);
      ctx.lineDashOffset = -dashOffset; // negative = flows in path direction (export→import)
      drawing = false;
      emitInterpolatedPath(wps, (pos) => {
        if (!drawing) { ctx.moveTo(pos.x, pos.y); drawing = true; }
        else ctx.lineTo(pos.x, pos.y);
      }, () => { drawing = false; });
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Emit projected points along waypoints, interpolating to avoid land-cut.
  // onPoint(pos) called for each visible point, onBreak() when line must break.
  function emitInterpolatedPath(wps, onPoint, onBreak) {
    for (let i = 0; i < wps.length - 1; i++) {
      const a = wps[i];
      const b = wps[i + 1];
      const span = Math.max(Math.abs(b.lat - a.lat), Math.abs(b.lon - a.lon));
      const steps = Math.max(1, Math.ceil(span / MAX_SEG_DEG));

      for (let s = 0; s <= steps; s++) {
        if (s === 0 && i > 0) continue;
        const t = s / steps;
        const pos = project(a.lat + (b.lat - a.lat) * t, a.lon + (b.lon - a.lon) * t);
        if (!pos) { onBreak(); continue; }
        onPoint(pos);
      }
    }
  }

  // ================================================================
  //  CARGO SHIPS — directional chevrons with wake trails
  // ================================================================

  function renderCargo(ships, elapsed) {
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const sz = SHIP_SIZE * dpr;
    const wakeLen = WAKE_LENGTH * dpr;

    for (const ship of ships) {
      const pos = project(ship.lat, ship.lon);
      if (!pos) continue;

      const blocked = ship.blockaded;
      const laden = ship.phase === 'laden';
      const headingRad = (-ship.heading + 90) * Math.PI / 180;

      // --- Wake trail (behind the ship) ---
      if (!blocked) {
        const wx = pos.x - Math.cos(headingRad) * wakeLen;
        const wy = pos.y + Math.sin(headingRad) * wakeLen;
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(wx, wy);
        ctx.strokeStyle = WAKE_COLOR;
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();
      }

      // --- Chevron shape pointing in heading direction ---
      const cos = Math.cos(headingRad);
      const sin = Math.sin(headingRad);
      // Tip (front)
      const tx = pos.x + cos * sz;
      const ty = pos.y - sin * sz;
      // Left wing
      const lx = pos.x - cos * sz * 0.5 + sin * sz * 0.6;
      const ly = pos.y + sin * sz * 0.5 + cos * sz * 0.6;
      // Right wing
      const rx = pos.x - cos * sz * 0.5 - sin * sz * 0.6;
      const ry = pos.y + sin * sz * 0.5 - cos * sz * 0.6;
      // Notch (rear center)
      const nx = pos.x - cos * sz * 0.15;
      const ny = pos.y + sin * sz * 0.15;

      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(lx, ly);
      ctx.lineTo(nx, ny);
      ctx.lineTo(rx, ry);
      ctx.closePath();

      if (blocked) {
        ctx.fillStyle = CARGO_BLOCKED;
      } else if (laden) {
        ctx.fillStyle = CARGO_LADEN;
      } else {
        ctx.fillStyle = CARGO_BALLAST;
      }
      ctx.fill();

      // Blockade ring
      if (blocked) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, sz + 4 * dpr, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 60, 60, 0.5)';
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();
      }
    }
  }

  // ================================================================
  //  PORTS — activity rings that scale with nearby traffic
  // ================================================================

  function renderPorts(portList, cargoShips, elapsed) {
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const sz = PORT_SIZE * dpr;
    const half = sz / 2;
    portHitRegions = [];

    // Pre-compute ship proximity per port for activity glow
    const portActivity = new Map();
    for (const port of portList) {
      let nearby = 0;
      for (const ship of cargoShips) {
        const dlat = ship.lat - port.lat;
        const dlon = ship.lon - port.lon;
        if (Math.abs(dlat) < 5 && Math.abs(dlon) < 5) {
          const dist = Math.sqrt(dlat * dlat + dlon * dlon);
          if (dist < 3) nearby++;
        }
      }
      portActivity.set(port.id, nearby);
    }

    for (const port of portList) {
      const pos = project(port.lat, port.lon);
      if (!pos) continue;

      const player = port.isPlayerPlaced;
      const ring = player ? PORT_RING_PLAYER : PORT_RING_AI;
      const fill = player ? PORT_COLOR_PLAYER : PORT_COLOR_AI;
      const activity = portActivity.get(port.id) || 0;

      // Base pulse + activity boost
      const basePulse = player ? 1 + Math.sin(elapsed * PULSE_SPEED) * 0.1 : 1;
      const activityPulse = 1 + Math.min(activity, 6) * 0.04;
      const bgR = (half + 2 * dpr) * basePulse * activityPulse;

      // Activity glow (outer ring, visible when ships are near)
      if (activity > 0) {
        const glowR = bgR + (3 + activity * 1.5) * dpr;
        const glowAlpha = Math.min(0.25, 0.05 + activity * 0.04);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, glowR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${ring}, ${glowAlpha})`;
        ctx.lineWidth = 2 * dpr;
        ctx.stroke();
      }

      // Background circle
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, bgR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(9, 18, 33, 0.82)';
      ctx.fill();

      // Border ring
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, bgR + 1 * dpr, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${ring}, ${player ? 0.55 : 0.35})`;
      ctx.lineWidth = 1.1 * dpr;
      ctx.stroke();

      // Diamond marker
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y - half);
      ctx.lineTo(pos.x + half * 0.7, pos.y);
      ctx.lineTo(pos.x, pos.y + half);
      ctx.lineTo(pos.x - half * 0.7, pos.y);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();

      // Label for player ports
      if (player && port.name) {
        ctx.font = `${9 * dpr}px "Space Grotesk","Avenir Next",sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = `rgba(${ring}, 0.7)`;
        ctx.fillText(port.name, pos.x, pos.y + bgR + 2 * dpr);
      }

      portHitRegions.push({ x: pos.x, y: pos.y, radius: bgR + 4 * dpr, port });
    }
  }

  // ================================================================
  //  PENDING PORT PLACEMENT
  // ================================================================

  function renderPending(pending, elapsed) {
    if (!pending) return;
    const pos = project(pending.lat, pending.lon);
    if (!pos) return;

    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const pulse = 1 + Math.sin(elapsed * 3) * 0.2;
    const r = 14 * dpr * pulse;

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    ctx.setLineDash([4 * dpr, 3 * dpr]);
    ctx.strokeStyle = 'rgba(100, 210, 160, 0.7)';
    ctx.lineWidth = 1.5 * dpr;
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = `bold ${10 * dpr}px "Space Grotesk","Avenir Next",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(100, 210, 160, 0.9)';
    ctx.fillText('OIL PORT', pos.x, pos.y + r + 3 * dpr);

    ctx.font = `${8 * dpr}px "Space Grotesk","Avenir Next",sans-serif`;
    ctx.fillStyle = 'rgba(180, 200, 220, 0.6)';
    ctx.fillText('Enter to confirm | Esc to cancel', pos.x, pos.y + r + 16 * dpr);
  }

  // ================================================================
  //  PUBLIC API
  // ================================================================

  return {
    pickPort(clientX, clientY) {
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
      const px = clientX * dpr;
      const py = clientY * dpr;
      let best = null;
      let bestD = Infinity;
      for (const h of portHitRegions) {
        const dx = h.x - px;
        const dy = h.y - py;
        const d = dx * dx + dy * dy;
        if (d < h.radius * h.radius && d < bestD) {
          bestD = d;
          best = h.port;
        }
      }
      return best;
    },

    render({ routes, cargoShips, ports, elapsedTime, pendingPort }) {
      syncSize();
      ctx.clearRect(0, 0, cw, ch);
      if (routes && routes.length > 0) renderLanes(routes, elapsedTime);
      if (cargoShips && cargoShips.length > 0) renderCargo(cargoShips, elapsedTime);
      if (ports && ports.length > 0) renderPorts(ports, cargoShips || [], elapsedTime);
      if (pendingPort) renderPending(pendingPort, elapsedTime);
    },

    dispose() {
      canvas.remove();
    },
  };
}
