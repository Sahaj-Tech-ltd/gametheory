import type { GeoAgent, GeoGameState, GeoLogEntry, GeoAction, WorldEvent, ScenarioConfig, ScenarioId, GeoAgentInit, Commodity, ResourceVector } from './geoTypes.ts'
import { GEO_ELIM_RESOURCES, ALL_COMMODITIES, stockpileScore, shortagesOf, zeroVector } from './geoTypes.ts'
import { RESOURCE_PROFILES, defaultFlow } from './geoResourceProfiles.ts'
import { runCouncilForAgent } from './council.ts'
import type { CouncilSession } from './council.ts'
import { runNegotiationPhase, applyDeals, composeDeltas } from './negotiation.ts'

// Which commodities each action category touches, and the magnitude.
// Negative = the target (or self) loses that much from stockpile.
// `mode` controls who the change applies to.
interface CommodityHit {
  commodity: Commodity
  amount: number  // negative = loss, positive = gain
  mode: 'self' | 'target' | 'both'
}

// Per-action commodity flows applied directly to stockpile.
// These run in addition to the scalar military/influence/stability deltas in ACTION_EFFECTS.
const ACTION_COMMODITY_FX: Record<GeoAction, CommodityHit[]> = {
  diplomacy:        [],
  sanction:         [{ commodity: 'capital', amount: -4, mode: 'target' }],
  'military-posture': [{ commodity: 'capital', amount: -2, mode: 'self' }],
  'cyber-attack':   [],  // resolved dynamically — success steals capital, failure is no-op
  'proxy-war':      [
    { commodity: 'capital', amount: -3, mode: 'self' },
    { commodity: 'manpower', amount: -3, mode: 'target' },
    { commodity: 'capital', amount: -3, mode: 'target' },
  ],
  strike:           [
    { commodity: 'capital', amount: -4, mode: 'self' },
    { commodity: 'manpower', amount: -5, mode: 'target' },
    { commodity: 'capital', amount: -5, mode: 'target' },
  ],
  deploy:           [{ commodity: 'capital', amount: -3, mode: 'self' }],
  'trade-deal':     [],  // resolved dynamically — exchange surplus commodities
  aid:              [],  // resolved dynamically — donor's biggest surplus → recipient's biggest shortage
  propaganda:       [],
}

// Map event types to the commodities they hit, with weights summing to 1.
// Event.resourceImpact gets distributed across these commodities.
const EVENT_COMMODITY_WEIGHTS: Record<string, Partial<ResourceVector>> = {
  'pandemic':        { manpower: 0.4, capital: 0.3, science: 0.15, food: 0.15 },
  'supply-crisis':   { science: 0.35, rareEarth: 0.3, capital: 0.2, oil: 0.15 },
  'trade-war':       { capital: 0.5, science: 0.2, food: 0.15, oil: 0.15 },
  'cyber-incident':  { capital: 0.5, science: 0.5 },
  'natural-disaster':{ water: 0.25, food: 0.25, manpower: 0.25, capital: 0.25 },
  'revolution':      { capital: 0.4, manpower: 0.3, food: 0.15, oil: 0.15 },
  'assassination':   { capital: 0.4, manpower: 0.3, science: 0.3 },
  'election':        { capital: 0.5, science: 0.5 },
  'treaty':          { capital: 0.4, oil: 0.2, gas: 0.2, food: 0.2 },
  'embargo':         { oil: 0.35, gas: 0.25, capital: 0.25, food: 0.15 },
}

const applyCommodityDelta = (stockpile: ResourceVector, commodity: Commodity, delta: number): ResourceVector => ({
  ...stockpile,
  [commodity]: stockpile[commodity] + delta,
})

// Distribute a scalar event impact across commodities according to event type weighting.
const distributeEventImpact = (stockpile: ResourceVector, eventType: string, impact: number): ResourceVector => {
  const weights = EVENT_COMMODITY_WEIGHTS[eventType] ?? { capital: 0.5, food: 0.25, manpower: 0.25 }
  const next = { ...stockpile }
  for (const [c, w] of Object.entries(weights) as [Commodity, number][]) {
    next[c] = next[c] + impact * w
  }
  return next
}

// Find the agent's largest surplus and largest deficit. Used for trade and aid resolution.
const surplusCommodity = (agent: GeoAgent): Commodity => {
  const net = ALL_COMMODITIES.map(c => ({
    c,
    score: agent.flow.stockpile[c] + (agent.flow.production[c] - agent.flow.consumption[c]) * 3,
  }))
  return net.sort((a, b) => b.score - a.score)[0].c
}

const deficitCommodity = (agent: GeoAgent): Commodity => {
  const net = ALL_COMMODITIES.map(c => ({
    c,
    score: agent.flow.stockpile[c] + (agent.flow.production[c] - agent.flow.consumption[c]) * 3,
  }))
  return net.sort((a, b) => a.score - b.score)[0].c
}

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

