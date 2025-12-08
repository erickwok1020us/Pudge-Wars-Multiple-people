/**
 * Test Runner Module
 * 
 * Provides a unified interface for running automated tests in the game.
 * Includes UI controls and keyboard shortcuts for easy test execution.
 * 
 * Usage:
 *   // Initialize after game is ready
 *   const testRunner = new TestRunner(game);
 *   testRunner.showUI();
 *   
 *   // Or run tests programmatically
 *   const results = await testRunner.runAllTests();
 */

class TestRunner {
    constructor(game) {
        this.game = game;
        this.aimingTest = null;
        this.slidingTest = null;
        this.uiContainer = null;
        this.resultsPanel = null;
        this.isUIVisible = false;
        
        // Initialize test modules
        this.initializeTests();
        
        // Setup keyboard shortcuts
        this.setupKeyboardShortcuts();
    }
    
    /**
     * Initialize test modules
     */
    initializeTests() {
        if (typeof AimingAutoTest !== 'undefined') {
            this.aimingTest = new AimingAutoTest(this.game);
        } else {
            console.warn('[TEST-RUNNER] AimingAutoTest not loaded');
        }
        
        if (typeof SlidingAutoTest !== 'undefined') {
            this.slidingTest = new SlidingAutoTest(this.game);
        } else {
            console.warn('[TEST-RUNNER] SlidingAutoTest not loaded');
        }
    }
    
