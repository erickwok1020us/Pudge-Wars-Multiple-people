/**
 * Movement Stop / Sliding Auto-Test Module
 * 
 * Automatically tests the sliding behavior after stopping movement by:
 * 1. Starting character movement in a fixed direction
 * 2. Programmatically stopping movement input
 * 3. Recording timestamps and positions at key moments
 * 4. Calculating sliding time and distance
 * 5. Running multiple iterations and computing statistics
 * 
 * Key Measurements:
 * - t_inputRelease: When movement input stops
 * - t_serverStop: When server confirms stop (if available)
 * - t_clientStop: When character visually stops moving
 * - slidingTime: t_clientStop - t_inputRelease
 * - slidingDistance: distance traveled after input release
 * 
 * Usage:
 *   const slidingTest = new SlidingAutoTest(game);
 *   const results = await slidingTest.runTest();
 *   console.log(results.passed ? 'PASS' : 'FAIL');
 */

class SlidingAutoTest {
    constructor(game) {
        this.game = game;
        
        // Test configuration
        this.config = {
            // Movement parameters
            moveDuration: 1000,        // How long to move before stopping (ms)
            moveDirection: { x: 1, z: 0 },  // Direction to move (normalized)
            moveDistance: 30,          // Target distance to move
            
            // Measurement parameters
            positionCheckInterval: 16, // Check position every 16ms (~60fps)
            stopThreshold: 0.01,       // Position change below this = stopped
            maxWaitForStop: 2000,      // Max time to wait for stop (ms)
            stopConfirmFrames: 3,      // Consecutive frames with no movement to confirm stop
            
            // Test iterations
            iterations: 10,            // Number of test runs
            delayBetweenTests: 500,    // Delay between test iterations (ms)
            
            // Simulated network jitter (optional)
            simulateJitter: false,
            jitterMin: 0,              // Min jitter in ms
            jitterMax: 50,             // Max jitter in ms
            
            // Pass/fail thresholds
            avgSlidingTimeThreshold: 100,    // Average sliding time must be < 100ms
            maxSlidingTimeThreshold: 150,    // Max sliding time must be < 150ms
            avgSlidingDistanceThreshold: 0.5, // Average sliding distance < 0.5 units
            maxSlidingDistanceThreshold: 1.0, // Max sliding distance < 1.0 units
            
            // Visualization
            showVisualization: true,
            startMarkerColor: 0x00ff00,      // Green for start position
            stopMarkerColor: 0xff0000,       // Red for stop position
            releaseMarkerColor: 0xffff00,    // Yellow for input release position
            pathColor: 0x0088ff,             // Blue for movement path
        };
        
        // Test state
        this.isRunning = false;
        this.currentIteration = 0;
        this.iterationResults = [];
        this.visualMarkers = [];
        this.results = null;
        
        // Measurement state
        this.measurementState = {
            isMoving: false,
            positions: [],
            timestamps: [],
            t_inputRelease: 0,
            t_serverStop: 0,
            t_clientStop: 0,
            pos_at_inputRelease: null,
            pos_at_clientStop: null,
            pos_start: null
        };
        
        // Server stop listener
        this._serverStopListener = null;
    }
    
    /**
     * Get current player position
     */
    getPlayerPosition() {
        if (!this.game.playerSelf) return null;
        return {
            x: this.game.playerSelf.x,
            z: this.game.playerSelf.z,
            timestamp: Date.now()
        };
    }
    
    /**
     * Calculate distance between two positions
     */
    distance(pos1, pos2) {
        if (!pos1 || !pos2) return Infinity;
        const dx = pos2.x - pos1.x;
        const dz = pos2.z - pos1.z;
        return Math.sqrt(dx * dx + dz * dz);
    }
    