const MIDDLE_EAST_EVENTS: WorldEvent[] = [
  {
    id: 'october-7-attack',
    name: 'October 7 Attack',
    type: 'pandemic',
    description: 'Hamas launches a massive surprise attack on Israel. Thousands of rockets, armed infiltrators breach the border. Heavy Israeli casualties. Hostages taken into Gaza. Israel declares war.',
    targetNations: ['israel', 'hamas'],
    resourceImpact: -5,
    stabilityImpact: -15,
    militaryImpact: -3,
    influenceImpact: 0,
    triggerRound: 2,
    cascadeChance: 0.95,
    followUpEvents: ['gaza-siege'],
  },
  {
    id: 'gaza-siege',
    name: 'Siege of Gaza',
    type: 'supply-crisis',
    description: 'Israel imposes total siege on Gaza — no food, water, fuel, or electricity. Humanitarian crisis escalates. Global protests erupt. Pressure mounts on all regional actors.',
    targetRegions: ['Middle East'],
    targetNations: ['israel', 'hamas'],
    resourceImpact: -3,
    stabilityImpact: -5,
    militaryImpact: 0,
    influenceImpact: -2,
    cascadeChance: 0.85,
    followUpEvents: ['hezbollah-front'],
  },
  {
    id: 'hezbollah-front',
    name: 'Hezbollah Opens Northern Front',
    type: 'cyber-incident',
    description: 'Hezbollah begins daily rocket attacks on northern Israel from Lebanon. Israel deploys troops to the Lebanese border. A second front opens. Iran signals support.',
    targetNations: ['israel', 'hezbollah', 'iran'],
    resourceImpact: -3,
    stabilityImpact: -4,
    militaryImpact: -2,
    influenceImpact: 0,
    triggerRound: 6,
    cascadeChance: 0.8,
    followUpEvents: ['houthi-red-sea'],
  },
  {
    id: 'houthi-red-sea',
    name: 'Houthi Red Sea Disruptions',
    type: 'supply-crisis',
    description: 'Houthis attack cargo ships in the Red Sea. Global shipping reroutes around Africa. Insurance rates spike. Energy and goods prices surge worldwide. Saudi Arabia and UAE economies strained.',
    targetNations: ['saudi', 'uae', 'houthis'],
    resourceImpact: -3,
    stabilityImpact: -4,
    militaryImpact: 0,
    influenceImpact: 0,
    triggerRound: 8,
    cascadeChance: 0.85,
    followUpEvents: ['us-carrier'],
  },
  {
    id: 'us-carrier',
    name: 'US Carrier Strike Group Deployed',
    type: 'trade-war',
    description: 'The US deploys a carrier strike group to the Eastern Mediterranean and another to the Red Sea. Massive show of force aimed at deterring Iran and its proxies.',
    targetNations: ['usa', 'iran'],
    resourceImpact: -2,
    stabilityImpact: 2,
    militaryImpact: 3,
    influenceImpact: 2,
    triggerRound: 10,
    cascadeChance: 0.7,
    followUpEvents: ['iran-proxy-strikes'],
  },
  {
    id: 'iran-proxy-strikes',
    name: 'Iran-Backed Militias Strike US Bases',
    type: 'cyber-incident',
    description: 'Iranian-backed militias launch drone and rocket attacks on US bases in Iraq and Syria. American personnel wounded. Pentagon weighs response options.',
    targetNations: ['usa', 'iran'],
    resourceImpact: -2,
    stabilityImpact: -3,
    militaryImpact: -1,
    influenceImpact: 3,
    triggerRound: 12,
    cascadeChance: 0.8,
    followUpEvents: ['israel-iran-strike'],
  },
  {
    id: 'israel-iran-strike',
    name: 'Israeli Strike on Iranian Facilities',
    type: 'trade-war',
    description: 'Israel conducts precision strikes on Iranian military and nuclear-adjacent facilities. Iran vows retaliation. The shadow war erupts into the open.',
    targetNations: ['iran', 'israel'],
    resourceImpact: -8,
    stabilityImpact: -10,
    militaryImpact: -5,
    influenceImpact: -3,
    triggerRound: 15,
    cascadeChance: 0.9,
    followUpEvents: ['petrodollar-crisis'],
  },
  {
    id: 'petrodollar-crisis',
    name: 'Petrodollar Weakens',
    type: 'trade-war',
    description: 'Gulf states signal willingness to accept non-dollar payments for oil. Saudi Arabia flirts with Chinese yuan pricing. The petrodollar regime — backbone of US financial power — shows cracks.',
    targetNations: ['saudi', 'usa', 'china'],
    resourceImpact: -2,
    stabilityImpact: -3,
    militaryImpact: 0,
    influenceImpact: -3,
    triggerRound: 18,
    cascadeChance: 0.7,
    followUpEvents: ['gulf-drone-strikes'],
  },
  {
    id: 'gulf-drone-strikes',
    name: 'Drone Strikes on Gulf Energy Infrastructure',
    type: 'cyber-incident',
    description: 'Coordinated drone and missile strikes hit Saudi Aramco facilities and UAE desalination plants. Houthi claims responsibility. Oil production disrupted. Regional markets panic.',
    targetNations: ['saudi', 'uae', 'houthis'],
    resourceImpact: -8,
    stabilityImpact: -8,
    militaryImpact: -3,
    influenceImpact: -2,
    triggerRound: 20,
    cascadeChance: 0.6,
    followUpEvents: [],
    duration: 3,
  },
  {
    id: 'regional-war-or-ceasefire',
    name: 'Regional War or Ceasefire',
    type: 'revolution',
    description: 'The region reaches a tipping point. With stability cratering, either a fragile ceasefire takes hold or full regional war erupts drawing in all actors and their global patrons.',
    targetRegions: ['Middle East'],
    resourceImpact: -5,
    stabilityImpact: -5,
    militaryImpact: -4,
    influenceImpact: 0,
    triggerRound: 25,
    cascadeChance: 0.5,
    followUpEvents: [],
    duration: 4,
  },
  {
    id: 'new-middle-east-order',
    name: 'New Middle East Order',
    type: 'election',
    description: 'The dust settles on the most destructive Middle East conflict in decades. Alliances have shifted irreversibly. Iran\'s proxy network is degraded but not destroyed. Gulf states have hedged toward China. Israel is bloodied but standing. The US footprint in the region has shrunk. A new balance of power emerges.',
    targetRegions: ['Middle East'],
    resourceImpact: 0,
    stabilityImpact: -5,
    militaryImpact: 0,
    influenceImpact: 0,
    triggerRound: 30,
    cascadeChance: 0.3,
    followUpEvents: [],
    duration: 5,
  },
]

