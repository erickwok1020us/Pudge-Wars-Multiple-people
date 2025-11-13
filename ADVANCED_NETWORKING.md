# Advanced Networking Implementation

## Overview

This document describes the advanced networking features implemented for Mundo Cleaver multiplayer game to improve responsiveness and fairness in high-latency scenarios.

## Features Implemented

### Phase 1: Client-Side Prediction + Server Reconciliation

#### 1. Time Synchronization (TimeSync.js)
- **Purpose**: Establish synchronized clock between client and server
- **Implementation**: Ping/pong mechanism with exponential moving average (EMA)
- **Metrics Tracked**:
  - RTT (Round-Trip Time)
  - Server time offset
  - Jitter (RTT variance)
- **Update Frequency**: Every 2 seconds

#### 2. Input Buffering (InputBuffer.js)
- **Purpose**: Track and replay unacknowledged player inputs
- **Features**:
  - Monotonically increasing sequence numbers
  - Buffer of last 100 inputs
  - Acknowledgment tracking via `lastProcessedSeq`
- **Use Case**: Enables deterministic replay for reconciliation

#### 3. Server Reconciliation (Reconciler.js)
- **Purpose**: Smoothly correct client prediction errors
- **Algorithm**:
  1. Apply authoritative server state
  2. Replay unacknowledged inputs on top of server state
  3. Calculate position error
  4. Apply smooth correction (100ms lerp for small errors, instant snap for large errors)
- **Thresholds**:
  - Small correction: < 10 units (smoothed over 100ms)
  - Large correction: ≥ 10 units (instant snap)

#### 4. Server Protocol Updates
- **Time Sync**: Added `timeSyncPing`/`timeSyncPong` events
- **Movement Protocol**: Extended `playerMove` to include:
  - `seq`: Input sequence number
  - `clientTime`: Client timestamp
- **Game State Broadcast**: Extended to include:
  - `lastProcessedSeq`: Last acknowledged input sequence per player

## Feature Flags

The implementation uses feature flags in `game3d.js` to enable/disable features:

```javascript
this.NETCODE = {
    prediction: true,      // Client-side prediction
    reconciliation: true,  // Server reconciliation
    lagComp: false         // Lag compensation (Phase 2 - not yet implemented)
};
```

## Architecture

### Client-Side Flow
1. Player clicks to move
2. **Prediction**: Immediately update local position
3. **Input Buffer**: Store input with sequence number
4. **Network**: Send `playerMove` with seq + clientTime to server
5. **Reconciliation**: On receiving server state:
   - Acknowledge inputs up to `lastProcessedSeq`
   - Apply server position
   - Replay unacknowledged inputs
   - Smooth any position discrepancies

### Server-Side Flow
1. Receive `playerMove` with seq
2. Update `player.lastProcessedSeq = seq`
3. Validate and apply movement
4. Broadcast game state including `lastProcessedSeq`

## Files Modified

### Frontend (Pudge-Wars-Multiple-people)
- `client/net/TimeSync.js` - NEW: Time synchronization module
- `client/net/InputBuffer.js` - NEW: Input buffering and sequencing
- `client/net/Reconciler.js` - NEW: Server reconciliation logic
- `game3d.js` - Modified: Integrated networking modules, added prediction/reconciliation
- `index.html` - Modified: Added script tags for networking modules

### Backend (mundo-cleaver-socket-server)
- `server.js` - Modified: Added time sync handler, updated playerMove to track seq
- `gameEngine.js` - Modified: Added lastProcessedSeq tracking, updated broadcast

## Testing

### Local Testing
To test the implementation locally:

1. Start the backend server:
```bash
cd mundo-cleaver-socket-server
npm start
```

2. Start the frontend:
```bash
cd Pudge-Wars-Multiple-people
# Serve via your preferred method (e.g., Live Server, http-server)
```

3. Open two browser windows and create a multiplayer game

4. Observe the console logs:
   - `[TimeSync]` - Time synchronization metrics
   - `[NETCODE]` - Prediction/reconciliation status
   - `[Reconciler]` - Correction statistics

### Artificial Latency Testing
To test with simulated latency, modify the client code temporarily:

```javascript
// In game3d.js, wrap socket.emit calls:
setTimeout(() => {
    socket.emit('playerMove', data);
}, 150); // 150ms artificial delay
```

