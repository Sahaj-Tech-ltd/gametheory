# Technical Architecture

Deep dive into how the Wargames simulation engine works — game state management, parallel agent execution, LLM integration, event cascading, and React state management.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                     React UI (App.tsx)                │
│  ┌──────────┐  ┌──────────┐  ┌─────────────────────┐ │
│  │ Menu     │  │ Game     │  │ Agent Cards,        │ │
│  │ Screen   │  │ Screen   │  │ Scoreboard, Log,    │ │
│  │          │  │          │  │ Reasoning Panel      │ │
│  └──────────┘  └──────────┘  └─────────────────────┘ │
├──────────────────────────────────────────────────────┤
│                   Game Engine Layer                   │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ gameEngine   │  │ milGameEngine│  │ geoGame    │ │
│  │ (PD)         │  │ (Military)   │  │ Engine     │ │
│  └──────────────┘  └──────────────┘  └────────────┘ │
├──────────────────────────────────────────────────────┤
│                    LLM Integration                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ llm.ts   │  │ milLlm   │  │ geoLlm.ts        │   │
│  │ (PD)     │  │ (Military)│  │ (Geopolitical)   │   │
│  └──────────┘  └──────────┘  └──────────────────┘   │
├──────────────────────────────────────────────────────┤
│                    Agent Definitions                  │
│  ┌────────┐ ┌─────────┐ ┌────────┐ ┌────────────┐  │
│  │agents  │ │milAgents│ │geoAgents│ │ww1/ww2/me  │  │
│  │(PD)    │ │(Military)│ │(Geo)   │ │(Scenarios) │  │
│  └────────┘ └─────────┘ └────────┘ └────────────┘  │
├──────────────────────────────────────────────────────┤
│                    Type Definitions                   │
│  ┌────────┐ ┌─────────┐ ┌────────┐                  │
│  │agents  │ │milTypes │ │geoTypes│                    │
│  └────────┘ └─────────┘ └────────┘                  │
└──────────────────────────────────────────────────────┘
```

---

## Game Engine

### Immutable State

Game state is **immutable**. Each round produces a brand new state object — the previous state is never mutated.

```typescript
// Every round returns a NEW state object
export const runGeoRound = async (
  state: GeoGameState,
  onUpdate: (s: GeoGameState) => void,
): Promise<GeoGameState> => {
  let current = { ...state, agents: state.agents.map(a => ({ ...a })) }
  // ... mutations happen on 'current', not 'state'
  return next  // new object
}
```

**Why immutable?**

1. **React reconciliation**: React can detect state changes via reference equality — no deep comparison needed
2. **Async safety**: No stale closures when agents make parallel async decisions
3. **Debuggability**: You can inspect any historical state for replay/analysis
4. **Predictability**: No hidden mutations causing hard-to-trace bugs

### Round Execution Flow

Each round follows this sequence:

```
1. Process Events
   ├── Check for scripted events matching current round
   ├── Roll for random events (probability scales with instability)
   ├── Cascade follow-up events from active events
   └── Expire events whose duration has elapsed

2. Agent Decisions (parallel)
   └── Promise.all(activeAgents.map(agent => getDecision(agent, state)))

3. Resolve Actions
   ├── Apply ACTION_EFFECTS for each agent's chosen action
   ├── Calculate resource, military, influence, threat deltas
   ├── Handle special cases (cyber-attack success/failure, nuclear retaliation)
   └── Generate log entries

4. Apply State Updates
   ├── Apply accumulated deltas to each agent
   ├── Clamp values (threat 0-10, stability 0-100)
   ├── Check stability thresholds (crisis/prosperity)
   ├── Check eliminations (resources <= -50)
   └── Check win conditions

