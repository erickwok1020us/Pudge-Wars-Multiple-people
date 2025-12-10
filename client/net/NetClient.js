/**
 * NetClient.js
 * 
 * Unified networking client that wraps socket.io and provides a clean API
 * for the game layer. Handles time synchronization, input buffering,
 * reconciliation, and state management.
 * 
 * Architecture designed for future SDK integration:
 * - Event-driven pattern with clear callbacks
 * - Encapsulates all networking logic
 * - Game-agnostic core with game-specific extensions
 */

class NetClient {
    constructor(socket, options = {}) {
        this.socket = socket;
        this.options = {
            enablePrediction: true,
            enableReconciliation: true,
            enableInterpolation: true,
            interpolationDelay: 100, // ms
            maxInterpolationDelay: 200, // ms
            minInterpolationDelay: 50, // ms
            reconnectAttempts: 5,
            reconnectDelay: 1000, // ms
            heartbeatInterval: 5000, // ms
            heartbeatTimeout: 15000, // ms
            ...options
        };
        
        // Core networking modules
        this.timeSync = null;
        this.inputBuffer = null;
        this.reconciler = null;
        
        // State tracking
        this.connected = false;
        this.roomCode = null;
        this.playerId = null;
        this.team = null;
        this.gameMode = null;
        
        // Reconnection state
        this.reconnecting = false;
        this.reconnectAttempt = 0;
        this.lastHeartbeat = Date.now();
        this.heartbeatTimer = null;
        this.connectionLostTimer = null;
        
        // Delta compression state
        this.lastKnownState = {
            players: new Map(),
            knives: new Map()
        };
        
        // Event callbacks
        this.callbacks = {
            onStateUpdate: null,
            onMoveAck: null,
            onKnifeSpawn: null,
            onKnifeHit: null,
            onKnifeDestroy: null,
            onHealthUpdate: null,
            onGameOver: null,
            onDisconnect: null,
            onReconnect: null,
            onConnectionLost: null,
            onError: null
        };
        
        // Network statistics
        this.stats = {
            messagesSent: 0,
            messagesReceived: 0,
            bytesSent: 0,
            bytesReceived: 0,
            lastRTT: 0,
            avgRTT: 0,
            jitter: 0,
            packetLoss: 0,
            stateUpdatesReceived: 0,
            lastStateUpdateTime: 0
        };
        
        // Initialize modules if available
        this._initializeModules();
        this._setupSocketListeners();
    }
    
    /**
     * Initialize networking modules
     */
    _initializeModules() {
        if (typeof TimeSync !== 'undefined') {
            this.timeSync = new TimeSync(this.socket);
        }
        
        if (typeof InputBuffer !== 'undefined') {
            this.inputBuffer = new InputBuffer();
        }
        
        // Reconciler is initialized later when game reference is available
    }
    
    /**
     * Set game reference for reconciler
     * @param {Object} game - Game instance
     */
    setGame(game) {
        this.game = game;
        if (typeof Reconciler !== 'undefined' && this.options.enableReconciliation) {
            this.reconciler = new Reconciler(game);
        }
    }
    
    /**
     * Setup socket event listeners
     */
    _setupSocketListeners() {
        // Connection events
        this.socket.on('connect', () => {
            console.log('[NetClient] Connected to server');
            this.connected = true;
            this.reconnecting = false;
            this.reconnectAttempt = 0;
            this._startHeartbeat();
            
            if (this.callbacks.onReconnect && this.roomCode) {
                this.callbacks.onReconnect();
            }
        });
        
        this.socket.on('disconnect', (reason) => {
            console.log('[NetClient] Disconnected:', reason);
            this.connected = false;
            this._stopHeartbeat();
            
            if (this.callbacks.onDisconnect) {
                this.callbacks.onDisconnect(reason);
            }
            
            // Attempt reconnection for recoverable disconnects
            if (reason === 'io server disconnect' || reason === 'transport close') {
                this._attemptReconnect();
            }
        });
        
        this.socket.on('connect_error', (error) => {
            console.error('[NetClient] Connection error:', error);
            if (this.callbacks.onError) {
                this.callbacks.onError(error);
            }
        });
        
        // Game state updates
        this.socket.on('serverGameState', (data) => {
            this._handleStateUpdate(data);
        });
        
        // Movement acknowledgments
        this.socket.on('serverMoveAck', (data) => {
            this._handleMoveAck(data);
        });
        
        // Knife events
        this.socket.on('serverKnifeSpawn', (data) => {
            this.stats.messagesReceived++;
            if (this.callbacks.onKnifeSpawn) {
                this.callbacks.onKnifeSpawn(data);
            }
        });
        
        this.socket.on('serverKnifeHit', (data) => {
            this.stats.messagesReceived++;
            if (this.callbacks.onKnifeHit) {
                this.callbacks.onKnifeHit(data);
            }
        });
        
        this.socket.on('serverKnifeDestroy', (data) => {
            this.stats.messagesReceived++;
            if (this.callbacks.onKnifeDestroy) {
                this.callbacks.onKnifeDestroy(data);
            }
        });
        
        // Health updates
        this.socket.on('serverHealthUpdate', (data) => {
            this.stats.messagesReceived++;
            if (this.callbacks.onHealthUpdate) {
                this.callbacks.onHealthUpdate(data);
            }
        });
        
        // Game over
        this.socket.on('gameOver', (data) => {
            this.stats.messagesReceived++;
            if (this.callbacks.onGameOver) {
                this.callbacks.onGameOver(data);
            }
        });
        
        // Time sync
        this.socket.on('timeSyncPong', (data) => {
            if (this.timeSync) {
                this.timeSync.handlePong(data);
                this.stats.lastRTT = this.timeSync.getRTT();
                this.stats.jitter = this.timeSync.getJitter();
            }
        });
    }
    
