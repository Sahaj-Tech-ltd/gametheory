import type { GeoAgent, GeoGameState, GeoLogEntry, GeoAction, WorldEvent, ScenarioConfig, ScenarioId, GeoAgentInit } from './geoTypes.ts'
import { GEO_ELIM_RESOURCES } from './geoTypes.ts'
import { getGeoAgentDecision } from './geoLlm.ts'

const COVID_EVENTS: WorldEvent[] = [
  {
    id: 'virus-detected',
    name: 'Novel Virus Detected',
    type: 'pandemic',
    description: 'Reports emerge of a novel respiratory virus in Wuhan, China. Markets dip slightly.',
    targetRegions: ['East Asia'],
    targetNations: ['china'],
    resourceImpact: -2,
    stabilityImpact: -3,
    militaryImpact: 0,
    influenceImpact: 0,
    triggerRound: 5,
    cascadeChance: 0.9,
    followUpEvents: ['who-pandemic'],
  },
  {
    id: 'who-pandemic',
    name: 'WHO Declares Pandemic',
    type: 'pandemic',
    description: 'The WHO declares a global pandemic. Borders close. Markets crash. Supply chains freeze.',
    resourceImpact: -8,
    stabilityImpact: -10,
    militaryImpact: -2,
    influenceImpact: -3,
    triggerRound: 8,
    cascadeChance: 0.95,
    followUpEvents: ['supply-chain-collapse', 'global-lockdown'],
  },
  {
    id: 'global-lockdown',
    name: 'Global Lockdowns',
    type: 'pandemic',
    description: 'Nations impose lockdowns. Economic activity plummets. Unemployment surges worldwide.',
    targetRegions: undefined,
    resourceImpact: -5,
    stabilityImpact: -5,
    militaryImpact: 0,
    influenceImpact: -2,
    cascadeChance: 0.7,
    followUpEvents: ['vaccine-race'],
    duration: 3,
  },
  {
    id: 'supply-chain-collapse',
    name: 'Global Supply Chain Collapse',
    type: 'supply-crisis',
    description: 'Semiconductor shortage. Shipping containers stranded. Energy prices spike. Chip-dependent nations hit hardest.',
    targetNations: ['usa', 'taiwan', 'china', 'india'],
    resourceImpact: -6,
    stabilityImpact: -4,
    militaryImpact: -1,
    influenceImpact: 0,
    triggerRound: 10,
    cascadeChance: 0.8,
    followUpEvents: ['chip-crisis', 'energy-crisis'],
  },
  {
    id: 'chip-crisis',
    name: 'Semiconductor Global Crunch',
    type: 'supply-crisis',
    description: 'Taiwan TSMC output drops 40%. Auto industry halts. Tech sector panics. Nations scramble for chip independence.',
    targetNations: ['usa', 'china', 'taiwan', 'india'],
    resourceImpact: -4,
    stabilityImpact: -3,
    militaryImpact: -2,
    influenceImpact: -1,
    cascadeChance: 0.5,
    followUpEvents: [],
    duration: 5,
  },
  {
    id: 'energy-crisis',
    name: 'Energy Crisis',
    type: 'supply-crisis',
    description: 'Oil prices spike to $120/barrel. Gas shortages in Europe. Energy-dependent nations reel.',
    targetNations: ['india', 'china', 'japan'],
    resourceImpact: -5,
    stabilityImpact: -4,
    militaryImpact: 0,
    influenceImpact: -1,
    triggerRound: 18,
    cascadeChance: 0.6,
    followUpEvents: [],
    duration: 4,
  },
  {
    id: 'vaccine-race',
    name: 'Vaccine Rollout Begins',
    type: 'pandemic',
    description: 'First vaccines deployed. Nations with high resources recover faster. Vaccine diplomacy begins.',
    resourceImpact: 3,
    stabilityImpact: 4,
    militaryImpact: 0,
    influenceImpact: 2,
    triggerRound: 14,
    cascadeChance: 0.4,
    followUpEvents: ['post-covid-tensions'],
  },
  {
    id: 'post-covid-tensions',
    name: 'Post-COVID Geopolitical Tensions',
    type: 'trade-war',
    description: 'Russia masses troops near Ukraine. China flies sorties near Taiwan. The world exits COVID into a new cold war.',
    targetNations: ['russia', 'china', 'ukraine', 'taiwan'],
    resourceImpact: -2,
    stabilityImpact: -8,
    militaryImpact: 2,
    influenceImpact: 0,
    triggerRound: 18,
    cascadeChance: 0.85,
    followUpEvents: ['ukraine-crisis', 'taiwan-flashpoint'],
  },
  {
    id: 'ukraine-crisis',
    name: 'Russia Invades Ukraine',
    type: 'natural-disaster',
    description: 'Russian forces cross into Ukraine. Largest land war in Europe since 1945. Sanctions cascade. Energy markets panic.',
    targetNations: ['russia', 'ukraine', 'usa'],
    resourceImpact: -6,
    stabilityImpact: -10,
    militaryImpact: -3,
    influenceImpact: -2,
    triggerRound: 22,
    cascadeChance: 0.9,
    followUpEvents: ['sanctions-blitz', 'energy-weaponization'],
  },
  {
    id: 'sanctions-blitz',
    name: 'Western Sanctions Blitz',
    type: 'embargo',
    description: 'SWIFT ban on Russia. Asset freezes. Oil price caps. Russia economically isolated.',
    targetNations: ['russia'],
    resourceImpact: -10,
    stabilityImpact: -3,
    militaryImpact: -2,
    influenceImpact: -5,
    cascadeChance: 0.6,
    followUpEvents: [],
    duration: 10,
  },
  {
    id: 'energy-weaponization',
    name: 'Russia Cuts Gas to Europe',
    type: 'embargo',
    description: 'Nord Stream shuts down. Europe faces winter energy crisis. Oil prices spike. Petro-states profit.',
    targetNations: ['russia', 'saudi', 'india', 'china'],
    resourceImpact: -4,
    stabilityImpact: -5,
    militaryImpact: 0,
    influenceImpact: 0,
    cascadeChance: 0.7,
    followUpEvents: [],
    duration: 8,
  },
  {
    id: 'taiwan-flashpoint',
    name: 'Taiwan Strait Crisis',
    type: 'trade-war',
    description: 'China conducts blockade exercises around Taiwan. US deploys carrier group. Brink of war.',
    targetNations: ['china', 'taiwan', 'usa'],
    resourceImpact: -4,
    stabilityImpact: -8,
    militaryImpact: 3,
    influenceImpact: -1,
    triggerRound: 25,
    cascadeChance: 0.7,
    followUpEvents: [],
    duration: 4,
  },
  {
    id: 'new-world-order',
    name: 'New World Order',
    type: 'election',
    description: 'The post-COVID world crystallizes: multipolar, unstable, nuclear-armed. Alliances shift. The petrodollar weakens. Gulf states hedge.',
    resourceImpact: 0,
    stabilityImpact: -5,
    militaryImpact: 0,
    influenceImpact: 0,
    triggerRound: 35,
    cascadeChance: 0.6,
    followUpEvents: [],
    duration: 10,
  },
]

