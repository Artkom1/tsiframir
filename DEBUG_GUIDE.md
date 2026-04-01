# Руководство по диагностике калькулятора

## Что было сделано для диагностики проблемы

### 1. Комплексное логирование
Добавлено детальное логирование на всех этапах:
- **Инициализация**: Проверка загрузки всех модулей (Core, Registry, Validation, UI)
- **Переключение калькулятора**: Логирование смены активного калькулятора
- **Рендеринг формы**: Отслеживание создания форм и полей
- **Отправка формы**: Логирование клика по кнопке и сбора данных
- **Валидация**: Проверка правильности введённых данных
- **Расчёт**: Выполнение расчёта и получение результатов
- **Отображение результатов**: Рендеринг результатов на странице

### 2. Добавлены диагностические инструменты

В консоли браузера доступны следующие команды для тестирования:

```javascript
// Проверить расчёт по дате рождения
testCalculator.birthDate()

// Проверить расчёт по ФИО
testCalculator.fullName()

// Проверить отправку формы (симулирует клик по кнопке)
testCalculator.submitForm()

// Запустить все тесты
testCalculator.runAll()

// Или запустить встроенный набор тестов
NumerologyCalculator.Test.runAll()
```

## Как использовать для диагностики

### Шаг 1: Открыть консоль браузера
- **Chrome/Firefox**: `F12` → вкладка **Console**
- **Safari**: Включить консоль в меню разработчика
- **Edge**: `F12` → вкладка **Console**

### Шаг 2: Проверить инициализацию системы

Посмотрите в консоль при загрузке страницы. Должны увидеть сообщения вроде:

```
🚀 Initializing Numerology Calculator System...
✓ CalculatorCore loaded
✓ CalculatorRegistry loaded
✓ CalculatorValidation loaded
✓ CalculatorUI loaded
✓ All dependencies loaded
✓ Container found
✓ Calculator System initialized successfully
✓ Registered calculators: 5
✓ Enabled calculators: 5
✓ Enabled calculator IDs: birthDate, fullName, compatibility, wordCode, lifeCycles, passportAnalysis
```

**Если этого не видно** → система не инициализировалась корректно.

### Шаг 3: Проверить диагностические инструменты

В консоли выполните:

```javascript
testCalculator
```

Должны увидеть объект со свойствами: `birthDate`, `fullName`, `submitForm`, `runAll`

### Шаг 4: Запустить тесты расчётов

Проверьте, работают ли сами функции расчёта:

```javascript
window.testCalculator.birthDate(11, 9, 2012)
```

Должны увидеть результат:
```javascript
{
  success: true,
  method: 'birthDate',
  output: {
    primary: 17,
    secondary: 8,
    meaning: "зависимость"
  },
  // ... остальные данные
}
```

### Шаг 5: Запустить полный набор тестов

```javascript
NumerologyCalculator.Test.runAll()
```

Это запустит все встроенные тесты и покажет результаты в консоли.

### Шаг 6: Проверить отправку формы вручную

Выполните в консоли:

```javascript
testCalculator.submitForm()
```

Это симулирует клик по кнопке "Рассчитать". В консоли должны увидеть логи:

```
📝 Form submission triggered
Form container found: true
Input fields found: 3
Collected data: {day: "...", month: "...", year: "..."}
Validation result: true {}
🧮 Executing calculation...
Calculation result: {success: true, ...}
Rendering result to: ...
```

## Что проверить в консоли при проблеме

### Если система не инициализировалась
- Посмотрите, есть ли сообщение об ошибке о какой-либо из зависимостей
- Проверьте, что все файлы скрипты загружены:
  - calculator-core.js ✓
  - calculator-validation.js ✓
  - calculator-registry.js ✓
  - calculator-ui.js ✓
  - calculator-test.js ✓
  - calculators.js ✓
  - CSS файлы загружены ✓

### Если форма не рендеритится
- Посмотрите логи при переключении между калькуляторами
- Проверьте, что DOM элемент `.calculator-form` существует на странице

### Если кнопка не отвечает на клик
- Проверьте логи "Button click is firing"
- Проверьте, что `handleFormSubmit` срабатывает при клике

### Если данные не собираются
- Посмотрите логи "Collected data:" - должны видеть введённые значения
- Проверьте, что input поля имеют правильные атрибуты `name`

### Если валидация провалилась
- Посмотрите "Validation result: false" с указанием ошибок
- Проверьте введённые значения

### Если расчёт не выполняется
- Посмотрите "Calculation result:" - должны видеть успешный результат
- Проверьте, что выбран правильный калькулятор

### Если результат не отображается
- Проверьте логи "Rendering result to:" - должны видеть DOM элемент
- Проверьте, что CSS загружен и стили применяются

## Примеры команд для проверки каждого калькулятора

### 1. Дата рождения
```javascript
NumerologyCalculator.execute('birthDate', {day: 11, month: 9, year: 2012})
```

### 2. ФИО
```javascript
NumerologyCalculator.execute('fullName', {surname: 'Иванов', name: 'Сергей', patronymic: ''})
```

### 3. Совместимость
```javascript
NumerologyCalculator.execute('compatibility', {
  person1Name: 'Анна',
  person1Day: 15, person1Month: 3, person1Year: 1990,
  person2Name: 'Иван',
  person2Day: 20, person2Month: 7, person2Year: 1988
})
```

### 4. Анализ слова
```javascript
NumerologyCalculator.execute('wordCode', {word: 'ЦифраМир'})
```

### 5. Прожитые жизни
```javascript
NumerologyCalculator.execute('lifeCycles', {day: 11, month: 9, year: 2012})
```

### 6. Анализ паспорта
```javascript
NumerologyCalculator.execute('passportAnalysis', {series: '6556', number: '8187921'})
```

## Отправка результатов диагностики

Если система всё равно не работает, скопируйте всё содержимое консоли и отправьте разработчикам с указанием:
1. Какой браузер и версия
2. Какие логи видны в консоли
3. Какая команда не работает (если выполнялись диагностические команды)
4. Скриншоты консоли

Успешно загруженная система должна показывать все зелёные галочки ✓ при загрузке.