    /**
     * Handle state update from server
     * @param {Object} data - State update data
     */
    _handleStateUpdate(data) {
        this.stats.messagesReceived++;
        this.stats.stateUpdatesReceived++;
        this.stats.lastStateUpdateTime = Date.now();
        
        // Update heartbeat tracking
        this.lastHeartbeat = Date.now();
        
        // Apply delta if this is a delta update
        if (data.delta && !data.full) {
            data = this._applyDeltaState(data);
        } else {
            // Full state - update our cache
            this._updateStateCache(data);
        }
        
        if (this.callbacks.onStateUpdate) {
            this.callbacks.onStateUpdate(data);
        }
    }
    
    /**
     * Handle movement acknowledgment from server
     * @param {Object} data - Move ack data
     */
    _handleMoveAck(data) {
        this.stats.messagesReceived++;
        
        // Acknowledge inputs up to this sequence
        if (this.inputBuffer && data.actionId) {
            this.inputBuffer.acknowledge(data.actionId);
        }
        
        // Perform reconciliation if enabled
        if (this.options.enableReconciliation && this.reconciler && this.inputBuffer) {
            const serverState = {
                x: data.x,
                z: data.z,
                targetX: data.targetX,
                targetZ: data.targetZ
            };
            const unackedInputs = this.inputBuffer.getUnacknowledgedInputs();
            this.reconciler.reconcile(serverState, unackedInputs);
        }
        
        if (this.callbacks.onMoveAck) {
            this.callbacks.onMoveAck(data);
        }
    }
    
    /**
     * Apply delta state to reconstruct full state
     * @param {Object} deltaData - Delta state data
     * @returns {Object} Full state data
     */
    _applyDeltaState(deltaData) {
        const fullState = {
            serverTick: deltaData.serverTick,
            serverTime: deltaData.serverTime,
            players: [],
            knives: []
        };
        
        // Apply player deltas
        if (deltaData.players) {
            for (const playerDelta of deltaData.players) {
                const cached = this.lastKnownState.players.get(playerDelta.playerId);
                const fullPlayer = cached ? { ...cached, ...playerDelta } : playerDelta;
                fullState.players.push(fullPlayer);
                this.lastKnownState.players.set(playerDelta.playerId, fullPlayer);
            }
        }
        
        // Apply knife deltas
        if (deltaData.knives) {
            for (const knifeDelta of deltaData.knives) {
                const cached = this.lastKnownState.knives.get(knifeDelta.knifeId);
                const fullKnife = cached ? { ...cached, ...knifeDelta } : knifeDelta;
                fullState.knives.push(fullKnife);
                this.lastKnownState.knives.set(knifeDelta.knifeId, fullKnife);
            }
        }
        
        // Handle removed entities
        if (deltaData.removedKnives) {
            for (const knifeId of deltaData.removedKnives) {
                this.lastKnownState.knives.delete(knifeId);
            }
        }
        
        return fullState;
    }
    
    /**
     * Update state cache with full state
     * @param {Object} data - Full state data
     */
    _updateStateCache(data) {
        if (data.players) {
            for (const player of data.players) {
                this.lastKnownState.players.set(player.playerId, player);
            }
        }
        
        if (data.knives) {
            this.lastKnownState.knives.clear();
            for (const knife of data.knives) {
                this.lastKnownState.knives.set(knife.knifeId, knife);
            }
        }
    }
    
    /**
     * Start heartbeat monitoring
     */
    _startHeartbeat() {
        this._stopHeartbeat();
        
        // Start time sync if available
        if (this.timeSync) {
            this.timeSync.start();
        }
        
        // Monitor for connection loss
        this.heartbeatTimer = setInterval(() => {
            const timeSinceLastUpdate = Date.now() - this.lastHeartbeat;
            
            if (timeSinceLastUpdate > this.options.heartbeatTimeout) {
                console.warn('[NetClient] Connection appears lost (no updates for', timeSinceLastUpdate, 'ms)');
                if (this.callbacks.onConnectionLost) {
                    this.callbacks.onConnectionLost(timeSinceLastUpdate);
                }
            }
        }, this.options.heartbeatInterval);
    }
    