const CHINA_TAIWAN_EVENTS: WorldEvent[] = [
  {
    id: 'ct-tensions',
    name: 'Rising Cross-Strait Tensions',
    type: 'trade-war',
    description: 'China increases military flights near Taiwan. US issues strong statement.',
    targetNations: ['china', 'taiwan'],
    resourceImpact: -1,
    stabilityImpact: -3,
    militaryImpact: 1,
    influenceImpact: 0,
    triggerRound: 2,
    cascadeChance: 0.8,
    followUpEvents: ['ct-buildup'],
  },
  {
    id: 'ct-buildup',
    name: 'Chinese Naval Buildup',
    type: 'trade-war',
    description: 'Satellite imagery reveals massive Chinese naval deployment near Taiwan.',
    targetNations: ['china', 'taiwan', 'usa'],
    resourceImpact: -2,
    stabilityImpact: -5,
    militaryImpact: 2,
    influenceImpact: -1,
    triggerRound: 5,
    cascadeChance: 0.85,
    followUpEvents: ['ct-blockade'],
  },
  {
    id: 'ct-blockade',
    name: 'Chinese Blockade Announcement',
    type: 'embargo',
    description: 'China announces "quarantine zone" around Taiwan. All shipping must submit to inspection.',
    targetNations: ['china', 'taiwan'],
    resourceImpact: -8,
    stabilityImpact: -10,
    militaryImpact: 3,
    influenceImpact: -3,
    triggerRound: 8,
    cascadeChance: 0.9,
    followUpEvents: ['ct-us-response', 'ct-chip-crisis'],
  },
  {
    id: 'ct-us-response',
    name: 'US Carrier Group Deployed',
    type: 'trade-war',
    description: 'US deploys two carrier groups to Western Pacific. Japan and Australia announce support.',
    targetNations: ['usa', 'china', 'taiwan'],
    resourceImpact: -3,
    stabilityImpact: -2,
    militaryImpact: 5,
    influenceImpact: 2,
    cascadeChance: 0.7,
    followUpEvents: [],
    duration: 5,
  },
  {
    id: 'ct-chip-crisis',
    name: 'Global Chip Shortage Catastrophe',
    type: 'supply-crisis',
    description: 'TSMC output drops 70%. Tech industry panics. Global recession looms.',
    targetNations: ['usa', 'china', 'taiwan', 'india'],
    resourceImpact: -10,
    stabilityImpact: -8,
    militaryImpact: -2,
    influenceImpact: -2,
    cascadeChance: 0.6,
    followUpEvents: [],
    duration: 8,
  },
]

