# Contributing

How to set up the development environment, follow code conventions, and contribute new agents, scenarios, and game modes to Wargames.

---

## Development Setup

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm 9+
- An OpenAI-compatible API key (or Gemini API key)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/gametheory.git
cd gametheory/wargames

# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit .env with your API keys
```

### Environment Variables

```bash
VITE_OPENAI_API_KEY=your-key    # Required for agent reasoning
VITE_GEMINI_API_KEY=your-key    # Optional alternate LLM
```

### Development Commands

```bash
npm run dev        # Start dev server with hot module replacement
npm run build      # Type-check (tsc -b) + production build (vite build)
npm run lint       # ESLint
npm run preview    # Preview production build
```

### Type-Checking

```bash
npx tsc --noEmit   # Type-check without emitting files
```

The build command runs `tsc -b && vite build`, so `npm run build` also type-checks.

---

## Code Style

### TypeScript

- **Strict mode** is enabled — no implicit any, no unused variables
- **`import type`** for type-only imports (required by `verbatimModuleSyntax`)
- **No `enum`** — use string literal unions instead (required by `erasableSyntaxOnly`)
- **2-space indent**, single quotes, trailing commas

### Naming Conventions

| Element | Convention | Example |
|:--------|:----------|:--------|
| Files | camelCase | `geoGameEngine.ts`, `milTypes.ts` |
| Types/Interfaces | PascalCase | `GeoAgent`, `MilGameState` |
| Constants | UPPER_SNAKE_CASE | `THREAT_LOCK`, `MAX_ROUNDS` |
| Functions/variables | camelCase | `runGeoRound`, `getAgentDecision` |
| React components | PascalCase | `MenuScreen`, `GameScreen` |
| Agent IDs | kebab-case | `'usa'`, `'china-taiwan'` |

### Imports

```typescript
// Type-only imports use 'import type'
import type { GeoAgent, GeoGameState } from './geoTypes.ts'

// Non-React files use .ts extension
import { GEO_ELIM_RESOURCES } from './geoTypes.ts'

// React files imported without extension
import { GameScreen } from './App'
```

### File Organization

```
src/
├── [gameMode]Agents.ts    # Agent definitions
├── [gameMode]GameEngine.ts # Game logic
├── [gameMode]Llm.ts       # LLM integration
├── [gameMode]Types.ts     # Type definitions
├── App.tsx                 # All UI
└── main.tsx               # Entry point
```

Each game mode follows this 4-file pattern. Types go in `*Types.ts`, agent personalities in `*Agents.ts`, game mechanics in `*GameEngine.ts`, and LLM API calls in `*Llm.ts`.

### Styling

- Tailwind for layout/spacing only (`flex`, `grid`, `px-*`, `rounded-*`)
- No Tailwind color utilities — theme colors defined as constants in `App.tsx`
- Inline `style={{}}` objects for colors and custom styling
- CSS variables in `index.css` for global theme tokens
- Dark theme by default

---

## Adding New Agents

### Step 1: Define the Agent Object

Add a new entry to the appropriate agents file (e.g., `geoAgents.ts`, `meAgents.ts`):

```typescript
{
  id: 'brazil',                          // Unique kebab-case ID
  name: 'Brazil',                        // Display name
  color: '#22C55E',                      // UI color (hex)
  region: 'South America',              // Geographic region
  personality: 'Emerging Regional Power', // Strategy archetype
  resources: 60,                         // Economic strength (0-100)
  military: 50,                          // Military strength (0-100)
  influence: 45,                         // Diplomatic weight (0-100)
  nuclear: false,                        // Nuclear capability
  threatMap: {                           // Initial threat perceptions
    usa: 3,
    china: 2,
    russia: 1,
    // ... threats toward all other agents
  },
  alliances: ['argentina', 'usa'],       // Allied agent IDs
  dependencies: {                        // Supply chain dependencies
    technology: ['usa', 'china'],
    energy: ['saudi'],
  },
  systemPrompt: makePrompt(
    'Brazil',
    'You are an emerging regional power...',
    'Allies: Argentina, USA. Rivals: Venezuela...'
  ),
}
```

### Step 2: Write the System Prompt

The system prompt has three parts:

1. **Personality** — 2-4 sentences defining the nation's strategic doctrine and worldview
2. **Context** — Alliance network, rivalries, dependencies
3. **Rules** — Shared game rules block (already defined as `RULES` constant)

```typescript
systemPrompt: makePrompt(
  'Brazil',                                            // Nation name
  'You are an emerging regional power...',              // Personality
  'Allies: USA. Rivals: Venezuela. Dependencies: ...'   // Context
)
```

**Tips for good prompts:**

- Be specific about strategy (not "play well" but "use Pavlov strategy")
- Name specific allies, enemies, and dependencies
- Include emotional/visceral language for authenticity
- Reference real-world grievances, ambitions, and fears
- Specify which game theory strategy the nation follows

### Step 3: Update Threat Maps

Every existing agent needs a threat entry for your new agent:

```typescript
// In existing agents' threatMap:
brazil: 2,  // Existing agent's perception of Brazil
```

### Step 4: Test

Run the simulation and observe:

1. Does the agent's behavior match its personality?
2. Do alliances form and break as expected?
3. Does the agent use its dependencies strategically?
4. Are threat perceptions updating correctly?

---

## Adding New Scenarios

### Step 1: Define the Scenario ID

Add to the `ScenarioId` type in `geoTypes.ts`:

```typescript
export type ScenarioId =
  | 'free-play'
  | 'covid-cascade'
  // ... existing scenarios
  | 'arctic-competition'  // New scenario
