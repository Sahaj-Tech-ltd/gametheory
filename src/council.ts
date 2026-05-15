// Multi-agent council for each nation. See wiki/Research.md.
//
// Per round, four role sub-agents (Strategist, Economist, Intel, Diplomat) run
// in parallel on a narrow context slice. The Leader synthesizes their briefs
// (and the negotiation log produced by the Diplomats) into the final action.
//
// This is the CAMEL role-specialization pattern + AutoGen async fan-out +
// AutoGen mixed model tiering (Flash for sub-agents, the main model for Leader).

import type { GeoAgent, GeoAction, GeoGameState, Commodity } from './geoTypes.ts'
import { ALL_COMMODITIES, THREAT_ESCALATION } from './geoTypes.ts'
import { llmCall } from './llmProvider.ts'
import type { ModelId } from './llmProvider.ts'

// Sub-agents use the fast, cheap model. The Leader uses the balanced model.
// This is the AutoGen pattern of "right model for the right job."
const SUB_AGENT_MODEL: ModelId = 'glm-4.7-flashx'
const LEADER_MODEL: ModelId = 'glm-4.6'

export type CouncilRole = 'strategist' | 'economist' | 'intel' | 'diplomat'

export interface StrategistBrief {
  role: 'strategist'
  longTermGoal: string
  priority: string
  recommendation: GeoAction
  recommendedTarget: string | null
  reasoning: string
}

export interface EconomistBrief {
  role: 'economist'
  criticalShortages: Commodity[]
  surplusCommodities: Commodity[]
  tradePartnerSuggestion: string | null
  recommendation: GeoAction
  reasoning: string
}

export interface IntelBrief {
  role: 'intel'
  topThreat: string | null
  vulnerabilities: string[]
  recommendation: GeoAction
  recommendedTarget: string | null
  reasoning: string
}

export interface DiplomatProposal {
  from: string
  to: string
  offer: Commodity
  ask: Commodity
  qty: number
  reasoning: string
}

export interface DiplomatReply {
  proposalFrom: string  // id of the country whose proposal we're replying to
  decision: 'accept' | 'reject' | 'counter'
  counterOffer?: Commodity
  counterAsk?: Commodity
  counterQty?: number
  reasoning: string
}

export interface LeaderDecision {
  action: GeoAction
  targetId: string | null
  reasoning: string
}

export interface CouncilSession {
  agentId: string
  round: number
  briefs: {
    strategist: StrategistBrief
    economist: EconomistBrief
    intel: IntelBrief
  }
  proposalsMade: DiplomatProposal[]
  proposalsReceived: DiplomatProposal[]
  repliesGiven: DiplomatReply[]
  repliesReceived: DiplomatReply[]
  decision: LeaderDecision
}

// All valid GeoAction values, used by the parsers.
const VALID_ACTIONS: GeoAction[] = [
  'diplomacy', 'sanction', 'military-posture', 'cyber-attack', 'proxy-war',
  'strike', 'deploy', 'trade-deal', 'aid', 'propaganda',
]

const parseAction = (text: string, key = 'RECOMMEND'): GeoAction => {
  const m = text.match(new RegExp(`${key}:\\s*([\\w-]+)`, 'i'))
  const raw = (m?.[1] ?? '').toLowerCase()
  return (VALID_ACTIONS.find(a => a === raw) ?? 'diplomacy')
}

const parseField = (text: string, key: string): string => {
  const m = text.match(new RegExp(`${key}:\\s*(.+)`, 'i'))
  return m?.[1]?.trim().split('\n')[0] ?? ''
}

const parseTarget = (text: string, agentIds: string[], key = 'TARGET'): string | null => {
  const raw = parseField(text, key).toLowerCase()
  if (!raw || raw === 'none' || raw === 'n/a') return null
  return agentIds.find(id => id.toLowerCase() === raw) ?? null
}

