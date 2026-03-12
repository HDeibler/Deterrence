export function createStrategicHudController({ document }) {
  const headlineNode = document.getElementById('strategicHeadlineValue');
  const problemNode = document.getElementById('strategicProblemValue');
  const nextActionNode = document.getElementById('strategicNextActionValue');
  const dateNode = document.getElementById('strategicDateValue');
  const treasuryNode = document.getElementById('strategicTreasuryValue');
  const financeNode = document.getElementById('strategicFinanceValue');
  const reserveNode = document.getElementById('strategicReserveValue');
  const chipFactoryButton = document.getElementById('strategicBuildChipFactoryButton');
  const chipFactoryMeta = document.getElementById('strategicBuildChipFactoryMeta');
  const militaryFactoryButton = document.getElementById('strategicBuildMilitaryFactoryButton');
  const militaryFactoryMeta = document.getElementById('strategicBuildMilitaryFactoryMeta');
  const cancelPlacementButton = document.getElementById('strategicCancelPlacementButton');
  const placementHintNode = document.getElementById('strategicPlacementHint');
  const selectionCardNode = document.getElementById('strategicSelectionCard');
  const selectionTitleNode = document.getElementById('strategicSelectionTitle');
  const selectionBonusNode = document.getElementById('strategicSelectionBonus');
  const selectionBodyNode = document.getElementById('strategicSelectionBody');
  const selectionMetaNode = document.getElementById('strategicSelectionMeta');
  const selectionUpgradeButton = document.getElementById('strategicSelectionUpgradeButton');
  const selectionPauseButton = document.getElementById('strategicSelectionPauseButton');
  const selectionEmphasisButton = document.getElementById('strategicSelectionEmphasisButton');
  const objectiveListNode = document.getElementById('strategicObjectiveList');
  const industryListNode = document.getElementById('strategicIndustryList');
  const resourceListNode = document.getElementById('strategicResourceList');
  const tradePortListNode = document.getElementById('strategicTradePortList');
  const tradeContractListNode = document.getElementById('strategicTradeContractList');
  const tradeProducerListNode = document.getElementById('strategicTradeProducerList');
  const baseListNode = document.getElementById('strategicBaseList');
  const addChipQueueButton = document.getElementById('strategicAddChipQueueButton');
  const addMilitaryQueueButton = document.getElementById('strategicAddMilitaryQueueButton');
  const queueListNode = document.getElementById('strategicQueueList');

  const strategySummary = document.getElementById('strategySummaryLabel');
  const industrySummary = document.getElementById('industrySummaryLabel');
  const resourcesSummary = document.getElementById('resourcesSummaryLabel');
  const tradeSummary = document.getElementById('tradeSummaryLabel');
  const deploymentSummary = document.getElementById('deploymentSummaryLabel');
  const productionSummary = document.getElementById('productionSummaryLabel');

  let lastSignature = '';

  return {
    onBuildChipFactory(handler) {
      chipFactoryButton.addEventListener('click', handler);
      return () => chipFactoryButton.removeEventListener('click', handler);
    },
    onBuildMilitaryFactory(handler) {
      militaryFactoryButton.addEventListener('click', handler);
      return () => militaryFactoryButton.removeEventListener('click', handler);
    },
    onCancelPlacement(handler) {
      cancelPlacementButton.addEventListener('click', handler);
      return () => cancelPlacementButton.removeEventListener('click', handler);
    },
    onUpgradeSelectedFactory(handler) {
      selectionUpgradeButton.addEventListener('click', handler);
      return () => selectionUpgradeButton.removeEventListener('click', handler);
    },
    onToggleSelectedFactoryPaused(handler) {
      selectionPauseButton.addEventListener('click', handler);
      return () => selectionPauseButton.removeEventListener('click', handler);
    },
    onCycleSelectedFactoryEmphasis(handler) {
      selectionEmphasisButton.addEventListener('click', handler);
      return () => selectionEmphasisButton.removeEventListener('click', handler);
    },
    onAddChipQueue(handler) {
      addChipQueueButton.addEventListener('click', handler);
      return () => addChipQueueButton.removeEventListener('click', handler);
    },
    onAddMilitaryQueue(handler) {
      addMilitaryQueueButton.addEventListener('click', handler);
      return () => addMilitaryQueueButton.removeEventListener('click', handler);
    },
    onQueueAction(handler) {
      const delegate = (event) => {
        const button = event.target.closest('[data-queue-action]');
        if (!button) {
          return;
        }
        handler({
          action: button.dataset.queueAction,
          queueId: button.dataset.queueId,
        });
      };
      queueListNode.addEventListener('click', delegate);
      return () => queueListNode.removeEventListener('click', delegate);
    },
    onTradeAction(handler) {
      const delegate = (event) => {
        const button = event.target.closest('[data-trade-action]');
        if (!button) {
          return;
        }
        handler({
          action: button.dataset.tradeAction,
          producerCountryId: button.dataset.producerCountryId,
          contractId: button.dataset.contractId,
          portId: button.dataset.portId,
        });
      };
      tradePortListNode.addEventListener('click', delegate);
      tradeProducerListNode.addEventListener('click', delegate);
      tradeContractListNode.addEventListener('click', delegate);
      return () => {
        tradePortListNode.removeEventListener('click', delegate);
        tradeProducerListNode.removeEventListener('click', delegate);
        tradeContractListNode.removeEventListener('click', delegate);
      };
    },
    render(snapshot, uiState = {}) {
      const signature = JSON.stringify({ snapshot, uiState });
      if (signature === lastSignature) {
        return;
      }
      lastSignature = signature;

      const placementMode = uiState.placementMode ?? null;
      const placementCountryName = uiState.placementCountryName ?? 'your country';
      const placementPreview = uiState.placementPreview ?? null;
      const selectedProjectId = uiState.selectedProjectId ?? null;

      if (snapshot.status === 'loading') {
        renderUnavailable({
          status: 'Loading strategic bootstrap',
          hint: 'Preparing strategic systems.',
        });
        return;
      }

      if (snapshot.status === 'error') {
        renderUnavailable({
          status: snapshot.message ?? 'Strategic bootstrap failed',
          hint: 'Reload the campaign or restart the session.',
        });
        return;
      }

      if (snapshot.status !== 'ready') {
        renderUnavailable({
          status: 'Select a playable country to load strategic state',
          hint: 'Open a new game to begin the campaign.',
        });
        return;
      }

      const commandCenter = snapshot.commandCenter ?? {};
      headlineNode.textContent =
        commandCenter.headline ?? 'Build economy -> fill bases -> project force';
      problemNode.textContent = commandCenter.leadingProblem ?? 'Domestic stocks are stable.';
      nextActionNode.textContent =
        commandCenter.nextAction ?? 'Select a build action to begin shaping the campaign.';
      dateNode.textContent = snapshot.finance?.gameDateLabel ?? '-';
      treasuryNode.textContent = formatMoney(snapshot.finance?.treasuryBalance);
      financeNode.textContent = `${formatSignedMoney(snapshot.finance?.effectiveNetPerHour ?? snapshot.finance?.netPerHour)}/hr`;
      reserveNode.textContent =
        snapshot.reserveInventories.length > 0
          ? snapshot.reserveInventories
              .map((entry) => `${entry.label} ${formatCompact(entry.amount)}`)
              .join(' · ')
          : 'No reserve assets available';

      renderProjectButton(chipFactoryButton, chipFactoryMeta, commandCenter.projects, 'chip_factory');
      renderProjectButton(
        militaryFactoryButton,
        militaryFactoryMeta,
        commandCenter.projects,
        'military_factory',
      );
      renderQueueToolbar(addChipQueueButton, commandCenter.queueBuildOptions, 'chip_factory');
      renderQueueToolbar(
        addMilitaryQueueButton,
        commandCenter.queueBuildOptions,
        'military_factory',
      );

      cancelPlacementButton.hidden = !placementMode;
      placementHintNode.textContent = renderPlacementHint({
        placementMode,
        placementCountryName,
        placementPreview,
      });

      renderSelectionCard({
        projects: snapshot.industrialProjects ?? [],
        selectedProjectId,
      });

      objectiveListNode.innerHTML =
        snapshot.objectives?.length > 0
          ? snapshot.objectives.map(renderObjectiveRow).join('')
          : renderPlaceholder('No campaign objectives loaded');

      industryListNode.innerHTML =
        snapshot.industrialProjects?.length > 0
          ? snapshot.industrialProjects
              .map((project) => renderIndustryRow(project, project.id === selectedProjectId))
              .join('')
          : renderPlaceholder('No player-built industry yet. Place a factory to shape the economy.');
      resourceListNode.innerHTML = snapshot.resources.map(renderResourceRow).join('');
      tradePortListNode.innerHTML =
        snapshot.trade?.ports?.length > 0
          ? snapshot.trade.ports.map(renderTradePortRow).join('')
          : renderPlaceholder('No active logistics nodes');
      tradeContractListNode.innerHTML =
        snapshot.trade?.contracts?.length > 0
          ? snapshot.trade.contracts.map(renderTradeContractRow).join('')
          : renderPlaceholder('No active import contracts');
      tradeProducerListNode.innerHTML =
        snapshot.trade?.producers?.oil?.length > 0
          ? snapshot.trade.producers.oil.map(renderTradeProducerRow).join('')
          : renderPlaceholder('No foreign oil producers available');
      baseListNode.innerHTML =
        snapshot.baseSummaries.length > 0
          ? snapshot.baseSummaries.map(renderBaseRow).join('')
          : renderPlaceholder('No domestic base network');
      queueListNode.innerHTML = snapshot.queues.map(renderQueueRow).join('');

      updateSummaryLabels(snapshot);
    },
  };

  function updateSummaryLabels(snapshot) {
    const objectives = snapshot.objectives ?? [];
    const incomplete = objectives.filter((o) => !o.completed);
    strategySummary.textContent =
      incomplete.length > 0 ? incomplete[0].title : objectives.length > 0 ? 'All complete' : '-';

    const factories = snapshot.industrialProjects ?? [];
    if (factories.length > 0) {
      const totalPercent = factories.reduce((sum, f) => sum + (f.paused ? 0 : f.throughputPercent), 0);
      industrySummary.textContent = `${factories.length} factories, +${totalPercent}%`;
    } else {
      industrySummary.textContent = 'No factories';
    }

    const resources = snapshot.resources ?? [];
    const concern = resources.find((r) => r.netPerHour < 0);
    resourcesSummary.textContent = concern ? `${concern.label} low` : resources.length > 0 ? 'Stable' : '-';

    const contracts = snapshot.trade?.contracts ?? [];
    if (contracts.length > 0) {
      const totalOilHr = contracts.reduce((sum, c) => sum + (c.deliveredVolumePerHour ?? 0), 0);
      tradeSummary.textContent = `${contracts.length} contracts, ${formatCompact(totalOilHr)}/hr`;
    } else {
      tradeSummary.textContent = 'No contracts';
    }

    const bases = snapshot.baseSummaries ?? [];
    if (bases.length > 0) {
      const totalLoaded = bases.reduce((sum, b) => sum + b.loadedBases, 0);
      deploymentSummary.textContent = `${totalLoaded} bases loaded`;
    } else {
      deploymentSummary.textContent = 'Empty';
    }

    const queues = snapshot.queues ?? [];
    const active = queues.filter((q) => q.status === 'active' || q.status === 'running');
    productionSummary.textContent =
      active.length > 0 ? `${active.length} queues active` : queues.length > 0 ? `${queues.length} queues` : 'Idle';
  }

  function renderUnavailable({ status, hint }) {
    headlineNode.textContent = 'Build economy -> fill bases -> project force';
    problemNode.textContent = status;
    nextActionNode.textContent = hint;
    dateNode.textContent = '-';
    treasuryNode.textContent = '-';
    financeNode.textContent = '-';
    reserveNode.textContent = '-';
    chipFactoryMeta.textContent = '-';
    militaryFactoryMeta.textContent = '-';
    chipFactoryButton.disabled = true;
    militaryFactoryButton.disabled = true;
    addChipQueueButton.disabled = true;
    addMilitaryQueueButton.disabled = true;
    cancelPlacementButton.hidden = true;
    placementHintNode.textContent = hint;
    selectionCardNode.hidden = true;
    selectionUpgradeButton.disabled = true;
    selectionPauseButton.disabled = true;
    selectionEmphasisButton.disabled = true;
    objectiveListNode.innerHTML = renderPlaceholder('No campaign objectives');
    industryListNode.innerHTML = renderPlaceholder('Strategic command unavailable');
    resourceListNode.innerHTML = renderPlaceholder('No resource data');
    tradePortListNode.innerHTML = renderPlaceholder('No port data');
    tradeContractListNode.innerHTML = renderPlaceholder('No contract data');
    tradeProducerListNode.innerHTML = renderPlaceholder('No producer data');
    baseListNode.innerHTML = renderPlaceholder('No deployment data');
    queueListNode.innerHTML = renderPlaceholder('No queue data');

    strategySummary.textContent = '-';
    industrySummary.textContent = '-';
    resourcesSummary.textContent = '-';
    tradeSummary.textContent = '-';
    deploymentSummary.textContent = '-';
    productionSummary.textContent = '-';
  }

  function renderSelectionCard({ projects, selectedProjectId }) {
    const project = (projects ?? []).find((entry) => entry.id === selectedProjectId) ?? null;
    if (!project) {
      selectionCardNode.hidden = true;
      selectionUpgradeButton.disabled = true;
      selectionPauseButton.disabled = true;
      selectionEmphasisButton.disabled = true;
      return;
    }

    selectionCardNode.hidden = false;
    selectionTitleNode.textContent = project.label;
    selectionBonusNode.textContent = project.paused
      ? 'Paused'
      : `+${project.throughputPercent}%`;
    selectionBodyNode.textContent = project.paused
      ? `${project.label} is paused and currently contributing no throughput.`
      : `${project.label} is increasing ${formatFacilityLabel(project.facilityType)} throughput for this country.`;
    selectionMetaNode.textContent = [
      `${formatCoordinatePair(project.lat, project.lon)}`,
      `Focus ${project.emphasisLabel}`,
      `Upgrade ${project.upgradeLevel}/${2}`,
      `Project ID ${project.id}`,
    ].join(' · ');
    selectionUpgradeButton.disabled = !project.nextUpgradeCost;
    selectionPauseButton.disabled = false;
    selectionEmphasisButton.disabled = false;
    selectionUpgradeButton.textContent = project.nextUpgradeCost
      ? `Upgrade ${formatMoney(project.nextUpgradeCost.treasuryCost)}`
      : 'Max Upgrade';
    selectionPauseButton.textContent = project.paused ? 'Resume' : 'Pause';
    selectionEmphasisButton.textContent = `Focus ${project.emphasisLabel}`;
  }
}

