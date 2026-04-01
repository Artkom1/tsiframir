/**
 * CALCULATOR VALIDATION
 * Input validation and error handling
 */

const CalculatorValidation = (() => {
  /**
   * Validation rules for each input type
   */
  const rules = {
    day: (value) => {
      const num = parseInt(value, 10);
      if (isNaN(num)) return 'Введите число';
      if (num < 1 || num > 31) return 'День должен быть от 1 до 31';
      return null;
    },

    month: (value) => {
      const num = parseInt(value, 10);
      if (isNaN(num)) return 'Введите число';
      if (num < 1 || num > 12) return 'Месяц должен быть от 1 до 12';
      return null;
    },

    year: (value) => {
      const num = parseInt(value, 10);
      if (isNaN(num)) return 'Введите число';
      if (num < 1900) return 'Год должен быть не менее 1900';
      if (num > new Date().getFullYear()) return 'Год не может быть в будущем';
      return null;
    },

    surname: (value) => {
      if (!value || value.trim() === '') return 'Фамилия обязательна';
      if (value.trim().length < 2) return 'Фамилия слишком короткая';
      const cyrillic = /^[А-Яа-яЁё\s-]*$/.test(value);
      if (!cyrillic) return 'Только кириллица (русские буквы)';
      return null;
    },

    name: (value) => {
      if (!value || value.trim() === '') return 'Имя обязательно';
      if (value.trim().length < 2) return 'Имя слишком короткое';
      const cyrillic = /^[А-Яа-яЁё\s-]*$/.test(value);
      if (!cyrillic) return 'Только кириллица (русские буквы)';
      return null;
    },

    patronymic: (value) => {
      if (!value) return null; // Optional field
      if (value.trim().length > 0 && value.trim().length < 2) return 'Отчество слишком короткое';
      const cyrillic = /^[А-Яа-яЁё\s-]*$/.test(value);
      if (!cyrillic) return 'Только кириллица (русские буквы)';
      return null;
    },

    // Compatibility fields
    person1Name: (value) => {
      if (!value || value.trim() === '') return 'Имя обязательно';
      if (value.trim().length < 2) return 'Имя слишком короткое';
      return null;
    },

    person2Name: (value) => {
      if (!value || value.trim() === '') return 'Имя обязательно';
      if (value.trim().length < 2) return 'Имя слишком короткое';
      return null;
    },

    person1Day: (value) => {
      const num = parseInt(value, 10);
      if (isNaN(num)) return 'Введите число';
      if (num < 1 || num > 31) return 'День должен быть от 1 до 31';
      return null;
    },

    person1Month: (value) => {
      const num = parseInt(value, 10);
      if (isNaN(num)) return 'Введите число';
      if (num < 1 || num > 12) return 'Месяц должен быть от 1 до 12';
      return null;
    },

    person1Year: (value) => {
      const num = parseInt(value, 10);
      if (isNaN(num)) return 'Введите число';
      if (num < 1900) return 'Год должен быть не менее 1900';
      if (num > new Date().getFullYear()) return 'Год не может быть в будущем';
      return null;
    },

    person2Day: (value) => {
      const num = parseInt(value, 10);
      if (isNaN(num)) return 'Введите число';
      if (num < 1 || num > 31) return 'День должен быть от 1 до 31';
      return null;
    },

    person2Month: (value) => {
      const num = parseInt(value, 10);
      if (isNaN(num)) return 'Введите число';
      if (num < 1 || num > 12) return 'Месяц должен быть от 1 до 12';
      return null;
    },

    person2Year: (value) => {
      const num = parseInt(value, 10);
      if (isNaN(num)) return 'Введите число';
      if (num < 1900) return 'Год должен быть не менее 1900';
      if (num > new Date().getFullYear()) return 'Год не может быть в будущем';
      return null;
    },

    word: (value) => {
      if (!value || value.trim() === '') return 'Введите слово или код';
      if (value.trim().length < 2) return 'Слово слишком короткое';
      return null;
    },

    // Passport fields
    series: (value) => {
      if (!value || value.trim() === '') return 'Серия обязательна';
      const digits = value.toString().replace(/[\s-]/g, '').match(/\d/g);
      if (!digits || digits.length < 3) return 'Серия должна содержать цифры';
      return null;
    },

    number: (value) => {
      if (!value || value.trim() === '') return 'Номер обязателен';
      const digits = value.toString().replace(/[\s-]/g, '').match(/\d/g);
      if (!digits || digits.length < 4) return 'Номер должен содержать цифры';
      return null;
    }
  };

  /**
   * Validate a single field
   */
  const validateField = (fieldName, value) => {
    if (!rules[fieldName]) {
      return { valid: true, error: null };
    }

    const error = rules[fieldName](value);
    return { valid: error === null, error };
  };

  /**
   * Validate entire form based on input schema
   */
  const validateForm = (data, inputSchema) => {
    const errors = {};
    let isValid = true;

    for (const [fieldName, fieldConfig] of Object.entries(inputSchema)) {
      const value = data[fieldName];

      // Check required fields
      if (fieldConfig.required && (!value || value.toString().trim() === '')) {
        errors[fieldName] = 'Это поле обязательно';
        isValid = false;
        continue;
      }

      // Skip validation for empty optional fields
      if (!fieldConfig.required && (!value || value.toString().trim() === '')) {
        continue;
      }

      // Run field-specific validation
      const validation = validateField(fieldName, value);
      if (!validation.valid) {
        errors[fieldName] = validation.error;
        isValid = false;
      }
    }

    return { valid: isValid, errors };
  };

  /**
   * Validate date (birth date must be valid and in the past)
   */
  const validateDate = (day, month, year) => {
    try {
      const date = new Date(year, month - 1, day);

      // Check if date is valid
      if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
        return { valid: false, error: 'Некорректная дата' };
      }

      // Check if date is in the past
      if (date > new Date()) {
        return { valid: false, error: 'Дата не может быть в будущем' };
      }

      return { valid: true, error: null };
    } catch (e) {
      return { valid: false, error: 'Ошибка при проверке даты' };
    }
  };

  /**
   * Get error message for display
   */
  const formatError = (error, fieldName) => {
    if (!error) return '';
    return error;
  };

  /**
   * Public API
   */
  return {
    validateField,
    validateForm,
    validateDate,
    formatError,
    rules
  };
})();
