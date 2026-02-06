# Shred Ninja

A realtime blockchain event game showcasing RISE's shred technology. Built to demonstrate the power of millisecond-level event streaming on RISE Testnet.

## What is this?

Shred Ninja is a Fruit Ninja-style game where you tap USDC transfer events (good) and avoid USDT transfer events (bad). Every token that appears on screen represents an actual blockchain transfer happening in realtime using RISE's shred-based event delivery.

**Key Feature:** Events arrive in ~3-5ms instead of waiting for block confirmations (12+ seconds on traditional chains).

## Why RISE Shreds?

RISE's **shred technology** streams transaction events as they're processed, enabling realtime blockchain applications.

This game demonstrates:
- **Millisecond latency**: Events appear almost instantly as transfers happen
- **No block waiting**: Zero delay from transaction execution to UI update
- **Progressive difficulty**: Spawn rate increases with score (every 3rd → 2nd → every event)

## Tech Stack

- **Next.js 16** with React 19
- **viem** for blockchain interaction
- **shreds** package for RISE shred subscriptions
- **framer-motion** for animations
- **Tailwind CSS** for styling

## Getting Started

```bash
# Install dependencies
bun install

# Run development server
bun dev
```

Open [http://localhost:3000](http://localhost:3000) to play.

## How It Works

### Shred Client Setup

```typescript
import { createPublicClient, webSocket } from 'viem'
import { riseTestnet } from 'viem/chains'
import { shredActions } from 'shreds/viem'

const client = createPublicClient({
  chain: riseTestnet,
  transport: webSocket('wss://testnet.riselabs.xyz/ws'),
}).extend(shredActions)
```

### Subscribe to Shreds

```typescript
client.watchShreds({
  includeStateChanges: false,
  onShred: (shred) => {
    shred.transactions.forEach((tx) => {
      // Filter for ERC20 Transfer events
      tx.logs
        .filter(log => log.topics[0] === TRANSFER_EVENT_SIGNATURE)
        .forEach(log => {
          // Process realtime transfer event
          spawnToken(log)
        })
    })
  },
})
```

### Progressive Difficulty

The game dynamically adjusts event frequency based on score:

```typescript
// 0-24 score: Every 3rd event
if (score < 25 && eventCounter % 3 !== 0) return

// 25-49 score: Every 2nd event
if (score < 50 && eventCounter % 2 !== 0) return

// 50+ score: Every single event (no filter)
```

## Key Files

- `src/app/page.tsx` - Main game logic (shred subscription, game state, UI)
- No separate components - everything in one file for simplicity

## Shreds Package

This project uses the `shreds` npm package for RISE integration:

```bash
bun add shreds
```

The package provides `shredActions` to extend viem clients with shred-specific functionality.

## Game Mechanics

- **Tap USDC (C)**: +1 point
- **Tap USDT (T)**: Game over
- **Miss 10 USDC events**: Game over
- **Difficulty scales**: More events spawn as score increases

## Learn More

- [RISE Documentation](https://docs.riselabs.xyz)
- [Shreds Package](https://github.com/risechain/shred-api)
- [viem Documentation](https://viem.sh)

## License

MIT