function renderProjectButton(button, metaNode, projects, projectKey) {
  const project = (projects ?? []).find((entry) => entry.key === projectKey);
  if (!project) {
    button.disabled = true;
    metaNode.textContent = '-';
    return;
  }
  button.disabled = !project.affordable;
  button.dataset.affordable = project.affordable ? 'true' : 'false';
  metaNode.textContent =
    `${formatMoney(project.treasuryCost)} · +${project.throughputPercent}% ${project.shortLabel} · ${project.placedCount} placed`;
}

function renderQueueToolbar(button, options, facilityType) {
  const option = (options ?? []).find((entry) => entry.facilityType === facilityType);
  button.disabled = !option?.available;
  button.title = option?.detail ?? '';
}

function renderIndustryRow(project, selected = false) {
  return `
    <article class="strategic-row" data-selected="${selected ? 'true' : 'false'}">
      <header>
        <strong>${project.label}</strong>
        <span>${project.paused ? 'Paused' : `+${project.throughputPercent}%`}</span>
      </header>
      <p>${Math.abs(project.lat).toFixed(1)}°${project.lat >= 0 ? 'N' : 'S'} ${Math.abs(project.lon).toFixed(1)}°${project.lon >= 0 ? 'E' : 'W'}</p>
      <small>${project.emphasisLabel} · Upgrade ${project.upgradeLevel}/${2}${project.paused ? ' · Paused' : ''}</small>
    </article>
  `;
}

