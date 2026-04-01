/**
 * CALCULATOR REGISTRY
 * Module management system
 * Allows dynamic registration and execution of calculators
 */

const CalculatorRegistry = (() => {
  const registry = new Map();

  /**
   * Register a new calculator module
   */
  const registerCalculator = (config) => {
    if (!config.id) {
      console.error('Calculator must have an id');
      return false;
    }

    registry.set(config.id, {
      id: config.id,
      title: config.title,
      description: config.description,
      priority: config.priority || 'NORMAL',
      phase: config.phase || 1,
      enabled: config.enabled !== false,
      inputs: config.inputs || {},
      formula: config.formula || {},
      outputs: config.outputs || {},
      confidenceLevel: config.confidenceLevel || 'UNKNOWN',
      notes: config.notes || ''
    });

    return true;
  };

  /**
   * Get calculator configuration by ID
   */
  const getCalculator = (id) => {
    return registry.get(id);
  };

  /**
   * Get all calculators (optionally filtered by enabled status)
   */
  const getAllCalculators = (onlyEnabled = true) => {
    const calculators = Array.from(registry.values());
    return onlyEnabled ? calculators.filter(c => c.enabled) : calculators;
  };

  /**
   * Get calculators by phase
   */
  const getByPhase = (phase) => {
    return Array.from(registry.values()).filter(c => c.phase === phase && c.enabled);
  };

  /**
   * Execute a calculation
   */
  const executeCalculation = (calculatorId, inputs) => {
    const calculator = getCalculator(calculatorId);

    if (!calculator) {
      return { success: false, error: `Калькулятор ${calculatorId} не найден` };
    }

    if (!calculator.enabled) {
      return { success: false, error: 'Этот калькулятор пока недоступен' };
    }

    // Route to correct calculator
    switch (calculatorId) {
      // Phase 1
      case 'birthDate':
        return CalculatorCore.calculateByBirthDate(
          inputs.day,
          inputs.month,
          inputs.year
        );

      case 'fullName':
        return CalculatorCore.calculateByFullName(
          inputs.surname,
          inputs.name,
          inputs.patronymic || ''
        );

      // Phase 2
      case 'compatibility':
        return CalculatorCore.calculateCompatibility(
          {
            name: inputs.person1Name,
            birthDate: {
              day: inputs.person1Day,
              month: inputs.person1Month,
              year: inputs.person1Year
            }
          },
          {
            name: inputs.person2Name,
            birthDate: {
              day: inputs.person2Day,
              month: inputs.person2Month,
              year: inputs.person2Year
            }
          }
        );

      case 'wordCode':
        return CalculatorCore.calculateByWordCode(inputs.word);

      // Phase 3
      case 'lifeCycles':
        return CalculatorCore.calculateLifeCycles(
          inputs.day,
          inputs.month,
          inputs.year
        );

      case 'passportAnalysis':
        return CalculatorCore.calculatePassportAnalysis(
          inputs.series,
          inputs.number
        );

      default:
        return { success: false, error: 'Неизвестный тип расчета' };
    }
  };

  /**
   * Initialize all Phase 1 calculators (CRITICAL)
   */
  const initPhase1 = () => {
    // Birth Date Calculator
    registerCalculator({
      id: 'birthDate',
      title: 'Расчет по дате рождения',
      description: 'Найдите ваш личный числовой код по дате рождения',
      priority: 'CRITICAL',
      phase: 1,
      enabled: true,
      inputs: {
        day: {
          type: 'number',
          min: 1,
          max: 31,
          required: true,
          label: 'День'
        },
        month: {
          type: 'number',
          min: 1,
          max: 12,
          required: true,
          label: 'Месяц'
        },
        year: {
          type: 'number',
          min: 1900,
          max: 2100,
          required: true,
          label: 'Год'
        }
      },
      formula: {
        description: 'Сумма всех цифр даты → редукция → интерпретация',
        source: 'Глава 9: Просчеты по дате рождения (стр. 69)',
        example: '11.09.2012 → 17 → 8 → зависимость'
      },
      outputs: {
        primary: 'Двузначный или однозначный код',
        secondary: 'Редуцированный однозначный код (1-9)',
        interpretation: 'Мистическое значение из Таблицы №3'
      },
      confidenceLevel: 'HIGH',
      notes: 'Все примеры из книги верифицированы'
    });

    // Full Name Calculator
    registerCalculator({
      id: 'fullName',
      title: 'Расчет по ФИО',
      description: 'Найдите числовой код личности по фамилии и имени',
      priority: 'CRITICAL',
      phase: 1,
      enabled: true,
      inputs: {
        surname: {
          type: 'text',
          required: true,
          label: 'Фамилия',
          placeholder: 'Иванов'
        },
        name: {
          type: 'text',
          required: true,
          label: 'Имя',
          placeholder: 'Сергей'
        },
        patronymic: {
          type: 'text',
          required: true,
          label: 'Отчество',
          placeholder: 'Николаевич'
        }
      },
      formula: {
        description: 'Каждая буква = число (1-33) → сумма → редукция → интерпретация',
        source: 'Глава 2: Русский алфавит (Таблица №1, стр. 21)',
        example: 'Николай Гоголь → 82 → 10 → вера'
      },
      outputs: {
        primary: 'Числовой код личности',
        secondary: 'Редуцированный однозначный код',
        interpretation: 'Психологический портрет из Таблицы №3'
      },
      confidenceLevel: 'HIGH',
      notes: 'Используется отображение букв русского алфавита на числа 1-33'
    });
  };

  /**
   * Initialize all Phase 2 calculators (EXTENDED)
   */
  const initPhase2 = () => {
    // Compatibility Calculator
    registerCalculator({
      id: 'compatibility',
      title: 'Совместимость двух людей',
      description: 'Анализ совместимости между двумя людьми по их кодам',
      priority: 'IMPORTANT',
      phase: 2,
      enabled: true,
      inputs: {
        person1Name: {
          type: 'text',
          required: true,
          label: 'Имя человека 1'
        },
        person1Day: {
          type: 'number',
          min: 1,
          max: 31,
          required: true,
          label: 'День рождения 1'
        },
        person1Month: {
          type: 'number',
          min: 1,
          max: 12,
          required: true,
          label: 'Месяц рождения 1'
        },
        person1Year: {
          type: 'number',
          min: 1900,
          max: 2100,
          required: true,
          label: 'Год рождения 1'
        },
        person2Name: {
          type: 'text',
          required: true,
          label: 'Имя человека 2'
        },
        person2Day: {
          type: 'number',
          min: 1,
          max: 31,
          required: true,
          label: 'День рождения 2'
        },
        person2Month: {
          type: 'number',
          min: 1,
          max: 12,
          required: true,
          label: 'Месяц рождения 2'
        },
        person2Year: {
          type: 'number',
          min: 1900,
          max: 2100,
          required: true,
          label: 'Год рождения 2'
        }
      },
      formula: {
        description: 'Сравнение кодов двух людей по датам рождения',
        source: 'Глава 10: Совместимость по числовым кодам'
      },
      confidenceLevel: 'MEDIUM',
      notes: 'Совместимость считается на основе разницы между личными кодами'
    });

    // Word/Code Analyzer
    registerCalculator({
      id: 'wordCode',
      title: 'Анализ слова или кода',
      description: 'Найдите числовой код любого слова, названия или программы',
      priority: 'IMPORTANT',
      phase: 2,
      enabled: true,
      inputs: {
        word: {
          type: 'text',
          required: true,
          label: 'Слово, название или код',
          placeholder: 'ЦифраМир, Центр Кодов, Успех...'
        }
      },
      formula: {
        description: 'Каждая буква → число (1-33) → сумма → редукция',
        source: 'Таблица №1: Русский алфавит'
      },
      confidenceLevel: 'HIGH',
      notes: 'Анализируется на основе букв русского алфавита'
    });
  };

  /**
   * Initialize all Phase 3 calculators (ADVANCED)
   */
  const initPhase3 = () => {
    // Life Cycles Calculator
    registerCalculator({
      id: 'lifeCycles',
      title: 'Количество прожитых жизней',
      description: 'Определите количество воплощений по дате рождения',
      priority: 'OPTIONAL',
      phase: 3,
      enabled: true,
      inputs: {
        day: {
          type: 'number',
          min: 1,
          max: 31,
          required: true,
          label: 'День'
        },
        month: {
          type: 'number',
          min: 1,
          max: 12,
          required: true,
          label: 'Месяц'
        },
        year: {
          type: 'number',
          min: 1900,
          max: 2100,
          required: true,
          label: 'Год'
        }
      },
      formula: {
        description: 'Количество цифр в дате = количество прожитых жизней',
        source: 'Глава 10: Количество жизней, прожитое личностью (стр. 73)'
      },
      confidenceLevel: 'MEDIUM',
      notes: 'Каждая цифра даты рождения показывает одно воплощение'
    });

    // Passport Analysis
    registerCalculator({
      id: 'passportAnalysis',
      title: 'Анализ паспортных данных',
      description: 'Расчет кода по номеру и серии паспорта',
      priority: 'OPTIONAL',
      phase: 3,
      enabled: true,
      inputs: {
        series: {
          type: 'text',
          required: true,
          label: 'Серия паспорта',
          placeholder: '6556 или 65569'
        },
        number: {
          type: 'text',
          required: true,
          label: 'Номер паспорта',
          placeholder: '8187921'
        }
      },
      formula: {
        description: 'Серия + номер → сумма цифр → редукция → интерпретация',
        source: 'Глава 16: Паспортные данные - СССР (специальный раздел)'
      },
      confidenceLevel: 'MEDIUM',
      notes: 'Номер паспорта содержит информацию о судьбе и возможностях'
    });
  };

  /**
   * Initialize all calculators (all phases)
   */
  const initAll = () => {
    initPhase1();
    initPhase2();
    initPhase3();
  };

  /**
   * Public API
   */
  return {
    registerCalculator,
    getCalculator,
    getAllCalculators,
    getByPhase,
    executeCalculation,
    initPhase1,
    initPhase2,
    initPhase3,
    initAll,

    // Statistics
    getCount: () => registry.size,
    getEnabledCount: () => Array.from(registry.values()).filter(c => c.enabled).length
  };
})();

// Auto-initialize all calculators on script load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    CalculatorRegistry.initAll();
  });
} else {
  CalculatorRegistry.initAll();
}