    /**
     * Start movement towards a target
     */
    startMovement() {
        if (!this.game.playerSelf) {
            console.error('[SLIDE-TEST] No player available');
            return false;
        }
        
        const startPos = this.getPlayerPosition();
        this.measurementState.pos_start = startPos;
        
        // Calculate target position
        const targetX = startPos.x + this.config.moveDirection.x * this.config.moveDistance;
        const targetZ = startPos.z + this.config.moveDirection.z * this.config.moveDistance;
        
        // Set movement target (simulating a click)
        this.game.playerSelf.targetX = targetX;
        this.game.playerSelf.targetZ = targetZ;
        this.game.playerSelf.isMoving = true;
        
        // If multiplayer, emit movement event
        if (this.game.isMultiplayer && typeof socket !== 'undefined' && socket) {
            socket.emit('playerMove', {
                roomCode: typeof roomCode !== 'undefined' ? roomCode : '',
                targetX: targetX,
                targetZ: targetZ,
                actionId: `test-${Date.now()}-${Math.random()}`
            });
        }
        
        this.measurementState.isMoving = true;
        console.log(`[SLIDE-TEST] Started movement from (${startPos.x.toFixed(2)}, ${startPos.z.toFixed(2)}) to (${targetX.toFixed(2)}, ${targetZ.toFixed(2)})`);
        
        return true;
    }
    
    /**
     * Stop movement (simulate releasing input)
     */
    stopMovement() {
        if (!this.game.playerSelf) return;
        
        const releasePos = this.getPlayerPosition();
        this.measurementState.t_inputRelease = Date.now();
        this.measurementState.pos_at_inputRelease = releasePos;
        
        // Clear movement target (simulating releasing the mouse button)
        // Note: We set targetX/Z to current position to stop, but don't set isMoving = false
        // This lets us test how the game naturally stops
        this.game.playerSelf.targetX = this.game.playerSelf.x;
        this.game.playerSelf.targetZ = this.game.playerSelf.z;
        
        // If multiplayer, emit stop event
        if (this.game.isMultiplayer && typeof socket !== 'undefined' && socket) {
            socket.emit('playerMove', {
                roomCode: typeof roomCode !== 'undefined' ? roomCode : '',
                targetX: this.game.playerSelf.x,
                targetZ: this.game.playerSelf.z,
                actionId: `test-stop-${Date.now()}-${Math.random()}`
            });
        }
        
        console.log(`[SLIDE-TEST] Input released at (${releasePos.x.toFixed(2)}, ${releasePos.z.toFixed(2)}) t=${this.measurementState.t_inputRelease}`);
    }
    
    /**
     * Monitor position until character stops
     */
    async waitForStop() {
        return new Promise((resolve) => {
            let lastPos = this.getPlayerPosition();
            let stoppedFrames = 0;
            let checkCount = 0;
            const maxChecks = this.config.maxWaitForStop / this.config.positionCheckInterval;
            
            const checkInterval = setInterval(() => {
                const currentPos = this.getPlayerPosition();
                checkCount++;
                
                // Record position for path visualization
                this.measurementState.positions.push(currentPos);
                this.measurementState.timestamps.push(Date.now());
                
                // Check if position changed
                const moved = this.distance(lastPos, currentPos);
                
                if (moved < this.config.stopThreshold) {
                    stoppedFrames++;
                    
                    if (stoppedFrames >= this.config.stopConfirmFrames) {
                        // Character has stopped
                        clearInterval(checkInterval);
                        
                        this.measurementState.t_clientStop = Date.now();
                        this.measurementState.pos_at_clientStop = currentPos;
                        this.measurementState.isMoving = false;
                        
                        console.log(`[SLIDE-TEST] Client stopped at (${currentPos.x.toFixed(2)}, ${currentPos.z.toFixed(2)}) t=${this.measurementState.t_clientStop}`);
                        resolve(true);
                    }
                } else {
                    stoppedFrames = 0;
                }
                
                lastPos = currentPos;
                
                // Timeout
                if (checkCount >= maxChecks) {
                    clearInterval(checkInterval);
                    console.warn('[SLIDE-TEST] Timeout waiting for stop');
                    this.measurementState.t_clientStop = Date.now();
                    this.measurementState.pos_at_clientStop = currentPos;
                    resolve(false);
                }
            }, this.config.positionCheckInterval);
        });
    }
    