function renderPlacementHint({ placementMode, placementCountryName, placementPreview }) {
  if (!placementMode) {
    return 'Start by placing industry, then watch queues accelerate and assets fill real bases.';
  }
  if (!placementPreview) {
    return `Placement mode: ${placementLabel(placementMode)}. Move over ${placementCountryName} and click to place it.`;
  }
  return placementPreview.valid
    ? `${placementLabel(placementMode)} ready at ${formatCoordinatePair(placementPreview.lat, placementPreview.lon)}. Click to confirm placement.`
    : `Invalid placement. ${placementLabel(placementMode)} must be inside ${placementCountryName}.`;
}

function renderResourceRow(resource) {
  const tone = resource.netPerHour >= 0 ? 'positive' : 'negative';
  return `
    <article class="strategic-row" data-tone="${tone}">
      <header>
        <strong>${resource.label}</strong>
        <span>${formatCompact(resource.amount)}</span>
      </header>
      <p>${formatSignedCompact(resource.netPerHour)}/hr net</p>
      <small>Prod ${formatCompact(resource.productionPerHour)}/hr · Imports ${formatCompact(resource.importPerHour ?? 0)}/hr · Queue ${formatCompact(resource.queueDemandPerHour)}/hr · Upkeep ${formatCompact(resource.upkeepPerHour)}/hr</small>
    </article>
  `;
}

