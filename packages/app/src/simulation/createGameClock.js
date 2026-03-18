// Game clock tracks in-game military time (Zulu / UTC).
// Starts at a configurable epoch and advances by simulation-scaled time each tick.

const SECONDS_PER_DAY = 86400;
const MONTHS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];

export function createGameClock({
  startYear = 2026,
  startMonth = 3,
  startDay = 15,
  startHour = 6,
  startMinute = 0,
} = {}) {
  // Epoch as a JS Date (UTC)
  const epoch = new Date(Date.UTC(startYear, startMonth - 1, startDay, startHour, startMinute, 0));
  let elapsedSimSeconds = 0;

  function getCurrentDate() {
    return new Date(epoch.getTime() + elapsedSimSeconds * 1000);
  }

  return {
    tick(simSeconds) {
      elapsedSimSeconds += simSeconds;
    },

    reset() {
      elapsedSimSeconds = 0;
    },

    getElapsedSeconds() {
      return elapsedSimSeconds;
    },

    getDay() {
      return Math.floor(elapsedSimSeconds / SECONDS_PER_DAY) + 1;
    },

    getFormattedTime() {
      const d = getCurrentDate();
      return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}Z`;
    },

    getFormattedDate() {
      const d = getCurrentDate();
      const day = this.getDay();
      const dateStr = `${pad2(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
      return `DAY ${day} \u2014 ${dateStr}`;
    },
  };
}

function pad2(n) {
  return n < 10 ? `0${n}` : String(n);
}
