'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPublicClient, webSocket } from 'viem'
import { riseTestnet } from 'viem/chains'
import { shredActions } from 'shreds/viem'

const TOKEN_ADDRESSES = {
  USDC: '0x8a93d247134d91e0de6f96547cb0204e5be8e5d8',
  USDT: '0x40918ba7f132e0acba2ce4de4c4baf9bd2d7d849',
} as const

// ERC20 Transfer event signature
const TRANSFER_SIG = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const MAX_MISSES = 10
const TOKEN_LIFETIME = 5000 // Token animation duration
const MISS_TIMEOUT = 4500 // When to count a miss (before animation ends)
let eventCounter = 0
const processedTokens = new Set<string>() // Prevent duplicate events

type GameStatus = 'idle' | 'playing' | 'gameOver'
type TokenType = 'USDC' | 'USDT'

// Audio utilities
const audioCtx = typeof window !== 'undefined' ? new AudioContext() : null

const playTone = (frequency: number, duration: number, volume = 0.3) => {
  if (!audioCtx) return
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.connect(gain)
  gain.connect(audioCtx.destination)
  osc.frequency.value = frequency
  gain.gain.value = volume
  osc.start()
  osc.stop(audioCtx.currentTime + duration)
}

const sounds = {
  tap: () => {
    playTone(523, 0.08, 0.25) // C5
    setTimeout(() => playTone(659, 0.12, 0.2), 80) // E5
  },
  miss: () => playTone(220, 0.15),
  gameOver: () => {
    playTone(440, 0.2, 0.4)
    setTimeout(() => playTone(330, 0.2, 0.4), 100)
    setTimeout(() => playTone(220, 0.4, 0.4), 200)
  },
}

interface Token {
  id: string
  type: TokenType
  startX: number
  startY: number
  endX: number
  endY: number
  timerId?: number
}

const client = createPublicClient({
  chain: riseTestnet,
  transport: webSocket('wss://testnet.riselabs.xyz/ws'),
}).extend(shredActions)

