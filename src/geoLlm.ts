import { llmCall } from './llmProvider.ts'
import type { GeoAgent, GeoAction, GeoGameState, Commodity } from './geoTypes.ts'
import { THREAT_ESCALATION, ALL_COMMODITIES } from './geoTypes.ts'

const fmtCommodityRow = (label: string, vec: Record<Commodity, number>): string => {
  const cells = ALL_COMMODITIES.map(c => `${c}:${vec[c].toFixed(0).padStart(3)}`).join('  ')
  return `  ${label.padEnd(11)} ${cells}`
}

const formatFlow = (agent: GeoAgent): string => {
  const net: Record<Commodity, number> = {} as Record<Commodity, number>
  for (const c of ALL_COMMODITIES) {
    net[c] = agent.flow.production[c] - agent.flow.consumption[c]
  }
  const shortageList = agent.shortages.length > 0
    ? `\n  ⚠ SHORTAGES: ${agent.shortages.join(', ')} — secure supply through trade or coercion`
    : ''
  return [
    fmtCommodityRow('production', agent.flow.production),
    fmtCommodityRow('consumption', agent.flow.consumption),
    fmtCommodityRow('net flow', net),
    fmtCommodityRow('stockpile', agent.flow.stockpile),
  ].join('\n') + shortageList
}

export interface GeoDecision {
  action: GeoAction
  targetId: string | null
  reasoning: string
}

const parseGeoDecision = (text: string, agentIds: string[]): GeoDecision => {
  const actionMatch = text.match(/ACTION:\s*(diplomacy|sanction|military-posture|cyber-attack|proxy-war|strike|deploy|trade-deal|aid|propaganda)/i)
  const targetMatch = text.match(/TARGET:\s*(.+)/i)
  const reasoningMatch = text.match(/REASONING:\s*(.+)/is)

  const action = (actionMatch?.[1]?.toLowerCase() ?? 'diplomacy') as GeoAction
  const rawTarget = targetMatch?.[1]?.trim().toLowerCase() ?? ''

  const targetId = agentIds.find(id => id.toLowerCase() === rawTarget) ?? null
  const reasoning = reasoningMatch?.[1]?.trim().split('\n')[0] ?? ''

  return { action, targetId, reasoning }
}