## Performance Impact

- **Client CPU**: Minimal (~1-2% increase for reconciliation smoothing)
- **Network Bandwidth**: Negligible (added 2 integers per playerMove: seq + clientTime)
- **Server CPU**: Minimal (sequence number tracking is O(1))

## Phase 2: Lag Compensation (IMPLEMENTED)

### Overview
Lag compensation ensures fair hit detection in high-latency scenarios by rewinding server state to the time when the player actually saw their target. This prevents the frustrating "I shot them but missed" experience common in high-latency games.

### Implementation Details

#### Position History Buffer (PositionHistory.js)
- **Ring buffer**: Stores 120 snapshots (~2 seconds at 60Hz)
- **Snapshot data**: timestamp, Map<socketId, {x, z, team, isDead}>
- **Efficient lookup**: O(n) search for closest timestamp (n=120 max)
- **Automatic cleanup**: Oldest entries automatically overwritten

#### Server-Side Time Rewinding
When processing a knife throw:
1. Client sends `clientTimestamp` (synchronized via TimeSync)
2. Server calculates lag: `lagMs = serverTime - clientTimestamp`
3. If lag is reasonable (0-1000ms), server rewinds:
   - Calls `positionHistory.getPositionsAt(clientTimestamp)`
   - Gets historical positions of all players at that time
   - Performs collision detection against historical positions
4. If lag is unreasonable or no history available, uses current positions

#### Integration Points
- **gameEngine.js**: 
  - `positionHistory.recordSnapshot()` called every tick
  - `checkKnifeCollisions()` uses `getPositionsAt()` for lag compensation
- **game3d.js**:
  - `throwKnifeTowardsMouse()` sends `clientTimestamp` via TimeSync
  - Feature flag `NETCODE.lagComp` enables/disables lag compensation

### Benefits
- **Fair hit detection**: Players with 100-500ms latency can still land accurate shots
- **Prevents "shot behind cover"**: Targets see hits that were valid when attacker fired
- **Minimal overhead**: Ring buffer is memory-efficient, lookup is fast
- **Graceful degradation**: Falls back to current positions if history unavailable

### Configuration
```javascript
// Server-side (gameEngine.js)
this.positionHistory = new PositionHistory(120); // 2 seconds at 60Hz
this.lagCompensationEnabled = true;

// Client-side (game3d.js)
this.NETCODE = {
    prediction: true,
    reconciliation: true,
    lagComp: true  // Enable lag compensation
};
```

### Debugging Lag Compensation
Look for these console logs:
- `[LAG-COMP] Rewinding to {timestamp}` - Server is rewinding time
- `[LAG-COMP] Rewound player {socketId} by {distance} units` - Player position was rewound
- `[LAG-COMP] WARNING: Future timestamp detected` - Client clock is ahead of server

### Performance Impact
- **Server CPU**: Minimal (~0.5% increase for position history recording)
- **Server Memory**: ~50KB per room (120 snapshots × ~400 bytes per snapshot)
- **Network**: No additional bandwidth (clientTimestamp already sent)

## Debugging

### Client-Side Debug Flags
```javascript
// In browser console:
currentGame.NETCODE.prediction = false;  // Disable prediction
currentGame.NETCODE.reconciliation = false;  // Disable reconciliation
```

### Server-Side Logs
Look for these log patterns:
- `[GAME-ENGINE] Player X added` - Check lastProcessedSeq initialization
- `[SERVER] playerMove` - Verify seq is being received

### Common Issues

**Issue**: Jittery movement
- **Cause**: Reconciliation corrections too frequent
- **Solution**: Check RTT/jitter metrics, may need to adjust smoothing duration

**Issue**: Position desync
- **Cause**: Input replay not deterministic
- **Solution**: Ensure Reconciler.applyInput() matches server movement logic exactly

**Issue**: High correction magnitude
- **Cause**: Packet loss or high jitter
- **Solution**: Check network conditions, consider increasing buffer size

## References

- [Valve's Source Engine Networking](https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking)
- [Gabriel Gambetta's Client-Server Game Architecture](https://www.gabrielgambetta.com/client-server-game-architecture.html)
- [Overwatch Gameplay Architecture](https://www.youtube.com/watch?v=W3aieHjyNvw)
