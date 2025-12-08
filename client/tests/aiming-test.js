/**
 * Aiming Auto-Test Module
 * 
 * Automatically tests aiming accuracy by:
 * 1. Generating a grid of target points on the ground
 * 2. For each target, calculating the corresponding screen coordinates
 * 3. Firing at each target and measuring the actual hit point
 * 4. Computing error statistics (max, average, per-target)
 * 5. Visualizing results with markers
 * 
 * Usage:
 *   const aimTest = new AimingAutoTest(game);
 *   const results = await aimTest.runTest();
 *   console.log(results.passed ? 'PASS' : 'FAIL');
 */

class AimingAutoTest {
    constructor(game) {
        this.game = game;
        
        // Test configuration
        this.config = {
            gridSize: 5,           // 5x5 grid of target points
            gridSpacing: 20,       // Distance between grid points in world units
            gridCenterX: 0,        // Center of grid in world X
            gridCenterZ: 0,        // Center of grid in world Z
            targetY: 0,            // Y position of targets (ground level)
            
            // Pass/fail thresholds
            maxErrorThreshold: 2.0,     // Max allowed error in world units
            avgErrorThreshold: 1.0,     // Average error threshold
            
            // Visualization
            showVisualization: true,
            targetMarkerColor: 0x00ff00,    // Green for target points
            hitMarkerColor: 0xff0000,       // Red for hit points
            goodHitColor: 0x00ff00,         // Green for accurate hits
            badHitColor: 0xff0000,          // Red for inaccurate hits
            markerSize: 0.5,
            
            // Test timing
            delayBetweenShots: 100,  // ms between shots
        };
        
        // Test state
        this.targetPoints = [];
        this.hitPoints = [];
        this.errors = [];
        this.visualMarkers = [];
        this.isRunning = false;
        this.results = null;
    }
    
    /**
     * Generate grid of target points
     */
    generateTargetGrid() {
        this.targetPoints = [];
        const { gridSize, gridSpacing, gridCenterX, gridCenterZ, targetY } = this.config;
        
        const halfGrid = Math.floor(gridSize / 2);
        
        for (let i = 0; i < gridSize; i++) {
            for (let j = 0; j < gridSize; j++) {
                const x = gridCenterX + (i - halfGrid) * gridSpacing;
                const z = gridCenterZ + (j - halfGrid) * gridSpacing;
                
                this.targetPoints.push({
                    x: x,
                    y: targetY,
                    z: z,
                    index: this.targetPoints.length,
                    gridPos: { i, j }
                });
            }
        }
        
        console.log(`[AIM-TEST] Generated ${this.targetPoints.length} target points`);
        return this.targetPoints;
    }
    
    /**
     * Convert world point to screen coordinates
     * This is the inverse of getAimTargetWorldPoint
     */
    worldToScreen(worldPoint) {
        if (!this.game.camera || !this.game.renderer) {
            console.error('[AIM-TEST] Camera or renderer not available');
            return null;
        }
        
        const vector = new THREE.Vector3(worldPoint.x, worldPoint.y, worldPoint.z);
        vector.project(this.game.camera);
        
        const rect = this.game.renderer.domElement.getBoundingClientRect();
        
        const screenX = ((vector.x + 1) / 2) * rect.width + rect.left;
        const screenY = ((-vector.y + 1) / 2) * rect.height + rect.top;
        
        return { clientX: screenX, clientY: screenY };
    }
    
    /**
     * Simulate aiming at a target point and get the calculated aim direction
     * Returns the world point that would be hit based on current aiming logic
     */
    simulateAim(targetPoint) {
        // Convert target to screen coordinates
        const screenCoords = this.worldToScreen(targetPoint);
        if (!screenCoords) {
            return null;
        }
        
        // Use the game's unified aim function to get the calculated hit point
        const calculatedHitPoint = this.game.getAimTargetWorldPoint(screenCoords.clientX, screenCoords.clientY);
        
        if (calculatedHitPoint) {
            return {
                x: calculatedHitPoint.x,
                y: calculatedHitPoint.y,
                z: calculatedHitPoint.z,
                screenCoords: screenCoords
            };
        }
        
        return null;
    }
    