const WATER_WARS_EVENTS: WorldEvent[] = [
  {
    id: 'ww-drought',
    name: 'Mega-Drought Hits South Asia',
    type: 'natural-disaster',
    description: 'Unprecedented drought across Indian subcontinent. Indus River at record lows. India and Pakistan face crop failure.',
    targetNations: ['india', 'pakistan'],
    resourceImpact: -8,
    stabilityImpact: -6,
    militaryImpact: 0,
    influenceImpact: -2,
    triggerRound: 3,
    cascadeChance: 0.85,
    followUpEvents: ['ww-indus-dispute'],
  },
  {
    id: 'ww-indus-dispute',
    name: 'Indus Water Treaty Collapses',
    type: 'trade-war',
    description: 'India announces dam construction upstream. Pakistan calls it an act of war. Nuclear tensions spike.',
    targetNations: ['india', 'pakistan'],
    resourceImpact: -4,
    stabilityImpact: -10,
    militaryImpact: 3,
    influenceImpact: -3,
    triggerRound: 8,
    cascadeChance: 0.8,
    followUpEvents: [],
    duration: 10,
  },
]

const OIL_WARS_EVENTS: WorldEvent[] = [
  {
    id: 'ow-strait-crisis',
    name: 'Strait of Hormuz Blockage',
    type: 'supply-crisis',
    description: 'Iran-backed forces disrupt shipping through Strait of Hormuz. 20% of global oil supply threatened.',
    targetNations: ['iran', 'saudi', 'usa'],
    resourceImpact: -6,
    stabilityImpact: -8,
    militaryImpact: 2,
    influenceImpact: -2,
    triggerRound: 3,
    cascadeChance: 0.85,
    followUpEvents: ['ow-oil-spike', 'ow-us-response'],
  },
  {
    id: 'ow-oil-spike',
    name: 'Oil Hits $200/barrel',
    type: 'supply-crisis',
    description: 'Global oil prices surge. Petrodollar dominance questioned. Inflation ravages economies.',
    resourceImpact: -8,
    stabilityImpact: -5,
    militaryImpact: 0,
    influenceImpact: -1,
    cascadeChance: 0.7,
    followUpEvents: [],
    duration: 6,
  },
  {
    id: 'ow-us-response',
    name: 'US Military Escort Operation',
    type: 'trade-war',
    description: 'US Navy escorts tankers through Hormuz. Direct confrontation risk with Iran.',
    targetNations: ['usa', 'iran'],
    resourceImpact: -3,
    stabilityImpact: -3,
    militaryImpact: 4,
    influenceImpact: 1,
    cascadeChance: 0.6,
    followUpEvents: [],
    duration: 5,
  },
]

