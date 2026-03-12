import { EVENT_TEMPLATES } from '../game/data/eventTemplateCatalog.js';

const HISTORY_LIMIT = 100;
const DEFAULT_FEED_LIMIT = 20;

function createInitialState() {
  return {
    activeEvents: [],
    cooldowns: {},
    eventHistory: [],
    totalEventsGenerated: 0,
  };
}

export function createCampaignEventSystem() {
  let state = createInitialState();
  let nextEventId = 1;

  function step(deltaSeconds) {
    const expiredIds = [];
    for (const templateId of Object.keys(state.cooldowns)) {
      state.cooldowns[templateId] -= deltaSeconds;
      if (state.cooldowns[templateId] <= 0) {
        expiredIds.push(templateId);
      }
    }
    for (const id of expiredIds) {
      delete state.cooldowns[id];
    }
  }

  function evaluate(worldState) {
    const generated = [];

    for (const template of EVENT_TEMPLATES) {
      if (state.cooldowns[template.id] > 0) {
        continue;
      }

      const alreadyActive = state.activeEvents.some(
        (event) => event.templateId === template.id,
      );
      if (alreadyActive) {
        continue;
      }

      let triggered = false;
      try {
        triggered = template.trigger(worldState);
      } catch (_error) {
        continue;
      }

      if (!triggered) {
        continue;
      }

      const event = {
        id: `evt-${nextEventId}`,
        templateId: template.id,
        title: template.title,
        detail: template.detail,
        severity: template.severity,
        category: template.category,
        timestamp: Date.now(),
        dismissed: false,
      };
      nextEventId += 1;

      state.activeEvents.push(event);
      state.eventHistory.push(event);
      state.totalEventsGenerated += 1;
      state.cooldowns[template.id] = template.cooldownHours * 3600;

      generated.push(event);
    }

    if (state.eventHistory.length > HISTORY_LIMIT) {
      state.eventHistory = state.eventHistory.slice(-HISTORY_LIMIT);
    }

    return generated;
  }

  function getSnapshot() {
    const active = getActiveEvents();
    let criticalCount = 0;
    for (const event of active) {
      if (event.severity === 'critical') {
        criticalCount += 1;
      }
    }
    return {
      activeEvents: active,
      activeCount: active.length,
      criticalCount,
      recentEvents: state.eventHistory.slice(-10),
      totalEventsGenerated: state.totalEventsGenerated,
    };
  }

  function serializeState() {
    return {
      activeEvents: state.activeEvents.map((event) => ({ ...event })),
      cooldowns: { ...state.cooldowns },
      eventHistory: state.eventHistory.map((event) => ({ ...event })),
      totalEventsGenerated: state.totalEventsGenerated,
      nextEventId,
    };
  }

  function loadState(serialized) {
    state = {
      activeEvents: serialized.activeEvents.map((event) => ({ ...event })),
      cooldowns: { ...serialized.cooldowns },
      eventHistory: serialized.eventHistory.map((event) => ({ ...event })),
      totalEventsGenerated: serialized.totalEventsGenerated,
    };
    nextEventId = serialized.nextEventId;
  }

  function reset() {
    state = createInitialState();
    nextEventId = 1;
  }

  function getActiveEvents() {
    return state.activeEvents;
  }

  function dismissEvent(eventId) {
    const index = state.activeEvents.findIndex((candidate) => candidate.id === eventId);
    if (index !== -1) {
      state.activeEvents[index].dismissed = true;
      state.activeEvents.splice(index, 1);
    }
  }

  function getEventFeed(limit = DEFAULT_FEED_LIMIT) {
    return state.eventHistory.slice(-limit).reverse();
  }

  return {
    step,
    evaluate,
    getSnapshot,
    serializeState,
    loadState,
    reset,
    getActiveEvents,
    dismissEvent,
    getEventFeed,
  };
}