const WW1_EVENTS: WorldEvent[] = [
  {
    id: 'ww1-assassination',
    name: 'Assassination of Archduke Franz Ferdinand',
    type: 'assassination',
    description: 'Archduke Franz Ferdinand of Austria-Hungary and his wife are assassinated in Sarajevo by a Serbian nationalist. The powder keg of Europe is lit.',
    targetNations: ['austro-hungarian'],
    resourceImpact: 0,
    stabilityImpact: -5,
    militaryImpact: 0,
    influenceImpact: 0,
    triggerRound: 1,
    cascadeChance: 0.95,
    followUpEvents: ['ww1-ultimatum'],
  },
  {
    id: 'ww1-ultimatum',
    name: 'Austrian Ultimatum to Serbia',
    type: 'embargo',
    description: 'Austria-Hungary issues an unacceptable ultimatum to Serbia. Serbia agrees to most but not all terms. Austria prepares for war.',
    targetNations: ['austro-hungarian', 'russian-empire'],
    resourceImpact: -2,
    stabilityImpact: -5,
    militaryImpact: 2,
    influenceImpact: -2,
    triggerRound: 2,
    cascadeChance: 0.9,
    followUpEvents: ['ww1-russian-mobilization'],
  },
  {
    id: 'ww1-russian-mobilization',
    name: 'Russian Mobilization',
    type: 'trade-war',
    description: 'Russia begins full mobilization in defense of Serbia. The Tsar chooses Pan-Slavism over peace. Germany issues an ultimatum to Russia.',
    targetNations: ['russian-empire', 'german-empire'],
    resourceImpact: -3,
    stabilityImpact: -8,
    militaryImpact: 5,
    influenceImpact: -3,
    triggerRound: 3,
    cascadeChance: 0.95,
    followUpEvents: ['ww1-schlieffen'],
  },
  {
    id: 'ww1-schlieffen',
    name: 'Schlieffen Plan Activated',
    type: 'trade-war',
    description: 'Germany declares war on Russia and France. Implements the Schlieffen Plan — invading Belgium to bypass French defenses. Britain\'s guarantee of Belgian neutrality is tested.',
    targetNations: ['german-empire', 'french-republic', 'british-empire'],
    resourceImpact: -5,
    stabilityImpact: -10,
    militaryImpact: 5,
    influenceImpact: -3,
    triggerRound: 4,
    cascadeChance: 0.95,
    followUpEvents: ['ww1-britain-enters'],
  },
  {
    id: 'ww1-britain-enters',
    name: 'Britain Declares War',
    type: 'treaty',
    description: 'Britain declares war on Germany in defense of Belgian neutrality. The Royal Navy begins blockade of German ports. The full Triple Entente is now engaged.',
    targetNations: ['british-empire', 'german-empire'],
    resourceImpact: -3,
    stabilityImpact: -5,
    militaryImpact: 3,
    influenceImpact: 2,
    triggerRound: 5,
    cascadeChance: 0.85,
    followUpEvents: ['ww1-marne'],
  },
  {
    id: 'ww1-marne',
    name: 'Battle of the Marne',
    type: 'trade-war',
    description: 'French and British forces halt the German advance at the Marne River. The Schlieffen Plan fails. Trench warfare begins. Millions dig in for a war of attrition.',
    targetNations: ['german-empire', 'french-republic', 'british-empire'],
    resourceImpact: -5,
    stabilityImpact: -3,
    militaryImpact: -3,
    influenceImpact: 0,
    triggerRound: 6,
    cascadeChance: 0.8,
    followUpEvents: ['ww1-trench-stalemate'],
  },
  {
    id: 'ww1-trench-stalemate',
    name: 'Trench Warfare Stalemate',
    type: 'natural-disaster',
    description: 'The Western Front freezes into hundreds of miles of trenches. Machine guns, artillery, and barbed wire make offensive operations suicidal. Casualties mount with no territorial gain.',
    targetNations: ['german-empire', 'french-republic', 'british-empire'],
    resourceImpact: -4,
    stabilityImpact: -2,
    militaryImpact: -4,
    influenceImpact: -1,
    triggerRound: 8,
    cascadeChance: 0.7,
    followUpEvents: [],
    duration: 6,
  },
  {
    id: 'ww1-ottoman-enters',
    name: 'Ottoman Empire Enters the War',
    type: 'treaty',
    description: 'The Ottoman Empire joins the Central Powers. The Dardanelles are closed to Russian shipping. Winston Churchill plans the Gallipoli campaign.',
    targetNations: ['ottoman-empire', 'british-empire', 'russian-empire'],
    resourceImpact: -3,
    stabilityImpact: -4,
    militaryImpact: 2,
    influenceImpact: -2,
    triggerRound: 7,
    cascadeChance: 0.85,
    followUpEvents: [],
    duration: 5,
  },
  {
    id: 'ww1-italy-joins',
    name: 'Italy Joins the Entente',
    type: 'treaty',
    description: 'Italy defects from the Triple Alliance and declares war on Austria-Hungary, lured by promises of territorial gains. The secret Treaty of London is signed.',
    targetNations: ['italy', 'austro-hungarian'],
    resourceImpact: -2,
    stabilityImpact: -3,
    militaryImpact: 3,
    influenceImpact: 2,
    triggerRound: 10,
    cascadeChance: 0.8,
    followUpEvents: [],
    duration: 3,
  },
  {
    id: 'ww1-us-entry',
    name: 'United States Enters the War',
    type: 'election',
    description: 'After unrestricted German submarine warfare sinks American ships and the Zimmermann Telegram is exposed, the United States declares war on Germany. Fresh troops and industrial might shift the balance.',
    targetNations: ['united-states', 'german-empire'],
    resourceImpact: -5,
    stabilityImpact: 3,
    militaryImpact: 8,
    influenceImpact: 5,
    triggerRound: 15,
    cascadeChance: 0.9,
    followUpEvents: ['ww1-spring-offensive'],
  },
  {
    id: 'ww1-russian-revolution',
    name: 'Russian Revolution',
    type: 'revolution',
    description: 'The Bolsheviks seize power in Russia. Lenin signs the Treaty of Brest-Litovsk, withdrawing Russia from the war. Germany can now shift divisions to the Western Front.',
    targetNations: ['russian-empire', 'german-empire'],
    resourceImpact: -8,
    stabilityImpact: -8,
    militaryImpact: -5,
    influenceImpact: -5,
    triggerRound: 17,
    cascadeChance: 0.9,
    followUpEvents: ['ww1-spring-offensive'],
  },
  {
    id: 'ww1-spring-offensive',
    name: 'German Spring Offensive',
    type: 'trade-war',
    description: 'Germany launches its last great offensive on the Western Front with divisions freed from the Eastern Front. Initial gains are made but the offensive stalls against reinforced Allied lines.',
    targetNations: ['german-empire', 'french-republic', 'british-empire'],
    resourceImpact: -6,
    stabilityImpact: -5,
    militaryImpact: -6,
    influenceImpact: -2,
    triggerRound: 20,
    cascadeChance: 0.8,
    followUpEvents: ['ww1-hundred-days'],
  },
  {
    id: 'ww1-hundred-days',
    name: 'Hundred Days Offensive',
    type: 'trade-war',
    description: 'Allied forces, now reinforced by millions of American troops, launch a devastating counteroffensive. German lines collapse. The Hindenburg Line is broken.',
    targetNations: ['german-empire', 'british-empire', 'french-republic', 'united-states'],
    resourceImpact: -8,
    stabilityImpact: 5,
    militaryImpact: -5,
    influenceImpact: 3,
    triggerRound: 23,
    cascadeChance: 0.85,
    followUpEvents: ['ww1-armistice'],
  },
  {
    id: 'ww1-armistice',
    name: 'Armistice Signed',
    type: 'treaty',
    description: 'At the eleventh hour of the eleventh day of the eleventh month, the guns fall silent. The Great War is over. Empires lie in ruins. A new world begins.',
    targetNations: ['german-empire', 'british-empire', 'french-republic', 'united-states'],
    resourceImpact: 3,
    stabilityImpact: 10,
    militaryImpact: -2,
    influenceImpact: 2,
    triggerRound: 28,
    cascadeChance: 0.95,
    followUpEvents: [],
    duration: 3,
  },
]

