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
  resources: number
  military: number
  influence: number
  nuclear: boolean
  threatMap: Record<string, number>
  alliances: string[]
  dependencies: Record<string, string[]>
  lastAction: GeoAction | null
  lastTarget: string | null
  reasoning: string
  systemPrompt: string
}

export type GeoAgentInit = Omit<GeoAgent, 'lastAction' | 'lastTarget' | 'reasoning'> & {
  lastAction?: GeoAction | null
  lastTarget?: string | null
  reasoning?: string
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
export const GEO_ELIM_RESOURCES = -50
export const THREAT_ESCALATION = 8
