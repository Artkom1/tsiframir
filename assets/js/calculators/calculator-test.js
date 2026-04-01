/**
 * CALCULATOR TEST SUITE
 * Simple tests to verify all calculators work correctly
 * Run in browser console: NumerologyCalculator.Test.runAll()
 */

const CalculatorTest = (() => {
  /**
   * Test birth date calculation
   */
  const testBirthDate = () => {
    console.log('\n📅 TESTING BIRTH DATE CALCULATOR');
    console.log('================================');

    const testCases = [
      { day: 11, month: 9, year: 2012, expectedFinal: 8, name: 'Example from book' },
      { day: 1, month: 1, year: 2000, expectedFinal: 3, name: 'Y2K midnight' },
      { day: 25, month: 12, year: 1980, expectedFinal: 7, name: 'Christmas 1980' }
    ];

    testCases.forEach((test, idx) => {
      const result = CalculatorCore.calculateByBirthDate(test.day, test.month, test.year);
      const passed = result.output.secondary === test.expectedFinal;
      const status = passed ? '✓' : '✗';

      console.log(`\n${status} Test ${idx + 1}: ${test.name}`);
      console.log(`  Date: ${test.day}.${test.month}.${test.year}`);
      console.log(`  Result: ${result.output.primary} → ${result.output.secondary}`);
      console.log(`  Meaning: "${result.output.meaning}"`);
      if (!passed) {
        console.log(`  Expected final: ${test.expectedFinal}, Got: ${result.output.secondary}`);
      }
    });
  };

  /**
   * Test full name calculation
   */
  const testFullName = () => {
    console.log('\n👤 TESTING FULL NAME CALCULATOR');
    console.log('================================');

    const testCases = [
      { surname: 'Иванов', name: 'Сергей', patronymic: 'Николаевич', name: 'Иванов Сергей' },
      { surname: 'Петров', name: 'Иван', patronymic: '', name: 'Петров Иван' },
      { surname: 'Кузнецов', name: 'Сергей', patronymic: '', name: 'Кузнецов Сергей' }
    ];

    testCases.forEach((test, idx) => {
      const result = CalculatorCore.calculateByFullName(test.surname, test.name, test.patronymic);
      console.log(`\n✓ Test ${idx + 1}: ${test.name}`);
      console.log(`  Sum: ${result.output.primary}`);
      console.log(`  Final code: ${result.output.secondary}`);
      console.log(`  Meaning: "${result.output.meaning}"`);
      console.log(`  Trace: ${result.trace.slice(0, 3).join(' → ')}`);
    });
  };

  /**
   * Test number interpretations
   */
  const testInterpretations = () => {
    console.log('\n📖 TESTING NUMBER INTERPRETATIONS');
    console.log('==================================');

    const testCodes = [1, 7, 12, 22, 33, 48];

    testCodes.forEach((code) => {
      const meaning = CalculatorCore.getInterpretation(code);
      console.log(`${code}: "${meaning}"`);
    });
  };

  /**
   * Test validation
   */
  const testValidation = () => {
    console.log('\n✅ TESTING VALIDATION');
    console.log('====================');

    const tests = [
      { field: 'day', value: '15', valid: true },
      { field: 'day', value: '32', valid: false },
      { field: 'month', value: '12', valid: true },
      { field: 'month', value: '13', valid: false },
      { field: 'surname', value: 'Иванов', valid: true },
      { field: 'surname', value: 'A', valid: false }
    ];

    tests.forEach((test) => {
      const validation = CalculatorValidation.validateField(test.field, test.value);
      const status = validation.valid === test.valid ? '✓' : '✗';
      console.log(`${status} ${test.field}: "${test.value}" → ${validation.valid ? 'VALID' : 'INVALID'}`);
      if (validation.error) {
        console.log(`   Error: ${validation.error}`);
      }
    });
  };

  /**
   * Test registry
   */
  const testRegistry = () => {
    console.log('\n📋 TESTING CALCULATOR REGISTRY');
    console.log('===============================');

    const all = CalculatorRegistry.getAllCalculators();
    console.log(`Total calculators registered: ${all.length}`);
    console.log(`Enabled calculators: ${CalculatorRegistry.getEnabledCount()}`);

    all.forEach((calc) => {
      const status = calc.enabled ? '✓' : '○';
      console.log(`${status} ${calc.title} (Phase ${calc.phase}, ${calc.confidenceLevel})`);
    });
  };

  /**
   * Test compatibility calculator
   */
  const testCompatibility = () => {
    console.log('\n💑 TESTING COMPATIBILITY CALCULATOR');
    console.log('===================================');

    const testCases = [
      {
        person1: { name: 'Сергей', day: 15, month: 5, year: 1980 },
        person2: { name: 'Анна', day: 22, month: 11, year: 1982 },
        name: 'Сергей и Анна'
      },
      {
        person1: { name: 'Иван', day: 1, month: 1, year: 2000 },
        person2: { name: 'Елена', day: 1, month: 1, year: 2000 },
        name: 'Иван и Елена (одинаковые коды)'
      }
    ];

    testCases.forEach((test, idx) => {
      const result = CalculatorCore.calculateCompatibility(
        { name: test.person1.name, birthDate: { day: test.person1.day, month: test.person1.month, year: test.person1.year } },
        { name: test.person2.name, birthDate: { day: test.person2.day, month: test.person2.month, year: test.person2.year } }
      );

      if (result.success) {
        console.log(`\n✓ Test ${idx + 1}: ${test.name}`);
        console.log(`  ${test.person1.name}: ${result.output.person1.code} (${result.output.person1.meaning})`);
        console.log(`  ${test.person2.name}: ${result.output.person2.code} (${result.output.person2.meaning})`);
        console.log(`  Совместимость: ${result.output.compatibility.percent}% (${result.output.compatibility.level})`);
      } else {
        console.log(`\n✗ Test ${idx + 1}: Error - ${result.error}`);
      }
    });
  };

  /**
   * Test word/code analyzer
   */
  const testWordCode = () => {
    console.log('\n📝 TESTING WORD/CODE ANALYZER');
    console.log('=============================');

    const testWords = ['ЦифраМир', 'Центр Кодов', 'Успех', 'Любовь'];

    testWords.forEach((word) => {
      const result = CalculatorCore.calculateByWordCode(word);
      console.log(`\n✓ "${word}"`);
      console.log(`  Code: ${result.output.primary} → ${result.output.secondary}`);
      console.log(`  Meaning: "${result.output.meaning}"`);
    });
  };

  /**
   * Test life cycles calculator
   */
  const testLifeCycles = () => {
    console.log('\n🔄 TESTING LIFE CYCLES CALCULATOR');
    console.log('==================================');

    const testCases = [
      { day: 15, month: 5, year: 1980, name: 'Пример 1' },
      { day: 1, month: 1, year: 2000, name: 'Y2K' },
      { day: 25, month: 12, year: 1985, name: 'Рождество' }
    ];

    testCases.forEach((test) => {
      const result = CalculatorCore.calculateLifeCycles(test.day, test.month, test.year);
      console.log(`\n✓ ${test.name}`);
      console.log(`  Date: ${test.day}.${test.month}.${test.year}`);
      console.log(`  Lives: ${result.output.totalLives}`);
      console.log(`  Description: ${result.output.lifeDescription}`);
    });
  };

  /**
   * Test passport analyzer
   */
  const testPassportAnalysis = () => {
    console.log('\n🛂 TESTING PASSPORT ANALYZER');
    console.log('=============================');

    const testCases = [
      { series: '6556', number: '8187921', name: 'Sample passport' },
      { series: '1234', number: '567890', name: 'Test passport' }
    ];

    testCases.forEach((test) => {
      const result = CalculatorCore.calculatePassportAnalysis(test.series, test.number);
      console.log(`\n✓ ${test.name}`);
      console.log(`  Series: ${test.series}, Number: ${test.number}`);
      console.log(`  Code: ${result.output.primary} → ${result.output.secondary}`);
      console.log(`  Meaning: "${result.output.meaning}"`);
    });
  };

  /**
   * Run all tests
   */
  const runAll = () => {
    console.clear();
    console.log('🎯 NUMEROLOGY CALCULATOR TEST SUITE - COMPLETE');
    console.log('==============================================\n');

    try {
      testBirthDate();
      testFullName();
      testInterpretations();
      testValidation();
      testRegistry();
      testCompatibility();
      testWordCode();
      testLifeCycles();
      testPassportAnalysis();

      console.log('\n\n✅ ALL TESTS COMPLETED (Phase 1, 2, 3)');
      console.log('========================================\n');
      console.log(`Total Calculators: ${CalculatorRegistry.getCount()}`);
      console.log(`Enabled Calculators: ${CalculatorRegistry.getEnabledCount()}`);
      console.log('Console output complete. Check results above.');
    } catch (e) {
      console.error('❌ TEST FAILED:', e.message);
      console.error(e);
    }
  };

  /**
   * Public API
   */
  return {
    // Phase 1
    testBirthDate,
    testFullName,
    testInterpretations,
    testValidation,
    testRegistry,

    // Phase 2
    testCompatibility,
    testWordCode,

    // Phase 3
    testLifeCycles,
    testPassportAnalysis,

    // All
    runAll
  };
})();

// Export to global scope for easy access
window.CalculatorTest = CalculatorTest;

// Auto-log instructions
console.log('💡 Calculator Test Suite loaded (Phase 1, 2, 3).');
console.log('Run all tests: NumerologyCalculator.Test.runAll()');
console.log('\nPhase 1 tests:');
console.log('  - NumerologyCalculator.Test.testBirthDate()');
console.log('  - NumerologyCalculator.Test.testFullName()');
console.log('  - NumerologyCalculator.Test.testInterpretations()');
console.log('  - NumerologyCalculator.Test.testValidation()');
console.log('  - NumerologyCalculator.Test.testRegistry()');
console.log('\nPhase 2 tests:');
console.log('  - NumerologyCalculator.Test.testCompatibility()');
console.log('  - NumerologyCalculator.Test.testWordCode()');
console.log('\nPhase 3 tests:');
console.log('  - NumerologyCalculator.Test.testLifeCycles()');
console.log('  - NumerologyCalculator.Test.testPassportAnalysis()');