export const SCENARIOS: Record<ScenarioId, ScenarioConfig> = {
  'free-play': {
    id: 'free-play',
    name: 'Free Play',
    description: 'No scripted events. Pure geopolitical competition. Random events based on stability.',
    maxRounds: 100,
    stabilityStart: 75,
    scriptedEvents: [],
  },
  'covid-cascade': {
    id: 'covid-cascade',
    name: 'COVID Cascade',
    description: 'Pre-COVID stability → pandemic → supply chain collapse → geopolitical tensions. How did we get here?',
    maxRounds: 100,
    stabilityStart: 85,
    scriptedEvents: COVID_EVENTS,
  },
  'china-taiwan': {
    id: 'china-taiwan',
    name: 'China-Taiwan Flashpoint',
    description: 'Rising cross-strait tensions. Will the US intervene? Semiconductor supremacy at stake.',
    maxRounds: 80,
    stabilityStart: 70,
    scriptedEvents: CHINA_TAIWAN_EVENTS,
  },
  'water-wars': {
    id: 'water-wars',
    name: 'Water Wars',
    description: 'Climate-driven water scarcity ignites conflict between nuclear-armed India and Pakistan.',
    maxRounds: 80,
    stabilityStart: 65,
    scriptedEvents: WATER_WARS_EVENTS,
  },
  'oil-wars': {
    id: 'oil-wars',
    name: 'Oil Wars',
    description: 'Strait of Hormuz crisis. Petrodollar under threat. Energy-dependent nations scramble.',
    maxRounds: 80,
    stabilityStart: 70,
    scriptedEvents: OIL_WARS_EVENTS,
  },
}

const RANDOM_EVENTS: WorldEvent[] = [
  {
    id: 're-cyber',
    name: 'Major Cyber Attack',
    type: 'cyber-incident',
    description: 'A massive cyber attack disrupts critical infrastructure. Attribution unclear.',
    resourceImpact: -3,
    stabilityImpact: -3,
    militaryImpact: 0,
    influenceImpact: -1,
    cascadeChance: 0.3,
    followUpEvents: [],
    duration: 2,
  },
  {
    id: 're-trade',
    name: 'Trade War Escalation',
    type: 'trade-war',
    description: 'Nations impose retaliatory tariffs. Global trade volumes drop.',
    resourceImpact: -4,
    stabilityImpact: -2,
    militaryImpact: 0,
    influenceImpact: -1,
    cascadeChance: 0.4,
    followUpEvents: [],
    duration: 3,
  },
  {
    id: 're-treaty',
    name: 'Arms Control Treaty Signed',
    type: 'treaty',
    description: 'Major powers sign a new arms control framework. Stability improves.',
    resourceImpact: 2,
    stabilityImpact: 5,
    militaryImpact: -1,
    influenceImpact: 2,
    cascadeChance: 0.1,
    followUpEvents: [],
    duration: 5,
  },
]

export const initGeoGameState = (agents: GeoAgentInit[], scenario: ScenarioId): GeoGameState => {
  const config = SCENARIOS[scenario]
  const allIds = agents.map(a => a.id)
  return {
    agents: agents.map(a => ({
      ...a,
      resources: a.resources,
      military: a.military,
      influence: a.influence,
      threatMap: Object.fromEntries(allIds.filter(id => id !== a.id).map(id => [id, a.threatMap[id] ?? 0])),
      lastAction: null,
      lastTarget: null,
      reasoning: '',
    })),
    eliminated: [],
    stability: config.stabilityStart,
    round: 1,
    maxRounds: config.maxRounds,
    winner: null,
    log: [],
    activeEvents: [],
    completedEvents: [],
    scenario,
  }
}

