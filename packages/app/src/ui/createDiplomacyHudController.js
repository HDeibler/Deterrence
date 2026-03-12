import { renderPlaceholder } from './renderPlaceholder.js';

const POSTURE_TONES = {
  allied: 'positive',
  friendly: 'positive',
  neutral: '',
  rival: 'warning',
  hostile: 'negative',
};

export function createDiplomacyHudController({ document }) {
  const relationsListNode = document.getElementById('diplomacyRelationsList');
  const accessListNode = document.getElementById('diplomacyAccessList');
  const sanctionsListNode = document.getElementById('diplomacySanctionsList');
  const summaryNode = document.getElementById('diplomacySummaryLabel');
  let lastSignature = '';

  return {
    onDiplomacyAction(handler) {
      const nodes = [relationsListNode, accessListNode, sanctionsListNode].filter(Boolean);
      const delegate = (event) => {
        const button = event.target.closest('[data-diplomacy-action]');
        if (!button) return;
        handler({
          action: button.dataset.diplomacyAction,
          countryId: button.dataset.countryId,
          agreementId: button.dataset.agreementId,
          sanctionId: button.dataset.sanctionId,
        });
      };
      for (const node of nodes) node.addEventListener('click', delegate);
      return () => {
        for (const node of nodes) node.removeEventListener('click', delegate);
      };
    },

    render(snapshot) {
      if (!relationsListNode) return;
      const signature = JSON.stringify(snapshot);
      if (signature === lastSignature) return;
      lastSignature = signature;

      if (summaryNode) {
        let allies = 0;
        let hostile = 0;
        for (const r of snapshot.relations ?? []) {
          if (r.posture === 'allied') allies++;
          else if (r.posture === 'hostile') hostile++;
        }
        summaryNode.textContent = `${allies} allied, ${hostile} hostile`;
      }

      relationsListNode.innerHTML =
        snapshot.relations?.length > 0
          ? snapshot.relations.map(renderRelationRow).join('')
          : renderPlaceholder('No diplomatic data');

      if (accessListNode) {
        accessListNode.innerHTML =
          snapshot.agreements?.length > 0
            ? snapshot.agreements.map(renderAccessRow).join('')
            : renderPlaceholder('No access agreements');
      }

      if (sanctionsListNode) {
        sanctionsListNode.innerHTML =
          snapshot.sanctions?.length > 0
            ? snapshot.sanctions.map(renderSanctionRow).join('')
            : renderPlaceholder('No active sanctions');
      }
    },
  };
}

function renderRelationRow(relation) {
  const tone = POSTURE_TONES[relation.posture] ?? '';
  const alignment = (relation.alignmentScore * 100).toFixed(0);
  const trade = (relation.tradeOpenness * 100).toFixed(0);

  return `
    <article class="strategic-row" data-tone="${tone}">
      <header>
        <strong>${relation.countryName}</strong>
        <span>${relation.posture}</span>
      </header>
      <p>Alignment: ${alignment}% \u00B7 Trade: ${trade}%</p>
      <div class="strategic-inline-actions">
        <button class="strategic-inline-button" type="button"
          data-diplomacy-action="propose-agreement" data-country-id="${relation.countryId}">Propose</button>
        <button class="strategic-inline-button" type="button"
          data-diplomacy-action="impose-sanction" data-country-id="${relation.countryId}">Sanction</button>
      </div>
    </article>
  `;
}

function renderAccessRow(agreement) {
  const status = agreement.active ? 'Active' : 'Pending';
  return `
    <article class="strategic-row">
      <header>
        <strong>${agreement.name}</strong>
        <span>${status}</span>
      </header>
      <p>${agreement.type.replace(/_/g, ' ')} with ${agreement.partnerName}</p>
      <div class="strategic-inline-actions">
        <button class="strategic-inline-button" type="button"
          data-diplomacy-action="revoke-agreement" data-agreement-id="${agreement.id}">Revoke</button>
      </div>
    </article>
  `;
}

function renderSanctionRow(sanction) {
  return `
    <article class="strategic-row" data-tone="warning">
      <header>
        <strong>${sanction.targetName}</strong>
        <span>${sanction.type.replace(/_/g, ' ')}</span>
      </header>
      <p>Severity: ${sanction.severity} \u00B7 Turn ${sanction.imposedTurn}</p>
      <div class="strategic-inline-actions">
        <button class="strategic-inline-button" type="button"
          data-diplomacy-action="lift-sanction" data-sanction-id="${sanction.id}">Lift</button>
      </div>
    </article>
  `;
}