    /**
     * Stop heartbeat monitoring
     */
    _stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        
        if (this.timeSync) {
            this.timeSync.stop();
        }
    }
    
    /**
     * Attempt to reconnect to server
     */
    _attemptReconnect() {
        if (this.reconnecting || this.reconnectAttempt >= this.options.reconnectAttempts) {
            return;
        }
        
        this.reconnecting = true;
        this.reconnectAttempt++;
        
        console.log(`[NetClient] Attempting reconnect (${this.reconnectAttempt}/${this.options.reconnectAttempts})`);
        
        setTimeout(() => {
            if (!this.connected) {
                this.socket.connect();
            }
        }, this.options.reconnectDelay * this.reconnectAttempt);
    }
    
    // ==================== Public API ====================
    
    /**
     * Register event callback
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     */
    on(event, callback) {
        const callbackName = 'on' + event.charAt(0).toUpperCase() + event.slice(1);
        if (this.callbacks.hasOwnProperty(callbackName)) {
            this.callbacks[callbackName] = callback;
        } else {
            console.warn('[NetClient] Unknown event:', event);
        }
    }
    
    /**
     * Send move command to server
     * @param {string} roomCode - Room code
     * @param {number} targetX - Target X position
     * @param {number} targetZ - Target Z position
     * @returns {number} Action ID
     */
    sendMove(roomCode, targetX, targetZ) {
        const actionId = this.inputBuffer ? this.inputBuffer.addInput({ targetX, targetZ }) : Date.now();
        
        const message = {
            roomCode,
            targetX,
            targetZ,
            actionId,
            seq: actionId,
            clientTime: Date.now()
        };
        
        this.socket.emit('playerMove', message);
        this.stats.messagesSent++;
        
        return actionId;
    }
    
    /**
     * Send knife throw command to server
     * @param {string} roomCode - Room code
     * @param {number} targetX - Target X position
     * @param {number} targetZ - Target Z position
     * @param {number} actionId - Action ID
     * @param {number} clientTimestamp - Client timestamp for lag compensation
     */
    sendKnifeThrow(roomCode, targetX, targetZ, actionId, clientTimestamp) {
        const message = {
            roomCode,
            targetX,
            targetZ,
            actionId,
            clientTimestamp,
            clientSendTime: Date.now()
        };
        
        this.socket.emit('knifeThrow', message);
        this.stats.messagesSent++;
    }
    
    /**
     * Request to rejoin a room after disconnect
     * @param {string} roomCode - Room code
     * @param {number} playerId - Player ID
     */
    rejoin(roomCode, playerId) {
        this.socket.emit('rejoinRoom', { roomCode, playerId });
        
        // Clear local state for fresh start
        if (this.inputBuffer) {
            this.inputBuffer.clear();
        }
        this.lastKnownState.players.clear();
        this.lastKnownState.knives.clear();
    }
    
    /**
     * Update reconciler smoothing (call every frame)
     */
    updateSmoothing() {
        if (this.reconciler) {
            this.reconciler.updateSmoothing();
        }
    }
    
    /**
     * Get current server time estimate
     * @returns {number} Estimated server time
     */
    getServerTime() {
        return this.timeSync ? this.timeSync.getServerTime() : Date.now();
    }
    
    /**
     * Get current RTT
     * @returns {number} Round-trip time in ms
     */
    getRTT() {
        return this.timeSync ? this.timeSync.getRTT() : 0;
    }
    
    /**
     * Get current jitter
     * @returns {number} Jitter in ms
     */
    getJitter() {
        return this.timeSync ? this.timeSync.getJitter() : 0;
    }
    
    /**
     * Get adaptive interpolation delay based on network conditions
     * @returns {number} Recommended interpolation delay in ms
     */
    getAdaptiveInterpolationDelay() {
        const rtt = this.getRTT();
        const jitter = this.getJitter();
        
        // Base delay on RTT/2 + 2*jitter + buffer
        let delay = (rtt / 2) + (jitter * 2) + 20;
        
        // Clamp to configured bounds
        delay = Math.max(this.options.minInterpolationDelay, delay);
        delay = Math.min(this.options.maxInterpolationDelay, delay);
        
        return delay;
    }
    
    /**
     * Get network statistics
     * @returns {Object} Network stats
     */
    getStats() {
        return {
            ...this.stats,
            connected: this.connected,
            reconnecting: this.reconnecting,
            inputBufferSize: this.inputBuffer ? this.inputBuffer.getUnackedCount() : 0,
            timeSyncStats: this.timeSync ? this.timeSync.getStats() : null,
            reconcilerStats: this.reconciler ? this.reconciler.getStats() : null
        };
    }
    
    /**
     * Cleanup and disconnect
     */
    destroy() {
        this._stopHeartbeat();
        if (this.timeSync) {
            this.timeSync.stop();
        }
        this.socket.disconnect();
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NetClient;
}