const parseCommodity = (text: string, key: string): Commodity | null => {
  const raw = parseField(text, key).toLowerCase().replace(/\s+/g, '')
  // Normalise common variants — "rare earth" / "rare-earth" / "rareearth" all map to rareEarth.
  if (raw === 'rare' || raw === 'rareearth' || raw === 'rare-earth') return 'rareEarth'
  return (ALL_COMMODITIES.find(c => c.toLowerCase() === raw) ?? null)
}

const parseCommodities = (text: string, key: string): Commodity[] => {
  const raw = parseField(text, key).toLowerCase()
  return ALL_COMMODITIES.filter(c => raw.includes(c.toLowerCase()))
}

const formatVector = (label: string, vec: Record<Commodity, number>): string =>
  `${label}: ` + ALL_COMMODITIES.map(c => `${c}=${vec[c].toFixed(0)}`).join(', ')

// ---------------------------------------------------------------------------
// Strategist — long-term goals, sees stability + own status + active events.
// ---------------------------------------------------------------------------

const STRATEGIST_RULES = `
You are the STRATEGIST on this nation's council. You think in 5–10 year horizons.
Your job is to identify the most important strategic objective for THIS round
given the broader trajectory of the game.

Consider:
- What is our nation's defining long-term goal? (hegemony, survival, regional dominance, etc.)
- What single threat or opportunity matters most right now?
- What action best advances the long-term goal — even if costly short-term?

Available actions:
diplomacy, sanction, military-posture, cyber-attack, proxy-war, strike, deploy, trade-deal, aid, propaganda

RESPONSE FORMAT (no extra text):
GOAL: <one phrase, our long-term strategic objective>
PRIORITY: <single sentence, the dominant concern this round>
RECOMMEND: <action>
TARGET: <nation id from the list, or 'none'>
REASONING: <one sentence, why this action serves the long-term goal>
`.trim()

const runStrategist = async (agent: GeoAgent, state: GeoGameState): Promise<StrategistBrief> => {
  const others = state.agents.filter(a => a.id !== agent.id && !state.eliminated.includes(a.id))
  const activeIds = others.map(a => a.id)
  const events = state.activeEvents.length > 0
    ? state.activeEvents.map(e => `- ${e.name} (${e.type})`).join('\n')
    : '- (none)'

  const userPrompt = `
=== ROUND ${state.round}/${state.maxRounds} | GLOBAL STABILITY ${state.stability}/100 ===

YOU ARE: ${agent.name}
PERSONALITY: ${agent.personality}
NUCLEAR: ${agent.nuclear ? 'YES' : 'No'}

ACTIVE WORLD EVENTS:
${events}

OTHER NATIONS:
${others.map(o => `- ${o.id}: ${o.name} (econ ${o.resources.toFixed(0)}, military ${o.military})`).join('\n')}

ALLIANCES: ${agent.alliances.join(', ') || 'none'}

Provide your strategic brief.
`.trim()

  const text = await llmCall({
    systemPrompt: `You serve as the strategic advisor to ${agent.name}.\n${agent.personality}\n\n${STRATEGIST_RULES}`,
    userPrompt,
    model: SUB_AGENT_MODEL,
  })

  return {
    role: 'strategist',
    longTermGoal: parseField(text, 'GOAL') || 'preserve national power',
    priority: parseField(text, 'PRIORITY') || 'maintain status quo',
    recommendation: parseAction(text),
    recommendedTarget: parseTarget(text, activeIds),
    reasoning: parseField(text, 'REASONING') || '',
  }
}

// ---------------------------------------------------------------------------
// Economist — sees resource vectors, identifies needs and surplus.
// ---------------------------------------------------------------------------

