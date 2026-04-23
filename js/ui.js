/**
 * UI Components for The Good Fight TTRPG.
 * Manual input modals (dice prompt, card picker) for physical mode.
 */
const UI = (() => {

  /**
   * Show a dice entry prompt modal for physical mode.
   * Compatible as a Dice provider: Dice.setProvider(UI.diceInput)
   * @param {string} dieType - e.g. 'd6', 'd100'
   * @returns {Promise<number>} Resolves with the entered value
   */
  function diceInput(dieType) {
    const max = Dice.getDieMax(dieType);
    return new Promise((resolve) => {
      const overlay = createOverlay();
      overlay.innerHTML = `
        <div class="modal">
          <h3>Roll a ${dieType} and enter your result:</h3>
          <input type="number" min="1" max="${max}" step="1" placeholder="1–${max}">
          <button type="button">Submit</button>
        </div>
      `;

      const input = overlay.querySelector('input[type="number"]');
      const button = overlay.querySelector('button');

      button.addEventListener('click', function () {
        const value = parseInt(input.value, 10);
        if (isNaN(value) || value < 1 || value > max) return;
        overlay.remove();
        resolve(value);
      });

      document.body.appendChild(overlay);
      input.focus();
    });
  }

  /**
   * Show a card picker modal for physical mode.
   * Compatible as a Deck provider: Deck.setProvider(UI.cardInput)
   * @param {number} count - How many cards to pick
   * @returns {Promise<Array<{suit, rank, value}>>} Resolves with card objects
   */
  async function cardInput(count) {
    const cards = [];
    for (let i = 0; i < count; i++) {
      const card = await pickOneCard(i + 1, count);
      cards.push(card);
    }
    return cards;
  }

  function pickOneCard(current, total) {
    return new Promise((resolve) => {
      const overlay = createOverlay();
      const label = total > 1 ? `Draw card ${current} of ${total}:` : 'Draw a card from your deck:';
      overlay.innerHTML = `
        <div class="modal">
          <h3>${label}</h3>
          <div class="card-picker">
            <select data-suit>
              <option value="hearts">Hearts</option>
              <option value="diamonds">Diamonds</option>
              <option value="clubs">Clubs</option>
              <option value="spades">Spades</option>
            </select>
            <select data-rank>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
              <option value="6">6</option>
              <option value="7">7</option>
              <option value="8">8</option>
              <option value="9">9</option>
              <option value="10">10</option>
              <option value="J">J</option>
              <option value="Q">Q</option>
              <option value="K">K</option>
              <option value="A">A</option>
            </select>
          </div>
          <button type="button">Submit</button>
        </div>
      `;

      const suitSelect = overlay.querySelector('[data-suit]');
      const rankSelect = overlay.querySelector('[data-rank]');
      const button = overlay.querySelector('button');

      button.addEventListener('click', function () {
        const suit = suitSelect.value;
        const rank = rankSelect.value;
        const value = Deck.cardValue(rank);
        overlay.remove();
        resolve({ suit, rank, value });
      });

      document.body.appendChild(overlay);
    });
  }

  function createOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    return overlay;
  }

  /**
   * Show a resolution modal displaying operation results.
   * @param {object} results - { operationName, rolls: [{value, target, success}], effects: string[], playerChoice: null | {prompt, options: [{label, value}]} }
   * @returns {Promise} Resolves when confirmed (with choice value if playerChoice was present)
   */
  function showResolutionModal(results) {
    return new Promise((resolve) => {
      const overlay = createOverlay();

      // Determine overall success/failure from rolls
      const allSuccess = results.rolls.every(r => r.success);
      const outcomeText = allSuccess ? 'Success!' : 'Failure';
      const outcomeClass = allSuccess ? 'outcome-success' : 'outcome-failure';

      // Build rolls display
      const rollsHtml = results.rolls.map(r =>
        `<div class="roll-result">Roll: ${r.value} vs target ${r.target} — ${r.success ? 'Hit' : 'Miss'}</div>`
      ).join('');

      // Build effects display
      const effectsHtml = results.effects.length > 0
        ? `<div class="effects-list">${results.effects.map(e => `<div class="effect">${e}</div>`).join('')}</div>`
        : '';

      // Build choice or confirm buttons
      let actionsHtml = '';
      if (results.playerChoice) {
        actionsHtml += `<p class="choice-prompt">${results.playerChoice.prompt}</p>`;
        actionsHtml += results.playerChoice.options.map(opt =>
          `<button type="button" class="btn-choice" data-choice="${opt.value}">${opt.label}</button>`
        ).join(' ');
      } else {
        actionsHtml = '<button type="button" class="btn-confirm">Confirm</button>';
      }

      overlay.innerHTML = `
        <div class="modal resolution-modal">
          <h3>${results.operationName}</h3>
          <div class="rolls-section">${rollsHtml}</div>
          <div class="outcome ${outcomeClass}">${outcomeText}</div>
          ${effectsHtml}
          <div class="modal-actions">${actionsHtml}</div>
        </div>
      `;

      // Wire up confirm button
      const confirmBtn = overlay.querySelector('.btn-confirm');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', function () {
          overlay.remove();
          resolve(null);
        });
      }

      // Wire up choice buttons
      const choiceBtns = overlay.querySelectorAll('.btn-choice');
      choiceBtns.forEach(btn => {
        btn.addEventListener('click', function () {
          const choiceValue = btn.dataset.choice;
          overlay.remove();
          resolve(choiceValue);
        });
      });

      document.body.appendChild(overlay);
    });
  }

  return {
    diceInput,
    cardInput,
    showResolutionModal,
  };
})();
