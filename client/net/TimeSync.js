/**
 * TimeSync.js
 * 
 * Manages time synchronization between client and server using ping/pong mechanism.
 * Computes server time offset and RTT using exponential moving average (EMA).
 */

class TimeSync {
    constructor(socket) {
        this.socket = socket;
        this.offset = 0; // Server time - client time (ms)
        this.rtt = 0; // Round-trip time (ms)
        this.jitter = 0; // RTT variance (ms)
        
        this.OFFSET_ALPHA = 0.1;
        this.RTT_ALPHA = 0.2;
        this.JITTER_ALPHA = 0.1;
        
        this.pingInterval = null;
        this.pendingPings = new Map(); // seq -> { clientSendTime }
        this.nextPingSeq = 1;
        
        this.syncCount = 0;
        this.lastSyncTime = 0;
        
        this.setupListeners();
    }
    
    setupListeners() {
        this.socket.on('timeSyncPong', (data) => {
            this.handlePong(data);
        });
    }
    
    /**
     * Start sending periodic pings to server
     */
    start() {
        if (this.pingInterval) {
            return;
        }
        
        console.log('[TimeSync] Starting time synchronization');
        
        this.sendPing();
        
        this.pingInterval = setInterval(() => {
            this.sendPing();
        }, 2000);
    }
    
    /**
     * Stop time synchronization
     */
    stop() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
            console.log('[TimeSync] Stopped time synchronization');
        }
    }
    
    /**
     * Send a ping to the server
     */
    sendPing() {
        const seq = this.nextPingSeq++;
        const clientSendTime = Date.now();
        
        this.pendingPings.set(seq, { clientSendTime });
        
        this.socket.emit('timeSyncPing', {
            seq,
            clientSendTime
        });
        
        const cutoff = clientSendTime - 5000;
        for (const [oldSeq, data] of this.pendingPings.entries()) {
            if (data.clientSendTime < cutoff) {
                this.pendingPings.delete(oldSeq);
            }
        }
    }
    
    /**
     * Handle pong response from server
     */
    handlePong(data) {
        const { seq, serverTime } = data;
        const clientReceiveTime = Date.now();
        
        const pending = this.pendingPings.get(seq);
        if (!pending) {
            return; // Stale or duplicate pong
        }
        
        this.pendingPings.delete(seq);
        
        const { clientSendTime } = pending;
        
        const measuredRTT = clientReceiveTime - clientSendTime;
        
        const estimatedServerTimeNow = serverTime + (measuredRTT / 2);
        const measuredOffset = estimatedServerTimeNow - clientReceiveTime;
        
        if (this.syncCount === 0) {
            this.rtt = measuredRTT;
            this.offset = measuredOffset;
        } else {
            const rttDelta = Math.abs(measuredRTT - this.rtt);
            this.jitter = this.JITTER_ALPHA * rttDelta + (1 - this.JITTER_ALPHA) * this.jitter;
            
            this.rtt = this.RTT_ALPHA * measuredRTT + (1 - this.RTT_ALPHA) * this.rtt;
            
            this.offset = this.OFFSET_ALPHA * measuredOffset + (1 - this.OFFSET_ALPHA) * this.offset;
        }
        
        this.syncCount++;
        this.lastSyncTime = clientReceiveTime;
        
        if (this.syncCount <= 5 || this.syncCount % 10 === 0) {
            console.log(`[TimeSync] RTT: ${this.rtt.toFixed(1)}ms, Offset: ${this.offset.toFixed(1)}ms, Jitter: ${this.jitter.toFixed(1)}ms`);
        }
    }
    
    /**
     * Get current server time estimate
     */
    getServerTime() {
        return Date.now() + this.offset;
    }
    
    /**
     * Get current RTT
     */
    getRTT() {
        return this.rtt;
    }
    
    /**
     * Get current jitter
     */
    getJitter() {
        return this.jitter;
    }
    
    /**
     * Get sync stats for debugging
     */
    getStats() {
        return {
            offset: this.offset,
            rtt: this.rtt,
            jitter: this.jitter,
            syncCount: this.syncCount,
            lastSyncTime: this.lastSyncTime
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TimeSync;
}