5. Return New State
```

### Parallel Agent Execution

All agents make decisions **simultaneously** each round:

```typescript
const rawDecisions = await Promise.all(
  active.map(async agent => ({
    agentId: agent.id,
    decision: await getGeoAgentDecision(agent, current),
  }))
)
```

This is critical for game theory accuracy. In a simultaneous-move game, no agent should know what others are doing in the current round. `Promise.all()` ensures all LLM calls are made before any results are processed.

---

## LLM Integration

### Prompt Structure

Each agent's LLM call combines three pieces:

```
┌─────────────────────────────────────────┐
│ System Prompt                           │
│                                         │
│ "You are the leadership of [Nation]"    │
│                                         │
│ Personality: [Strategic doctrine]        │
│                                         │
│ [Alliance/dependency context]           │
│                                         │
│ [GAME RULES block]                      │
│ - Game theory framework                 │
│ - Dynamic assets                        │
│ - Threat assessment system              │
│ - Nuclear deterrence                    │
│ - Alliance system                       │
│ - Dependency chains                     │
│ - Response format                       │
│                                         │
│ + Game state context (per-round)        │
│ - Current round number                  │
│ - Your resources/military/influence     │
│ - Your threat map                       │
│ - Recent action history                 │
│ - Active events                         │
│ - Stability level                       │
└─────────────────────────────────────────┘
```

### Response Parsing

LLM responses are parsed with regex for structured output:

```typescript
// Expected format:
// ACTION: strike
// TARGET: Iran
// REASONING: Their nuclear program threatens our existence.

const actionMatch = text.match(/ACTION:\s*(.+)/)
const targetMatch = text.match(/TARGET:\s*(.+)/)
const reasoningMatch = text.match(/REASONING:\s*(.+)/)
```

### Fallback Defaults

If parsing fails (LLM didn't follow format), the system falls back to safe defaults:

| Game Mode | Default Action | Default Target |
|:----------|:--------------|:--------------|
| Prisoner's Dilemma | Cooperate | N/A |
| WarGames | stand-down | N/A |
| Geopolitical | diplomacy | none |

This ensures the simulation always progresses, even when the LLM produces unexpected output.

---

## Agent Definition Pattern

### Separation of Concerns

Agents are defined in separate files from game engines and LLM integration:

```
agents.ts         → Agent definitions (personality, prompts)
gameEngine.ts     → Game logic (scoring, round resolution)
llm.ts            → LLM integration (API calls, parsing)
```

### Agent Definition Example

```typescript
// geoAgents.ts
export const geoAgents: GeoAgentInit[] = [
  {
    id: 'usa',
    name: 'United States',
    color: '#3B82F6',
    region: 'North America',
    personality: 'Hegemonic Defender',
    resources: 95,
    military: 95,
    influence: 95,
    nuclear: true,
    threatMap: { russia: 7, china: 6, iran: 5, /* ... */ },
    alliances: ['israel', 'ukraine', 'taiwan', 'saudi', 'india'],
    dependencies: {
      chips: ['taiwan'],
      oil: ['saudi'],
      rare_earths: ['china'],
    },
    systemPrompt: makePrompt('the United States', personality, context),
  },
  // ... more agents
]
```

### Shared Rule Set

All agents in a game mode share the same rules block (game theory framework, threat assessment, etc.). Individual personality is injected via `makePrompt()`:

```typescript
const makePrompt = (name: string, personality: string, context: string) =>
  `You are the leadership of ${name}...\n\nPersonality: ${personality}\n\n${context}\n\n${RULES}`
```

This ensures consistent game mechanics while allowing unique agent behavior.

---

## Event Cascade System

### WorldEvent Structure

```typescript
interface WorldEvent {
  id: string
  name: string
  type: EventType           // pandemic, supply-crisis, trade-war, etc.
  description: string
  targetRegions?: string[]  // Which regions are affected
  targetNations?: string[]  // Which nations are affected
  resourceImpact: number    // Delta to resources
  stabilityImpact: number   // Delta to global stability
  militaryImpact: number    // Delta to military strength
  influenceImpact: number   // Delta to diplomatic influence
  triggerRound?: number     // When this event fires
  cascadeChance: number     // Probability of triggering follow-ups (0-1)
  followUpEvents?: string[] // IDs of events that can cascade from this
  duration?: number         // Rounds this event persists
}
```

### Event Processing Pipeline

```
processEvents(state):
  1. Scripted events:
     - Filter events where triggerRound == current round
     - Apply each event's impacts to targeted nations
     - Add to completedEvents

  2. Random events:
     - Probability = (100 - stability) / 100 * 0.15
     - Pick random event from RANDOM_EVENTS pool
     - Apply impacts

  3. Cascade events:
     - For each active event, roll cascadeChance * stabilityFactor
     - If triggered, find first untriggered follow-up event
     - Apply and log as "⚡ CASCADE → [event name]"

  4. Expire events:
     - Decrement duration on all active events
     - Remove events where duration <= 0