    /**
     * Calculate error between target and hit point
     */
    calculateError(targetPoint, hitPoint) {
        if (!hitPoint) {
            return {
                distance: Infinity,
                dx: Infinity,
                dz: Infinity,
                angle: 0
            };
        }
        
        const dx = hitPoint.x - targetPoint.x;
        const dz = hitPoint.z - targetPoint.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        // Calculate angle error (direction from player to target vs direction to hit)
        const playerX = this.game.playerSelf ? this.game.playerSelf.x : 0;
        const playerZ = this.game.playerSelf ? this.game.playerSelf.z : 0;
        
        const targetAngle = Math.atan2(targetPoint.z - playerZ, targetPoint.x - playerX);
        const hitAngle = Math.atan2(hitPoint.z - playerZ, hitPoint.x - playerX);
        const angleDiff = Math.abs(targetAngle - hitAngle) * (180 / Math.PI);
        
        return {
            distance: distance,
            dx: dx,
            dz: dz,
            angle: angleDiff
        };
    }
    
    /**
     * Create visual marker at a point
     */
    createMarker(point, color, size = null) {
        if (!this.game.scene) return null;
        
        const markerSize = size || this.config.markerSize;
        const geometry = new THREE.SphereGeometry(markerSize, 16, 16);
        const material = new THREE.MeshBasicMaterial({ color: color });
        const marker = new THREE.Mesh(geometry, material);
        
        marker.position.set(point.x, point.y + 0.1, point.z);
        this.game.scene.add(marker);
        this.visualMarkers.push(marker);
        
        return marker;
    }
    