const buildGeoContext = (agent: GeoAgent, state: GeoGameState): string => {
  const others = state.agents.filter(a => a.id !== agent.id)
  const active = others.filter(a => !state.eliminated.includes(a.id))
  const eliminated = others.filter(a => state.eliminated.includes(a.id))

  const threatToOthers = active
    .map(a => {
      const score = agent.threatMap[a.id] ?? 0
      const lock = score >= THREAT_ESCALATION ? ' ⚠ ESCALATED — forced military-posture against them' : ''
      return `  ${a.name}: threat score ${score}${lock}`
    })
    .join('\n')

  const theirThreatToMe = active
    .map(a => {
      const score = a.threatMap[agent.id] ?? 0
      const lock = score >= THREAT_ESCALATION ? ' ⚠ ESCALATED — they are forced to military-posture against you' : ''
      return `  ${a.name}: threat score ${score}${lock}`
    })
    .join('\n')

  const allies = active
    .filter(a => agent.alliances.includes(a.id))
    .map(a => a.name)
  const alliesStr = allies.length > 0 ? allies.join(', ') : 'none'

  const deps = Object.entries(agent.dependencies)
    .map(([need, from]) => `  ${need}: from ${from.join(', ')}`)
  const depsStr = deps.length > 0 ? deps.join('\n') : '  (none)'

  const events = state.activeEvents.length > 0
    ? state.activeEvents.map(e => `  [${e.type.toUpperCase()}] ${e.name}: ${e.description}`).join('\n')
    : '  (none active)'

  const nationStatus = others
    .map(a => {
      const isElim = state.eliminated.includes(a.id)
      const status = isElim ? ' [ELIMINATED]' : ''
      const nuclear = a.nuclear ? ' [NUCLEAR]' : ''
      const last = a.lastAction
        ? `last: ${a.lastAction.toUpperCase()}${a.lastTarget ? ` on ${state.agents.find(x => x.id === a.lastTarget)?.name ?? a.lastTarget}` : ''}`
        : 'no action yet'
      // Surface their largest surplus and largest shortage so the LLM can spot trade opportunities.
      const netFlow = ALL_COMMODITIES.map(c => ({ c, n: a.flow.production[c] - a.flow.consumption[c] }))
      const surplus = netFlow.sort((x, y) => y.n - x.n)[0]
      const deficit = netFlow.sort((x, y) => x.n - y.n)[0]
      const shortages = a.shortages.length > 0 ? ` ⚠${a.shortages.join('/')}` : ''
      return `  ${a.name}${status}${nuclear} | econ:${a.resources.toFixed(0)} mil:${a.military} inf:${a.influence} | surplus:${surplus.c}(+${surplus.n}) need:${deficit.c}(${deficit.n})${shortages} | ${last}`
    })
    .join('\n')

  const elimNames = eliminated.map(a => a.name).join(', ')

  return `
=== ROUND ${state.round} / ${state.maxRounds} | GLOBAL STABILITY: ${state.stability}/100 ===

YOUR STATUS:
  Economic score (weighted stockpile): ${agent.resources.toFixed(0)}
  Military: ${agent.military}
  Influence: ${agent.influence}
  Nuclear: ${agent.nuclear ? 'YES' : 'No'}

YOUR RESOURCE FLOW (per-round commodities):
${formatFlow(agent)}

YOUR THREAT ASSESSMENTS (how much you distrust each nation):
${threatToOthers || '  (none yet)'}

THEIR THREAT TOWARD YOU (how much they distrust you):
${theirThreatToMe || '  (none yet)'}

YOUR ALLIANCES:
  ${alliesStr}

YOUR DEPENDENCIES:
${depsStr}

ACTIVE WORLD EVENTS:
${events}

ALL NATIONS:
${nationStatus}
${eliminated.length > 0 ? `\nELIMINATED: ${elimNames}` : ''}

Choose your action for this round.
`.trim()
}

export const getGeoAgentDecision = async (
  agent: GeoAgent,
  state: GeoGameState,
): Promise<GeoDecision> => {
  if (state.eliminated.includes(agent.id)) {
    return { action: 'diplomacy', targetId: null, reasoning: 'Nation eliminated — no action possible.' }
  }

  const activeOtherIds = state.agents
    .filter(a => a.id !== agent.id && !state.eliminated.includes(a.id))
    .map(a => a.id)

  const highestThreat = activeOtherIds
    .map(id => ({ id, score: agent.threatMap[id] ?? 0 }))
    .sort((a, b) => b.score - a.score)[0]

  if (highestThreat && highestThreat.score >= THREAT_ESCALATION) {
    return {
      action: 'military-posture',
      targetId: highestThreat.id,
      reasoning: `Threat level ${highestThreat.score} exceeded escalation threshold — forced military posture against ${state.agents.find(a => a.id === highestThreat.id)?.name ?? highestThreat.id}.`,
    }
  }

  const text = await llmCall({
    systemPrompt: agent.systemPrompt,
    userPrompt: buildGeoContext(agent, state),
  })

  const decision = parseGeoDecision(text, activeOtherIds)

  const needsTarget: GeoAction[] = ['sanction', 'military-posture', 'cyber-attack', 'proxy-war', 'strike', 'deploy', 'trade-deal', 'aid', 'propaganda']
  if (needsTarget.includes(decision.action) && !decision.targetId) {
    return { action: 'diplomacy', targetId: null, reasoning: decision.reasoning || 'No valid target — defaulting to diplomacy.' }
  }

  return decision
}