function renderQueueRow(queue) {
  return `
    <article class="strategic-row">
      <header>
        <strong>${queue.recipeName}</strong>
        <span>${queue.status}</span>
      </header>
      <p>${queue.facilityLabel} · ${queue.outputAmount} ${queue.outputLabel} · +${queue.throughputPercent}% throughput</p>
      <small>${formatCompact(queue.completedQuantity + queue.progressUnits)}/${formatCompact(queue.targetQuantity)} batches · ${Math.round(queue.progressRatio * 100)}% · ${queue.assignmentPercent}% assigned</small>
      <small>${queue.plannerStatus}</small>
      <div class="strategic-inline-actions">
        <button class="strategic-inline-button" type="button" data-queue-action="cycle" data-queue-id="${queue.id}">
          Cycle Recipe
        </button>
        <button class="strategic-inline-button" type="button" data-queue-action="decrease" data-queue-id="${queue.id}">
          - Batch
        </button>
        <button class="strategic-inline-button" type="button" data-queue-action="increase" data-queue-id="${queue.id}">
          + Batch
        </button>
        <button class="strategic-inline-button" type="button" data-queue-action="up" data-queue-id="${queue.id}" ${queue.canMoveUp ? '' : 'disabled'}>
          Up
        </button>
        <button class="strategic-inline-button" type="button" data-queue-action="down" data-queue-id="${queue.id}" ${queue.canMoveDown ? '' : 'disabled'}>
          Down
        </button>
        <button class="strategic-inline-button" type="button" data-queue-action="remove" data-queue-id="${queue.id}">
          Remove
        </button>
      </div>
    </article>
  `;
}