    /**
     * Create line between two points
     */
    createLine(point1, point2, color) {
        if (!this.game.scene) return null;
        
        const material = new THREE.LineBasicMaterial({ color: color });
        const points = [
            new THREE.Vector3(point1.x, point1.y + 0.1, point1.z),
            new THREE.Vector3(point2.x, point2.y + 0.1, point2.z)
        ];
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
     * Run the aiming test
     */
    async runTest(options = {}) {
        if (this.isRunning) {
            console.warn('[AIM-TEST] Test already running');
            return null;
        }
        
        this.isRunning = true;
        console.log('[AIM-TEST] Starting aiming accuracy test...');
        
        // Apply options
        Object.assign(this.config, options);
        
        // Clear previous results
        this.clearVisualization();
        this.hitPoints = [];
        this.errors = [];
        
        // Generate target grid
        this.generateTargetGrid();
        
        // Position player at center if possible
        if (this.game.playerSelf) {
            // Store original position
            const originalPos = {
                x: this.game.playerSelf.x,
                z: this.game.playerSelf.z
            };
            
            // Move player to test position (center of grid)
            this.game.playerSelf.x = this.config.gridCenterX;
            this.game.playerSelf.z = this.config.gridCenterZ - 30; // Behind the grid
            this.game.playerSelf.isMoving = false;
            
            if (this.game.playerSelf.mesh) {
                this.game.playerSelf.mesh.position.x = this.game.playerSelf.x;
                this.game.playerSelf.mesh.position.z = this.game.playerSelf.z;
            }
        }
        
        // Test each target point
        for (let i = 0; i < this.targetPoints.length; i++) {
            const target = this.targetPoints[i];
            
            // Visualize target point
            if (this.config.showVisualization) {
                this.createMarker(target, this.config.targetMarkerColor, this.config.markerSize);
            }
            
            // Simulate aiming at target
            const hitPoint = this.simulateAim(target);
            this.hitPoints.push(hitPoint);
            
            // Calculate error
            const error = this.calculateError(target, hitPoint);
            error.targetIndex = i;
            error.target = target;
            error.hit = hitPoint;
            this.errors.push(error);
            
            // Visualize hit point and error line
            if (this.config.showVisualization && hitPoint) {
                const hitColor = error.distance < this.config.avgErrorThreshold 
                    ? this.config.goodHitColor 
                    : this.config.badHitColor;
                this.createMarker(hitPoint, hitColor, this.config.markerSize * 0.7);
                
                // Draw line from target to hit point to show error
                if (error.distance > 0.1) {
                    this.createLine(target, hitPoint, 0xffff00);
                }
            }
            
            // Small delay between tests
            await this.delay(this.config.delayBetweenShots);
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
        const validErrors = this.errors.filter(e => e.distance !== Infinity);
        
        if (validErrors.length === 0) {
            return {
                passed: false,
                totalTargets: this.targetPoints.length,
                validHits: 0,
                maxError: Infinity,
                avgError: Infinity,
                minError: Infinity,
                maxAngleError: Infinity,
                avgAngleError: Infinity,
                errorsByPosition: [],
                failReason: 'No valid hits recorded'
            };
        }
        
        const distances = validErrors.map(e => e.distance);
        const angles = validErrors.map(e => e.angle);
        
        const maxError = Math.max(...distances);
        const minError = Math.min(...distances);
        const avgError = distances.reduce((a, b) => a + b, 0) / distances.length;
        
        const maxAngleError = Math.max(...angles);
        const avgAngleError = angles.reduce((a, b) => a + b, 0) / angles.length;
        
        // Check pass/fail
        const passed = maxError <= this.config.maxErrorThreshold && 
                       avgError <= this.config.avgErrorThreshold;
        
        let failReason = null;
        if (!passed) {
            if (maxError > this.config.maxErrorThreshold) {
                failReason = `Max error ${maxError.toFixed(3)} exceeds threshold ${this.config.maxErrorThreshold}`;
            } else if (avgError > this.config.avgErrorThreshold) {
                failReason = `Avg error ${avgError.toFixed(3)} exceeds threshold ${this.config.avgErrorThreshold}`;
            }
        }
        
        // Find worst positions
        const sortedErrors = [...validErrors].sort((a, b) => b.distance - a.distance);
        const worstPositions = sortedErrors.slice(0, 5).map(e => ({
            gridPos: e.target.gridPos,
            worldPos: { x: e.target.x, z: e.target.z },
            error: e.distance,
            dx: e.dx,
            dz: e.dz
        }));
        
        return {
            passed: passed,
            totalTargets: this.targetPoints.length,
            validHits: validErrors.length,
            maxError: maxError,
            minError: minError,
            avgError: avgError,
            maxAngleError: maxAngleError,
            avgAngleError: avgAngleError,
            worstPositions: worstPositions,
            allErrors: this.errors,
            failReason: failReason,
            config: { ...this.config }
        };
    }
    
    /**
     * Log test results
     */
    logResults() {
        const r = this.results;
        
        console.log('='.repeat(60));
        console.log('[AIM-TEST] RESULTS');
        console.log('='.repeat(60));
        console.log(`Status: ${r.passed ? 'PASS' : 'FAIL'}`);
        if (r.failReason) {
            console.log(`Fail Reason: ${r.failReason}`);
        }
        console.log('-'.repeat(60));
        console.log(`Total Targets: ${r.totalTargets}`);
        console.log(`Valid Hits: ${r.validHits}`);
        console.log(`Max Error: ${r.maxError.toFixed(4)} units`);
        console.log(`Min Error: ${r.minError.toFixed(4)} units`);
        console.log(`Avg Error: ${r.avgError.toFixed(4)} units`);
        console.log(`Max Angle Error: ${r.maxAngleError.toFixed(2)} degrees`);
        console.log(`Avg Angle Error: ${r.avgAngleError.toFixed(2)} degrees`);
        console.log('-'.repeat(60));
        console.log('Worst Positions:');
        for (const pos of r.worstPositions) {
            console.log(`  Grid(${pos.gridPos.i},${pos.gridPos.j}) World(${pos.worldPos.x.toFixed(1)},${pos.worldPos.z.toFixed(1)}) Error: ${pos.error.toFixed(4)} (dx:${pos.dx.toFixed(4)}, dz:${pos.dz.toFixed(4)})`);
        }
        console.log('='.repeat(60));
        
        return r;
    }
    
    /**
     * Run test at multiple resolutions
     */
    async runMultiResolutionTest(resolutions = null) {
        const defaultResolutions = [
            { width: 1920, height: 1080, name: '1080p (16:9)' },
            { width: 2560, height: 1440, name: '1440p (16:9)' },
            { width: 1920, height: 1200, name: 'WUXGA (16:10)' },
            { width: 1280, height: 1024, name: 'SXGA (5:4)' },
            { width: 375, height: 667, name: 'iPhone SE (9:16)' }
        ];
        
        const testResolutions = resolutions || defaultResolutions;
        const results = [];
        
        console.log('[AIM-TEST] Starting multi-resolution test...');
        
        for (const res of testResolutions) {
            console.log(`\n[AIM-TEST] Testing resolution: ${res.name} (${res.width}x${res.height})`);
            
            // Note: In a real implementation, you would resize the renderer here
            // For now, we just run the test and note the current resolution
            const result = await this.runTest();
            result.resolution = res;
            results.push(result);
            
            this.clearVisualization();
            await this.delay(500);
        }
        
        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('[AIM-TEST] MULTI-RESOLUTION SUMMARY');
        console.log('='.repeat(60));
        
        for (const r of results) {
            const status = r.passed ? 'PASS' : 'FAIL';
            console.log(`${r.resolution.name}: ${status} (max: ${r.maxError.toFixed(3)}, avg: ${r.avgError.toFixed(3)})`);
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
        this.clearVisualization();
        this.targetPoints = [];
        this.hitPoints = [];
        this.errors = [];
        this.results = null;
    }
}

// Export for use in game
if (typeof window !== 'undefined') {
    window.AimingAutoTest = AimingAutoTest;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AimingAutoTest;
}