    /**
     * Setup server stop listener
     */
    setupServerStopListener() {
        if (!this.game.isMultiplayer || typeof socket === 'undefined' || !socket) {
            return;
        }
        
        // Listen for server game state to detect server-side stop
        this._serverStopListener = (data) => {
            if (!data.players) return;
            
            for (const player of data.players) {
                if (player.playerId === this.game.myPlayerId) {
                    const serverSpeedSq = (player.vx || 0) * (player.vx || 0) + 
                                          (player.vz || 0) * (player.vz || 0);
                    const serverIsMoving = !!player.isMoving || serverSpeedSq > 0.0001;
                    
                    if (!serverIsMoving && this.measurementState.t_serverStop === 0 && 
                        this.measurementState.t_inputRelease > 0) {
                        this.measurementState.t_serverStop = Date.now();
                        console.log(`[SLIDE-TEST] Server stop detected at t=${this.measurementState.t_serverStop}`);
                    }
                }
            }
        };
        
        socket.on('serverGameState', this._serverStopListener);
    }
    
    /**
     * Remove server stop listener
     */
    removeServerStopListener() {
        if (this._serverStopListener && typeof socket !== 'undefined' && socket) {
            socket.off('serverGameState', this._serverStopListener);
            this._serverStopListener = null;
        }
    }
    
    /**
     * Run a single test iteration
     */
    async runSingleIteration() {
        // Reset measurement state
        this.measurementState = {
            isMoving: false,
            positions: [],
            timestamps: [],
            t_inputRelease: 0,
            t_serverStop: 0,
            t_clientStop: 0,
            pos_at_inputRelease: null,
            pos_at_clientStop: null,
            pos_start: null
        };
        
        // Setup server listener
        this.setupServerStopListener();
        
        // Start movement
        if (!this.startMovement()) {
            this.removeServerStopListener();
            return null;
        }
        
        // Wait for movement duration
        await this.delay(this.config.moveDuration);
        
        // Add simulated jitter if enabled
        if (this.config.simulateJitter) {
            const jitter = this.config.jitterMin + 
                Math.random() * (this.config.jitterMax - this.config.jitterMin);
            await this.delay(jitter);
        }
        
        // Stop movement (release input)
        this.stopMovement();
        
        // Wait for character to stop
        await this.waitForStop();
        
        // Remove server listener
        this.removeServerStopListener();
        
        // Calculate results
        const slidingTime = this.measurementState.t_clientStop - this.measurementState.t_inputRelease;
        const slidingDistance = this.distance(
            this.measurementState.pos_at_inputRelease,
            this.measurementState.pos_at_clientStop
        );
        
        const serverDelay = this.measurementState.t_serverStop > 0 
            ? this.measurementState.t_serverStop - this.measurementState.t_inputRelease 
            : null;
        
        const result = {
            iteration: this.currentIteration,
            slidingTime: slidingTime,
            slidingDistance: slidingDistance,
            serverDelay: serverDelay,
            t_inputRelease: this.measurementState.t_inputRelease,
            t_serverStop: this.measurementState.t_serverStop,
            t_clientStop: this.measurementState.t_clientStop,
            pos_start: this.measurementState.pos_start,
            pos_at_inputRelease: this.measurementState.pos_at_inputRelease,
            pos_at_clientStop: this.measurementState.pos_at_clientStop,
            positionHistory: this.measurementState.positions
        };
        
        console.log(`[SLIDE-TEST] Iteration ${this.currentIteration}: slidingTime=${slidingTime}ms, slidingDistance=${slidingDistance.toFixed(4)} units`);
        
        return result;
    }
    
