// Cicero-inspired negotiation phase. See wiki/Research.md.
//
// Before each action round, every active nation's Diplomat proposes ONE deal
// (or NO_PROPOSAL). Targeted nations' Diplomats reply with accept/reject/counter.
// Accepted proposals (and accepted counters) become Deals that transfer commodities
// between stockpiles immediately, before the Leader phase.
//
// Why immediate execution: keeps Phase B scope bounded. A future iteration can
// add multi-round commitments and Grim Trigger penalties for broken deals.

import type { GeoAgent, GeoGameState, Commodity, ResourceVector } from './geoTypes.ts'
import { ALL_COMMODITIES, zeroVector } from './geoTypes.ts'
import { runDiplomatPropose, runDiplomatReply } from './council.ts'
import type { DiplomatProposal, DiplomatReply } from './council.ts'

export interface Deal {
  from: string
  to: string
  fromGives: Commodity  // commodity flowing from->to
  toGives: Commodity    // commodity flowing to->from
  qty: number
  origin: 'accept' | 'counter-accept'
}

export interface NegotiationRecord {
  round: number
  proposals: DiplomatProposal[]
  replies: DiplomatReply[]
  deals: Deal[]
}

export const runNegotiationPhase = async (state: GeoGameState): Promise<NegotiationRecord> => {
  const active = state.agents.filter(a => !state.eliminated.includes(a.id))

  // Phase 1 — every active Diplomat generates at most one outgoing proposal.
  const proposalResults = await Promise.all(
    active.map(async agent => ({
      agentId: agent.id,
      proposal: await runDiplomatPropose(agent, state),
    })),
  )
  const proposals: DiplomatProposal[] = proposalResults
    .map(r => r.proposal)
    .filter((p): p is DiplomatProposal => p !== null)

  // Phase 2 — each targeted nation replies to incoming proposals in parallel.
  // If a nation gets multiple proposals, it replies to each (one Flash call per).
  const replyTasks: { proposal: DiplomatProposal; promise: Promise<DiplomatReply> }[] = []
  for (const proposal of proposals) {
    const replier = active.find(a => a.id === proposal.to)
    if (!replier) continue
    replyTasks.push({
      proposal,
      promise: runDiplomatReply(replier, proposal, state),
    })
  }
  const replies = await Promise.all(replyTasks.map(t => t.promise))

  // Convert accepted proposals (and accepted counters) into Deals.
  const deals: Deal[] = []
  for (let i = 0; i < replyTasks.length; i++) {
    const proposal = replyTasks[i].proposal
    const reply = replies[i]
    if (reply.decision === 'accept') {
      deals.push({
        from: proposal.from,
        to: proposal.to,
        fromGives: proposal.offer,
        toGives: proposal.ask,
        qty: proposal.qty,
        origin: 'accept',
      })
    } else if (reply.decision === 'counter' && reply.counterOffer && reply.counterAsk && reply.counterQty) {
      // Counter-offers auto-accept in v1 — too expensive to do another round trip.
      // The original proposer's Diplomat brief said what they value, so this is a
      // reasonable approximation of "would they take the counter."
      deals.push({
        from: proposal.to,             // counter flips perspective
        to: proposal.from,
        fromGives: reply.counterOffer,
        toGives: reply.counterAsk,
        qty: reply.counterQty,
        origin: 'counter-accept',
      })
    }
  }

  return { round: state.round, proposals, replies, deals }
}

// Apply deals to agent stockpiles. Returns the per-agent commodity delta.
// Each deal transfers `qty` of `fromGives` from `from` → `to`, and `qty` of `toGives`
// the other way. Diplomatic byproduct: alliances strengthen on accepted deals (handled
// in the engine, not here).
export const applyDeals = (
  agents: GeoAgent[],
  deals: Deal[],
): Record<string, ResourceVector> => {
  const delta: Record<string, ResourceVector> = Object.fromEntries(
    agents.map(a => [a.id, zeroVector()]),
  )

  for (const deal of deals) {
    if (!delta[deal.from] || !delta[deal.to]) continue
    delta[deal.from][deal.fromGives] -= deal.qty
    delta[deal.to][deal.fromGives] += deal.qty
    delta[deal.to][deal.toGives] -= deal.qty
    delta[deal.from][deal.toGives] += deal.qty
  }

  return delta
}

// Compose two commodity delta maps. Used by engine to merge negotiation transfers
// with action-driven commodity hits before applying to stockpile.
export const composeDeltas = (
  a: Record<string, ResourceVector>,
  b: Record<string, ResourceVector>,
): Record<string, ResourceVector> => {
  const out: Record<string, ResourceVector> = {}
  const allIds = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const id of allIds) {
    const va = a[id] ?? zeroVector()
    const vb = b[id] ?? zeroVector()
    const merged = zeroVector()
    for (const c of ALL_COMMODITIES) merged[c] = va[c] + vb[c]
    out[id] = merged
  }
  return out
}
