/**
 * Reconciler.js
 * 
 * Handles server reconciliation for client-side prediction.
 * Applies authoritative server state and replays unacknowledged inputs.
 * Smoothly corrects position discrepancies.
 */

class Reconciler {
    constructor(game) {
        this.game = game;
        
        this.smoothingEnabled = true;
        this.smoothingDuration = 100; // ms to smooth corrections
        this.maxCorrectionPerSecond = 50; // Max units to correct per second
        
        this.correctionInProgress = false;
        this.correctionStartTime = 0;
        this.correctionStartPos = { x: 0, z: 0 };
        this.correctionTargetPos = { x: 0, z: 0 };
        
        this.totalCorrections = 0;
        this.totalCorrectionMagnitude = 0;
        this.maxCorrectionMagnitude = 0;
        this.lastCorrectionTime = 0;
    }
    
    /**
     * Reconcile client state with authoritative server state
     * @param {Object} serverState - Authoritative state from server
     * @param {Array} unackedInputs - Unacknowledged inputs to replay
     */
    reconcile(serverState, unackedInputs) {
        if (!this.game.playerSelf) {
            return;
        }
        
        const player = this.game.playerSelf;
        
        const predictedX = player.x;
        const predictedZ = player.z;
        
        player.x = serverState.x;
        player.z = serverState.z;
        
        if (serverState.health !== undefined) {
            player.health = serverState.health;
        }
        
        if (serverState.isDead !== undefined) {
            player.isDead = serverState.isDead;
        }
        
        for (const inputItem of unackedInputs) {
            this.applyInput(player, inputItem.input);
        }
        
        const errorX = player.x - predictedX;
        const errorZ = player.z - predictedZ;
        const errorMagnitude = Math.sqrt(errorX * errorX + errorZ * errorZ);
        
        if (errorMagnitude > 0.1) {
            this.totalCorrections++;
            this.totalCorrectionMagnitude += errorMagnitude;
            this.maxCorrectionMagnitude = Math.max(this.maxCorrectionMagnitude, errorMagnitude);
            this.lastCorrectionTime = Date.now();
            
            if (errorMagnitude > 2.0) {
                console.log(`[Reconciler] Large correction: ${errorMagnitude.toFixed(2)} units`);
            }
            
            if (this.smoothingEnabled && errorMagnitude < 10) {
                this.correctionInProgress = true;
                this.correctionStartTime = Date.now();
                this.correctionStartPos = { x: predictedX, z: predictedZ };
                this.correctionTargetPos = { x: player.x, z: player.z };
                
                player.x = predictedX;
                player.z = predictedZ;
            } else {
                this.correctionInProgress = false;
            }
        }
    }
    
    /**
     * Apply a single input to player state (deterministic)
     * @param {Object} player - Player object
     * @param {Object} input - Input data { targetX, targetZ }
     */
    applyInput(player, input) {
        if (!input) {
            return;
        }
        
        if (input.targetX !== undefined && input.targetZ !== undefined) {
            player.targetX = input.targetX;
            player.targetZ = input.targetZ;
            player.isMoving = true;
            
            const dx = input.targetX - player.x;
            const dz = input.targetZ - player.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            if (distance > 0.1) {
                const moveSpeed = this.game.PLAYER_SPEED || 23.4;
                const dt = 1 / 60; // Assume 60 FPS
                const maxMove = moveSpeed * dt;
                
                if (distance <= maxMove) {
                    player.x = input.targetX;
                    player.z = input.targetZ;
                    player.isMoving = false;
                } else {
                    const ratio = maxMove / distance;
                    player.x += dx * ratio;
                    player.z += dz * ratio;
                }
            }
        }
    }
    
    /**
     * Update smoothing interpolation (call every frame)
     */
    updateSmoothing() {
        if (!this.correctionInProgress || !this.game.playerSelf) {
            return;
        }
        
        const player = this.game.playerSelf;
        const now = Date.now();
        const elapsed = now - this.correctionStartTime;
        
        if (elapsed >= this.smoothingDuration) {
            player.x = this.correctionTargetPos.x;
            player.z = this.correctionTargetPos.z;
            this.correctionInProgress = false;
        } else {
            const t = elapsed / this.smoothingDuration;
            const smoothT = this.easeOutCubic(t);
            
            player.x = this.lerp(this.correctionStartPos.x, this.correctionTargetPos.x, smoothT);
            player.z = this.lerp(this.correctionStartPos.z, this.correctionTargetPos.z, smoothT);
        }
    }
    
    /**
     * Linear interpolation
     */
    lerp(a, b, t) {
        return a + (b - a) * t;
    }
    
    /**
     * Ease out cubic for smooth deceleration
     */
    easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }
    
    /**
     * Get stats for debugging
     */
    getStats() {
        const avgCorrection = this.totalCorrections > 0 
            ? this.totalCorrectionMagnitude / this.totalCorrections 
            : 0;
        
        return {
            totalCorrections: this.totalCorrections,
            avgCorrectionMagnitude: avgCorrection,
            maxCorrectionMagnitude: this.maxCorrectionMagnitude,
            lastCorrectionTime: this.lastCorrectionTime,
            correctionInProgress: this.correctionInProgress
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Reconciler;
}
