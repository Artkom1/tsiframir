/**
 * CALCULATOR UI
 * DOM rendering and event handling
 */

const CalculatorUI = (() => {
  let currentCalculatorId = 'birthDate';
  let lastResult = null;

  /**
   * Render module selector (tabs)
   */
  const renderModuleSelector = (container) => {
    const calculators = CalculatorRegistry.getAllCalculators(true);

    const selectorHTML = calculators
      .map((calc, idx) => `
        <button
          class="module-tab ${idx === 0 ? 'active' : ''}"
          data-calculator="${calc.id}"
          title="${calc.description}"
        >
          ${calc.title}
        </button>
      `)
      .join('');

    container.innerHTML = selectorHTML;

    // Add event listeners
    container.querySelectorAll('.module-tab').forEach((btn) => {
      btn.addEventListener('click', () => switchCalculator(btn.dataset.calculator, container));
    });
  };

  /**
   * Switch active calculator
   */
  const switchCalculator = (calculatorId, selectorContainer) => {
    currentCalculatorId = calculatorId;

    // Update active tab
    selectorContainer.querySelectorAll('.module-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.calculator === calculatorId);
    });

    // Render new form
    const formContainer = document.querySelector('.calculator-form');
    renderForm(formContainer, calculatorId);

    // Clear previous result
    const resultArea = document.querySelector('.result-area');
    renderEmpty(resultArea);

    // Scroll to form
    setTimeout(() => {
      formContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  /**
   * Render dynamic form based on calculator config
   */
  const renderForm = (container, calculatorId) => {
    const calculator = CalculatorRegistry.getCalculator(calculatorId);

    if (!calculator) {
      container.innerHTML = '<p class="form-error">Калькулятор не найден</p>';
      return;
    }

    let formHTML = '';
    let currentSection = '';

    // Render input fields
    for (const [fieldName, fieldConfig] of Object.entries(calculator.inputs)) {
      const fieldType = fieldConfig.type || 'text';

      // Group fields for compatibility (person1, person2)
      const newSection = fieldName.includes('person')
        ? fieldName.substring(0, fieldName.indexOf('Day') || fieldName.indexOf('Month') || fieldName.indexOf('Year') || fieldName.indexOf('Name'))
        : '';

      if (newSection && newSection !== currentSection) {
        if (currentSection) formHTML += '</div>'; // Close previous group
        const personNum = newSection.includes('person1') ? '1' : '2';
        formHTML += `<div class="form-section-group"><h4 style="margin-bottom: 16px; color: var(--text); font-size: 0.95rem; font-weight: 600;">Человек ${personNum}</h4>`;
        currentSection = newSection;
      }

      if (fieldType === 'number') {
        formHTML += `
          <div class="form-group">
            <label class="form-label">
              ${fieldConfig.label}
              ${fieldConfig.required ? '' : '<span class="hint">(опционально)</span>'}
            </label>
            <input
              type="number"
              class="form-input"
              name="${fieldName}"
              placeholder="${fieldConfig.placeholder || ''}"
              min="${fieldConfig.min || ''}"
              max="${fieldConfig.max || ''}"
              ${fieldConfig.required ? 'required' : ''}
            />
            <span class="form-error hidden" data-field="${fieldName}"></span>
          </div>
        `;
      } else {
        formHTML += `
          <div class="form-group">
            <label class="form-label">
              ${fieldConfig.label}
              ${fieldConfig.required ? '' : '<span class="hint">(опционально)</span>'}
            </label>
            <input
              type="text"
              class="form-input"
              name="${fieldName}"
              placeholder="${fieldConfig.placeholder || ''}"
              ${fieldConfig.required ? 'required' : ''}
            />
            <span class="form-error hidden" data-field="${fieldName}"></span>
          </div>
        `;
      }
    }

    if (currentSection) formHTML += '</div>'; // Close last group

    // Add button
    formHTML += `
      <div class="button-group">
        <button type="submit" class="btn btn-primary">
          Рассчитать
        </button>
      </div>
    `;

    container.innerHTML = formHTML;

    // Add form submission handler
    const form = container.closest('form') || container.parentElement.querySelector('form');
    if (form) {
      form.removeEventListener('submit', handleFormSubmit);
      form.addEventListener('submit', handleFormSubmit);
    } else {
      // If no form wrapper, create event listener directly
      const submitBtn = container.querySelector('.btn-primary');
      if (submitBtn) {
        submitBtn.addEventListener('click', (e) => {
          e.preventDefault();
          handleFormSubmit.call(container);
        });
      }
    }
  };

  /**
   * Handle form submission
   */
  const handleFormSubmit = function(e) {
    e.preventDefault();

    // Get form data
    const form = e.target.tagName === 'FORM' ? e.target : this.closest('form');
    const formData = new FormData(form || this);
    const data = Object.fromEntries(formData);

    // Validate
    const calculator = CalculatorRegistry.getCalculator(currentCalculatorId);
    const validation = CalculatorValidation.validateForm(data, calculator.inputs);

    if (!validation.valid) {
      // Show errors
      for (const [fieldName, error] of Object.entries(validation.errors)) {
        showFieldError(fieldName, error);
      }
      return;
    }

    // Clear errors
    document.querySelectorAll('.form-error').forEach((el) => {
      el.classList.add('hidden');
    });

    // Execute calculation
    const result = CalculatorRegistry.executeCalculation(currentCalculatorId, data);

    if (!result.success) {
      showError(result.error);
      return;
    }

    // Show result
    lastResult = result;
    const resultArea = document.querySelector('.result-area');
    renderResult(resultArea, result);

    // Scroll to result
    setTimeout(() => {
      resultArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
  };

  /**
   * Show field error
   */
  const showFieldError = (fieldName, error) => {
    const input = document.querySelector(`input[name="${fieldName}"]`);
    const errorEl = document.querySelector(`[data-field="${fieldName}"]`);

    if (input) {
      input.classList.add('error');
    }
    if (errorEl) {
      errorEl.textContent = error;
      errorEl.classList.remove('hidden');
    }
  };

  /**
   * Clear field error on input
   */
  const clearFieldError = (fieldName) => {
    const input = document.querySelector(`input[name="${fieldName}"]`);
    const errorEl = document.querySelector(`[data-field="${fieldName}"]`);

    if (input) {
      input.classList.remove('error');
      input.addEventListener('input', function handler() {
        this.classList.remove('error');
        this.removeEventListener('input', handler);
      });
    }
    if (errorEl) {
      errorEl.classList.add('hidden');
    }
  };

  /**
   * Render result panel (handles different calculator types)
   */
  const renderResult = (container, result) => {
    const { output, trace, method } = result;

    let resultHTML = '<div class="result-panel">';

    // Handle different calculator types
    if (method === 'compatibility') {
      const { person1, person2, compatibility } = output;
      resultHTML += `
        <div class="result-header">
          <h3>Совместимость</h3>
        </div>

        <div class="compatibility-display">
          <div class="person-code">
            <div class="person-name">${person1.name}</div>
            <div class="person-code-value">${person1.code}</div>
            <div class="person-meaning">${person1.meaning}</div>
          </div>

          <div class="compatibility-meter">
            <div class="compatibility-bar">
              <div class="compatibility-fill" style="width: ${compatibility.percent}%"></div>
            </div>
            <div class="compatibility-percent">${compatibility.percent}%</div>
            <div class="compatibility-level">${compatibility.level}</div>
          </div>

          <div class="person-code">
            <div class="person-name">${person2.name}</div>
            <div class="person-code-value">${person2.code}</div>
            <div class="person-meaning">${person2.meaning}</div>
          </div>
        </div>

        <div class="compatibility-description">
          <p>${compatibility.description}</p>
        </div>
      `;
    } else if (method === 'lifeCycles') {
      const { totalLives, lifeDescription, dominantNumbers } = output;
      resultHTML += `
        <div class="result-header">
          <h3>Прожитые жизни</h3>
        </div>

        <div class="code-display">
          <div class="code-primary">${totalLives}</div>
        </div>

        <div class="interpretation">
          <h4>Описание</h4>
          <p class="meaning-text">${lifeDescription}</p>
        </div>

        ${dominantNumbers.length > 0 ? `
          <div class="dominant-numbers">
            <h4>Доминирующие числа:</h4>
            <div class="numbers-grid">
              ${dominantNumbers.map((num) => `
                <div class="number-card">
                  <div class="number-code">${num.number}</div>
                  <div class="number-freq">×${num.frequency}</div>
                  <div class="number-meaning">${num.meaning}</div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      `;
    } else if (method === 'passportAnalysis') {
      const { primary, secondary, meaning, seriesAnalysis, numberAnalysis } = output;
      resultHTML += `
        <div class="result-header">
          <h3>Анализ паспорта</h3>
        </div>

        <div class="code-display">
          <div class="code-primary">${primary}</div>
          ${secondary !== primary ? `
            <div class="code-reduction">
              →
              <span class="code-reduction-result">${secondary}</span>
            </div>
          ` : ''}
        </div>

        <div class="interpretation">
          <h4>Значение</h4>
          <p class="meaning-text">${meaning}</p>
        </div>

        <div class="passport-analysis">
          <div class="analysis-item">${seriesAnalysis}</div>
          <div class="analysis-item">${numberAnalysis}</div>
        </div>
      `;
    } else {
      // Default (birth date, full name, word code)
      const { primary, secondary, meaning } = output;
      resultHTML += `
        <div class="result-header">
          <h3>Ваш код</h3>
        </div>

        <div class="code-display">
          <div class="code-primary">${primary}</div>
          ${secondary !== primary ? `
            <div class="code-reduction">
              →
              <span class="code-reduction-result">${secondary}</span>
            </div>
          ` : ''}
        </div>

        <div class="interpretation">
          <h4>Значение</h4>
          <p class="meaning-text">${meaning}</p>
        </div>
      `;
    }

    // Add trace for all
    resultHTML += `
      <div class="calculation-trace">
        <details>
          <summary>Как мы считали</summary>
          <ol class="trace-steps">
            ${trace.map((step) => `<li>${step}</li>`).join('')}
          </ol>
        </details>
      </div>
    </div>
    `;

    container.innerHTML = resultHTML;
  };

  /**
   * Render empty state
   */
  const renderEmpty = (container) => {
    container.innerHTML = `
      <div class="result-empty">
        <div class="result-empty-icon">✨</div>
        <p>Заполните форму и нажмите "Рассчитать" чтобы увидеть результат</p>
      </div>
    `;
  };

  /**
   * Show error message
   */
  const showError = (message) => {
    const resultArea = document.querySelector('.result-area');
    resultArea.innerHTML = `
      <div class="result-panel" style="border-color: #f44336; background: rgba(244, 67, 54, 0.05);">
        <p style="color: #f44336; text-align: center; font-weight: 600; margin: 0;">
          ⚠️ ${message}
        </p>
      </div>
    `;
  };

  /**
   * Initialize the entire calculator system
   */
  const init = () => {
    // Find container
    const container = document.querySelector('.center-of-codes');
    if (!container) {
      console.warn('Calculator container not found');
      return;
    }

    // Find or create elements
    const selectorContainer = container.querySelector('.module-selector') ||
                            (() => {
                              const el = document.createElement('div');
                              el.className = 'module-selector';
                              container.insertBefore(el, container.querySelector('.calculator-form'));
                              return el;
                            })();

    const formContainer = container.querySelector('.calculator-form') ||
                         (() => {
                           const el = document.createElement('div');
                           el.className = 'calculator-form';
                           container.appendChild(el);
                           return el;
                         })();

    const resultArea = container.querySelector('.result-area') ||
                      (() => {
                        const el = document.createElement('div');
                        el.className = 'result-area';
                        container.appendChild(el);
                        return el;
                      })();

    // Render selector
    renderModuleSelector(selectorContainer);

    // Render initial form
    renderForm(formContainer, currentCalculatorId);

    // Render empty result area
    renderEmpty(resultArea);

    // Add input event listeners for error clearing
    formContainer.addEventListener('input', (e) => {
      if (e.target.classList.contains('form-input')) {
        clearFieldError(e.target.name);
      }
    });

    return { container, selectorContainer, formContainer, resultArea };
  };

  /**
   * Public API
   */
  return {
    init,
    renderModuleSelector,
    renderForm,
    renderResult,
    renderEmpty,
    switchCalculator,
    showError,
    getLastResult: () => lastResult,
    getCurrentCalculatorId: () => currentCalculatorId
  };
})();