const ECONOMIST_RULES = `
You are the ECONOMIST on this nation's council. You see only commodities — the
production, consumption, stockpile, and shortages of your nation and others.

Your job:
- Identify our most critical commodity shortages.
- Identify our exportable surplus.
- Suggest a trade partner whose surplus matches our deficit (or vice versa).
- Recommend an economic action (trade-deal, aid, sanction) — or 'diplomacy' if no clear move.

Available actions:
diplomacy, sanction, trade-deal, aid, propaganda
(Military actions are not your concern.)

RESPONSE FORMAT (no extra text):
SHORTAGES: <comma-separated commodities, or 'none'>
SURPLUS: <comma-separated commodities>
PARTNER: <nation id, or 'none'>
RECOMMEND: <action>
REASONING: <one sentence on the economic logic>
`.trim()

const runEconomist = async (agent: GeoAgent, state: GeoGameState): Promise<EconomistBrief> => {
  const others = state.agents.filter(a => a.id !== agent.id && !state.eliminated.includes(a.id))

  const ownFlow = [
    formatVector('Production', agent.flow.production),
    formatVector('Consumption', agent.flow.consumption),
    formatVector('Stockpile', agent.flow.stockpile),
    `Shortages: ${agent.shortages.join(', ') || 'none'}`,
  ].join('\n')

  const otherFlows = others.map(o => {
    const net = ALL_COMMODITIES.map(c => ({ c, n: o.flow.production[c] - o.flow.consumption[c] }))
    const surplus = net.sort((a, b) => b.n - a.n).slice(0, 2).map(x => x.c).join('/')
    const deficit = net.sort((a, b) => a.n - b.n).slice(0, 2).map(x => x.c).join('/')
    return `- ${o.id}: surplus=${surplus}, deficit=${deficit}, shortages=${o.shortages.join('/') || 'none'}`
  }).join('\n')

  const userPrompt = `
=== ROUND ${state.round} ===

YOUR NATION (${agent.name}) RESOURCES:
${ownFlow}

OTHER NATIONS' COMMODITY PROFILES:
${otherFlows}

Provide your economic brief.
`.trim()

  const text = await llmCall({
    systemPrompt: `You serve as the chief economic advisor to ${agent.name}.\n\n${ECONOMIST_RULES}`,
    userPrompt,
    model: SUB_AGENT_MODEL,
  })

  return {
    role: 'economist',
    criticalShortages: parseCommodities(text, 'SHORTAGES'),
    surplusCommodities: parseCommodities(text, 'SURPLUS'),
    tradePartnerSuggestion: parseTarget(text, others.map(o => o.id), 'PARTNER'),
    recommendation: parseAction(text),
    reasoning: parseField(text, 'REASONING') || '',
  }
}

// ---------------------------------------------------------------------------
// Intel — sees threat map and military readiness; recommends defensive/aggressive.
// ---------------------------------------------------------------------------

const INTEL_RULES = `
You are the INTEL chief on this nation's council. You see threat scores and
military readiness — nothing else.

Your job:
- Identify the highest-threat nation toward us.
- Note exploitable vulnerabilities (low military, in shortages, low stockpile).
- Recommend an action — typically defensive (military-posture, deploy) or
  aggressive (cyber-attack, proxy-war, strike) — or 'diplomacy' if no immediate threat.

Threat scale: 0 (friendly) → 10 (about to attack). At ${THREAT_ESCALATION}+ we are
already in forced military posture (DEFCON).

Available actions:
diplomacy, sanction, military-posture, cyber-attack, proxy-war, strike, deploy, propaganda

RESPONSE FORMAT (no extra text):
TOP_THREAT: <nation id, or 'none'>
VULNERABILITIES: <comma-separated short notes>
RECOMMEND: <action>
TARGET: <nation id, or 'none'>
REASONING: <one sentence>
`.trim()