function renderObjectiveRow(objective) {
  return `
    <article class="strategic-row" data-complete="${objective.completed ? 'true' : 'false'}">
      <header>
        <strong>${objective.title}</strong>
        <span>${objective.completed ? 'Complete' : `+$${objective.rewardTreasury.toLocaleString()}`}</span>
      </header>
      <p>${objective.detail}</p>
      <small>${objective.progressLabel}</small>
    </article>
  `;
}

function renderTradeContractRow(contract) {
  return `
    <article class="strategic-row" data-tone="${contract.disrupted ? 'negative' : contract.throttledPercent < 100 ? 'warning' : 'positive'}">
      <header>
        <strong>${contract.producerName}</strong>
        <span>${contract.reliabilityPercent}% reliable</span>
      </header>
      <p>${contract.routeLabel}</p>
      <small>${formatCompact(contract.deliveredVolumePerHour)}/hr delivered · ${formatMoney(contract.costPerHour)}/hr cost · ${contract.throttledPercent}% port throughput · ${contract.routeIntegrityPercent}% route integrity</small>
      <small>${contract.tripProgressPercent}% trip progress · ${formatCompact(contract.deliveredTotal ?? 0)} total delivered · ${contract.portStatus}</small>
      <small>${contract.disrupted ? `${formatCompact(contract.disruptionHoursRemaining)}h disruption remaining` : 'Route stable'}</small>
      <div class="strategic-inline-actions">
        <button class="strategic-inline-button" type="button" data-trade-action="stabilize" data-contract-id="${contract.id}" ${contract.disrupted ? '' : 'disabled'}>
          ${contract.disrupted ? `Stabilize Route (${formatMoney(contract.recoveryCost)})` : 'Route Stable'}
        </button>
        <button class="strategic-inline-button" type="button" data-trade-action="cancel" data-contract-id="${contract.id}">
          Cancel Contract
        </button>
      </div>
    </article>
  `;
}

