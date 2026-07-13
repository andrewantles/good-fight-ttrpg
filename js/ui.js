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

  /**
   * Show a base-die choice modal for a Recruit Attempt.
   * @param {boolean} canAffordSupply - Whether the player has a Supply to spend on d12
   * @returns {Promise<'d10'|'d12'>} Resolves with the chosen base die
   */
  function recruitDieChoice(canAffordSupply) {
    return new Promise((resolve) => {
      const overlay = createOverlay();
      overlay.innerHTML = `
        <div class="modal">
          <h3>Choose your Recruit Attempt base die:</h3>
          <div class="choice-buttons">
            <button type="button" data-choice="d10">d10</button>
            <button type="button" data-choice="d12" ${canAffordSupply ? '' : 'disabled'}>d12 (spend 1 Supply)</button>
          </div>
        </div>
      `;

      overlay.querySelectorAll('button[data-choice]').forEach((btn) => {
        btn.addEventListener('click', function () {
          const choice = btn.dataset.choice;
          overlay.remove();
          resolve(choice);
        });
      });

      document.body.appendChild(overlay);
    });
  }

  /**
   * Show the Compound Failure second-penalty choice modal: detain 1 more
   * Operative, or lose 2 Supplies instead. Resolves the `secondPenaltyChoice`
   * consumed by Operations.resolveSignificantVandalism / resolveScout.
   * @returns {Promise<'detain'|'supplies'>} Resolves with the chosen penalty
   */
  function compoundFailureChoice() {
    return new Promise((resolve) => {
      const overlay = createOverlay();
      overlay.innerHTML = `
        <div class="modal">
          <h3>Compound Failure — choose your second penalty:</h3>
          <div class="choice-buttons">
            <button type="button" data-choice="detain">Detain 1 more Operative</button>
            <button type="button" data-choice="supplies">Lose 2 Supplies</button>
          </div>
        </div>
      `;

      overlay.querySelectorAll('button[data-choice]').forEach((btn) => {
        btn.addEventListener('click', function () {
          const choice = btn.dataset.choice;
          overlay.remove();
          resolve(choice);
        });
      });

      document.body.appendChild(overlay);
    });
  }

  /**
   * Show a picker letting the player select exactly `count` Operatives
   * to assign to an Operation.
   * @param {number} count - Exact number of Operatives to select (K)
   * @param {Array<{suit, rank, value}>} availableOperatives
   * @returns {Promise<Array<{suit, rank, value}>>} Resolves with the chosen Operative card objects
   */
  function assignOperatives(count, availableOperatives) {
    return new Promise((resolve) => {
      const overlay = createOverlay();
      overlay.innerHTML = `
        <div class="modal">
          <h3>Select ${count} Operative${count === 1 ? '' : 's'} to assign:</h3>
          <div class="operative-picker" data-operative-list></div>
          <button type="button" data-submit disabled>Submit</button>
        </div>
      `;

      const list = overlay.querySelector('[data-operative-list]');
      availableOperatives.forEach((op, i) => {
        const label = document.createElement('label');
        label.className = 'operative-option';
        label.innerHTML = `<input type="checkbox" data-index="${i}"> ${op.rank} of ${op.suit} (${op.value})`;
        list.appendChild(label);
      });

      const submitButton = overlay.querySelector('[data-submit]');
      const checkboxes = Array.from(overlay.querySelectorAll('input[type="checkbox"]'));

      function updateSubmitState() {
        const checkedCount = checkboxes.filter((cb) => cb.checked).length;
        submitButton.disabled = checkedCount !== count;
      }

      checkboxes.forEach((cb) => cb.addEventListener('change', updateSubmitState));

      submitButton.addEventListener('click', function () {
        const chosen = checkboxes
          .filter((cb) => cb.checked)
          .map((cb) => availableOperatives[parseInt(cb.dataset.index, 10)]);
        overlay.remove();
        resolve(chosen);
      });

      document.body.appendChild(overlay);
    });
  }

  function createOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    return overlay;
  }

  return {
    diceInput,
    cardInput,
    recruitDieChoice,
    assignOperatives,
    compoundFailureChoice,
  };
})();