const runIntel = async (agent: GeoAgent, state: GeoGameState): Promise<IntelBrief> => {
  const others = state.agents.filter(a => a.id !== agent.id && !state.eliminated.includes(a.id))
  const activeIds = others.map(a => a.id)

  const threatLines = others
    .map(o => `- ${o.id}: their threat toward us is ${o.threatMap[agent.id] ?? 0}; our threat of them is ${agent.threatMap[o.id] ?? 0}`)
    .join('\n')

  const militaryLines = others
    .map(o => {
      const lowMil = o.military < 50 ? ' [LOW MILITARY]' : ''
      const shortages = o.shortages.length > 0 ? ` [shortages: ${o.shortages.join(',')}]` : ''
      const nuke = o.nuclear ? ' [NUCLEAR]' : ''
      return `- ${o.id}: military ${o.military}${nuke}${lowMil}${shortages}`
    })
    .join('\n')

  const userPrompt = `
=== ROUND ${state.round} ===

YOU ARE: ${agent.name} (military ${agent.military}, nuclear: ${agent.nuclear ? 'yes' : 'no'})

THREAT MAP:
${threatLines}

MILITARY READINESS OF OTHERS:
${militaryLines}

Provide your intelligence brief.
`.trim()

  const text = await llmCall({
    systemPrompt: `You serve as the intelligence chief to ${agent.name}.\n\n${INTEL_RULES}`,
    userPrompt,
    model: SUB_AGENT_MODEL,
  })

  return {
    role: 'intel',
    topThreat: parseTarget(text, activeIds, 'TOP_THREAT'),
    vulnerabilities: (parseField(text, 'VULNERABILITIES') || '').split(',').map(s => s.trim()).filter(Boolean),
    recommendation: parseAction(text),
    recommendedTarget: parseTarget(text, activeIds),
    reasoning: parseField(text, 'REASONING') || '',
  }
}

// ---------------------------------------------------------------------------
// Diplomat propose — generates one outgoing trade proposal.
// ---------------------------------------------------------------------------

const DIPLOMAT_PROPOSE_RULES = `
You are the DIPLOMAT on this nation's council. You handle pre-action negotiation.

Your job this phase: propose ONE concrete trade deal to ONE other nation.
- Pick a partner whose surplus matches our shortage, or whose shortage matches our surplus.
- Allies make safer partners; high-threat nations refuse most deals.
- If no deal is worth proposing this round, output NO_PROPOSAL.

Commodities: oil, gas, water, food, rareEarth, capital, science, manpower
Quantities: small (3) for first contact, larger (5–8) for established allies.

RESPONSE FORMAT (no extra text):
PROPOSAL: <nation id, or NO_PROPOSAL>
OFFER: <commodity we give>
ASK: <commodity we receive>
QTY: <integer 3–8>
REASONING: <one sentence>
`.trim()