const WW2_EVENTS: WorldEvent[] = [
  {
    id: 'ww2-rhineland',
    name: 'German Remilitarization of the Rhineland',
    type: 'trade-war',
    description: 'Hitler sends troops into the Rhineland, violating the Treaty of Versailles. France and Britain protest but take no action. The first test of Allied resolve — and it fails.',
    targetNations: ['nazi-germany', 'british-empire', 'vichy-france'],
    resourceImpact: -2,
    stabilityImpact: -3,
    militaryImpact: 2,
    influenceImpact: -1,
    triggerRound: 1,
    cascadeChance: 0.8,
    followUpEvents: ['ww2-anschluss'],
  },
  {
    id: 'ww2-anschluss',
    name: 'Anschluss and Czech Crisis',
    type: 'trade-war',
    description: 'Germany annexes Austria and demands the Sudetenland from Czechoslovakia. At Munich, Britain and France agree — appeasement at its peak. "Peace for our time."',
    targetNations: ['nazi-germany', 'british-empire'],
    resourceImpact: -1,
    stabilityImpact: -5,
    militaryImpact: 3,
    influenceImpact: -2,
    triggerRound: 3,
    cascadeChance: 0.85,
    followUpEvents: ['ww2-poland'],
  },
  {
    id: 'ww2-poland',
    name: 'Invasion of Poland',
    type: 'trade-war',
    description: 'German blitzkrieg overwhelms Poland in weeks. Britain and France declare war. The Soviet Union invades from the east. Poland is partitioned between two tyrannies.',
    targetNations: ['nazi-germany', 'british-empire', 'soviet-union'],
    resourceImpact: -4,
    stabilityImpact: -10,
    militaryImpact: 5,
    influenceImpact: -3,
    triggerRound: 5,
    cascadeChance: 0.95,
    followUpEvents: ['ww2-fall-france'],
  },
  {
    id: 'ww2-fall-france',
    name: 'Fall of France',
    type: 'supply-crisis',
    description: 'In six devastating weeks, German blitzkrieg sweeps through France. Paris falls. The French army — the largest in Europe — collapses. The Vichy regime is established.',
    targetNations: ['nazi-germany', 'vichy-france', 'british-empire'],
    resourceImpact: -8,
    stabilityImpact: -8,
    militaryImpact: -5,
    influenceImpact: -5,
    triggerRound: 8,
    cascadeChance: 0.9,
    followUpEvents: ['ww2-battle-britain'],
  },
  {
    id: 'ww2-battle-britain',
    name: 'Battle of Britain',
    type: 'trade-war',
    description: 'The Luftwaffe attempts to destroy the RAF and bomb Britain into submission. The Blitz devastates London. But the RAF holds. "Never in the field of human conflict was so much owed by so many to so few."',
    targetNations: ['nazi-germany', 'british-empire'],
    resourceImpact: -5,
    stabilityImpact: -3,
    militaryImpact: -3,
    influenceImpact: 3,
    triggerRound: 10,
    cascadeChance: 0.85,
    followUpEvents: [],
    duration: 4,
  },
  {
    id: 'ww2-barbarossa',
    name: 'Operation Barbarossa',
    type: 'trade-war',
    description: 'Germany launches the largest invasion in history against the Soviet Union — 3.8 million troops. Initial gains are enormous. Soviet losses are catastrophic. But the vastness of Russia swallows armies.',
    targetNations: ['nazi-germany', 'soviet-union'],
    resourceImpact: -6,
    stabilityImpact: -10,
    militaryImpact: -4,
    influenceImpact: -3,
    triggerRound: 12,
    cascadeChance: 0.95,
    followUpEvents: ['ww2-pearl-harbor', 'ww2-stalingrad'],
  },
  {
    id: 'ww2-pearl-harbor',
    name: 'Attack on Pearl Harbor',
    type: 'trade-war',
    description: 'Imperial Japan attacks the US Pacific Fleet at Pearl Harbor. America is thrust into the war. Hitler foolishly declares war on the United States. The full global conflict has begun.',
    targetNations: ['imperial-japan', 'united-states', 'nazi-germany'],
    resourceImpact: -6,
    stabilityImpact: -8,
    militaryImpact: 5,
    influenceImpact: 3,
    triggerRound: 14,
    cascadeChance: 0.95,
    followUpEvents: [],
    duration: 3,
  },
  {
    id: 'ww2-stalingrad',
    name: 'Battle of Stalingrad',
    type: 'trade-war',
    description: 'The turning point on the Eastern Front. The German 6th Army is encircled and destroyed in the ruins of Stalingrad. 800,000 Axis casualties. The Red Army begins its unstoppable westward advance.',
    targetNations: ['nazi-germany', 'soviet-union'],
    resourceImpact: -10,
    stabilityImpact: 3,
    militaryImpact: -8,
    influenceImpact: 5,
    triggerRound: 18,
    cascadeChance: 0.9,
    followUpEvents: ['ww2-dday'],
  },
  {
    id: 'ww2-dday',
    name: 'D-Day — Normandy Landings',
    type: 'trade-war',
    description: 'The largest amphibious invasion in history. 156,000 Allied troops storm the beaches of Normandy. The Western Front is opened. Germany now fights a hopeless two-front war.',
    targetNations: ['united-states', 'british-empire', 'nazi-germany'],
    resourceImpact: -5,
    stabilityImpact: 5,
    militaryImpact: -3,
    influenceImpact: 5,
    triggerRound: 23,
    cascadeChance: 0.9,
    followUpEvents: ['ww2-fall-berlin'],
  },
  {
    id: 'ww2-fall-berlin',
    name: 'Fall of Berlin',
    type: 'revolution',
    description: 'Soviet forces encircle Berlin. Hitler takes his own life. The Nazi regime crumbles. Europe lies in ruins. The war in Europe is over. The war in the Pacific continues.',
    targetNations: ['nazi-germany', 'soviet-union'],
    resourceImpact: -12,
    stabilityImpact: 8,
    militaryImpact: -8,
    influenceImpact: 5,
    triggerRound: 27,
    cascadeChance: 0.95,
    followUpEvents: [],
    duration: 3,
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
  'middle-east-escalation': {
    id: 'middle-east-escalation',
    name: 'Middle East Escalation',
    description: 'October 7 and its aftermath. Proxy wars ignite across the Middle East as Iran, Israel, and Gulf states collide.',
    maxRounds: 80,
    stabilityStart: 60,
    scriptedEvents: MIDDLE_EAST_EVENTS,
  },
  'ww1': {
    id: 'ww1',
    name: 'The Great War — 1914',
    description: 'Assassination in Sarajevo ignites the alliance chain. Empires clash in the war to end all wars. Can you rewrite history?',
    maxRounds: 35,
    stabilityStart: 55,
    scriptedEvents: WW1_EVENTS,
  },
  'ww2': {
    id: 'ww2',
    name: 'World War II — 1939',
    description: 'From the ashes of Versailles, Hitler rises. Blitzkrieg, total war, and the clash of ideologies reshape the world forever.',
    maxRounds: 35,
    stabilityStart: 50,
    scriptedEvents: WW2_EVENTS,
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
    agents: agents.map(a => {
      const flow = a.flow ?? RESOURCE_PROFILES[a.id] ?? defaultFlow()
      return {
        ...a,
        flow,
        shortages: shortagesOf(flow.stockpile),
        resources: stockpileScore(flow.stockpile),
        military: a.military,
        influence: a.influence,
        threatMap: Object.fromEntries(allIds.filter(id => id !== a.id).map(id => [id, a.threatMap[id] ?? 0])),
        lastAction: null,
        lastTarget: null,
        reasoning: '',
      }
    }),
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
    const nextStockpile = distributeEventImpact(agent.flow.stockpile, event.type, event.resourceImpact)
    const nextFlow = { ...agent.flow, stockpile: nextStockpile }
    return {
      ...agent,
      flow: nextFlow,
      shortages: shortagesOf(nextStockpile),
      resources: stockpileScore(nextStockpile),
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
  'sanction':       { selfInf: -1, stabDelta: -1, threatFromTarget: 2 },
  'military-posture': { targetMil: -2, stabDelta: -1, threatToObservers: 1, threatFromTarget: 2 },
  'cyber-attack':   { stabDelta: -1, threatToObservers: 2 },
  'proxy-war':      { targetMil: -2, stabDelta: -2, threatToObservers: 2 },
  'strike':         { targetMil: -8, stabDelta: -3, threatToObservers: 4, threatFromTarget: 3 },
  'deploy':         { selfInf: 1, stabDelta: 0, threatToObservers: 1 },
  'trade-deal':     { stabDelta: 1, threatToSelf: -1, threatFromTarget: -1 },
  'aid':            { selfInf: 2, stabDelta: 1, threatToSelf: -2 },
  'propaganda':     { selfInf: 2, targetInf: -1, stabDelta: 0, threatFromTarget: 1 },
}

// Apply per-action commodity hits and dynamic exchanges. Returns the per-agent
// stockpile delta map plus a human-readable outcome string for the action log.
const resolveCommodityEffects = (
  decision: { action: GeoAction; targetId: string | null },
  selfAgent: GeoAgent,
  target: GeoAgent | null,
  stockDelta: Record<string, ResourceVector>,
): string => {
  const { action } = decision

  // Apply the static commodity hits from ACTION_COMMODITY_FX.
  for (const hit of ACTION_COMMODITY_FX[action]) {
    if (hit.mode === 'self' || hit.mode === 'both') {
      stockDelta[selfAgent.id] = applyCommodityDelta(stockDelta[selfAgent.id], hit.commodity, hit.amount)
    }
    if ((hit.mode === 'target' || hit.mode === 'both') && target) {
      stockDelta[target.id] = applyCommodityDelta(stockDelta[target.id], hit.commodity, hit.amount)
    }
  }

  // Dynamic resolution for actions whose commodity depends on context.
  switch (action) {
    case 'cyber-attack':
      if (target && Math.random() < 0.6) {
        // Successful exfiltration of capital.
        stockDelta[target.id] = applyCommodityDelta(stockDelta[target.id], 'capital', -3)
        stockDelta[selfAgent.id] = applyCommodityDelta(stockDelta[selfAgent.id], 'capital', 3)
        return `cyber-attack on ${target.name} — SUCCESS (stole 3 capital)`
      }
      if (target) return `cyber-attack on ${target.name} — TRACED (threat +3)`
      return 'cyber-attack without target'

    case 'trade-deal': {
      if (!target) return 'trade deal without partner'
      // Each side ships its largest surplus to the other.
      const selfOffer = surplusCommodity(selfAgent)
      const targetOffer = surplusCommodity(target)
      stockDelta[selfAgent.id] = applyCommodityDelta(stockDelta[selfAgent.id], selfOffer, -3)
      stockDelta[selfAgent.id] = applyCommodityDelta(stockDelta[selfAgent.id], targetOffer, 3)
      stockDelta[target.id] = applyCommodityDelta(stockDelta[target.id], targetOffer, -3)
      stockDelta[target.id] = applyCommodityDelta(stockDelta[target.id], selfOffer, 3)
      return `trade deal with ${target.name} (traded ${selfOffer} ↔ ${targetOffer})`
    }

    case 'aid': {
      if (!target) return 'aid without recipient'
      // Donor sends from its surplus to recipient's biggest deficit.
      const need = deficitCommodity(target)
      const give = surplusCommodity(selfAgent)
      stockDelta[selfAgent.id] = applyCommodityDelta(stockDelta[selfAgent.id], give, -3)
      // The aid is converted to whatever the recipient needs most.
      stockDelta[target.id] = applyCommodityDelta(stockDelta[target.id], need, 4)
      return `aid to ${target.name} (sent ${give}, addressed their ${need} shortage)`
    }

    case 'strike':
      if (!target) return 'strike without target'
      if (target.nuclear && Math.random() < 0.15) {
        // Nuclear retaliation devastates both stockpiles.
        for (const c of ALL_COMMODITIES) {
          stockDelta[selfAgent.id] = applyCommodityDelta(stockDelta[selfAgent.id], c, -selfAgent.flow.stockpile[c] * 0.6)
          stockDelta[target.id] = applyCommodityDelta(stockDelta[target.id], c, -target.flow.stockpile[c] * 0.6)
        }
        return `⚔ STRIKE on ${target.name} — NUCLEAR RETALIATION! Both nations devastated.`
      }
      return `struck ${target.name} (commodity hits on capital and manpower)`

    case 'sanction':
      return target ? `sanctioned ${target.name} (−4 their capital)` : 'sanction without target'

    case 'military-posture':
      return target ? `postured military against ${target.name} (−2 their military readiness)` : 'military posture without target'

    case 'proxy-war':
      return target ? `waged proxy war against ${target.name} (−3 their manpower, −3 their capital, −3 your capital)` : 'proxy war without target'

    case 'deploy':
      return target ? `deployed forces to support ${target.name} (−3 your capital)` : 'deployment without target'

    case 'diplomacy':
      return `pursued diplomatic engagement${target ? ` with ${target.name}` : ''} (+2 influence)`

    case 'propaganda':
      return target ? `launched propaganda against ${target.name} (+2 influence, −1 theirs)` : 'propaganda campaign'

    default:
      return ''
  }
}

// Tick production - consumption into stockpile. Called once per round per active nation.
const tickFlow = (agent: GeoAgent): GeoAgent => {
  const nextStockpile = { ...zeroVector() }
  for (const c of ALL_COMMODITIES) {
    nextStockpile[c] = agent.flow.stockpile[c] + agent.flow.production[c] - agent.flow.consumption[c]
  }
  return {
    ...agent,
    flow: { ...agent.flow, stockpile: nextStockpile },
    shortages: shortagesOf(nextStockpile),
    resources: stockpileScore(nextStockpile),
  }
}

export const runGeoRound = async (
  state: GeoGameState,
  onUpdate: (s: GeoGameState) => void,
): Promise<GeoGameState> => {
  let current = { ...state, agents: state.agents.map(a => ({ ...a })) }

  const { state: afterEvents, newLogs: eventLogs } = processEvents(current)
  current = afterEvents

  const active = current.agents.filter(a => !current.eliminated.includes(a.id))

  // Cicero-style negotiation: every active Diplomat proposes once, targets reply,
  // accepted proposals (and accepted counters) become Deals that transfer commodities
  // immediately. See src/negotiation.ts and wiki/Research.md.
  const negotiation = await runNegotiationPhase(current)
  const negotiationDelta = applyDeals(current.agents, negotiation.deals)

  // CAMEL/AutoGen-style council: each nation runs Strategist + Economist + Intel
  // in parallel (Flash model), then the Leader (main model) synthesizes with the
  // negotiation outcome. See src/council.ts.
  const sessions = await Promise.all(
    active.map(async agent => {
      const proposalsMade = negotiation.proposals.filter(p => p.from === agent.id)
      const proposalsReceived = negotiation.proposals.filter(p => p.to === agent.id)
      const repliesGiven = negotiation.replies.filter(r => {
        const p = negotiation.proposals.find(pp => pp.from === r.proposalFrom)
        return p?.to === agent.id
      })
      const repliesReceived = negotiation.replies.filter(r => r.proposalFrom === agent.id)
      return runCouncilForAgent(agent, current, proposalsMade, proposalsReceived, repliesGiven, repliesReceived)
    }),
  )
  const councilSessions: Record<string, CouncilSession> = {}
  for (const s of sessions) councilSessions[s.agentId] = s

  const rawDecisions = sessions.map(s => ({
    agentId: s.agentId,
    decision: { action: s.decision.action, targetId: s.decision.targetId, reasoning: s.decision.reasoning },
  }))

  // Pre-seed stockDelta with negotiation transfers so actions and deals merge into one application.
  const stockDelta: Record<string, ResourceVector> = composeDeltas(
    negotiationDelta,
    Object.fromEntries(current.agents.map(a => [a.id, zeroVector()])),
  )
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

  // Log negotiation outcomes so the timeline shows the back-and-forth before actions.
  for (const proposal of negotiation.proposals) {
    const targetName = current.agents.find(a => a.id === proposal.to)?.name ?? proposal.to
    const reply = negotiation.replies.find(r => r.proposalFrom === proposal.from)
    const verdict = reply?.decision ?? 'no-reply'
    const verdictGlyph = verdict === 'accept' ? '✓' : verdict === 'counter' ? '⇄' : '✗'
    actionLogs.push({
      round: current.round,
      agentId: proposal.from,
      action: 'diplomacy',
      targetId: proposal.to,
      outcome: `🤝 ${verdictGlyph} proposed ${targetName}: ${proposal.qty} ${proposal.offer} ↔ ${proposal.qty} ${proposal.ask} → ${verdict.toUpperCase()}${reply?.reasoning ? ` ("${reply.reasoning}")` : ''}`,
      stabilityDelta: verdict === 'accept' ? 1 : 0,
    })
    // Cooperation signal: accepted deals reduce mutual threat; rejection nudges it up slightly.
    if (verdict === 'accept' || verdict === 'counter') {
      tDelta[proposal.from][proposal.to] = (tDelta[proposal.from][proposal.to] ?? 0) - 1
      tDelta[proposal.to][proposal.from] = (tDelta[proposal.to][proposal.from] ?? 0) - 1
      stabDelta += 1
    } else if (verdict === 'reject') {
      tDelta[proposal.from][proposal.to] = (tDelta[proposal.from][proposal.to] ?? 0) + 1
    }
  }

  for (const { agentId, decision } of rawDecisions) {
    const { action, targetId } = decision
    const selfAgent = current.agents.find(a => a.id === agentId)!
    const target = targetId ? current.agents.find(a => a.id === targetId) ?? null : null
    const obs = active.filter(a => a.id !== agentId)
    const fx = ACTION_EFFECTS[action]

    if (fx.selfMil) milDelta[agentId] += fx.selfMil
    if (fx.selfInf) infDelta[agentId] += fx.selfInf
    if (fx.stabDelta) stabDelta += fx.stabDelta

    if (target) {
      if (fx.targetMil) milDelta[target.id] += fx.targetMil
      if (fx.targetInf) infDelta[target.id] += fx.targetInf
      if (fx.threatFromTarget) tDelta[target.id][agentId] += fx.threatFromTarget
    }

    if (fx.threatToSelf && target) tDelta[agentId][target.id] += fx.threatToSelf
    if (fx.threatToObservers) obs.forEach(o => { tDelta[o.id][agentId] += fx.threatToObservers! })

    // Nuclear strike has an extra stability hit not encoded in the static table.
    if (action === 'strike' && target?.nuclear && Math.random() < 0.15) stabDelta -= 20

    const outcome = resolveCommodityEffects(decision, selfAgent, target, stockDelta)

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
  let newAgents: GeoAgent[] = current.agents.map(agent => {
    const newTM: Record<string, number> = { ...agent.threatMap }
    Object.entries(tDelta[agent.id] ?? {}).forEach(([id, d]) => {
      newTM[id] = Math.max(0, Math.min(10, (newTM[id] ?? 0) + d))
    })
    // Apply commodity deltas from this round's actions to stockpile.
    const stocked = { ...agent.flow.stockpile }
    const ad = stockDelta[agent.id] ?? zeroVector()
    for (const c of ALL_COMMODITIES) stocked[c] = stocked[c] + ad[c]
    const fd = rawDecisions.find(d => d.agentId === agent.id)
    return {
      ...agent,
      flow: { ...agent.flow, stockpile: stocked },
      shortages: shortagesOf(stocked),
      resources: stockpileScore(stocked),
      military: Math.max(0, agent.military + milDelta[agent.id]),
      influence: Math.max(0, agent.influence + infDelta[agent.id]),
      threatMap: newTM,
      lastAction: fd?.decision.action ?? agent.lastAction,
      lastTarget: fd?.decision.targetId ?? agent.lastTarget,
      reasoning: fd?.decision.reasoning ?? agent.reasoning,
    }
  })

  // Run per-round production - consumption tick on all non-eliminated nations.
  newAgents = newAgents.map(a => current.eliminated.includes(a.id) ? a : tickFlow(a))

  // Stability extremes hit capital (the most fungible resource).
  if (newStability <= 10) {
    newAgents = newAgents.map(a => {
      if (current.eliminated.includes(a.id)) return a
      const stocked = applyCommodityDelta(a.flow.stockpile, 'capital', -6)
      return {
        ...a,
        flow: { ...a.flow, stockpile: stocked },
        shortages: shortagesOf(stocked),
        resources: stockpileScore(stocked),
      }
    })
    newStability = Math.max(10, newStability + 5)
    actionLogs.push({
      round: current.round,
      agentId: '_event_',
      action: 'event',
      targetId: null,
      outcome: '⚠ GLOBAL CRISIS — stability collapse. All nations lose capital reserves.',
      stabilityDelta: -5,
    })
  } else if (newStability >= 95) {
    newAgents = newAgents.map(a => {
      if (current.eliminated.includes(a.id)) return a
      const stocked = applyCommodityDelta(a.flow.stockpile, 'capital', 4)
      return {
        ...a,
        flow: { ...a.flow, stockpile: stocked },
        shortages: shortagesOf(stocked),
        resources: stockpileScore(stocked),
      }
    })
    actionLogs.push({
      round: current.round,
      agentId: '_event_',
      action: 'event',
      targetId: null,
      outcome: '☮ GLOBAL PROSPERITY — stability peak. Capital reserves grow.',
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
    councilSessions,
    lastNegotiation: negotiation,
  }

  onUpdate(next)
  return next
}