function renderTradePortRow(port) {
  return `
    <article class="strategic-row" data-tone="${port.utilization > 1 ? 'negative' : port.utilization > 0.85 ? 'warning' : 'positive'}">
      <header>
        <strong>${port.name}</strong>
        <span>${Math.round(port.utilization * 100)}%</span>
      </header>
      <p>${port.status}</p>
      <small>${formatCompact(port.demandPerHour)}/hr demand · ${formatCompact(port.throughputPerHour)}/hr capacity · ${Math.round(port.throttleFactor * 100)}% routed throughput</small>
      <small>${port.controlled ? `Home port L${port.upgradeLevel} · ${port.resiliencePercent}% disruption hardening` : 'Foreign port'}</small>
      <div class="strategic-inline-actions">
        <button class="strategic-inline-button" type="button" data-trade-action="upgrade-port" data-port-id="${port.id}" ${port.upgradeAvailable ? '' : 'disabled'}>
          ${
            port.controlled
              ? port.upgradeAvailable
                ? `Upgrade Port (${formatMoney(port.upgradeCost?.treasuryCost ?? 0)})`
                : 'Port Maxed'
              : 'Foreign Port'
          }
        </button>
      </div>
    </article>
  `;
}

function renderTradeProducerRow(producer) {
  return `
    <article class="strategic-row">
      <header>
        <strong>${producer.countryName}</strong>
        <span>${Math.round(producer.routeRisk * 100)}% route risk</span>
      </header>
      <p>${producer.portName} · ${formatCompact(producer.productionPerHour)}/hr national output</p>
      <small>${producer.offeredVolumePerHour}/hr offer · ${formatMoney(producer.contractUnitCost)}/unit · ${producer.countryIso3} supply chain</small>
      <div class="strategic-inline-actions">
        <button class="strategic-inline-button" type="button" data-trade-action="${producer.isContracted ? 'active' : 'sign'}" data-producer-country-id="${producer.countryId}" ${producer.isContracted ? 'disabled' : ''}>
          ${producer.isContracted ? 'Contract Active' : 'Sign Contract'}
        </button>
      </div>
    </article>
  `;
}

function renderBaseRow(base) {
  return `
    <article class="strategic-row">
      <header>
        <strong>${base.label}</strong>
        <span>${base.loadedBases}/${base.activeBases}</span>
      </header>
      <p>${base.assetSummary || 'No compatible assets loaded yet'}</p>
      <small>${base.loadedBases} loaded bases · ${base.activeBases} active / ${base.totalBases} total</small>
    </article>
  `;
}

function renderPlaceholder(message) {
  return `<article class="strategic-row strategic-row-muted"><p>${message}</p></article>`;
}

function placementLabel(placementMode) {
  return placementMode === 'chip_factory' ? 'Chip Factory' : 'Military Factory';
}

function formatFacilityLabel(facilityType) {
  return facilityType === 'chip_factory' ? 'chip factory' : 'military factory';
}

function formatCoordinatePair(lat, lon) {
  return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`;
}

function formatMoney(value) {
  const amount = Number.isFinite(value) ? value : 0;
  return `$${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatSignedMoney(value) {
  const amount = Number.isFinite(value) ? value : 0;
  const prefix = amount >= 0 ? '+' : '-';
  return `${prefix}$${Math.abs(amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatCompact(value) {
  const amount = Number.isFinite(value) ? value : 0;
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: amount < 10 && amount % 1 !== 0 ? 1 : 0,
    maximumFractionDigits: amount < 10 ? 1 : 0,
  });
}

function formatSignedCompact(value) {
  const amount = Number.isFinite(value) ? value : 0;
  const prefix = amount >= 0 ? '+' : '-';
  return `${prefix}${formatCompact(Math.abs(amount))}`;
}