export default function Home() {
  const [status, setStatus] = useState<GameStatus>('idle')
  const [score, setScore] = useState(0)
  const [misses, setMisses] = useState(0)
  const [tokens, setTokens] = useState<Token[]>([])
  const missedTokens = useRef(new Set<string>()) // Track which tokens already counted as missed
  const scoreRef = useRef(0) // Ref to access current score in event subscription closure
  const bgMusicRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      bgMusicRef.current = new Audio('/jpbg.mp3')
      bgMusicRef.current.loop = true
      bgMusicRef.current.volume = 0.2
    }
    return () => {
      bgMusicRef.current?.pause()
    }
  }, [])

  const generatePosition = () => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    return {
      startX: 100 + Math.random() * (vw - 200),
      startY: -150,
      endX: 100 + Math.random() * (vw - 200),
      endY: vh + 150,
    }
  }

  useEffect(() => {
    if (status !== 'playing') return

    console.log('[SUBSCRIBE] Starting shred subscription...')
    const unwatch = client.watchShreds({
      includeStateChanges: false,
      onShred: (shred) => {
        console.log("shred received")
        shred.transactions.forEach((tx) => {
          const filteredLogs = tx.logs.filter(
            (log) =>
              log.topics[0] === TRANSFER_SIG &&
              Object.values(TOKEN_ADDRESSES).some(
                (addr) => addr.toLowerCase() === log.address.toLowerCase()
              )
          )

          filteredLogs.forEach((log) => {
              const tokenType = Object.entries(TOKEN_ADDRESSES).find(
                ([, addr]) => addr.toLowerCase() === log.address.toLowerCase()
              )?.[0] as TokenType

              if (!tokenType) return

              console.log(`[${tokenType}] Detected transfer in tx ${tx.hash}`)

              const tokenId = `${tx.hash}-${log.topics[0]}`

              // Skip duplicate events
              if (processedTokens.has(tokenId)) return
              processedTokens.add(tokenId)

              // Progressive difficulty: spawn frequency increases with score
              // 0-24: every 3rd event | 25-49: every 2nd event | 50+: every event
              eventCounter++
              if (scoreRef.current < 25) {
                if (eventCounter % 3 !== 0) return
              } else if (scoreRef.current < 50) {
                if (eventCounter % 2 !== 0) return
              }

              const position = generatePosition()

              // Set timer to count miss if token not tapped (only for USDC, avoid double counting)
              const timerId = window.setTimeout(() => {
                if (tokenType === 'USDC' && !missedTokens.current.has(tokenId)) {
                  missedTokens.current.add(tokenId)
                  sounds.miss()
                  setMisses((m) => {
                    const newMisses = m + 1
                    if (newMisses >= MAX_MISSES) {
                      setStatus('gameOver')
                      sounds.gameOver()
                    }
                    return newMisses
                  })
                }
              }, MISS_TIMEOUT)

              const newToken: Token = {
                id: tokenId,
                type: tokenType,
                timerId,
                ...position,
              }

              setTokens((prev) => [...prev, newToken])
            })
        })
      },
      onError: (error) => console.error('Shred error:', error),
    })

    return () => unwatch()
  }, [status])

  const handleTap = (tokenId: string, tokenType: TokenType) => {
    // Clear miss timer and remove token from state
    setTokens((prev) => {
      const token = prev.find(t => t.id === tokenId)
      if (token?.timerId) clearTimeout(token.timerId)
      return prev.filter((t) => t.id !== tokenId)
    })

    // USDT tap = game over, USDC tap = score++
    if (tokenType === 'USDT') {
      sounds.gameOver()
      setStatus('gameOver')
    } else {
      sounds.tap()
      setScore((s) => {
        scoreRef.current = s + 1
        return s + 1
      })
    }
  }

  const startGame = () => {
    audioCtx?.resume() // Resume AudioContext on user interaction
    bgMusicRef.current?.play().catch(e => console.error('BGM error:', e))
    setStatus('playing')
    setScore(0)
    setMisses(0)
    setTokens([])
    scoreRef.current = 0
    missedTokens.current.clear()
  }

  const resetGame = () => {
    setStatus('idle')
    setScore(0)
    setMisses(0)
    setTokens([])
    scoreRef.current = 0
    missedTokens.current.clear()
  }

  return (
    <div className="relative min-h-screen bg-linear-to-br from-black via-gray-900 to-black overflow-hidden">
      {/* Score Bar */}
      {status === 'playing' && (
        <>
          <div className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-sm border-b border-white/10 select-none">
            <div className="container mx-auto px-6 py-4 flex justify-between items-center">
              <div className="text-white">
                <span className="text-sm opacity-60">Score</span>
                <div className="text-3xl font-bold">{score}</div>
              </div>
              <div className="text-white text-right">
                <span className="text-sm opacity-60">Misses</span>
                <div className="text-3xl font-bold">
                  <span className={misses >= MAX_MISSES - 2 ? 'text-red-500' : ''}>
                    {misses}
                  </span>
                  <span className="opacity-40">/{MAX_MISSES}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="fixed bottom-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-sm border-t border-white/10 select-none">
            <div className="container mx-auto px-6 py-3 text-center">
              <p className="text-white/70 text-sm">
                Powered by RISE Shreds - 3ms blockchain confirmations
              </p>
            </div>
          </div>
        </>
      )}

      {/* Waiting Message */}
      {status === 'playing' && tokens.length === 0 && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none select-none">
          <div className="text-center">
            <div className="text-white/40 text-lg mb-2">Waiting for transfer events...</div>
            <div className="text-white/20 text-sm">Listening to RISE Testnet</div>
          </div>
        </div>
      )}

      {/* Flying Tokens */}
      <div className="absolute inset-0 pointer-events-none">
        <AnimatePresence>
          {tokens.map((token) => {
            const isGood = token.type === 'USDC'
            const color = isGood ? '#00D4AA' : '#FF4444'

            return (
              <motion.div
                key={token.id}
                initial={{ x: token.startX, y: token.startY, scale: 0, opacity: 0 }}
                animate={{ x: token.endX, y: token.endY, scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{
                  duration: TOKEN_LIFETIME / 1000,
                  ease: 'easeInOut',
                  scale: { duration: 0.2 },
                  opacity: { duration: 0.2 },
                }}
                onClick={() => handleTap(token.id, token.type)}
                className="absolute cursor-pointer pointer-events-auto"
                style={{ width: '120px', height: '120px' }}
              >
                <motion.div
                  animate={{
                    scale: [1, 1.1, 1],
                    boxShadow: [
                      `0 0 20px ${color}`,
                      `0 0 40px ${color}`,
                      `0 0 20px ${color}`,
                    ],
                  }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
                  className="w-full h-full rounded-full flex items-center justify-center text-3xl font-bold text-white select-none"
                  style={{ backgroundColor: color, border: `3px solid ${color}` }}
                >
                  {token.type === 'USDC' ? 'C' : 'T'}
                </motion.div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* Start Screen */}
      {status === 'idle' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center select-none">
          <div className="text-center px-8 max-w-3xl">
            <h1 className="text-6xl font-bold text-white mb-4">Shred Ninja</h1>
            <p className="text-xl text-white/80 mb-4">
              Tap the incoming events at lightspeed!
            </p>

            <div className="my-8 p-8 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10">
              <p className="text-white/70 text-base leading-relaxed mb-6">
                Realtime USDC and USDT transfer events streaming from RISE Testnet using shred technology.
                Each token represents an actual blockchain transfer happening in just 3 milliseconds -
                no waiting for block confirmations.
              </p>

              <div className="flex justify-center gap-12 text-base">
                <div className="text-center">
                  <div className="w-20 h-20 mx-auto mb-2 bg-green-500/20 rounded-full flex items-center justify-center border-3 border-green-500">
                    <span className="text-3xl text-green-500 font-bold">C</span>
                  </div>
                  <p className="text-green-500 font-semibold text-lg">Tap USDC</p>
                  <p className="text-white/50 text-sm">Score +1</p>
                </div>

                <div className="text-center">
                  <div className="w-20 h-20 mx-auto mb-2 bg-red-500/20 rounded-full flex items-center justify-center border-3 border-red-500">
                    <span className="text-3xl text-red-500 font-bold">T</span>
                  </div>
                  <p className="text-red-500 font-semibold text-lg">Avoid USDT</p>
                  <p className="text-white/50 text-sm">Game Over</p>
                </div>
              </div>
            </div>

            <button
              onClick={startGame}
              className="px-12 py-5 bg-white text-black font-bold text-xl rounded-xl hover:bg-white/90 transition-colors"
            >
              Tap to Start
            </button>

            <p className="text-white/50 text-base mt-6">
              Miss 10 events and the game ends
            </p>
          </div>
        </div>
      )}

      {/* Game Over Screen */}
      {status === 'gameOver' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/90 backdrop-blur-sm select-none">
          <div className="text-center px-8">
            <h2 className="text-5xl font-bold text-white mb-6">Game Over</h2>

            <div className="my-8 p-10 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10">
              <p className="text-white/60 text-lg mb-3">Final Score</p>
              <p className="text-6xl font-bold text-white">{score}</p>
            </div>

            <button
              onClick={resetGame}
              className="px-12 py-5 bg-white text-black font-bold text-xl rounded-xl hover:bg-white/90 transition-colors"
            >
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