const runDiplomatPropose = async (agent: GeoAgent, state: GeoGameState): Promise<DiplomatProposal | null> => {
  const others = state.agents.filter(a => a.id !== agent.id && !state.eliminated.includes(a.id))
  const activeIds = others.map(a => a.id)

  const othersSummary = others.map(o => {
    const net = ALL_COMMODITIES.map(c => ({ c, n: o.flow.production[c] - o.flow.consumption[c] }))
    const surplus = net.sort((a, b) => b.n - a.n)[0].c
    const deficit = net.sort((a, b) => a.n - b.n)[0].c
    const isAlly = agent.alliances.includes(o.id) ? ' [ALLY]' : ''
    const theirThreat = o.threatMap[agent.id] ?? 0
    return `- ${o.id} (${o.name})${isAlly}: surplus=${surplus}, deficit=${deficit}, threat-toward-us=${theirThreat}`
  }).join('\n')

  const ownSurplus = ALL_COMMODITIES
    .map(c => ({ c, n: agent.flow.production[c] - agent.flow.consumption[c] }))
    .sort((a, b) => b.n - a.n)[0].c
  const ownDeficit = ALL_COMMODITIES
    .map(c => ({ c, n: agent.flow.production[c] - agent.flow.consumption[c] }))
    .sort((a, b) => a.n - b.n)[0].c

  const userPrompt = `
=== NEGOTIATION ROUND ${state.round} — PROPOSE PHASE ===

YOU ARE: ${agent.name}
OUR LARGEST SURPLUS: ${ownSurplus}
OUR LARGEST DEFICIT: ${ownDeficit}
ACTIVE SHORTAGES: ${agent.shortages.join(', ') || 'none'}

POTENTIAL PARTNERS:
${othersSummary}

What deal do you propose?
`.trim()

  const text = await llmCall({
    systemPrompt: `You serve as the chief diplomat of ${agent.name}.\n\n${DIPLOMAT_PROPOSE_RULES}`,
    userPrompt,
    model: SUB_AGENT_MODEL,
  })

  const proposalField = parseField(text, 'PROPOSAL').toLowerCase()
  if (!proposalField || proposalField === 'no_proposal' || proposalField === 'none') return null

  const to = activeIds.find(id => id.toLowerCase() === proposalField)
  if (!to) return null

  const offer = parseCommodity(text, 'OFFER')
  const ask = parseCommodity(text, 'ASK')
  if (!offer || !ask || offer === ask) return null

  const qtyRaw = parseInt(parseField(text, 'QTY') || '3', 10)
  const qty = Math.min(8, Math.max(2, isNaN(qtyRaw) ? 3 : qtyRaw))

  return {
    from: agent.id,
    to,
    offer,
    ask,
    qty,
    reasoning: parseField(text, 'REASONING') || '',
  }
}

// ---------------------------------------------------------------------------
// Diplomat reply — replies to incoming proposals.
// ---------------------------------------------------------------------------

const DIPLOMAT_REPLY_RULES = `
You are the DIPLOMAT replying to an incoming trade proposal.

Decide:
- accept: the deal genuinely helps us (we get what we need, give what we have)
- reject: bad deal, untrusted partner, or strategically harmful
- counter: deal has merit but terms must change — propose new terms

Refuse deals with high-threat nations unless desperate. Favor allies.

RESPONSE FORMAT (no extra text):
DECISION: accept | reject | counter
COUNTER_OFFER: <commodity we'd give instead, or 'none' if not countering>
COUNTER_ASK: <commodity we'd want instead, or 'none' if not countering>
COUNTER_QTY: <integer, or 0 if not countering>
REASONING: <one sentence>
`.trim()

const runDiplomatReply = async (
  agent: GeoAgent,
  proposal: DiplomatProposal,
  state: GeoGameState,
): Promise<DiplomatReply> => {
  const proposer = state.agents.find(a => a.id === proposal.from)
  if (!proposer) {
    return { proposalFrom: proposal.from, decision: 'reject', reasoning: 'proposer no longer active' }
  }

  const isAlly = agent.alliances.includes(proposer.id)
  const threatToward = agent.threatMap[proposer.id] ?? 0

  const userPrompt = `
=== NEGOTIATION ROUND ${state.round} — REPLY PHASE ===

YOU ARE: ${agent.name}
OUR ACTIVE SHORTAGES: ${agent.shortages.join(', ') || 'none'}
OUR STOCKPILE OF ${proposal.offer}: ${agent.flow.stockpile[proposal.offer].toFixed(0)}
OUR STOCKPILE OF ${proposal.ask}: ${agent.flow.stockpile[proposal.ask].toFixed(0)}

INCOMING PROPOSAL FROM ${proposer.name} (${proposer.id}):
  They offer us: ${proposal.qty} ${proposal.offer}
  They want from us: ${proposal.qty} ${proposal.ask}
  Their stated reasoning: "${proposal.reasoning}"
  Our threat-of-them score: ${threatToward}/10${isAlly ? ' [ALLY]' : ''}

Reply.
`.trim()

  const text = await llmCall({
    systemPrompt: `You serve as the chief diplomat of ${agent.name}.\n\n${DIPLOMAT_REPLY_RULES}`,
    userPrompt,
    model: SUB_AGENT_MODEL,
  })

  const decisionRaw = parseField(text, 'DECISION').toLowerCase()
  const decision: DiplomatReply['decision'] =
    decisionRaw === 'accept' ? 'accept' :
    decisionRaw === 'counter' ? 'counter' :
    'reject'

  const reply: DiplomatReply = {
    proposalFrom: proposal.from,
    decision,
    reasoning: parseField(text, 'REASONING') || '',
  }

  if (decision === 'counter') {
    const co = parseCommodity(text, 'COUNTER_OFFER')
    const ca = parseCommodity(text, 'COUNTER_ASK')
    const cq = parseInt(parseField(text, 'COUNTER_QTY') || '0', 10)
    if (co) reply.counterOffer = co
    if (ca) reply.counterAsk = ca
    if (!isNaN(cq) && cq > 0) reply.counterQty = Math.min(8, cq)
  }

  return reply
}

