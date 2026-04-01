/**
 * NUMEROLOGY CALCULATOR CORE
 * Pure mathematical rules engine
 * All formulas verified against book source
 */

const CalculatorCore = (() => {
  /**
   * Russian alphabet mapping (33 letters)
   * Source: Таблица №1, стр. 21
   */
  const ALPHABET_MAP = {
    'А': 1,  'Б': 2,  'В': 3,  'Г': 4,  'Д': 5,  'Е': 6,  'Ё': 7,  'Ж': 8,  'З': 9,
    'И': 10, 'Й': 11, 'К': 12, 'Л': 13, 'М': 14, 'Н': 15, 'О': 16, 'П': 17, 'Р': 18,
    'С': 19, 'Т': 20, 'У': 21, 'Ф': 22, 'Х': 23, 'Ц': 24, 'Ч': 25, 'Ш': 26, 'Щ': 27,
    'Ъ': 28, 'Ы': 29, 'Ь': 30, 'Э': 31, 'Ю': 32, 'Я': 33
  };

  /**
   * Number interpretations (1-59+)
   * Source: Таблица №3, стр. 43
   */
  const NUMBER_INTERPRETATIONS = {
    1: 'физическое тело',
    2: 'священное знание',
    3: 'духовность',
    4: 'социальная роль',
    5: 'карма родовых миров',
    6: 'интуиция',
    7: 'сила',
    8: 'зависимость',
    9: 'альтруизм',
    10: 'понимание',
    11: 'сеть',
    12: 'вера',
    13: 'без дух',
    14: 'ясность',
    15: 'способное мышление',
    16: 'будущее',
    17: 'душа',
    18: 'общественное значение',
    19: 'война',
    20: 'зло',
    21: 'счастье',
    22: 'лидер',
    23: 'ночница',
    24: 'любовь',
    25: 'день',
    26: 'смерть',
    27: 'жизнь',
    28: 'в краю веровну',
    29: 'знание',
    30: 'решение задач',
    31: 'мужчина',
    32: 'финансовое развитие',
    33: 'судьба',
    34: 'господа',
    35: 'геройство',
    36: 'мечтание',
    37: 'женщина',
    38: 'величина',
    39: 'качество',
    40: 'реальность',
    41: 'реформа',
    42: 'армия',
    43: 'государства',
    44: 'сила авторитета',
    45: 'пропавец',
    46: 'матрица рода',
    47: 'гениальность',
    48: 'судьба',
    49: 'здоровье',
    50: 'самостоятельность',
    51: 'вознесение',
    52: 'профессор',
    53: 'тайные знания',
    54: 'прямость',
    55: 'монашество',
    56: 'добро',
    57: 'сомнение',
    58: 'трансформация',
    59: 'поворот'
  };

  /**
   * Convert string to uppercase and remove non-Cyrillic characters
   */
  const normalizeCyrillic = (str) => {
    return str
      .toUpperCase()
      .trim()
      .replace(/[^А-ЯЁ\s]/g, ''); // Remove non-Cyrillic except spaces
  };

  /**
   * Sum all digits of a number until single digit (1-9)
   * Example: 156 → 1+5+6=12 → 1+2=3
   */
  const reduceByDigitSum = (num) => {
    let sum = num;
    while (sum >= 10) {
      sum = String(sum)
        .split('')
        .map(Number)
        .reduce((a, b) => a + b, 0);
    }
    return sum;
  };

  /**
   * Get all intermediate values during reduction
   * Returns array of steps: [initial, step1, step2, ..., final]
   */
  const getReductionSteps = (num) => {
    const steps = [num];
    let current = num;

    while (current >= 10) {
      const digits = String(current)
        .split('')
        .map(Number);
      const nextSum = digits.reduce((a, b) => a + b, 0);
      steps.push(nextSum);
      current = nextSum;
    }

    return steps;
  };

  /**
   * Get letter value from Russian alphabet
   * Returns 1-33 or null if invalid
   */
  const getLetterValue = (letter) => {
    const normalized = letter.toUpperCase();
    return ALPHABET_MAP[normalized] || null;
  };

  /**
   * Convert text to numbers using alphabet
   * Returns array of values: [А=1, Б=2, ...]
   */
  const textToNumbers = (text) => {
    const normalized = normalizeCyrillic(text);
    const values = [];
    const steps = [];

    for (const char of normalized) {
      if (char === ' ') continue; // Skip spaces
      const val = getLetterValue(char);
      if (val !== null) {
        values.push(val);
        steps.push(`${char}=${val}`);
      }
    }

    return { values, steps, total: values.reduce((a, b) => a + b, 0) };
  };

  /**
   * Get number interpretation from Table 3
   */
  const getInterpretation = (code) => {
    // Ensure code is within valid range
    const normalizedCode = Math.min(code, 59);
    return NUMBER_INTERPRETATIONS[normalizedCode] || 'неизвестное значение';
  };

  /**
   * Calculate birth date code
   * Formula: Sum all digits of day + month + year → reduce to 1-9
   * Source: Глава 9, стр. 69
   */
  const calculateByBirthDate = (day, month, year) => {
    const dayStr = String(day).padStart(2, '0');
    const monthStr = String(month).padStart(2, '0');
    const yearStr = String(year);

    // Concatenate all digits: DDMMYYYY
    const allDigits = dayStr + monthStr + yearStr;

    // Sum all digits
    let sum = 0;
    for (const digit of allDigits) {
      sum += parseInt(digit, 10);
    }

    // Get reduction steps
    const reductionSteps = getReductionSteps(sum);
    const finalCode = reductionSteps[reductionSteps.length - 1];

    return {
      success: true,
      method: 'birthDate',
      inputs: { day, month, year },
      calculation: {
        digits: allDigits.split(''),
        sum: sum,
        reductionSteps: reductionSteps,
        intermediate: sum > 9 ? sum : null,
        final: finalCode
      },
      output: {
        primary: sum,
        secondary: finalCode,
        meaning: getInterpretation(finalCode)
      },
      trace: buildBirthDateTrace(day, month, year, allDigits, sum, reductionSteps)
    };
  };

  /**
   * Calculate full name code
   * Formula: Each letter → number → sum → reduce
   * Source: Глава 2, Таблица №1 + примеры стр. 78
   */
  const calculateByFullName = (surname, name, patronymic) => {
    const parts = [surname, name, patronymic].filter(Boolean);
    const fullText = parts.join('');

    if (!fullText.trim()) {
      return {
        success: false,
        error: 'Введите фамилию и имя'
      };
    }

    const conversion = textToNumbers(fullText);
    const { values, steps, total } = conversion;

    // Get reduction steps
    const reductionSteps = getReductionSteps(total);
    const finalCode = reductionSteps[reductionSteps.length - 1];

    return {
      success: true,
      method: 'fullName',
      inputs: { surname, name, patronymic },
      calculation: {
        textProcessed: normalizeCyrillic(fullText),
        letterToNumber: steps,
        sum: total,
        reductionSteps: reductionSteps,
        intermediate: total > 9 ? total : null,
        final: finalCode
      },
      output: {
        primary: total,
        secondary: finalCode,
        meaning: getInterpretation(finalCode)
      },
      trace: buildNameTrace(parts, steps, total, reductionSteps)
    };
  };

  /**
   * Build trace for birth date calculation
   */
  const buildBirthDateTrace = (day, month, year, digits, sum, reductionSteps) => {
    const trace = [];

    trace.push(`Дата рождения: ${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`);
    trace.push(`Цифры даты: ${digits.split('').join(' + ')}`);
    trace.push(`Сумма всех цифр: ${digits.split('').map(d => parseInt(d)).reduce((a,b) => a+b)} = <span class="trace-highlight">${sum}</span>`);

    // Add reduction steps if needed
    if (reductionSteps.length > 1) {
      for (let i = 1; i < reductionSteps.length; i++) {
        const prev = reductionSteps[i - 1];
        const curr = reductionSteps[i];
        const digits = String(prev).split('').map(Number);
        const calculation = digits.join(' + ');
        trace.push(`Редукция: ${calculation} = <span class="trace-highlight">${curr}</span>`);
      }
    }

    return trace;
  };

  /**
   * Build trace for name calculation
   */
  const buildNameTrace = (parts, steps, sum, reductionSteps) => {
    const trace = [];

    const partsText = parts.filter(Boolean).join(' ');
    trace.push(`Полное имя: ${partsText}`);
    trace.push(`Буквы в числа: ${steps.join(' + ')}`);
    trace.push(`Сумма: ${steps.length > 5 ? '(' + steps.length + ' букв)' : ''} = <span class="trace-highlight">${sum}</span>`);

    // Add reduction steps if needed
    if (reductionSteps.length > 1) {
      for (let i = 1; i < reductionSteps.length; i++) {
        const prev = reductionSteps[i - 1];
        const curr = reductionSteps[i];
        const digits = String(prev).split('').map(Number);
        const calculation = digits.join(' + ');
        trace.push(`Редукция: ${calculation} = <span class="trace-highlight">${curr}</span>`);
      }
    }

    return trace;
  };

  /**
   * Calculate compatibility between two people
   * Based on comparing their personal codes
   */
  const calculateCompatibility = (person1, person2) => {
    // Calculate both persons' codes
    const p1Result = person1.birthDate
      ? calculateByBirthDate(person1.birthDate.day, person1.birthDate.month, person1.birthDate.year)
      : person1.fullName
        ? calculateByFullName(person1.fullName.surname, person1.fullName.name, person1.fullName.patronymic || '')
        : null;

    const p2Result = person2.birthDate
      ? calculateByBirthDate(person2.birthDate.day, person2.birthDate.month, person2.birthDate.year)
      : person2.fullName
        ? calculateByFullName(person2.fullName.surname, person2.fullName.name, person2.fullName.patronymic || '')
        : null;

    if (!p1Result || !p2Result) {
      return {
        success: false,
        error: 'Укажите данные обоих людей'
      };
    }

    const code1 = p1Result.output.secondary;
    const code2 = p2Result.output.secondary;
    const codeDiff = Math.abs(code1 - code2);

    // Calculate compatibility percentage
    // Opposite numbers (1-9 distance): less compatible
    // Same or close numbers: more compatible
    let compatibility = Math.max(0, 100 - (codeDiff * 11));

    // Special cases
    if (code1 === code2) {
      compatibility = 95; // Same number = very high
    } else if (codeDiff === 1 || codeDiff === 8) {
      compatibility = 75; // Adjacent or opposite = good
    }

    const trace = buildCompatibilityTrace(
      person1.name,
      code1,
      p1Result.output.meaning,
      person2.name,
      code2,
      p2Result.output.meaning,
      compatibility
    );

    return {
      success: true,
      method: 'compatibility',
      inputs: { person1: person1.name, person2: person2.name },
      calculation: {
        person1Code: code1,
        person2Code: code2,
        codeDifference: codeDiff,
        compatibilityPercent: Math.round(compatibility)
      },
      output: {
        person1: {
          name: person1.name,
          code: code1,
          meaning: p1Result.output.meaning
        },
        person2: {
          name: person2.name,
          code: code2,
          meaning: p2Result.output.meaning
        },
        compatibility: {
          percent: Math.round(compatibility),
          level: getCompatibilityLevel(compatibility),
          description: getCompatibilityDescription(compatibility, code1, code2)
        }
      },
      trace: trace
    };
  };

  /**
   * Analyze word or code
   * Same algorithm as name but for arbitrary words
   */
  const calculateByWordCode = (word) => {
    if (!word || word.trim() === '') {
      return {
        success: false,
        error: 'Введите слово или код'
      };
    }

    const conversion = textToNumbers(word);
    const { values, steps, total } = conversion;

    // Get reduction steps
    const reductionSteps = getReductionSteps(total);
    const finalCode = reductionSteps[reductionSteps.length - 1];

    return {
      success: true,
      method: 'wordCode',
      inputs: { word },
      calculation: {
        textProcessed: normalizeCyrillic(word),
        letterToNumber: steps,
        sum: total,
        reductionSteps: reductionSteps,
        intermediate: total > 9 ? total : null,
        final: finalCode
      },
      output: {
        primary: total,
        secondary: finalCode,
        meaning: getInterpretation(finalCode)
      },
      trace: buildWordTrace(word, steps, total, reductionSteps)
    };
  };

  /**
   * Calculate life cycles (number of past lives)
   * Formula: Count frequency of each digit in birth date
   * Each digit frequency = number of that life cycle
   */
  const calculateLifeCycles = (day, month, year) => {
    const dayStr = String(day).padStart(2, '0');
    const monthStr = String(month).padStart(2, '0');
    const yearStr = String(year);

    const allDigits = (dayStr + monthStr + yearStr).split('').map(Number);

    // Count frequency of each digit
    const frequency = {};
    for (let i = 1; i <= 9; i++) {
      frequency[i] = allDigits.filter(d => d === i).length;
    }

    // Find the total count (total digits = number of lives)
    const totalLives = allDigits.length;

    // Find dominant frequencies
    const dominantNumbers = Object.entries(frequency)
      .filter(([num, count]) => count > 0)
      .sort((a, b) => b[1] - a[1]);

    const trace = buildLifeCyclesTrace(dayStr, monthStr, yearStr, frequency, totalLives);

    return {
      success: true,
      method: 'lifeCycles',
      inputs: { day, month, year },
      calculation: {
        digits: allDigits,
        frequency: frequency,
        totalLives: totalLives
      },
      output: {
        totalLives: totalLives,
        lifeDescription: getLifeDescription(totalLives),
        dominantNumbers: dominantNumbers.slice(0, 3).map(([num, count]) => ({
          number: parseInt(num),
          frequency: count,
          meaning: getInterpretation(parseInt(num))
        }))
      },
      trace: trace
    };
  };

  /**
   * Analyze passport number (USSR format)
   * Format: Series + Number (e.g., 65569-8187921)
   */
  const calculatePassportAnalysis = (series, number) => {
    if (!series || !number) {
      return {
        success: false,
        error: 'Укажите серию и номер паспорта'
      };
    }

    // Remove dashes and spaces
    const cleanSeries = series.toString().replace(/[\s-]/g, '');
    const cleanNumber = number.toString().replace(/[\s-]/g, '');

    // Combine for analysis
    const fullCode = cleanSeries + cleanNumber;
    const digits = fullCode.split('').map(Number).filter(d => !isNaN(d));

    if (digits.length === 0) {
      return {
        success: false,
        error: 'Паспортные данные содержат только цифры'
      };
    }

    // Calculate code
    const sum = digits.reduce((a, b) => a + b, 0);
    const reductionSteps = getReductionSteps(sum);
    const finalCode = reductionSteps[reductionSteps.length - 1];

    const trace = buildPassportTrace(cleanSeries, cleanNumber, digits, sum, reductionSteps);

    return {
      success: true,
      method: 'passportAnalysis',
      inputs: { series: cleanSeries, number: cleanNumber },
      calculation: {
        series: cleanSeries,
        number: cleanNumber,
        fullCode: fullCode,
        digitSum: sum,
        reductionSteps: reductionSteps,
        final: finalCode
      },
      output: {
        primary: sum,
        secondary: finalCode,
        meaning: getInterpretation(finalCode),
        seriesAnalysis: `Серия ${cleanSeries} → ${cleanSeries.split('').reduce((a,b) => parseInt(a) + parseInt(b), 0)}`,
        numberAnalysis: `Номер ${cleanNumber} → ${cleanNumber.split('').reduce((a,b) => parseInt(a) + parseInt(b), 0)}`
      },
      trace: trace
    };
  };

  /**
   * Trace builders for new calculators
   */
  const buildCompatibilityTrace = (name1, code1, mean1, name2, code2, mean2, compat) => {
    const trace = [];
    trace.push(`${name1}: код <span class="trace-highlight">${code1}</span> → "${mean1}"`);
    trace.push(`${name2}: код <span class="trace-highlight">${code2}</span> → "${mean2}"`);
    trace.push(`Разница между кодами: ${Math.abs(code1 - code2)}`);
    trace.push(`Совместимость: <span class="trace-highlight">${Math.round(compat)}%</span>`);
    return trace;
  };

  const buildWordTrace = (word, steps, sum, reductionSteps) => {
    const trace = [];
    trace.push(`Слово: ${word}`);
    trace.push(`Буквы в числа: ${steps.join(' + ')}`);
    trace.push(`Сумма: ${steps.length > 5 ? '(' + steps.length + ' букв)' : ''} = <span class="trace-highlight">${sum}</span>`);

    if (reductionSteps.length > 1) {
      for (let i = 1; i < reductionSteps.length; i++) {
        const prev = reductionSteps[i - 1];
        const curr = reductionSteps[i];
        const digits = String(prev).split('').map(Number);
        trace.push(`Редукция: ${digits.join(' + ')} = <span class="trace-highlight">${curr}</span>`);
      }
    }

    return trace;
  };

  const buildLifeCyclesTrace = (day, month, year, frequency, total) => {
    const trace = [];
    trace.push(`Дата: ${day}.${month}.${year}`);
    trace.push(`Все цифры: ${[...day, ...month, ...year].join(' + ')}`);
    trace.push(`Всего цифр: <span class="trace-highlight">${total}</span> (столько жизней прожито)`);

    const freq = [];
    for (let i = 1; i <= 9; i++) {
      if (frequency[i] > 0) {
        freq.push(`${i}: ${frequency[i]}x`);
      }
    }
    if (freq.length > 0) {
      trace.push(`Частота цифр: ${freq.join(', ')}`);
    }

    return trace;
  };

  const buildPassportTrace = (series, number, digits, sum, reductionSteps) => {
    const trace = [];
    trace.push(`Серия: ${series}`);
    trace.push(`Номер: ${number}`);
    trace.push(`Все цифры: ${digits.join(' + ')}`);
    trace.push(`Сумма: <span class="trace-highlight">${sum}</span>`);

    if (reductionSteps.length > 1) {
      for (let i = 1; i < reductionSteps.length; i++) {
        const prev = reductionSteps[i - 1];
        const curr = reductionSteps[i];
        const d = String(prev).split('').map(Number);
        trace.push(`Редукция: ${d.join(' + ')} = <span class="trace-highlight">${curr}</span>`);
      }
    }

    return trace;
  };

  /**
   * Helper functions for compatibility and life cycles
   */
  const getCompatibilityLevel = (percent) => {
    if (percent >= 90) return 'Идеальная';
    if (percent >= 75) return 'Отличная';
    if (percent >= 60) return 'Хорошая';
    if (percent >= 45) return 'Средняя';
    return 'Сложная';
  };

  const getCompatibilityDescription = (percent, code1, code2) => {
    const level = getCompatibilityLevel(percent);

    if (code1 === code2) {
      return `${level} совместимость. Вы похожи по судьбе и энергетике. Много общего в целях и мировоззрении.`;
    }

    const diff = Math.abs(code1 - code2);
    if (diff === 1 || diff === 8) {
      return `${level} совместимость. Дополняете друг друга. Противоположные качества могут создать баланс.`;
    }

    return `${level} совместимость. Потребуется работа над взаимопониманием и уважением различий.`;
  };

  const getLifeDescription = (totalLives) => {
    const descriptions = {
      5: 'Пятая жизнь: решение задач и преодоление препятствий',
      6: 'Шестая жизнь: скрытая жизнь, духовные практики',
      7: 'Седьмая жизнь: гуманность, помощь людям через любовь',
      8: 'Восьмая жизнь: независимость, неопределённость пути',
      9: 'Девятая жизнь: альтруизм, служение человечеству',
      10: 'Десятая жизнь: логика и анализ, опасности и препятствия',
      11: 'Одиннадцатая жизнь: власть, деньги, сексуальность',
      12: 'Двенадцатая жизнь: логика повторяется (возврат к основам)'
    };

    return descriptions[totalLives] || `${totalLives}-я жизнь: высокая степень воплощений`;
  };

  /**
   * Public API
   */
  return {
    // Phase 1 Calculations
    calculateByBirthDate,
    calculateByFullName,

    // Phase 2 Calculations
    calculateCompatibility,
    calculateByWordCode,

    // Phase 3 Calculations
    calculateLifeCycles,
    calculatePassportAnalysis,

    // Utilities
    getLetterValue,
    getInterpretation,
    reduceByDigitSum,
    textToNumbers,
    normalizeCyrillic,

    // Data access
    ALPHABET_MAP,
    NUMBER_INTERPRETATIONS
  };
})();