    /**
     * Setup keyboard shortcuts for tests
     */
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Only respond if not in an input field
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }
            
            // F9: Toggle test UI
            if (e.key === 'F9') {
                e.preventDefault();
                this.toggleUI();
            }
            
            // F10: Run aiming test (quick)
            if (e.key === 'F10' && !e.shiftKey) {
                e.preventDefault();
                this.runAimingTest({ gridSize: 3 });
            }
            
            // Shift+F10: Run full aiming test
            if (e.key === 'F10' && e.shiftKey) {
                e.preventDefault();
                this.runAimingTest({ gridSize: 5 });
            }
            
            // F11: Run sliding test (quick)
            if (e.key === 'F11' && !e.shiftKey) {
                e.preventDefault();
                this.runSlidingTest({ iterations: 5 });
            }
            
            // Shift+F11: Run full sliding test
            if (e.key === 'F11' && e.shiftKey) {
                e.preventDefault();
                this.runSlidingTest({ iterations: 20 });
            }
            
            // F12: Run all tests
            if (e.key === 'F12' && !e.ctrlKey) {
                e.preventDefault();
                this.runAllTests();
            }
        });
    }
    
    /**
     * Create and show the test UI
     */
    showUI() {
        if (this.uiContainer) {
            this.uiContainer.style.display = 'block';
            this.isUIVisible = true;
            return;
        }
        
        // Create UI container
        this.uiContainer = document.createElement('div');
        this.uiContainer.id = 'test-runner-ui';
        this.uiContainer.innerHTML = `
            <style>
                #test-runner-ui {
                    position: fixed;
                    top: 10px;
                    right: 10px;
                    width: 350px;
                    background: rgba(0, 0, 0, 0.9);
                    border: 2px solid #444;
                    border-radius: 8px;
                    color: #fff;
                    font-family: 'Consolas', 'Monaco', monospace;
                    font-size: 12px;
                    z-index: 10000;
                    user-select: none;
                }
                
                #test-runner-ui .header {
                    background: #333;
                    padding: 10px;
                    border-radius: 6px 6px 0 0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    cursor: move;
                }
                
                #test-runner-ui .header h3 {
                    margin: 0;
                    font-size: 14px;
                    color: #0f0;
                }
                
                #test-runner-ui .close-btn {
                    background: #f00;
                    border: none;
                    color: #fff;
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    cursor: pointer;
                    font-size: 12px;
                    line-height: 20px;
                    text-align: center;
                }
                
                #test-runner-ui .content {
                    padding: 10px;
                }
                
                #test-runner-ui .section {
                    margin-bottom: 15px;
                    padding: 10px;
                    background: #222;
                    border-radius: 4px;
                }
                
                #test-runner-ui .section-title {
                    color: #0af;
                    font-weight: bold;
                    margin-bottom: 8px;
                    font-size: 13px;
                }
                
                #test-runner-ui button {
                    background: #0066cc;
                    border: none;
                    color: #fff;
                    padding: 8px 12px;
                    margin: 4px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 11px;
                    transition: background 0.2s;
                }
                
                #test-runner-ui button:hover {
                    background: #0088ff;
                }
                
                #test-runner-ui button:disabled {
                    background: #444;
                    cursor: not-allowed;
                }
                
                #test-runner-ui button.success {
                    background: #00aa00;
                }
                
                #test-runner-ui button.danger {
                    background: #cc0000;
                }
                
                #test-runner-ui .shortcuts {
                    font-size: 10px;
                    color: #888;
                    margin-top: 5px;
                }
                
                #test-runner-ui .results-panel {
                    max-height: 200px;
                    overflow-y: auto;
                    background: #111;
                    padding: 8px;
                    border-radius: 4px;
                    font-size: 11px;
                    white-space: pre-wrap;
                }
                
                #test-runner-ui .status {
                    padding: 5px 10px;
                    border-radius: 4px;
                    margin-top: 5px;
                    font-size: 11px;
                }
                
                #test-runner-ui .status.pass {
                    background: #004400;
                    color: #0f0;
                }
                
                #test-runner-ui .status.fail {
                    background: #440000;
                    color: #f00;
                }
                
                #test-runner-ui .status.running {
                    background: #444400;
                    color: #ff0;
                }
                
                #test-runner-ui input[type="number"] {
                    width: 60px;
                    padding: 4px;
                    background: #333;
                    border: 1px solid #555;
                    color: #fff;
                    border-radius: 3px;
                }
                
                #test-runner-ui label {
                    display: inline-block;
                    width: 120px;
                    color: #aaa;
                }
                
                #test-runner-ui .config-row {
                    margin: 5px 0;
                }
            </style>
            
            <div class="header">
                <h3>Auto Test Runner</h3>
                <button class="close-btn" onclick="testRunner.hideUI()">X</button>
            </div>
            
            <div class="content">
                <!-- Aiming Test Section -->
                <div class="section">
                    <div class="section-title">Aiming Accuracy Test</div>
                    <div class="config-row">
                        <label>Grid Size:</label>
                        <input type="number" id="aim-grid-size" value="5" min="3" max="10">
                    </div>
                    <div class="config-row">
                        <label>Max Error Threshold:</label>
                        <input type="number" id="aim-max-error" value="2.0" step="0.1" min="0.1">
                    </div>
                    <button onclick="testRunner.runAimingTest()">Run Aiming Test</button>
                    <button onclick="testRunner.runAimingTest({gridSize: 3})">Quick (3x3)</button>
                    <div class="shortcuts">Shortcuts: F10 (quick), Shift+F10 (full)</div>
                    <div id="aim-status" class="status" style="display:none;"></div>
                </div>
                
                <!-- Sliding Test Section -->
                <div class="section">
                    <div class="section-title">Movement Stop / Sliding Test</div>
                    <div class="config-row">
                        <label>Iterations:</label>
                        <input type="number" id="slide-iterations" value="10" min="1" max="50">
                    </div>
                    <div class="config-row">
                        <label>Max Time (ms):</label>
                        <input type="number" id="slide-max-time" value="150" min="50" max="500">
                    </div>
                    <button onclick="testRunner.runSlidingTest()">Run Sliding Test</button>
                    <button onclick="testRunner.runSlidingTest({iterations: 5})">Quick (5x)</button>
                    <button onclick="testRunner.runSlidingTest({simulateJitter: true})">With Jitter</button>
                    <div class="shortcuts">Shortcuts: F11 (quick), Shift+F11 (full)</div>
                    <div id="slide-status" class="status" style="display:none;"></div>
                </div>
                
                <!-- All Tests Section -->
                <div class="section">
                    <div class="section-title">Run All Tests</div>
                    <button class="success" onclick="testRunner.runAllTests()">Run All Tests</button>
                    <button class="danger" onclick="testRunner.clearAllVisualizations()">Clear Markers</button>
                    <div class="shortcuts">Shortcut: F12</div>
                    <div id="all-status" class="status" style="display:none;"></div>
                </div>
                
                <!-- Results Panel -->
                <div class="section">
                    <div class="section-title">Results</div>
                    <div id="results-panel" class="results-panel">
                        No tests run yet.
                        
Press F9 to toggle this panel.
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.uiContainer);
        this.resultsPanel = document.getElementById('results-panel');
        this.isUIVisible = true;
        
        // Make draggable
        this.makeDraggable();
    }
    
    /**
     * Hide the test UI
     */
    hideUI() {
        if (this.uiContainer) {
            this.uiContainer.style.display = 'none';
            this.isUIVisible = false;
        }
    }
    
    /**
     * Toggle UI visibility
     */
    toggleUI() {
        if (this.isUIVisible) {
            this.hideUI();
        } else {
            this.showUI();
        }
    }
    
    /**
     * Make UI draggable
     */
    makeDraggable() {
        const header = this.uiContainer.querySelector('.header');
        let isDragging = false;
        let offsetX, offsetY;
        
        header.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('close-btn')) return;
            isDragging = true;
            offsetX = e.clientX - this.uiContainer.offsetLeft;
            offsetY = e.clientY - this.uiContainer.offsetTop;
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            this.uiContainer.style.left = (e.clientX - offsetX) + 'px';
            this.uiContainer.style.top = (e.clientY - offsetY) + 'px';
            this.uiContainer.style.right = 'auto';
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }
    
    /**
     * Update status display
     */
    updateStatus(elementId, status, message) {
        const el = document.getElementById(elementId);
        if (!el) return;
        
        el.style.display = 'block';
        el.className = 'status ' + status;
        el.textContent = message;
    }
    
    /**
     * Append to results panel
     */
    appendResults(text) {
        if (this.resultsPanel) {
            this.resultsPanel.textContent = text;
            this.resultsPanel.scrollTop = this.resultsPanel.scrollHeight;
        }
    }
    
    /**
     * Run aiming test
     */
    async runAimingTest(options = {}) {
        if (!this.aimingTest) {
            console.error('[TEST-RUNNER] Aiming test not available');
            return null;
        }
        
        // Get config from UI if available
        const gridSizeEl = document.getElementById('aim-grid-size');
        const maxErrorEl = document.getElementById('aim-max-error');
        
        const config = {
            gridSize: options.gridSize || (gridSizeEl ? parseInt(gridSizeEl.value) : 5),
            maxErrorThreshold: options.maxErrorThreshold || (maxErrorEl ? parseFloat(maxErrorEl.value) : 2.0),
            ...options
        };
        
        this.updateStatus('aim-status', 'running', 'Running aiming test...');
        console.log('[TEST-RUNNER] Starting aiming test with config:', config);
        
        try {
            const results = await this.aimingTest.runTest(config);
            
            const statusClass = results.passed ? 'pass' : 'fail';
            const statusText = results.passed 
                ? `PASS - Max: ${results.maxError.toFixed(3)}, Avg: ${results.avgError.toFixed(3)}`
                : `FAIL - ${results.failReason}`;
            
            this.updateStatus('aim-status', statusClass, statusText);
            this.appendResults(this.formatAimingResults(results));
            
            return results;
        } catch (error) {
            console.error('[TEST-RUNNER] Aiming test error:', error);
            this.updateStatus('aim-status', 'fail', 'Error: ' + error.message);
            return null;
        }
    }
    
    /**
     * Run sliding test
     */
    async runSlidingTest(options = {}) {
        if (!this.slidingTest) {
            console.error('[TEST-RUNNER] Sliding test not available');
            return null;
        }
        
        // Get config from UI if available
        const iterationsEl = document.getElementById('slide-iterations');
        const maxTimeEl = document.getElementById('slide-max-time');
        
        const config = {
            iterations: options.iterations || (iterationsEl ? parseInt(iterationsEl.value) : 10),
            maxSlidingTimeThreshold: options.maxSlidingTimeThreshold || (maxTimeEl ? parseInt(maxTimeEl.value) : 150),
            ...options
        };
        
        this.updateStatus('slide-status', 'running', 'Running sliding test...');
        console.log('[TEST-RUNNER] Starting sliding test with config:', config);
        
        try {
            const results = await this.slidingTest.runTest(config);
            
            const statusClass = results.passed ? 'pass' : 'fail';
            const statusText = results.passed 
                ? `PASS - Avg: ${results.avgSlidingTime.toFixed(1)}ms, Max: ${results.maxSlidingTime.toFixed(1)}ms`
                : `FAIL - ${results.failReason}`;
            
            this.updateStatus('slide-status', statusClass, statusText);
            this.appendResults(this.formatSlidingResults(results));
            
            return results;
        } catch (error) {
            console.error('[TEST-RUNNER] Sliding test error:', error);
            this.updateStatus('slide-status', 'fail', 'Error: ' + error.message);
            return null;
        }
    }
    
    /**
     * Run all tests
     */
    async runAllTests() {
        this.updateStatus('all-status', 'running', 'Running all tests...');
        
        const results = {
            aiming: null,
            sliding: null,
            allPassed: false
        };
        
        // Run aiming test
        console.log('\n[TEST-RUNNER] === Running Aiming Test ===');
        results.aiming = await this.runAimingTest({ gridSize: 5 });
        
        // Clear aiming visualization before sliding test
        if (this.aimingTest) {
            this.aimingTest.clearVisualization();
        }
        
        // Wait a bit between tests
        await this.delay(1000);
        
        // Run sliding test
        console.log('\n[TEST-RUNNER] === Running Sliding Test ===');
        results.sliding = await this.runSlidingTest({ iterations: 10 });
        
        // Determine overall result
        results.allPassed = (results.aiming?.passed ?? false) && (results.sliding?.passed ?? false);
        
        const statusClass = results.allPassed ? 'pass' : 'fail';
        const statusText = results.allPassed 
            ? 'ALL TESTS PASSED'
            : 'SOME TESTS FAILED';
        
        this.updateStatus('all-status', statusClass, statusText);
        
        // Format combined results
        this.appendResults(this.formatAllResults(results));
        
        console.log('\n[TEST-RUNNER] === All Tests Complete ===');
        console.log(`Overall: ${results.allPassed ? 'PASS' : 'FAIL'}`);
        
        return results;
    }
    
    /**
     * Format aiming test results for display
     */
    formatAimingResults(results) {
        if (!results) return 'No results';
        
        return `=== AIMING TEST RESULTS ===
Status: ${results.passed ? 'PASS' : 'FAIL'}
${results.failReason ? 'Reason: ' + results.failReason + '\n' : ''}
Targets: ${results.validHits}/${results.totalTargets}
Max Error: ${results.maxError.toFixed(4)} units
Avg Error: ${results.avgError.toFixed(4)} units
Min Error: ${results.minError.toFixed(4)} units

Worst Positions:
${results.worstPositions.map(p => 
    `  (${p.gridPos.i},${p.gridPos.j}): ${p.error.toFixed(4)}`
).join('\n')}
`;
    }
    
    /**
     * Format sliding test results for display
     */
    formatSlidingResults(results) {
        if (!results) return 'No results';
        
        return `=== SLIDING TEST RESULTS ===
Status: ${results.passed ? 'PASS' : 'FAIL'}
${results.failReason ? 'Reason: ' + results.failReason + '\n' : ''}
Iterations: ${results.iterations}

Sliding Time:
  Avg: ${results.avgSlidingTime.toFixed(2)} ms
  Max: ${results.maxSlidingTime.toFixed(2)} ms
  Min: ${results.minSlidingTime.toFixed(2)} ms
  StdDev: ${results.stdDevSlidingTime.toFixed(2)} ms

Sliding Distance:
  Avg: ${results.avgSlidingDistance.toFixed(4)} units
  Max: ${results.maxSlidingDistance.toFixed(4)} units
  Min: ${results.minSlidingDistance.toFixed(4)} units
`;
    }
    
    /**
     * Format all test results for display
     */
    formatAllResults(results) {
        let text = '=== ALL TESTS SUMMARY ===\n';
        text += `Overall: ${results.allPassed ? 'PASS' : 'FAIL'}\n\n`;
        
        text += `Aiming: ${results.aiming?.passed ? 'PASS' : 'FAIL'}\n`;
        if (results.aiming) {
            text += `  Max Error: ${results.aiming.maxError.toFixed(4)}\n`;
            text += `  Avg Error: ${results.aiming.avgError.toFixed(4)}\n`;
        }
        
        text += `\nSliding: ${results.sliding?.passed ? 'PASS' : 'FAIL'}\n`;
        if (results.sliding) {
            text += `  Avg Time: ${results.sliding.avgSlidingTime.toFixed(1)} ms\n`;
            text += `  Max Time: ${results.sliding.maxSlidingTime.toFixed(1)} ms\n`;
        }
        
        return text;
    }
    
    /**
     * Clear all visualizations
     */
    clearAllVisualizations() {
        if (this.aimingTest) {
            this.aimingTest.clearVisualization();
        }
        if (this.slidingTest) {
            this.slidingTest.clearVisualization();
        }
        console.log('[TEST-RUNNER] Cleared all visualizations');
    }
    
    /**
     * Helper delay function
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Cleanup
     */
    cleanup() {
        if (this.aimingTest) {
            this.aimingTest.cleanup();
        }
        if (this.slidingTest) {
            this.slidingTest.cleanup();
        }
        if (this.uiContainer) {
            this.uiContainer.remove();
            this.uiContainer = null;
        }
    }
}

// Global instance
let testRunner = null;
let _gameInstance = null;

/**
 * Initialize test runner when game is ready
 */
function initTestRunner(game) {
    if (testRunner) {
        testRunner.cleanup();
    }
    _gameInstance = game;
    testRunner = new TestRunner(game);
    console.log('[TEST-RUNNER] Initialized. Press F9 to open test UI.');
    console.log('[TEST-RUNNER] You can also run tests from console:');
    console.log('  - runAllAutoTests()     : Run all tests (fully automatic)');
    console.log('  - runAimingAutoTest()   : Run aiming test only');
    console.log('  - runSlidingAutoTest()  : Run sliding test only');
    return testRunner;
}

/**
 * Check if game is ready for testing
 */
function isGameReadyForTests() {
    if (!_gameInstance) {
        console.error('[AUTO-TEST] Game not initialized. Please start a game first.');
        return false;
    }
    if (!_gameInstance.playerSelf) {
        console.error('[AUTO-TEST] Player not available. Please start a game (AI mode or multiplayer) first.');
        return false;
    }
    return true;
}

/**
 * Run all auto tests - fully automatic, no manual input required
 * This is the main entry point for one-click testing
 * 
 * @param {Object} options - Optional configuration
 * @param {boolean} options.showVisualization - Show visual markers (default: true)
 * @param {number} options.aimingGridSize - Grid size for aiming test (default: 5)
 * @param {number} options.slidingIterations - Iterations for sliding test (default: 10)
 * @returns {Promise<Object>} Test results with passed boolean and detailed stats
 */
async function runAllAutoTests(options = {}) {
    console.log('='.repeat(60));
    console.log('[AUTO-TEST] Starting fully automatic test suite...');
    console.log('[AUTO-TEST] No manual input required - just wait for results.');
    console.log('='.repeat(60));
    
    if (!isGameReadyForTests()) {
        return {
            passed: false,
            aiming: null,
            sliding: null,
            error: 'Game not ready. Please start a game first.'
        };
    }
    
    const config = {
        showVisualization: options.showVisualization !== false,
        aimingGridSize: options.aimingGridSize || 5,
        slidingIterations: options.slidingIterations || 10
    };
    
    const results = {
        passed: false,
        aiming: null,
        sliding: null,
        timestamp: new Date().toISOString()
    };
    
    // Run aiming test
    console.log('\n[AUTO-TEST] === Phase 1: Aiming Accuracy Test ===');
    console.log('[AUTO-TEST] Testing aim calculation at multiple screen positions...');
    
    const aimingTest = new AimingAutoTest(_gameInstance);
    results.aiming = await aimingTest.runTest({
        gridSize: config.aimingGridSize,
        showVisualization: config.showVisualization
    });
    
    // Clear visualization before next test
    aimingTest.clearVisualization();
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Run sliding test
    console.log('\n[AUTO-TEST] === Phase 2: Movement Stop / Sliding Test ===');
    console.log('[AUTO-TEST] Testing movement stop timing and distance...');
    
    const slidingTest = new SlidingAutoTest(_gameInstance);
    results.sliding = await slidingTest.runTest({
        iterations: config.slidingIterations,
        showVisualization: config.showVisualization
    });
    
    // Calculate overall result
    results.passed = (results.aiming?.passed ?? false) && (results.sliding?.passed ?? false);
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('[AUTO-TEST] FINAL RESULTS');
    console.log('='.repeat(60));
    console.log(`Overall: ${results.passed ? 'PASS' : 'FAIL'}`);
    console.log('-'.repeat(60));
    console.log(`Aiming Test: ${results.aiming?.passed ? 'PASS' : 'FAIL'}`);
    if (results.aiming) {
        console.log(`  Max Error: ${results.aiming.maxError?.toFixed(4) || 'N/A'} units`);
        console.log(`  Avg Error: ${results.aiming.avgError?.toFixed(4) || 'N/A'} units`);
    }
    console.log('-'.repeat(60));
    console.log(`Sliding Test: ${results.sliding?.passed ? 'PASS' : 'FAIL'}`);
    if (results.sliding) {
        console.log(`  Avg Sliding Time: ${results.sliding.avgSlidingTime?.toFixed(2) || 'N/A'} ms`);
        console.log(`  Max Sliding Time: ${results.sliding.maxSlidingTime?.toFixed(2) || 'N/A'} ms`);
        console.log(`  Avg Sliding Distance: ${results.sliding.avgSlidingDistance?.toFixed(4) || 'N/A'} units`);
    }
    console.log('='.repeat(60));
    
    return results;
}

/**
 * Run aiming auto test only - fully automatic
 */
async function runAimingAutoTest(options = {}) {
    console.log('[AUTO-TEST] Starting aiming accuracy test...');
    
    if (!isGameReadyForTests()) {
        return { passed: false, error: 'Game not ready' };
    }
    
    const aimingTest = new AimingAutoTest(_gameInstance);
    return await aimingTest.runTest({
        gridSize: options.gridSize || 5,
        showVisualization: options.showVisualization !== false,
        ...options
    });
}

/**
 * Run sliding auto test only - fully automatic
 */
async function runSlidingAutoTest(options = {}) {
    console.log('[AUTO-TEST] Starting sliding/stop test...');
    
    if (!isGameReadyForTests()) {
        return { passed: false, error: 'Game not ready' };
    }
    
    const slidingTest = new SlidingAutoTest(_gameInstance);
    return await slidingTest.runTest({
        iterations: options.iterations || 10,
        showVisualization: options.showVisualization !== false,
        ...options
    });
}

// Export for use in game
if (typeof window !== 'undefined') {
    window.TestRunner = TestRunner;
    window.initTestRunner = initTestRunner;
    
    // Global one-click test functions
    window.runAllAutoTests = runAllAutoTests;
    window.runAimingAutoTest = runAimingAutoTest;
    window.runSlidingAutoTest = runSlidingAutoTest;
    window.isGameReadyForTests = isGameReadyForTests;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
        TestRunner, 
        initTestRunner,
        runAllAutoTests,
        runAimingAutoTest,
        runSlidingAutoTest
    };
}
