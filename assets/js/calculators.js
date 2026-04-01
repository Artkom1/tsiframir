/**
 * NUMEROLOGY CALCULATOR SYSTEM
 * Main initialization file
 */

(function() {
  'use strict';

  /**
   * Initialize calculator system when DOM is ready
   */
  const initCalculators = () => {
    // Small delay to ensure all scripts are fully loaded
    setTimeout(() => {
      console.log('🚀 Initializing Numerology Calculator System...');

      // Check if all dependencies are loaded
      if (typeof CalculatorCore === 'undefined') {
        console.error('❌ CalculatorCore not loaded');
        return;
      }
      if (typeof CalculatorRegistry === 'undefined') {
        console.error('❌ CalculatorRegistry not loaded');
        return;
      }
      if (typeof CalculatorUI === 'undefined') {
        console.error('❌ CalculatorUI not loaded');
        return;
      }

      console.log('✓ All dependencies loaded');

      // Check if container exists
      const container = document.querySelector('.center-of-codes');
      if (!container) {
        console.error('❌ Container .center-of-codes not found in DOM');
        console.log('Available sections:', document.querySelectorAll('section').map(s => s.className).join(', '));
        return;
      }

      console.log('✓ Container found');

      // Initialize UI
      const uiElements = CalculatorUI.init();

      if (!uiElements) {
        console.warn('⚠️ Calculator UI initialization returned null');
        return;
      }

      console.log('✓ Calculator System initialized successfully');
      console.log(`✓ Registered calculators: ${CalculatorRegistry.getCount()}`);
      console.log(`✓ Enabled calculators: ${CalculatorRegistry.getEnabledCount()}`);
      console.log('✓ All 5 calculators ready!');
      console.log('Try: NumerologyCalculator.Test.runAll()');
    }, 100);
  };

  /**
   * Wait for DOM ready and all scripts loaded
   */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCalculators);
  } else {
    // DOM is already loaded
    initCalculators();
  }

  // Also set up window.NumerologyCalculator for global access
  window.NumerologyCalculator = {
    // Core modules
    Core: CalculatorCore,
    Registry: CalculatorRegistry,
    UI: CalculatorUI,
    Validation: CalculatorValidation,
    Test: CalculatorTest,

    // Utility functions
    execute: (calculatorId, inputs) => CalculatorRegistry.executeCalculation(calculatorId, inputs),
    getInterpretation: (code) => CalculatorCore.getInterpretation(code),
    validate: (fieldName, value) => CalculatorValidation.validateField(fieldName, value),

    // Phase 2 & 3 specific functions
    compatibility: (p1, p2) => CalculatorCore.calculateCompatibility(p1, p2),
    analyzeWord: (word) => CalculatorCore.calculateByWordCode(word),
    lifeCycles: (day, month, year) => CalculatorCore.calculateLifeCycles(day, month, year),
    passport: (series, number) => CalculatorCore.calculatePassportAnalysis(series, number)
  };

})();