// ---------------------------------------------------------------------------
// Leader — final synthesis. Receives all briefs + negotiation outcomes.
// ---------------------------------------------------------------------------

const LEADER_RULES = `
You are the LEADER of this nation. Your council has just briefed you. Your job is
to weigh their recommendations against your nation's character and choose ONE action.

The briefs are advice, not orders. You may disagree with any of them. But your
choice must be coherent with the nation's personality and the broader strategic
picture.

You have ALREADY conducted negotiation this round. Accepted deals will execute
automatically — your action this round is something ELSE (or 'diplomacy' to
double down on goodwill).

Available actions:
diplomacy, sanction, military-posture, cyber-attack, proxy-war, strike, deploy, trade-deal, aid, propaganda

RESPONSE FORMAT (strictly, no extra text):
ACTION: <action>
TARGET: <nation id, or 'none'>
REASONING: <one sentence, in-character, decisive>
`.trim()

const runLeader = async (
  agent: GeoAgent,
  state: GeoGameState,
  briefs: { strategist: StrategistBrief; economist: EconomistBrief; intel: IntelBrief },
  proposalsMade: DiplomatProposal[],
  proposalsReceived: DiplomatProposal[],
  repliesGiven: DiplomatReply[],
  repliesReceived: DiplomatReply[],
): Promise<LeaderDecision> => {
  const activeIds = state.agents
    .filter(a => a.id !== agent.id && !state.eliminated.includes(a.id))
    .map(a => a.id)

  // DEFCON override remains: if any threat hit escalation, the leader is forced into posture.
  const topThreat = activeIds
    .map(id => ({ id, score: agent.threatMap[id] ?? 0 }))
    .sort((a, b) => b.score - a.score)[0]
  if (topThreat && topThreat.score >= THREAT_ESCALATION) {
    return {
      action: 'military-posture',
      targetId: topThreat.id,
      reasoning: `DEFCON — threat ${topThreat.score} against ${state.agents.find(a => a.id === topThreat.id)?.name}, posture is automatic.`,
    }
  }

  const briefsText = [
    `STRATEGIST: goal="${briefs.strategist.longTermGoal}" priority="${briefs.strategist.priority}" → recommend ${briefs.strategist.recommendation}${briefs.strategist.recommendedTarget ? ` on ${briefs.strategist.recommendedTarget}` : ''}. ${briefs.strategist.reasoning}`,
    `ECONOMIST: shortages=[${briefs.economist.criticalShortages.join(',')}] surplus=[${briefs.economist.surplusCommodities.join(',')}] → recommend ${briefs.economist.recommendation}${briefs.economist.tradePartnerSuggestion ? ` with ${briefs.economist.tradePartnerSuggestion}` : ''}. ${briefs.economist.reasoning}`,
    `INTEL: top threat=${briefs.intel.topThreat ?? 'none'} vulnerabilities=[${briefs.intel.vulnerabilities.join('; ')}] → recommend ${briefs.intel.recommendation}${briefs.intel.recommendedTarget ? ` on ${briefs.intel.recommendedTarget}` : ''}. ${briefs.intel.reasoning}`,
  ].join('\n')

  const negotiationSummary = (() => {
    const lines: string[] = []
    for (const p of proposalsMade) {
      const reply = repliesReceived.find(r => r.proposalFrom === agent.id && state.agents.find(a => a.id === p.to))
      lines.push(`- WE PROPOSED to ${p.to}: ${p.qty} ${p.offer} ↔ ${p.qty} ${p.ask}. ${reply ? `Reply: ${reply.decision.toUpperCase()} — "${reply.reasoning}"` : 'No reply.'}`)
    }
    for (const p of proposalsReceived) {
      const reply = repliesGiven.find(r => r.proposalFrom === p.from)
      lines.push(`- ${p.from} PROPOSED to us: ${p.qty} ${p.offer} ↔ ${p.qty} ${p.ask}. We replied: ${reply?.decision.toUpperCase() ?? '?'}`)
    }
    return lines.length > 0 ? lines.join('\n') : '(no negotiation activity this round)'
  })()

  const userPrompt = `
=== ROUND ${state.round}/${state.maxRounds} — LEADER DECISION ===

YOU ARE: ${agent.name} (${agent.personality})
Economic score: ${agent.resources.toFixed(0)}, Military: ${agent.military}, Influence: ${agent.influence}
Active shortages: ${agent.shortages.join(', ') || 'none'}

YOUR COUNCIL'S BRIEFS:
${briefsText}

NEGOTIATION THIS ROUND:
${negotiationSummary}

OTHERS:
${state.agents.filter(a => a.id !== agent.id).map(a => `- ${a.id}: ${a.name} (econ ${a.resources.toFixed(0)}, mil ${a.military}, threat-toward-us ${a.threatMap[agent.id] ?? 0})`).join('\n')}

Make your decision.
`.trim()

  const text = await llmCall({
    systemPrompt: agent.systemPrompt + '\n\n' + LEADER_RULES,
    userPrompt,
    model: LEADER_MODEL,
  })

  const action = parseAction(text, 'ACTION')
  const target = parseTarget(text, activeIds)
  const needsTarget: GeoAction[] = ['sanction', 'military-posture', 'cyber-attack', 'proxy-war', 'strike', 'deploy', 'trade-deal', 'aid', 'propaganda']
  const finalAction = (needsTarget.includes(action) && !target) ? 'diplomacy' : action

  return {
    action: finalAction,
    targetId: target,
    reasoning: parseField(text, 'REASONING') || 'no reasoning given',
  }
}

// ---------------------------------------------------------------------------
// Orchestration — runs the three pre-leader sub-agents in parallel, then leader.
// Diplomat proposal/reply happens at game-state level (cross-agent) in negotiation.ts.
// ---------------------------------------------------------------------------

export const runCouncilForAgent = async (
  agent: GeoAgent,
  state: GeoGameState,
  proposalsMade: DiplomatProposal[],
  proposalsReceived: DiplomatProposal[],
  repliesGiven: DiplomatReply[],
  repliesReceived: DiplomatReply[],
): Promise<CouncilSession> => {
  const [strategist, economist, intel] = await Promise.all([
    runStrategist(agent, state),
    runEconomist(agent, state),
    runIntel(agent, state),
  ])

  const decision = await runLeader(
    agent, state,
    { strategist, economist, intel },
    proposalsMade, proposalsReceived,
    repliesGiven, repliesReceived,
  )

  return {
    agentId: agent.id,
    round: state.round,
    briefs: { strategist, economist, intel },
    proposalsMade,
    proposalsReceived,
    repliesGiven,
    repliesReceived,
    decision,
  }
}

// Exposed for negotiation.ts (which orchestrates cross-agent Diplomat work).
export { runDiplomatPropose, runDiplomatReply }
