export function createGameMenuController({ document, window }) {
  const nationSelectOverlay = document.getElementById('nationSelectOverlay');
  const nationOptionsNode = document.getElementById('nationSelectOptions');
  const nationStartButton = document.getElementById('nationStartButton');
  const pauseMenuOverlay = document.getElementById('pauseMenuOverlay');
  const settingsOpenButton = document.getElementById('settingsToggle');
  const settingsCountryField = document.getElementById('settingsCountryField');
  const settingsGodViewField = document.getElementById('settingsGodViewField');
  const settingsDefenseTestField = document.getElementById('settingsDefenseTestField');
  const resumeButton = document.getElementById('resumeGameButton');
  const settingsStatus = document.getElementById('settingsStatusText');
  const devBadge = document.getElementById('devModeBadge');

  let countries = [];
  let selectedCountryIso3 = null;
  let previewHandler = null;

  return {
    setCountries(nextCountries) {
      countries = [...nextCountries];
      if (!selectedCountryIso3 && countries.length > 0) {
        selectedCountryIso3 = countries[0].iso3;
      }
      populateCountryOptions();
      populateCountryField(settingsCountryField, countries);
    },
    render(session) {
      nationSelectOverlay.hidden = session.started;
      pauseMenuOverlay.hidden = !session.started || !session.paused;
      devBadge.hidden = !session.devMode;
      settingsOpenButton.hidden = !session.started;

      if (session.activeCountryIso3) {
        selectedCountryIso3 = session.activeCountryIso3;
      }
      populateCountryOptions();
      if (session.activeCountryIso3) {
        settingsCountryField.value = session.activeCountryIso3;
      }
      settingsGodViewField.checked = session.godView;
      settingsDefenseTestField.checked = session.defenseTargetOwn;

      settingsStatus.textContent = session.godView ? 'God view enabled' : 'Country view enabled';
    },
    onStart(handler) {
      const clickHandler = () => {
        if (!selectedCountryIso3) {
          return;
        }
        handler(selectedCountryIso3);
      };
      nationStartButton.addEventListener('click', clickHandler);
      return () => nationStartButton.removeEventListener('click', clickHandler);
    },
    onPreviewCountry(handler) {
      previewHandler = handler;
      const keyHandler = (event) => {
        if (nationSelectOverlay.hidden) {
          return;
        }
        if (event.key === 'Tab') {
          event.preventDefault();
          cycleCountry(event.shiftKey ? -1 : 1);
          handler(selectedCountryIso3);
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          if (selectedCountryIso3) {
            handler(selectedCountryIso3, { confirm: true });
          }
        }
      };
      window.addEventListener('keydown', keyHandler);
      return () => {
        previewHandler = null;
        window.removeEventListener('keydown', keyHandler);
      };
    },
    onOpenSettings(handler) {
      settingsOpenButton.addEventListener('click', handler);
      return () => settingsOpenButton.removeEventListener('click', handler);
    },
    onResume(handler) {
      resumeButton.addEventListener('click', handler);
      return () => resumeButton.removeEventListener('click', handler);
    },
    onChangeCountry(handler) {
      const countryChangeHandler = () => {
        if (!settingsCountryField.value) {
          return;
        }
        handler(settingsCountryField.value);
      };
      settingsCountryField.addEventListener('change', countryChangeHandler);
      return () => settingsCountryField.removeEventListener('change', countryChangeHandler);
    },
    onToggleGodView(handler) {
      const godViewHandler = () => {
        handler(settingsGodViewField.checked);
      };
      settingsGodViewField.addEventListener('change', godViewHandler);
      return () => settingsGodViewField.removeEventListener('change', godViewHandler);
    },
    onDefenseTargetOwn(handler) {
      const changeHandler = () => {
        handler(settingsDefenseTestField.checked);
      };
      settingsDefenseTestField.addEventListener('change', changeHandler);
      return () => settingsDefenseTestField.removeEventListener('change', changeHandler);
    },
  };

  function cycleCountry(direction) {
    if (countries.length === 0) {
      return;
    }
    const currentIndex = countries.findIndex((country) => country.iso3 === selectedCountryIso3);
    const nextIndex =
      currentIndex === -1 ? 0 : (currentIndex + direction + countries.length) % countries.length;
    selectedCountryIso3 = countries[nextIndex].iso3;
    populateCountryOptions();
  }

  function populateCountryOptions() {
    nationOptionsNode.innerHTML = '';
    for (const country of countries) {
      const option = nationOptionsNode.ownerDocument.createElement('button');
      option.type = 'button';
      option.className = 'nation-option';
      if (country.iso3 === selectedCountryIso3) {
        option.dataset.selected = 'true';
      }
      option.innerHTML = `<strong>${country.name}</strong><span>${country.iso3}</span>`;
      option.addEventListener('click', () => {
        selectedCountryIso3 = country.iso3;
        populateCountryOptions();
        previewHandler?.(selectedCountryIso3);
      });
      nationOptionsNode.appendChild(option);
    }
  }
}

function populateCountryField(selectNode, countries) {
  const previousValue = selectNode.value;
  selectNode.innerHTML = '';
  for (const country of countries) {
    const option = selectNode.ownerDocument.createElement('option');
    option.value = country.iso3;
    option.textContent = `${country.name} (${country.iso3})`;
    selectNode.appendChild(option);
  }
  if (previousValue) {
    selectNode.value = previousValue;
  }
}
