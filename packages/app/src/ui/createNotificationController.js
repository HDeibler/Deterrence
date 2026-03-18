// Universal notification toast system.
// Notifications stack from bottom-up, auto-dismiss after 10s, closeable.
// Duplicate notifications consolidate into a single toast with a count badge.

export function createNotificationController({ document, mountNode }) {
  const container = document.createElement('div');
  container.className = 'notification-container';
  mountNode.appendChild(container);

  let nextId = 1;
  // group key → { id, count, el, textSpan, badgeEl, timer }
  const activeGroups = new Map();

  function push({ text, type = 'info', duration = 10000, actions = null, group = null }) {
    // If a group key is provided and an active notification exists for it, consolidate
    if (group && activeGroups.has(group)) {
      const existing = activeGroups.get(group);
      existing.count += 1;
      existing.badgeEl.textContent = existing.count;
      existing.badgeEl.hidden = false;
      // Reset the auto-dismiss timer
      clearTimeout(existing.timer);
      existing.timer = setTimeout(() => dismiss(existing.id), duration);
      // Move to top
      container.prepend(existing.el);
      return existing.id;
    }

    const id = nextId++;
    const el = document.createElement('div');
    el.className = `notification notification-${type}`;
    el.dataset.notifId = id;

    // Count badge (hidden until count > 1)
    const badgeEl = document.createElement('span');
    badgeEl.className = 'notification-badge';
    badgeEl.hidden = true;
    el.appendChild(badgeEl);

    const textSpan = document.createElement('span');
    textSpan.className = 'notification-text';
    textSpan.textContent = text;
    el.appendChild(textSpan);

    // Action buttons (e.g., "View")
    if (actions && actions.length > 0) {
      const actionsWrap = document.createElement('div');
      actionsWrap.className = 'notification-actions';
      for (const action of actions) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'notification-action-btn';
        btn.textContent = action.label;
        btn.addEventListener('click', () => {
          action.onClick();
          dismiss(id);
        });
        actionsWrap.appendChild(btn);
      }
      el.appendChild(actionsWrap);
    }

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'notification-close';
    closeBtn.textContent = '\u00d7';
    closeBtn.addEventListener('click', () => dismiss(id));
    el.appendChild(closeBtn);

    container.prepend(el);

    requestAnimationFrame(() => {
      el.classList.add('notification-visible');
    });

    const timer = setTimeout(() => dismiss(id), duration);

    if (group) {
      activeGroups.set(group, { id, count: 1, el, textSpan, badgeEl, timer });
    }

    el._dismissTimer = timer;
    el._group = group;

    return id;
  }

  function dismiss(id) {
    const el = container.querySelector(`[data-notif-id="${id}"]`);
    if (!el) {
      return;
    }
    clearTimeout(el._dismissTimer);
    // Remove from group tracking
    if (el._group && activeGroups.has(el._group)) {
      activeGroups.delete(el._group);
    }
    el.classList.remove('notification-visible');
    el.classList.add('notification-exit');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    setTimeout(() => { if (el.parentNode) el.remove(); }, 500);
  }

  return {
    push,
    dismiss,
    info(text) { return push({ text, type: 'info' }); },
    success(text, group) { return push({ text, type: 'success', group }); },
    warn(text, group) { return push({ text, type: 'warn', group }); },
    error(text, group) { return push({ text, type: 'error', group }); },
    dispose() { container.remove(); },
  };
}