```

### Step 2: Define Scripted Events

Create event arrays in `geoGameEngine.ts`:

```typescript
const ARCTIC_EVENTS: WorldEvent[] = [
  {
    id: 'arctic-ice-melt',
    name: 'Arctic Ice Cap Collapse',
    type: 'natural-disaster',
    description: 'Arctic ice reaches record low. New shipping routes open...',
    targetRegions: ['Arctic'],
    targetNations: ['russia', 'usa', 'china'],
    resourceImpact: -3,
    stabilityImpact: -4,
    militaryImpact: 2,
    influenceImpact: 0,
    triggerRound: 3,
    cascadeChance: 0.8,
    followUpEvents: ['arctic-resource-rush'],
  },
  // ... more events
]
```

### Event Design Tips

- **Start small, cascade big**: Early events should have moderate impacts. Let the cascade system amplify them.
- **Use real history**: Model events after real geopolitical crises. Research the actual timeline.
- **Target specific nations**: Events that target specific nations create asymmetric effects that drive interesting gameplay.
- **Duration for lasting effects**: Use `duration` for events that should persist (blockades, treaties, pandemics).
- **Cascade chance scales impact**: High cascade chance (0.9+) means near-certain chain reactions. Low (0.3) means optional follow-ups.

### Step 3: Register the Scenario

Add to the `SCENARIOS` record in `geoGameEngine.ts`:

```typescript
export const SCENARIOS: Record<ScenarioId, ScenarioConfig> = {
  // ... existing scenarios
  'arctic-competition': {
    id: 'arctic-competition',
    name: 'Arctic Competition',
    description: 'Melting ice opens new frontiers...',
    maxRounds: 80,
    stabilityStart: 65,
    scriptedEvents: ARCTIC_EVENTS,
    agentOverrides: {
      russia: { resources: 70 },  // Optional: adjust agent stats
    },
  },
}
```

### Step 4: Create Scenario-Specific Agents (Optional)

If the scenario needs agents not in the core set, create a new agents file:

```typescript
// arcticAgents.ts
import type { GeoAgentInit } from './geoTypes.ts'

const RULES = `...`  // Era-specific or scenario-specific rules

export const arcticAgents: GeoAgentInit[] = [
  // ... agents specific to this scenario
]
```

See `ww1Agents.ts` and `ww2Agents.ts` for examples of scenario-specific agent files with era-adapted rules.

---

## Adding New Game Modes

A full game mode requires four files following the established pattern:

### 1. Type Definitions (`[mode]Types.ts`)

```typescript
export type MyAction = 'cooperate' | 'defect' | 'negotiate'

export interface MyAgent {
  id: string
  name: string
  // ... agent properties
}

export interface MyGameState {
  agents: MyAgent[]
  round: number
  // ... game state properties
}

export const MY_CONSTANTS = { ... }
```

### 2. Agent Definitions (`[mode]Agents.ts`)

```typescript
import type { MyAgent } from './myTypes.ts'

const RULES = `
GAME RULES:
...
`.trim()

const makePrompt = (name: string, personality: string, context: string) =>
  `You are ${name}...\n\nPersonality: ${personality}\n\n${context}\n\n${RULES}`

export const myAgents: MyAgent[] = [
  {
    id: 'agent-1',
    name: 'Agent One',
    // ... properties
    systemPrompt: makePrompt('Agent One', 'Aggressive', 'Context...'),
  },
]
```

### 3. Game Engine (`[mode]GameEngine.ts`)

```typescript
import type { MyGameState, MyAction } from './myTypes.ts'
import { getMyAgentDecision } from './myLlm.ts'

const ACTION_EFFECTS: Record<MyAction, { ... }> = { ... }

export const initMyGameState = (agents: MyAgent[]): MyGameState => { ... }

export const runMyRound = async (
  state: MyGameState,
  onUpdate: (s: MyGameState) => void,
): Promise<MyGameState> => {
  // 1. Copy state immutably
  let current = { ...state, agents: state.agents.map(a => ({ ...a })) }

  // 2. Get all agent decisions in parallel
  const decisions = await Promise.all(
    activeAgents.map(agent => getMyAgentDecision(agent, current))
  )

  // 3. Resolve actions and calculate deltas
  // 4. Apply deltas to agents
  // 5. Check win/elimination conditions
  // 6. Return new state

  onUpdate(next)
  return next
}
```

### 4. LLM Integration (`[mode]Llm.ts`)

```typescript
import type { MyAgent, MyGameState } from './myTypes.ts'

export const getMyAgentDecision = async (
  agent: MyAgent,
  state: MyGameState,
): Promise<{ action: string; target: string | null; reasoning: string }> => {
  // 1. Build prompt with current game state
  // 2. Call LLM API
  // 3. Parse response with regex
  // 4. Return parsed decision or fallback default
}
```

### 5. UI Integration

Add the new game mode to the menu in `App.tsx` and create a game screen component that:

- Initializes game state with `initMyGameState()`
- Runs rounds with `runMyRound()` on user action or auto-play
- Displays agent cards, scores, and action log
- Uses `useRef` for game state to avoid stale closures

---

## Pull Request Process

1. **Fork and branch**: Create a feature branch from `main`
2. **Type-check**: Run `npm run build` to ensure TypeScript compiles
3. **Lint**: Run `npm run lint` and fix any issues
4. **Test manually**: Run `npm run dev` and test your changes in the browser
5. **Document**: Update the wiki if adding new concepts, agents, or scenarios
6. **PR description**: Include what you changed, why, and how to test it