```

### Cascade Probability

The cascade probability is modified by global stability:

```typescript
const stabFactor = (100 - current.stability) / 100
const cascadeCandidates = current.activeEvents.filter(
  e => Math.random() < e.cascadeChance * stabFactor
)
```

At stability 100, cascades are suppressed (stabFactor = 0). At stability 0, cascades fire at full probability (stabFactor = 1). This creates a positive feedback loop — instability breeds more instability.

---

## State Management in React

### useRef for Game State

Game state is stored in a `useRef` rather than `useState` to avoid stale closures in async loops:

```typescript
// useRef avoids stale closure issues
const gameStateRef = useRef<GeoGameState>(initialState)

// When the game engine produces a new state:
const newState = await runGeoRound(gameStateRef.current, (s) => {
  gameStateRef.current = s
  setDisplayState({ ...s })  // trigger re-render
})
gameStateRef.current = newState
```

**Why useRef?**

The game engine is async — it makes multiple LLM calls per round. If state were in `useState`, each async callback would capture a stale snapshot of state from when it was created. `useRef` provides a mutable reference that always points to the latest state.

### Display State Pattern

A separate `useState` holds a copy of the game state for rendering:

```typescript
const [displayState, setDisplayState] = useState<GeoGameState>(initialState)
```

The game engine calls `onUpdate(next)` whenever state changes, which updates both the ref (for game logic) and the display state (for rendering).

### Animation via CSS Keyframes

Animations are implemented with CSS `@keyframes` injected via `<style>` tags rather than JavaScript animation libraries. This keeps the animation layer decoupled from the React component tree and avoids unnecessary re-renders.

---

## Action Resolution

### ACTION_EFFECTS Table

Each action has predefined effects on the acting agent, target, and observers:

```typescript
const ACTION_EFFECTS: Record<GeoAction, { ... }> = {
  'diplomacy':      { selfInf: +2, stabDelta: +1, threatToSelf: -1 },
  'sanction':       { targetRes: -3, selfInf: -1, stabDelta: -1, threatFromTarget: +2 },
  'military-posture': { targetMil: -2, stabDelta: -1, threatToObservers: +1, threatFromTarget: +2 },
  'cyber-attack':   { stabDelta: -1, threatToObservers: +2 },  // + special 60% success logic
  'proxy-war':      { selfRes: -3, targetRes: -4, targetMil: -2, stabDelta: -2, threatToObservers: +2 },
  'strike':         { selfRes: -3, targetRes: -5, targetMil: -8, stabDelta: -3, threatToObservers: +4, threatFromTarget: +3 },
  'deploy':         { selfRes: -2, selfInf: +1, stabDelta: 0, threatToObservers: +1 },
  'trade-deal':     { selfRes: +3, targetRes: +3, stabDelta: +1, threatToSelf: -1, threatFromTarget: -1 },
  'aid':            { selfRes: -2, targetRes: +4, selfInf: +2, stabDelta: +1, threatToSelf: -2 },
  'propaganda':     { selfInf: +2, targetInf: -1, stabDelta: 0, threatFromTarget: +1 },
}
```

### Special Resolution Logic

**Cyber-attacks** have probabilistic outcomes:
- 60% success: steal 2 resources from target
- 40% traced: threat +3 with the target (they know it was you)

**Strikes against nuclear powers** risk retaliation:
- 15% chance of nuclear retaliation: both nations lose 40 resources and 40 military, stability drops 20

This creates genuine risk in aggressive actions — attacking a nuclear power has a small but catastrophic risk of triggering MAD.

---

## TypeScript Configuration

### Strict Mode

```json
{
  "strict": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "noFallthroughCasesInSwitch": true,
  "verbatimModuleSyntax": true,
  "erasableSyntaxOnly": true
}
```

- `verbatimModuleSyntax`: Forces `import type` for type-only imports
- `erasableSyntaxOnly`: No `enum` — use string literal unions instead

### String Literal Unions Instead of Enums

```typescript
// Instead of enum:
export type GeoAction =
  | 'diplomacy' | 'sanction' | 'military-posture'
  | 'cyber-attack' | 'proxy-war' | 'strike'
  | 'deploy' | 'trade-deal' | 'aid' | 'propaganda'
```

This is enforced by `erasableSyntaxOnly` and provides better type inference with `Record<GeoAction, ...>`.
