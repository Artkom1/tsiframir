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
   * Render word code analysis result
   */
  const renderWordCodeResult = (container, result) => {
    const { primary, secondary, meaning } = result.output;
    const interp = INTERPRETATIONS_DB[secondary] || {};

    const html = `
      <div class="result-panel">
        <div class="result-header">
          <h3>📝 Анализ слова</h3>
        </div>

        <!-- ОСНОВНОЙ КОД -->
        <div class="interpretation-sections">
          <section class="interp-section">
            <h4>🔢 Цифровой код слова</h4>
            <div style="display: flex; gap: 20px; align-items: center; margin: 20px 0;">
              <div style="flex: 1;">
                <p style="font-size: 0.9rem; color: #666; margin: 0 0 10px 0;"><strong>Слово:</strong></p>
                <p style="font-size: 1.8rem; font-weight: bold; color: var(--gold); margin: 0;">${result.inputs.word.toUpperCase()}</p>
              </div>
              <div style="text-align: center; padding: 15px; background: #f9f9f9; border-radius: 8px;">
                <p style="font-size: 0.85rem; color: #999; margin: 0 0 5px 0;">Итоговый код</p>
                <p style="font-size: 2.5rem; font-weight: bold; color: var(--gold); margin: 0;">${secondary}</p>
              </div>
            </div>
            ${primary !== secondary ? `<p style="color: #666; font-size: 0.9rem;">Промежуточный результат: <strong>${primary}</strong> → <strong>${secondary}</strong></p>` : ''}
          </section>

          <!-- ЗНАЧЕНИЕ КОДА -->
          <section class="interp-section">
            <h4>🔮 Значение числа ${secondary}</h4>
            <p style="font-size: 1.1rem; font-weight: 500; color: var(--blue); margin: 15px 0;">${meaning}</p>
            <p>${interp.description || 'Это число содержит глубокую энергию и множество граней для исследования.'}</p>
            ${interp.lifeLesson ? `<p style="margin-top: 15px;"><em><strong>Жизненный урок:</strong> "${interp.lifeLesson}"</em></p>` : ''}
          </section>

          <!-- РАСШИРЕННЫЙ АНАЛИЗ -->
          <section class="interp-section ai-button-section">
            <button class="btn btn-ai" data-number="${secondary}" data-type="${result.method}">
              ✨ Получить расширенный анализ
            </button>
            <p style="font-size: 0.9rem; color: #999; margin-top: 12px; text-align: center;">
              Более подробный анализ с практическими рекомендациями
            </p>
          </section>
        </div>

        <!-- РАСЧЁТНЫЙ ШАГ ЗА ШАГОМ -->
        <div class="calculation-trace">
          <details>
            <summary>📐 Как мы считали</summary>
            <ol class="trace-steps">
              ${result.trace.map((step) => `<li>${step}</li>`).join('')}
            </ol>
          </details>
        </div>
      </div>
    `;

    container.innerHTML = html;
    attachAIButtonHandlers(container);
  };

  /**
   * Render compatibility result
   */
  const renderCompatibilityResult = (container, result) => {
    const { person1, person2, compatibility } = result.output;
    const { percent, level, description } = compatibility;

    const html = `
      <div class="result-panel">
        <div class="result-header">
          <h3>💑 Совместимость двух людей</h3>
        </div>

        <div class="compatibility-display" style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 20px; align-items: center; margin: 30px 0;">
          <!-- Человек 1 -->
          <div style="text-align: center; padding: 20px; background: #f0f0f0; border-radius: 10px;">
            <h4 style="margin: 0 0 10px 0;">${person1.name}</h4>
            <div style="font-size: 2.5rem; font-weight: bold; color: var(--gold); margin: 10px 0;">${person1.code}</div>
            <p style="color: #666; margin: 10px 0 0 0;">${person1.meaning}</p>
          </div>

          <!-- Результат совместимости -->
          <div style="text-align: center;">
            <div style="font-size: 3rem; font-weight: bold; color: var(--gold); margin: 10px 0;">
              ${percent}%
            </div>
            <div style="background: linear-gradient(90deg, #d4b85a 0%, #d4b85a ${percent}%, #e0e0e0 ${percent}%, #e0e0e0 100%); height: 8px; border-radius: 4px; margin: 10px 0; width: 100px;"></div>
            <p style="color: #666; margin: 10px 0; font-weight: bold;">${level}</p>
          </div>

          <!-- Человек 2 -->
          <div style="text-align: center; padding: 20px; background: #f0f0f0; border-radius: 10px;">
            <h4 style="margin: 0 0 10px 0;">${person2.name}</h4>
            <div style="font-size: 2.5rem; font-weight: bold; color: var(--gold); margin: 10px 0;">${person2.code}</div>
            <p style="color: #666; margin: 10px 0 0 0;">${person2.meaning}</p>
          </div>
        </div>

        <!-- Описание совместимости -->
        <div class="interpretation-sections" style="margin-top: 30px;">
          <section class="interp-section">
            <h4>📊 Анализ совместимости</h4>
            <p>${description}</p>
          </section>

          <!-- РАСШИРЕННЫЙ АНАЛИЗ -->
          <section class="interp-section ai-button-section">
            <button class="btn btn-ai" data-number="${result.calculation.person1Code}" data-type="${result.method}">
              ✨ Получить расширенный анализ
            </button>
            <p style="font-size: 0.9rem; color: #999; margin-top: 12px; text-align: center;">
              Более подробный анализ с практическими рекомендациями
            </p>
          </section>
        </div>

        <!-- РАСЧЁТНЫЙ ШАГ ЗА ШАГОМ -->
        <div class="calculation-trace">
          <details>
            <summary>📐 Как мы считали</summary>
            <ol class="trace-steps">
              ${result.trace.map((step) => `<li>${step}</li>`).join('')}
            </ol>
          </details>
        </div>
      </div>
    `;

    container.innerHTML = html;
    attachAIButtonHandlers(container);
  };

  /**
   * Render local interpretation with AI button
   */
  const renderLocalInterpretation = (container, result) => {
    // Handle compatibility results separately
    if (result.method === 'compatibility') {
      renderCompatibilityResult(container, result);
      return;
    }

    // Handle word code analysis separately
    if (result.method === 'wordCode') {
      renderWordCodeResult(container, result);
      return;
    }

    const num = result.output.secondary;
    const interp = INTERPRETATIONS_DB[num] || {};

    const html = `
      <div class="result-panel">
        <div class="result-header">
          <h3>📊 Ваш код: ${result.output.primary}${result.output.secondary !== result.output.primary ? ` → ${result.output.secondary}` : ''}</h3>
        </div>

        <!-- ОСНОВНОЙ АНАЛИЗ -->
        <div class="interpretation-sections">
          <section class="interp-section">
            <h4>🔮 Значение</h4>
            <p class="meaning-highlight">${result.output.meaning}</p>
            <p>${interp.description || 'Это число содержит глубокую энергию и множество граней для исследования.'}</p>
          </section>

          ${interp.psychology ? `
            <section class="interp-section">
              <h4>💫 Психологический портрет</h4>
              <div class="two-columns">
                <div>
                  <strong>✨ Сильные стороны:</strong>
                  <ul>
                    ${(interp.psychology.strengths || []).map(s => `<li>${s}</li>`).join('')}
                  </ul>
                </div>
                <div>
                  <strong>🌱 Развитие:</strong>
                  <ul>
                    ${(interp.psychology.challenges || []).map(c => `<li>${c}</li>`).join('')}
                  </ul>
                </div>
              </div>
            </section>
          ` : ''}

          ${interp.lifeLesson ? `
            <section class="interp-section">
              <h4>🎯 Жизненный урок</h4>
              <p><em>"${interp.lifeLesson}"</em></p>
            </section>
          ` : ''}

          ${interp.career ? `
            <section class="interp-section">
              <h4>🏢 Карьера и вызов</h4>
              <ul>
                ${interp.career.map(c => `<li>${c}</li>`).join('')}
              </ul>
            </section>
          ` : ''}

          ${interp.relationships ? `
            <section class="interp-section">
              <h4>❤️ В отношениях</h4>
              <p>${interp.relationships}</p>
            </section>
          ` : ''}

          <!-- РАСШИРЕННЫЙ АНАЛИЗ -->
          <section class="interp-section ai-button-section">
            <button class="btn btn-ai" data-number="${num}" data-type="${result.method}">
              ✨ Получить расширенный анализ
            </button>
            <p style="font-size: 0.9rem; color: #999; margin-top: 12px; text-align: center;">
              Более подробный анализ с практическими рекомендациями
            </p>
          </section>
        </div>

        <!-- РАСЧЁТНЫЙ ШАГ ЗА ШАГОМ -->
        <div class="calculation-trace">
          <details>
            <summary>📐 Как мы считали</summary>
            <ol class="trace-steps">
              ${result.trace.map((step) => `<li>${step}</li>`).join('')}
            </ol>
          </details>
        </div>
      </div>
    `;

    container.innerHTML = html;
    attachAIButtonHandlers(container);
  };

  /**
   * Database of interpretations (loaded from JSON)
   */
  let INTERPRETATIONS_DB = {};

  /**
   * Load interpretations from JSON
   */
  const loadInterpretations = async () => {
    try {
      console.log('📚 Loading interpretations...');
      const response = await fetch('/assets/data/numerology-system.json');
      const data = await response.json();
      INTERPRETATIONS_DB = data.numberInterpretations.data;
      console.log('✅ Interpretations loaded:', Object.keys(INTERPRETATIONS_DB).length, 'numbers');
    } catch (error) {
      console.error('❌ Error loading interpretations:', error);
    }
  };

  /**
   * Attach AI button handlers
   */
  const attachAIButtonHandlers = (container) => {
    console.log('🔗 attachAIButtonHandlers called');
    const buttons = container.querySelectorAll('.btn-ai');
    console.log('Found AI buttons:', buttons.length);

    buttons.forEach((button, index) => {
      console.log(`Attaching handler to button ${index}:`, button.dataset);
      button.addEventListener('click', () => {
        const number = button.dataset.number;
        const type = button.dataset.type;
        console.log('🖱️  AI button clicked for number:', number, 'type:', type);
        requestAIAnalysis(number, type);
      });
    });
  };

  /**
   * Request AI analysis
   */
  const requestAIAnalysis = async (number, calculatorType) => {
    console.log('🔄 requestAIAnalysis called:', { number, calculatorType });

    const button = document.querySelector(`[data-number="${number}"]`);
    console.log('Button found:', button);
    if (!button) {
      console.error('Button not found for number:', number);
      return;
    }

    const originalText = button.textContent;

    try {
      button.disabled = true;
      button.textContent = '⏳ Генерирую анализ... (5-10 сек)';
      button.style.opacity = '0.6';

      console.log('📤 Sending API request...');
      const apiUrl = 'https://numerology-forum-landing.vercel.app/api/ai-interpretation';
      console.log('API URL:', apiUrl);

      // Create timeout controller (30 second timeout)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          number: parseInt(number),
          calculatorType: calculatorType || 'birthDate'
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      console.log('📥 API response status:', response.status);

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('📋 API response:', result);

      if (!result.success) {
        console.warn('API returned success=false');
        if (result.fallback) {
          showMessage('ℹ️ ' + (result.message || 'AI анализ недоступен. Используем локальный анализ.'), 'info');
        } else {
          showMessage('❌ ' + (result.message || 'Ошибка при генерации анализа'), 'error');
        }
        return;
      }

      // Показать AI анализ
      console.log('✨ Displaying AI analysis...');
      displayAIAnalysis(result.analysis, result.cached);
      button.style.display = 'none';

    } catch (error) {
      console.error('❌ Error requesting AI analysis:', error);
      console.error('Error type:', error.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);

      // More specific error messages
      if (error.name === 'AbortError') {
        showMessage('❌ Ошибка: Запрос истекшелся (30 сек). Сервер медленно отвечает. Попробуйте позже.', 'error');
      } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
        showMessage('❌ Ошибка: fetch не работает. Проверьте сетевое соединение.', 'error');
      } else if (error.name === 'SyntaxError') {
        showMessage('❌ Ошибка: Неверный ответ от сервера. Попробуйте позже.', 'error');
      } else {
        showMessage('❌ Ошибка: ' + error.message, 'error');
      }

    } finally {
      button.disabled = false;
      button.textContent = originalText;
      button.style.opacity = '1';
    }
  };

  /**
   * Display AI analysis result
   */
  const displayAIAnalysis = (analysis, cached = false) => {
    const resultArea = document.querySelector('.result-area');
    const aiSection = document.createElement('div');
    aiSection.className = 'ai-analysis-section';

    // Parse markdown to HTML (simple version)
    let htmlContent = analysis.text
      .replace(/## /g, '<h3 style="margin-top: 20px; margin-bottom: 10px; color: var(--primary-dark); font-size: 1.1rem;">')
      .replace(/\n\n/g, '</h3><p style="margin: 8px 0;">') + '</p>';

    aiSection.innerHTML = `
      <div class="ai-analysis-header">
        <h3>✨ Расширенный анализ</h3>
        <p style="font-size: 0.85rem; color: #999; margin: 4px 0 0 0;">На основе нумерологических принципов</p>
      </div>
      <div class="ai-analysis-content">
        ${htmlContent}
      </div>
      <div class="ai-analysis-footer">
        <small>🕐 ${new Date().toLocaleString('ru-RU')}</small>
      </div>
    `;

    resultArea.appendChild(aiSection);
    aiSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /**
   * Show message to user
   */
  const showMessage = (message, type = 'info') => {
    const resultArea = document.querySelector('.result-area');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message message-${type}`;
    msgDiv.textContent = message;
    resultArea.appendChild(msgDiv);

    setTimeout(() => msgDiv.remove(), 4000);
  };

  /**
   * Render result panel (handles different calculator types)
   */
  const renderResult = (container, result) => {
    const { output, trace, method } = result;

    // Render local interpretation with AI button
    renderLocalInterpretation(container, result);
    return;

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

    // Load interpretations from JSON
    loadInterpretations();

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
