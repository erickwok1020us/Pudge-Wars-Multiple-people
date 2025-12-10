/**
 * NetProtocol.js
 * 
 * Defines the network protocol schema and encoding/decoding functions.
 * This module provides a central place for all message types and their structures,
 * making it easy to switch between JSON and binary encoding in the future.
 * 
 * Architecture designed for future SDK integration:
 * - All message types defined in one place
 * - Encode/decode functions abstracted for easy protocol changes
 * - Delta compression support built-in
 */

const NetProtocol = {
    // Protocol version for compatibility checking
    VERSION: '1.0.0',
    
    // Message types (client -> server)
    CLIENT_MSG: {
        MOVE: 'playerMove',
        KNIFE_THROW: 'knifeThrow',
        COLLISION_REPORT: 'collisionReport',
        TIME_SYNC_PING: 'timeSyncPing',
        REJOIN: 'rejoinRoom',
        READY: 'playerReady',
        LOADED: 'playerLoaded'
    },
    
    // Message types (server -> client)
    SERVER_MSG: {
        GAME_STATE: 'serverGameState',
        MOVE_ACK: 'serverMoveAck',
        KNIFE_SPAWN: 'serverKnifeSpawn',
        KNIFE_HIT: 'serverKnifeHit',
        KNIFE_DESTROY: 'serverKnifeDestroy',
        HEALTH_UPDATE: 'serverHealthUpdate',
        TIME_SYNC_PONG: 'timeSyncPong',
        ROOM_STATE: 'roomState',
        GAME_OVER: 'gameOver',
        OPPONENT_MOVE: 'opponentMove'
    },
    
    /**
     * Create a move command message
     * @param {number} targetX - Target X position
     * @param {number} targetZ - Target Z position
     * @param {number} actionId - Unique action identifier
     * @param {number} seq - Sequence number for input buffer
     * @param {number} clientTime - Client timestamp
     */
    createMoveCommand(targetX, targetZ, actionId, seq, clientTime) {
        return {
            targetX: this.quantizePosition(targetX),
            targetZ: this.quantizePosition(targetZ),
            actionId,
            seq,
            clientTime
        };
    },
    
    /**
     * Create a knife throw command message
     * @param {number} targetX - Target X position
     * @param {number} targetZ - Target Z position
     * @param {number} actionId - Unique action identifier
     * @param {number} clientTimestamp - Client timestamp for lag compensation
     */
    createKnifeThrowCommand(targetX, targetZ, actionId, clientTimestamp) {
        return {
            targetX: this.quantizePosition(targetX),
            targetZ: this.quantizePosition(targetZ),
            actionId,
            clientTimestamp,
            clientSendTime: Date.now()
        };
    },
    
    /**
     * Quantize position to reduce precision (saves bandwidth)
     * Positions are quantized to 2 decimal places
     * @param {number} value - Position value
     * @returns {number} Quantized value
     */
    quantizePosition(value) {
        return Math.round(value * 100) / 100;
    },
    
    /**
     * Quantize velocity to reduce precision
     * @param {number} value - Velocity value
     * @returns {number} Quantized value
     */
    quantizeVelocity(value) {
        return Math.round(value * 1000) / 1000;
    },
    
    /**
     * Calculate delta between two player states
     * @param {Object} current - Current player state
     * @param {Object} previous - Previous player state
     * @returns {Object|null} Delta object or null if no changes
     */
    calculatePlayerDelta(current, previous) {
        if (!previous) {
            return { ...current, full: true };
        }
        
        const delta = { playerId: current.playerId };
        let hasChanges = false;
        
        // Position changes (with threshold to avoid micro-updates)
        const posThreshold = 0.01;
        if (Math.abs(current.x - previous.x) > posThreshold) {
            delta.x = this.quantizePosition(current.x);
            hasChanges = true;
        }
        if (Math.abs(current.z - previous.z) > posThreshold) {
            delta.z = this.quantizePosition(current.z);
            hasChanges = true;
        }
        
        // Health changes
        if (current.health !== previous.health) {
            delta.health = current.health;
            hasChanges = true;
        }
        
        // Death state changes
        if (current.isDead !== previous.isDead) {
            delta.isDead = current.isDead;
            hasChanges = true;
        }
        
        // Movement state changes
        if (current.isMoving !== previous.isMoving) {
            delta.isMoving = current.isMoving;
            hasChanges = true;
        }
        
        return hasChanges ? delta : null;
    },
    
    /**
     * Calculate delta between two knife states
     * @param {Object} current - Current knife state
     * @param {Object} previous - Previous knife state
     * @returns {Object|null} Delta object or null if no changes
     */
    calculateKnifeDelta(current, previous) {
        if (!previous) {
            return { ...current, full: true };
        }
        
        const delta = { knifeId: current.knifeId };
        let hasChanges = false;
        
        const posThreshold = 0.1;
        if (Math.abs(current.x - previous.x) > posThreshold) {
            delta.x = this.quantizePosition(current.x);
            hasChanges = true;
        }
        if (Math.abs(current.z - previous.z) > posThreshold) {
            delta.z = this.quantizePosition(current.z);
            hasChanges = true;
        }
        
        return hasChanges ? delta : null;
    },
    
    /**
     * Apply delta to reconstruct full state
     * @param {Object} delta - Delta object
     * @param {Object} previous - Previous state
     * @returns {Object} Reconstructed full state
     */
    applyDelta(delta, previous) {
        if (delta.full || !previous) {
            return { ...delta };
        }
        
        return {
            ...previous,
            ...delta
        };
    },
    
    /**
     * Encode message for transmission (JSON for now, can switch to binary later)
     * @param {Object} message - Message object
     * @returns {string|ArrayBuffer} Encoded message
     */
    encode(message) {
        // For now, use JSON. Can switch to MessagePack later.
        return message;
    },
    
    /**
     * Decode received message
     * @param {string|ArrayBuffer} data - Encoded message
     * @returns {Object} Decoded message object
     */
    decode(data) {
        // For now, assume JSON. Can switch to MessagePack later.
        return data;
    },
    
    /**
     * Validate move command from client
     * @param {Object} data - Move command data
     * @returns {boolean} Whether the command is valid
     */
    validateMoveCommand(data) {
        if (typeof data.targetX !== 'number' || typeof data.targetZ !== 'number') {
            return false;
        }
        if (isNaN(data.targetX) || isNaN(data.targetZ)) {
            return false;
        }
        // Basic bounds check
        if (Math.abs(data.targetX) > 200 || Math.abs(data.targetZ) > 200) {
            return false;
        }
        return true;
    },
    
    /**
     * Validate knife throw command from client
     * @param {Object} data - Knife throw command data
     * @returns {boolean} Whether the command is valid
     */
    validateKnifeThrowCommand(data) {
        if (typeof data.targetX !== 'number' || typeof data.targetZ !== 'number') {
            return false;
        }
        if (isNaN(data.targetX) || isNaN(data.targetZ)) {
            return false;
        }
        return true;
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NetProtocol;
}
