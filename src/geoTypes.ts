export type Commodity =
  | 'oil'         // crude + refined petroleum
  | 'gas'         // natural gas
  | 'water'       // freshwater (renewable per round)
  | 'food'        // staple agricultural output
  | 'rareEarth'   // industrial metals, lithium, titanium, etc.
  | 'capital'     // financial reserves, sovereign wealth
  | 'science'     // research output, advanced manufacturing (chips, biotech)
  | 'manpower'    // skilled + unskilled labor pool

export const ALL_COMMODITIES: Commodity[] = [
  'oil', 'gas', 'water', 'food', 'rareEarth', 'capital', 'science', 'manpower',
]

export type ResourceVector = Record<Commodity, number>

export interface ResourceFlow {
  // Per-round inflow. Stockpile grows by this each tick.
  production: ResourceVector
  // Per-round outflow needed for the country to function.
  consumption: ResourceVector
  // Current accumulated total. After tick: stockpile += production - consumption.
  stockpile: ResourceVector
}

export const zeroVector = (): ResourceVector => ({
  oil: 0, gas: 0, water: 0, food: 0,
  rareEarth: 0, capital: 0, science: 0, manpower: 0,
})

// Weighted sum used as the legacy `resources` scalar and for elimination check.
// Weights reflect strategic value — capital and science weighted higher because
// they are harder to replace via trade than bulk commodities.
export const COMMODITY_WEIGHT: ResourceVector = {
  oil: 1.0, gas: 1.0, water: 0.8, food: 1.0,
  rareEarth: 1.2, capital: 1.5, science: 1.5, manpower: 0.8,
}

export const stockpileScore = (s: ResourceVector): number =>
  ALL_COMMODITIES.reduce((sum, c) => sum + s[c] * COMMODITY_WEIGHT[c], 0)

export const shortagesOf = (s: ResourceVector): Commodity[] =>
  ALL_COMMODITIES.filter(c => s[c] < 0)

export type GeoAction =
  | 'diplomacy'
  | 'sanction'
  | 'military-posture'
  | 'cyber-attack'
  | 'proxy-war'
  | 'strike'
  | 'deploy'
  | 'trade-deal'
  | 'aid'
  | 'propaganda'

export interface GeoAgent {
  id: string
  name: string
  color: string
  region: string
  personality: string
  // Derived weighted total of stockpile. Kept as a scalar so existing
  // event/action systems and the UI continue to work unchanged. Recomputed
  // every round from `flow.stockpile`.
  resources: number
  military: number
  influence: number
  nuclear: boolean
  threatMap: Record<string, number>
  alliances: string[]
  // String tags ("chips", "oil") preserved for narrative context in prompts.
  // The mechanical resource model lives in `flow` below.
  dependencies: Record<string, string[]>
  // IRL-grounded per-commodity resource model. See wiki/Research.md.
  flow: ResourceFlow
  // Commodities currently in deficit (stockpile < 0) — surfaced to the LLM
  // so countries feel scarcity and seek trade.
  shortages: Commodity[]
  lastAction: GeoAction | null
  lastTarget: string | null
  reasoning: string
  systemPrompt: string
}

export type GeoAgentInit = Omit<GeoAgent, 'lastAction' | 'lastTarget' | 'reasoning' | 'resources' | 'shortages' | 'flow'> & {
  lastAction?: GeoAction | null
  lastTarget?: string | null
  reasoning?: string
  // Optional in init — `initGeoGameState` populates from RESOURCE_PROFILES.
  resources?: number
  shortages?: Commodity[]
  flow?: ResourceFlow
}

export type EventType =
  | 'pandemic'
  | 'supply-crisis'
  | 'trade-war'
  | 'cyber-incident'
  | 'natural-disaster'
  | 'revolution'
  | 'assassination'
  | 'election'
  | 'treaty'
  | 'embargo'

export interface WorldEvent {
  id: string
  name: string
  type: EventType
  description: string
  targetRegions?: string[]
  targetNations?: string[]
  resourceImpact: number
  stabilityImpact: number
  militaryImpact: number
  influenceImpact: number
  triggerRound?: number
  cascadeChance: number
  followUpEvents?: string[]
  duration?: number
}

export interface GeoLogEntry {
  round: number
  agentId: string | '_event_'
  action: GeoAction | 'event'
  targetId: string | null
  outcome: string
  stabilityDelta: number
}

import type { CouncilSession } from './council.ts'
import type { NegotiationRecord } from './negotiation.ts'

export interface GeoGameState {
  agents: GeoAgent[]
  eliminated: string[]
  stability: number
  round: number
  maxRounds: number
  winner: GeoAgent | null
  log: GeoLogEntry[]
  activeEvents: WorldEvent[]
  completedEvents: string[]
  scenario: ScenarioId
  // Latest council session per agent id, keyed by agent.id. Populated each round.
  councilSessions?: Record<string, CouncilSession>
  // Latest negotiation phase outcome (proposals / replies / accepted deals).
  lastNegotiation?: NegotiationRecord
}

export type ScenarioId =
  | 'free-play'
  | 'covid-cascade'
  | 'china-taiwan'
  | 'water-wars'
  | 'oil-wars'
  | 'middle-east-escalation'
  | 'ww1'
  | 'ww2'

export interface ScenarioConfig {
  id: ScenarioId
  name: string
  description: string
  maxRounds: number
  stabilityStart: number
  scriptedEvents: WorldEvent[]
  agentOverrides?: Partial<Record<string, Partial<GeoAgent>>>
}

export const GEO_MAX_ROUNDS = 100
export const GEO_STABILITY_START = 75
// Elimination threshold: a nation collapses when its weighted stockpile score drops
// below this. Initial values range ~80 (Pakistan) to ~360 (USA), so 25 represents
// near-total economic collapse.
export const GEO_ELIM_RESOURCES = 25
export const THREAT_ESCALATION = 8