    /**
     * Create visual marker at a point
     */
    createMarker(point, color, size = 0.5) {
        if (!this.game.scene || !point) return null;
        
        const geometry = new THREE.SphereGeometry(size, 16, 16);
        const material = new THREE.MeshBasicMaterial({ color: color });
        const marker = new THREE.Mesh(geometry, material);
        
        const y = this.game.groundSurfaceY || 0;
        marker.position.set(point.x, y + 0.5, point.z);
        this.game.scene.add(marker);
        this.visualMarkers.push(marker);
        
        return marker;
    }
    
    /**
     * Create path visualization from position history
     */
    createPathVisualization(positions, color) {
        if (!this.game.scene || positions.length < 2) return null;
        
        const y = this.game.groundSurfaceY || 0;
        const points = positions.map(p => new THREE.Vector3(p.x, y + 0.2, p.z));
        
        const material = new THREE.LineBasicMaterial({ color: color });
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, material);
        
        this.game.scene.add(line);
        this.visualMarkers.push(line);
        
        return line;
    }
    
    /**
     * Clear all visual markers
     */
    clearVisualization() {
        for (const marker of this.visualMarkers) {
            if (marker.geometry) marker.geometry.dispose();
            if (marker.material) marker.material.dispose();
            if (this.game.scene) this.game.scene.remove(marker);
        }
        this.visualMarkers = [];
    }
    
    /**
     * Run the full sliding test
     */
    async runTest(options = {}) {
        if (this.isRunning) {
            console.warn('[SLIDE-TEST] Test already running');
            return null;
        }
        
        this.isRunning = true;
        console.log('[SLIDE-TEST] Starting sliding/stop test...');
        
        // Apply options
        Object.assign(this.config, options);
        
        // Clear previous results
        this.clearVisualization();
        this.iterationResults = [];
        
        // Run iterations
        for (let i = 0; i < this.config.iterations; i++) {
            this.currentIteration = i + 1;
            console.log(`\n[SLIDE-TEST] === Iteration ${this.currentIteration}/${this.config.iterations} ===`);
            
            const result = await this.runSingleIteration();
            if (result) {
                this.iterationResults.push(result);
                
                // Visualize this iteration
                if (this.config.showVisualization) {
                    this.createMarker(result.pos_start, this.config.startMarkerColor, 0.3);
                    this.createMarker(result.pos_at_inputRelease, this.config.releaseMarkerColor, 0.4);
                    this.createMarker(result.pos_at_clientStop, this.config.stopMarkerColor, 0.4);
                    
                    // Show path after input release
                    const releaseIndex = result.positionHistory.findIndex(
                        p => p.timestamp >= result.t_inputRelease
                    );
                    if (releaseIndex >= 0) {
                        const slidingPath = result.positionHistory.slice(releaseIndex);
                        this.createPathVisualization(slidingPath, this.config.pathColor);
                    }
                }
            }
            
            // Delay between iterations
            if (i < this.config.iterations - 1) {
                await this.delay(this.config.delayBetweenTests);
            }
        }
        
        // Calculate statistics
        this.results = this.calculateStatistics();
        
        // Log results
        this.logResults();
        
        this.isRunning = false;
        return this.results;
    }
    
    /**
     * Calculate test statistics
     */
    calculateStatistics() {
        if (this.iterationResults.length === 0) {
            return {
                passed: false,
                iterations: 0,
                failReason: 'No valid iterations completed'
            };
        }
        
        const slidingTimes = this.iterationResults.map(r => r.slidingTime);
        const slidingDistances = this.iterationResults.map(r => r.slidingDistance);
        const serverDelays = this.iterationResults
            .filter(r => r.serverDelay !== null)
            .map(r => r.serverDelay);
        
        // Calculate statistics
        const avgSlidingTime = slidingTimes.reduce((a, b) => a + b, 0) / slidingTimes.length;
        const maxSlidingTime = Math.max(...slidingTimes);
        const minSlidingTime = Math.min(...slidingTimes);
        
        const avgSlidingDistance = slidingDistances.reduce((a, b) => a + b, 0) / slidingDistances.length;
        const maxSlidingDistance = Math.max(...slidingDistances);
        const minSlidingDistance = Math.min(...slidingDistances);
        
        let avgServerDelay = null;
        let maxServerDelay = null;
        if (serverDelays.length > 0) {
            avgServerDelay = serverDelays.reduce((a, b) => a + b, 0) / serverDelays.length;
            maxServerDelay = Math.max(...serverDelays);
        }
        
        // Standard deviation
        const stdDevTime = Math.sqrt(
            slidingTimes.reduce((sum, t) => sum + Math.pow(t - avgSlidingTime, 2), 0) / slidingTimes.length
        );
        const stdDevDistance = Math.sqrt(
            slidingDistances.reduce((sum, d) => sum + Math.pow(d - avgSlidingDistance, 2), 0) / slidingDistances.length
        );
        
        // Check pass/fail
        const timePass = avgSlidingTime <= this.config.avgSlidingTimeThreshold &&
                         maxSlidingTime <= this.config.maxSlidingTimeThreshold;
        const distancePass = avgSlidingDistance <= this.config.avgSlidingDistanceThreshold &&
                             maxSlidingDistance <= this.config.maxSlidingDistanceThreshold;
        const passed = timePass && distancePass;
        
        let failReason = null;
        if (!passed) {
            const reasons = [];
            if (avgSlidingTime > this.config.avgSlidingTimeThreshold) {
                reasons.push(`Avg sliding time ${avgSlidingTime.toFixed(1)}ms > ${this.config.avgSlidingTimeThreshold}ms`);
            }
            if (maxSlidingTime > this.config.maxSlidingTimeThreshold) {
                reasons.push(`Max sliding time ${maxSlidingTime.toFixed(1)}ms > ${this.config.maxSlidingTimeThreshold}ms`);
            }
            if (avgSlidingDistance > this.config.avgSlidingDistanceThreshold) {
                reasons.push(`Avg sliding distance ${avgSlidingDistance.toFixed(3)} > ${this.config.avgSlidingDistanceThreshold}`);
            }
            if (maxSlidingDistance > this.config.maxSlidingDistanceThreshold) {
                reasons.push(`Max sliding distance ${maxSlidingDistance.toFixed(3)} > ${this.config.maxSlidingDistanceThreshold}`);
            }
            failReason = reasons.join('; ');
        }
        
        return {
            passed: passed,
            iterations: this.iterationResults.length,
            
            // Sliding time stats
            avgSlidingTime: avgSlidingTime,
            maxSlidingTime: maxSlidingTime,
            minSlidingTime: minSlidingTime,
            stdDevSlidingTime: stdDevTime,
            
            // Sliding distance stats
            avgSlidingDistance: avgSlidingDistance,
            maxSlidingDistance: maxSlidingDistance,
            minSlidingDistance: minSlidingDistance,
            stdDevSlidingDistance: stdDevDistance,
            
            // Server delay stats (if available)
            avgServerDelay: avgServerDelay,
            maxServerDelay: maxServerDelay,
            
            // Raw data
            allResults: this.iterationResults,
            
            // Thresholds used
            thresholds: {
                avgSlidingTime: this.config.avgSlidingTimeThreshold,
                maxSlidingTime: this.config.maxSlidingTimeThreshold,
                avgSlidingDistance: this.config.avgSlidingDistanceThreshold,
                maxSlidingDistance: this.config.maxSlidingDistanceThreshold
            },
            
            failReason: failReason
        };
    }
    
    /**
     * Log test results
     */
    logResults() {
        const r = this.results;
        
        console.log('\n' + '='.repeat(60));
        console.log('[SLIDE-TEST] RESULTS');
        console.log('='.repeat(60));
        console.log(`Status: ${r.passed ? 'PASS' : 'FAIL'}`);
        if (r.failReason) {
            console.log(`Fail Reason: ${r.failReason}`);
        }
        console.log('-'.repeat(60));
        console.log(`Iterations: ${r.iterations}`);
        console.log('');
        console.log('Sliding Time:');
        console.log(`  Average: ${r.avgSlidingTime.toFixed(2)} ms (threshold: ${r.thresholds.avgSlidingTime} ms)`);
        console.log(`  Maximum: ${r.maxSlidingTime.toFixed(2)} ms (threshold: ${r.thresholds.maxSlidingTime} ms)`);
        console.log(`  Minimum: ${r.minSlidingTime.toFixed(2)} ms`);
        console.log(`  Std Dev: ${r.stdDevSlidingTime.toFixed(2)} ms`);
        console.log('');
        console.log('Sliding Distance:');
        console.log(`  Average: ${r.avgSlidingDistance.toFixed(4)} units (threshold: ${r.thresholds.avgSlidingDistance})`);
        console.log(`  Maximum: ${r.maxSlidingDistance.toFixed(4)} units (threshold: ${r.thresholds.maxSlidingDistance})`);
        console.log(`  Minimum: ${r.minSlidingDistance.toFixed(4)} units`);
        console.log(`  Std Dev: ${r.stdDevSlidingDistance.toFixed(4)} units`);
        
        if (r.avgServerDelay !== null) {
            console.log('');
            console.log('Server Delay:');
            console.log(`  Average: ${r.avgServerDelay.toFixed(2)} ms`);
            console.log(`  Maximum: ${r.maxServerDelay.toFixed(2)} ms`);
        }
        
        console.log('='.repeat(60));
        
        return r;
    }
    
    /**
     * Run test with simulated network jitter
     */
    async runJitterTest(jitterConfigs = null) {
        const defaultConfigs = [
            { jitterMin: 0, jitterMax: 0, name: 'No Jitter' },
            { jitterMin: 0, jitterMax: 20, name: 'Low Jitter (0-20ms)' },
            { jitterMin: 10, jitterMax: 50, name: 'Medium Jitter (10-50ms)' },
            { jitterMin: 30, jitterMax: 100, name: 'High Jitter (30-100ms)' }
        ];
        
        const configs = jitterConfigs || defaultConfigs;
        const results = [];
        
        console.log('[SLIDE-TEST] Starting jitter test series...');
        
        for (const config of configs) {
            console.log(`\n[SLIDE-TEST] Testing with: ${config.name}`);
            
            const result = await this.runTest({
                simulateJitter: config.jitterMin > 0 || config.jitterMax > 0,
                jitterMin: config.jitterMin,
                jitterMax: config.jitterMax,
                iterations: 5  // Fewer iterations per jitter config
            });
            
            result.jitterConfig = config;
            results.push(result);
            
            this.clearVisualization();
            await this.delay(1000);
        }
        
        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('[SLIDE-TEST] JITTER TEST SUMMARY');
        console.log('='.repeat(60));
        
        for (const r of results) {
            const status = r.passed ? 'PASS' : 'FAIL';
            console.log(`${r.jitterConfig.name}: ${status}`);
            console.log(`  Avg Time: ${r.avgSlidingTime.toFixed(1)}ms, Max Time: ${r.maxSlidingTime.toFixed(1)}ms`);
            console.log(`  Avg Dist: ${r.avgSlidingDistance.toFixed(4)}, Max Dist: ${r.maxSlidingDistance.toFixed(4)}`);
        }
        
        const allPassed = results.every(r => r.passed);
        console.log('-'.repeat(60));
        console.log(`Overall: ${allPassed ? 'ALL PASS' : 'SOME FAILED'}`);
        console.log('='.repeat(60));
        
        return {
            allPassed: allPassed,
            results: results
        };
    }
    
    /**
     * Helper delay function
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Clean up test resources
     */
    cleanup() {
        this.removeServerStopListener();
        this.clearVisualization();
        this.iterationResults = [];
        this.results = null;
    }
}

// Export for use in game
if (typeof window !== 'undefined') {
    window.SlidingAutoTest = SlidingAutoTest;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SlidingAutoTest;
}