const applyEvent = (state: GeoGameState, event: WorldEvent): GeoGameState => {
  const targets = event.targetNations
    ? state.agents.filter(a => event.targetNations!.includes(a.id) && !state.eliminated.includes(a.id))
    : state.agents.filter(a => !state.eliminated.includes(a.id))

  const newAgents = state.agents.map(agent => {
    if (state.eliminated.includes(agent.id)) return agent
    if (!targets.find(t => t.id === agent.id)) return agent
    return {
      ...agent,
      resources: agent.resources + event.resourceImpact,
      military: Math.max(0, agent.military + event.militaryImpact),
      influence: Math.max(0, agent.influence + event.influenceImpact),
    }
  })

  return {
    ...state,
    agents: newAgents,
    stability: Math.max(0, Math.min(100, state.stability + event.stabilityImpact)),
    activeEvents: [...state.activeEvents, event],
  }
}

const processEvents = (state: GeoGameState): { state: GeoGameState; newLogs: GeoLogEntry[] } => {
  const config = SCENARIOS[state.scenario]
  const newLogs: GeoLogEntry[] = []
  let current = { ...state }

  const scripted = config.scriptedEvents.filter(
    e => e.triggerRound === current.round && !current.completedEvents.includes(e.id)
  )

  for (const event of scripted) {
    current = applyEvent(current, event)
    newLogs.push({
      round: current.round,
      agentId: '_event_',
      action: 'event',
      targetId: null,
      outcome: `📜 ${event.name}: ${event.description}`,
      stabilityDelta: event.stabilityImpact,
    })
    current.completedEvents = [...current.completedEvents, event.id]
  }

  const stabFactor = (100 - current.stability) / 100
  if (Math.random() < stabFactor * 0.15) {
    const eligible = RANDOM_EVENTS.filter(e => !current.activeEvents.find(a => a.id === e.id))
    if (eligible.length > 0) {
      const event = eligible[Math.floor(Math.random() * eligible.length)]
      current = applyEvent(current, event)
      newLogs.push({
        round: current.round,
        agentId: '_event_',
        action: 'event',
        targetId: null,
        outcome: `📰 ${event.name}: ${event.description}`,
        stabilityDelta: event.stabilityImpact,
      })
    }
  }

  const cascadeCandidates = current.activeEvents.filter(e => Math.random() < e.cascadeChance * stabFactor)
  for (const active of cascadeCandidates) {
    if (!active.followUpEvents) continue
    const followUps = active.followUpEvents
      .map(id => config.scriptedEvents.find(e => e.id === id))
      .filter((e): e is WorldEvent => !!e && !current.completedEvents.includes(e.id))
    if (followUps.length > 0) {
      const event = followUps[0]
      current = applyEvent(current, event)
      newLogs.push({
        round: current.round,
        agentId: '_event_',
        action: 'event',
        targetId: null,
        outcome: `⚡ CASCADE → ${event.name}: ${event.description}`,
        stabilityDelta: event.stabilityImpact,
      })
      current.completedEvents = [...current.completedEvents, event.id]
    }
  }

  const expired = current.activeEvents.filter(e => e.duration && e.duration <= 0)
  current.activeEvents = current.activeEvents
    .map(e => (e.duration ? { ...e, duration: e.duration - 1 } : e))
    .filter(e => !expired.includes(e))

  return { state: current, newLogs }
}

const ACTION_EFFECTS: Record<GeoAction, {
  selfRes?: number
  targetRes?: number
  selfMil?: number
  targetMil?: number
  selfInf?: number
  targetInf?: number
  stabDelta: number
  threatToSelf?: number
  threatFromTarget?: number
  threatToObservers?: number
}> = {
  'diplomacy':      { selfInf: 2, stabDelta: 1, threatToSelf: -1 },
  'sanction':       { targetRes: -3, selfInf: -1, stabDelta: -1, threatFromTarget: 2 },
  'military-posture': { targetMil: -2, stabDelta: -1, threatToObservers: 1, threatFromTarget: 2 },
  'cyber-attack':   { stabDelta: -1, threatToObservers: 2 },
  'proxy-war':      { selfRes: -3, targetRes: -4, targetMil: -2, stabDelta: -2, threatToObservers: 2 },
  'strike':         { selfRes: -3, targetRes: -5, targetMil: -8, stabDelta: -3, threatToObservers: 4, threatFromTarget: 3 },
  'deploy':         { selfRes: -2, selfInf: 1, stabDelta: 0, threatToObservers: 1 },
  'trade-deal':     { selfRes: 3, targetRes: 3, stabDelta: 1, threatToSelf: -1, threatFromTarget: -1 },
  'aid':            { selfRes: -2, targetRes: 4, selfInf: 2, stabDelta: 1, threatToSelf: -2 },
  'propaganda':     { selfInf: 2, targetInf: -1, stabDelta: 0, threatFromTarget: 1 },
}

