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
    console.log('🔄 Switching to calculator:', calculatorId);
    currentCalculatorId = calculatorId;

    // Update active tab
    selectorContainer.querySelectorAll('.module-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.calculator === calculatorId);
    });

    // Render new form
    const formContainer = document.querySelector('.calculator-form');
    console.log('Rendering form for:', calculatorId);
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
   * Parse compact date-name format: "30.07.1982 Петров Иван Иванович"
   */
  const parseDateName = (str) => {
    if (!str) return null;
    const parts = str.trim().split(/\s+/);
    if (parts.length < 3) return null;

    const dateParts = parts[0].split('.');
    if (dateParts.length !== 3) return null;

    const day = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10);
    const year = parseInt(dateParts[2], 10);

    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    if (day < 1 || day > 31) return null;
    if (month < 1 || month > 12) return null;
    if (year < 1900 || year > new Date().getFullYear()) return null;

    const surname = parts[1];
    const name = parts[2];
    const patronymic = parts[3] || '';

    // Validate that parts are Cyrillic only
    const cyrillic = /^[А-Яа-яЁё-]*$/.test(surname + name + patronymic);
    if (!cyrillic) return null;

    return { day, month, year, surname, name, patronymic };
  };

  /**
   * Render dynamic form based on calculator config
   */
  const renderForm = (container, calculatorId) => {
    console.log('📋 Rendering form for calculator:', calculatorId);
    const calculator = CalculatorRegistry.getCalculator(calculatorId);
    console.log('Calculator config retrieved:', !!calculator);

    if (!calculator) {
      console.error('Calculator not found:', calculatorId);
      container.innerHTML = '<p class="form-error">Калькулятор не найден</p>';
      return;
    }

    console.log('Calculator inputs:', Object.keys(calculator.inputs));
    let formHTML = '';

    // Special compact form for compatibility calculator
    if (calculatorId === 'compatibility') {
      console.log('Using compact form for compatibility calculator');
      formHTML = `
        <div class="form-section-group">
          <h4 style="margin-bottom: 16px; color: var(--text); font-size: 0.95rem; font-weight: 600;">Человек 1</h4>
          <div class="form-group">
            <label class="form-label">ФИО и дата рождения</label>
            <input
              type="text"
              class="form-input"
              name="person1Data"
              placeholder="30.07.1982 Петров Иван Иванович"
              required
            />
            <span class="form-hint" style="font-size: 0.85rem; color: #999; margin-top: 4px;">Формат: дата (ДД.ММ.ГГГГ) фамилия имя отчество</span>
            <span class="form-error hidden" data-field="person1Data"></span>
          </div>
        </div>

        <div class="form-section-group">
          <h4 style="margin-bottom: 16px; color: var(--text); font-size: 0.95rem; font-weight: 600;">Человек 2</h4>
          <div class="form-group">
            <label class="form-label">ФИО и дата рождения</label>
            <input
              type="text"
              class="form-input"
              name="person2Data"
              placeholder="15.03.1985 Иванова Анна Сергеевна"
              required
            />
            <span class="form-hint" style="font-size: 0.85rem; color: #999; margin-top: 4px;">Формат: дата (ДД.ММ.ГГГГ) фамилия имя отчество</span>
            <span class="form-error hidden" data-field="person2Data"></span>
          </div>
        </div>
      `;

      container.innerHTML = formHTML;

      // Add button
      container.innerHTML += `
        <div class="button-group">
          <button type="button" class="btn btn-primary" data-calculator="${calculatorId}">
            Рассчитать совместимость
          </button>
        </div>
      `;

      const submitBtn = container.querySelector('.btn-primary');
      if (submitBtn) {
        console.log('Attaching click handler to submit button (compatibility)');
        submitBtn.removeEventListener('click', handleFormSubmit);
        submitBtn.addEventListener('click', handleFormSubmit);
        submitBtn.addEventListener('click', () => {
          console.log('✓ Button click is firing');
        });
      }
      return;
    }

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
        <button type="button" class="btn btn-primary" data-calculator="${calculatorId}">
          Рассчитать
        </button>
      </div>
    `;

    container.innerHTML = formHTML;

    // Add click handler to submit button
    const submitBtn = container.querySelector('.btn-primary');
    console.log('Submit button found:', !!submitBtn);
    if (submitBtn) {
      console.log('Attaching click handler to submit button');
      submitBtn.removeEventListener('click', handleFormSubmit);
      submitBtn.addEventListener('click', handleFormSubmit);

      // Test that the listener was attached
      submitBtn.addEventListener('click', () => {
        console.log('✓ Button click is firing');
      });
    } else {
      console.error('❌ Submit button not found');
    }
  };

  /**
   * Handle form submission
   */
  const handleFormSubmit = function(e) {
    console.log('📝 Form submission triggered');
    e.preventDefault();

    // Find the form container
    const formContainer = e.target.closest('.calculator-form') || document.querySelector('.calculator-form');
    console.log('Form container found:', !!formContainer);

    if (!formContainer) {
      console.error('❌ Form container not found');
      return;
    }

    // Get all input fields
    const inputs = formContainer.querySelectorAll('input');
    console.log('Input fields found:', inputs.length);
    const data = {};

    inputs.forEach(input => {
      data[input.name] = input.value;
      console.log(`  - ${input.name}: "${input.value}"`);
    });

    console.log('Collected data:', data);

    // Special handling for compatibility calculator (parse compact format)
    if (currentCalculatorId === 'compatibility') {
      console.log('🔍 Parsing compact format for compatibility...');
      console.log('Person 1 raw:', data.person1Data);
      console.log('Person 2 raw:', data.person2Data);

      const person1Parsed = parseDateName(data.person1Data);
      const person2Parsed = parseDateName(data.person2Data);

      console.log('Person 1 parsed:', person1Parsed);
      console.log('Person 2 parsed:', person2Parsed);

      if (!person1Parsed) {
        console.error('❌ Cannot parse person 1 data:', data.person1Data);
        showFieldError('person1Data', 'Неправильный формат. Используйте: 30.07.1982 Петров Иван Иванович');
        return;
      }

      if (!person2Parsed) {
        console.error('❌ Cannot parse person 2 data:', data.person2Data);
        showFieldError('person2Data', 'Неправильный формат. Используйте: 15.03.1985 Иванова Анна Сергеевна');
        return;
      }

      // Convert to registry format
      data = {
        person1Name: person1Parsed.surname + ' ' + person1Parsed.name,
        person1Day: person1Parsed.day,
        person1Month: person1Parsed.month,
        person1Year: person1Parsed.year,
        person2Name: person2Parsed.surname + ' ' + person2Parsed.name,
        person2Day: person2Parsed.day,
        person2Month: person2Parsed.month,
        person2Year: person2Parsed.year
      };

      console.log('✓ Successfully parsed compatibility data:', data);
    }

    // Validate
    const calculator = CalculatorRegistry.getCalculator(currentCalculatorId);
    console.log('Calculator found:', !!calculator);

    if (!calculator) {
      console.error('Calculator not found:', currentCalculatorId);
      showError('Калькулятор не найден');
      return;
    }

    const validation = CalculatorValidation.validateForm(data, calculator.inputs);
    console.log('Validation result:', validation.valid, validation.errors);

    if (!validation.valid) {
      // Show errors
      for (const [fieldName, error] of Object.entries(validation.errors)) {
        console.log(`Error on field ${fieldName}: ${error}`);
        showFieldError(fieldName, error);
      }
      return;
    }

    // Clear errors
    document.querySelectorAll('.form-error').forEach((el) => {
      el.classList.add('hidden');
    });

    console.log('🧮 Executing calculation...');
    // Execute calculation
    const result = CalculatorRegistry.executeCalculation(currentCalculatorId, data);
    console.log('Calculation result:', result);

    if (!result.success) {
      console.error('Calculation failed:', result.error);
      showError(result.error);
      return;
    }

    // Show result
    lastResult = result;
    const resultArea = document.querySelector('.result-area');
    console.log('Rendering result to:', resultArea);
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
