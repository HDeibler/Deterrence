import { renderPlaceholder } from './renderPlaceholder.js';

const SEVERITY_TONES = {
  critical: 'negative',
  warning: 'warning',
  info: '',
  opportunity: 'positive',
};

export function createIntelligenceHudController({ document }) {
  const eventFeedNode = document.getElementById('intelligenceEventFeed');
  const summaryNode = document.getElementById('intelligenceSummaryLabel');
  let lastSignature = '';

  return {
    onEventAction(handler) {
      const delegate = (event) => {
        const button = event.target.closest('[data-event-action]');
        if (!button) return;
        handler({
          action: button.dataset.eventAction,
          eventId: button.dataset.eventId,
        });
      };
      if (eventFeedNode) eventFeedNode.addEventListener('click', delegate);
      return () => {
        if (eventFeedNode) eventFeedNode.removeEventListener('click', delegate);
      };
    },

    render(snapshot) {
      if (!eventFeedNode) return;
      const signature = JSON.stringify(snapshot);
      if (signature === lastSignature) return;
      lastSignature = signature;

      if (summaryNode) {
        const critical = snapshot.criticalCount ?? 0;
        const active = snapshot.activeCount ?? 0;
        if (critical > 0) {
          summaryNode.textContent = `${critical} critical`;
        } else if (active > 0) {
          summaryNode.textContent = `${active} alert${active !== 1 ? 's' : ''}`;
        } else {
          summaryNode.textContent = 'Clear';
        }
      }

      const events = snapshot.activeEvents ?? [];
      eventFeedNode.innerHTML =
        events.length > 0
          ? events.map(renderEventRow).join('')
          : renderPlaceholder('No intelligence reports');
    },
  };
}

function renderEventRow(event) {
  const tone = SEVERITY_TONES[event.severity] ?? '';
  return `
    <article class="strategic-row" data-tone="${tone}">
      <header>
        <strong>${event.title}</strong>
        <span>${event.severity}</span>
      </header>
      <p>${event.detail}</p>
      <small>${event.category}</small>
      <div class="strategic-inline-actions">
        <button class="strategic-inline-button" type="button"
          data-event-action="dismiss" data-event-id="${event.id}">Dismiss</button>
        <button class="strategic-inline-button" type="button"
          data-event-action="investigate" data-event-id="${event.id}">Investigate</button>
      </div>
    </article>
  `;
}