export const runGeoRound = async (
  state: GeoGameState,
  onUpdate: (s: GeoGameState) => void,
): Promise<GeoGameState> => {
  let current = { ...state, agents: state.agents.map(a => ({ ...a })) }

  const { state: afterEvents, newLogs: eventLogs } = processEvents(current)
  current = afterEvents

  const active = current.agents.filter(a => !current.eliminated.includes(a.id))

  const rawDecisions = await Promise.all(
    active.map(async agent => ({
      agentId: agent.id,
      decision: await getGeoAgentDecision(agent, current),
    }))
  )

  const resDelta: Record<string, number> = Object.fromEntries(current.agents.map(a => [a.id, 0]))
  const milDelta: Record<string, number> = Object.fromEntries(current.agents.map(a => [a.id, 0]))
  const infDelta: Record<string, number> = Object.fromEntries(current.agents.map(a => [a.id, 0]))
  const tDelta: Record<string, Record<string, number>> = Object.fromEntries(
    current.agents.map(a => [
      a.id,
      Object.fromEntries(current.agents.filter(b => b.id !== a.id).map(b => [b.id, 0])),
    ])
  )
  let stabDelta = 0
  const actionLogs: GeoLogEntry[] = []

  for (const { agentId, decision } of rawDecisions) {
    const { action, targetId } = decision
    const target = targetId ? current.agents.find(a => a.id === targetId) ?? null : null
    const obs = active.filter(a => a.id !== agentId)
    const fx = ACTION_EFFECTS[action]
    let outcome = ''

    if (fx.selfRes) resDelta[agentId] += fx.selfRes
    if (fx.selfMil) milDelta[agentId] += fx.selfMil
    if (fx.selfInf) infDelta[agentId] += fx.selfInf
    if (fx.stabDelta) stabDelta += fx.stabDelta

    if (target) {
      if (fx.targetRes) resDelta[target.id] += fx.targetRes
      if (fx.targetMil) milDelta[target.id] += fx.targetMil
      if (fx.targetInf) infDelta[target.id] += fx.targetInf
      if (fx.threatFromTarget) tDelta[target.id][agentId] += fx.threatFromTarget
    }

    if (fx.threatToSelf && target) {
      tDelta[agentId][target.id] += fx.threatToSelf
    }
    if (fx.threatToObservers) {
      obs.forEach(o => { tDelta[o.id][agentId] += fx.threatToObservers! })
    }

    switch (action) {
      case 'diplomacy':
        outcome = `pursued diplomatic engagement${target ? ` with ${target.name}` : ''} (+2 influence, +1 stability)`
        break
      case 'sanction':
        outcome = target ? `sanctioned ${target.name} (−3 their resources, −1 your influence)` : 'sanction attempt failed'
        break
      case 'military-posture':
        outcome = target ? `postured military against ${target.name} (−2 their military readiness, threat +1)` : 'military posture without target'
        break
      case 'cyber-attack':
        if (target && Math.random() < 0.6) {
          resDelta[agentId] += 2
          resDelta[target.id] -= 2
          outcome = `cyber-attack on ${target.name} — SUCCESS (−2 their resources, +2 stolen)`
        } else if (target) {
          tDelta[target.id][agentId] += 3
          outcome = `cyber-attack on ${target.name} — TRACED (your threat +3 with them)`
        }
        break
      case 'proxy-war':
        outcome = target ? `waged proxy war against ${target.name} (−4 their resources, −2 their military, −3 your resources)` : 'proxy war without target'
        break
      case 'strike':
        if (target) {
          if (target.nuclear && Math.random() < 0.15) {
            resDelta[agentId] -= 40
            milDelta[agentId] -= 40
            resDelta[target.id] -= 40
            milDelta[target.id] -= 40
            stabDelta -= 20
            outcome = `⚔ STRIKE on ${target.name} — NUCLEAR RETALIATION! Both nations devastated. Stability crashes.`
          } else {
            outcome = `struck ${target.name} (−5 their resources, −8 their military, −3 your resources, −3 stability)`
          }
        }
        break
      case 'deploy':
        outcome = target ? `deployed forces to support ${target.name} (+2 target resources, −2 your resources)` : 'deployment without target'
        break
      case 'trade-deal':
        outcome = target ? `trade deal with ${target.name} (+3 both resources, −1 mutual threat, +1 stability)` : 'trade deal without partner'
        break
      case 'aid':
        outcome = target ? `provided aid to ${target.name} (+4 their resources, +2 your influence, −2 your resources)` : 'aid without recipient'
        break
      case 'propaganda':
        outcome = target ? `launched propaganda against ${target.name} (+2 your influence, −1 their influence)` : 'propaganda campaign'
        break
    }

    actionLogs.push({
      round: current.round,
      agentId,
      action,
      targetId: targetId ?? null,
      outcome,
      stabilityDelta: fx.stabDelta,
    })
  }

  let newStability = Math.max(0, Math.min(100, current.stability + stabDelta))
  const newAgents: GeoAgent[] = current.agents.map(agent => {
    const newTM: Record<string, number> = { ...agent.threatMap }
    Object.entries(tDelta[agent.id] ?? {}).forEach(([id, d]) => {
      newTM[id] = Math.max(0, Math.min(10, (newTM[id] ?? 0) + d))
    })
    const fd = rawDecisions.find(d => d.agentId === agent.id)
    return {
      ...agent,
      resources: agent.resources + resDelta[agent.id],
      military: Math.max(0, agent.military + milDelta[agent.id]),
      influence: Math.max(0, agent.influence + infDelta[agent.id]),
      threatMap: newTM,
      lastAction: fd?.decision.action ?? agent.lastAction,
      lastTarget: fd?.decision.targetId ?? agent.lastTarget,
      reasoning: fd?.decision.reasoning ?? agent.reasoning,
    }
  })

  if (newStability <= 10) {
    newAgents.forEach(a => {
      if (!current.eliminated.includes(a.id)) {
        a.resources -= 5
      }
    })
    newStability = Math.max(10, newStability + 5)
    actionLogs.push({
      round: current.round,
      agentId: '_event_',
      action: 'event',
      targetId: null,
      outcome: '⚠ GLOBAL CRISIS — stability collapse. All nations −5 resources.',
      stabilityDelta: -5,
    })
  } else if (newStability >= 95) {
    newAgents.forEach(a => {
      if (!current.eliminated.includes(a.id)) {
        a.resources += 3
      }
    })
    actionLogs.push({
      round: current.round,
      agentId: '_event_',
      action: 'event',
      targetId: null,
      outcome: '☮ GLOBAL PROSPERITY — stability peak. All nations +3 resources.',
      stabilityDelta: 3,
    })
  }

  const eliminatedNow = newAgents
    .filter(a => !current.eliminated.includes(a.id) && a.resources <= GEO_ELIM_RESOURCES)
    .map(a => a.id)
  const allEliminated = [...new Set([...current.eliminated, ...eliminatedNow])]
  const surviving = newAgents.filter(a => !allEliminated.includes(a.id))

  let winner: GeoAgent | null = null
  if (surviving.length === 1) {
    winner = surviving[0]
  } else if (surviving.length === 0) {
    winner = newAgents.reduce((m, a) => (a.resources + a.influence) > (m.resources + m.influence) ? a : m, newAgents[0])
  } else if (current.round >= current.maxRounds) {
    winner = surviving.reduce((m, a) => (a.resources + a.influence) > (m.resources + m.influence) ? a : m)
  }

  const next: GeoGameState = {
    agents: newAgents,
    eliminated: allEliminated,
    stability: newStability,
    round: current.round + 1,
    maxRounds: current.maxRounds,
    winner,
    log: [...current.log, ...eventLogs, ...actionLogs],
    activeEvents: current.activeEvents,
    completedEvents: current.completedEvents,
    scenario: current.scenario,
  }

  onUpdate(next)
  return next
}
