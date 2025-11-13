/**
 * InputBuffer.js
 * 
 * Manages client input sequencing and buffering for client-side prediction.
 * Stores unacknowledged inputs and provides replay functionality.
 */

class InputBuffer {
    constructor() {
        this.nextSeq = 1;
        this.buffer = []; // Array of { seq, input, timestamp }
        this.lastProcessedSeq = 0;
        
        this.totalInputs = 0;
        this.totalAcked = 0;
    }
    
    /**
     * Add a new input to the buffer
     * @param {Object} input - The input data (e.g., { targetX, targetZ })
     * @returns {number} The sequence number assigned to this input
     */
    addInput(input) {
        const seq = this.nextSeq++;
        const timestamp = Date.now();
        
        this.buffer.push({
            seq,
            input: { ...input }, // Clone the input
            timestamp
        });
        
        this.totalInputs++;
        
        if (this.buffer.length > 100) {
            this.buffer.shift();
        }
        
        return seq;
    }
    
    /**
     * Acknowledge inputs up to a given sequence number
     * @param {number} lastProcessedSeq - Last sequence number processed by server
     */
    acknowledge(lastProcessedSeq) {
        if (lastProcessedSeq <= this.lastProcessedSeq) {
            return; // Already acknowledged
        }
        
        const before = this.buffer.length;
        
        this.buffer = this.buffer.filter(item => item.seq > lastProcessedSeq);
        
        const removed = before - this.buffer.length;
        this.totalAcked += removed;
        this.lastProcessedSeq = lastProcessedSeq;
    }
    
    /**
     * Get all unacknowledged inputs
     * @returns {Array} Array of { seq, input, timestamp }
     */
    getUnacknowledgedInputs() {
        return this.buffer.slice(); // Return a copy
    }
    
    /**
     * Get the number of unacknowledged inputs
     * @returns {number}
     */
    getUnackedCount() {
        return this.buffer.length;
    }
    
    /**
     * Get the last processed sequence number
     * @returns {number}
     */
    getLastProcessedSeq() {
        return this.lastProcessedSeq;
    }
    
    /**
     * Clear all buffered inputs
     */
    clear() {
        this.buffer = [];
    }
    
    /**
     * Get stats for debugging
     */
    getStats() {
        return {
            unackedCount: this.buffer.length,
            lastProcessedSeq: this.lastProcessedSeq,
            totalInputs: this.totalInputs,
            totalAcked: this.totalAcked,
            oldestUnacked: this.buffer.length > 0 ? this.buffer[0].seq : null
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = InputBuffer;
}
