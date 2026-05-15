# Research Foundation

This project is an experiment in **multi-agent LLM development**. The architecture borrows from five papers that together cover role specialization, structured conversation, memory, and strategic negotiation. This document records what we adopt from each, and what we deliberately leave behind.

---

## 1. CAMEL — Communicative Agents for "Mind" Exploration

> Li, G., Hammoud, H., Itani, H., Khizbullin, D., & Ghanem, B. (2023). *CAMEL: Communicative Agents for "Mind" Exploration of Large Language Model Society.* NeurIPS 2023.
> arXiv: [2303.17760](https://arxiv.org/abs/2303.17760) · Code: [camel-ai/camel](https://github.com/camel-ai/camel)

### Core idea
Two role-playing agents (e.g. "Python programmer" + "stock trader") complete a task by holding a structured conversation guided by **inception prompts**. The roles aren't decoration — each agent only sees the slice of the world that fits its role, which forces specialization rather than diluted generalism.

### What we adopt
Inside each country we run a **council of four role agents** plus a Leader:

| Role | Sees | Outputs |
|---|---|---|
| Strategist | Long-term goals, victory conditions, current stability | 3–5 year strategic objectives |
| Economist | Resource vectors (production / consumption / stockpile), shortages | Resource needs, surplus to trade |
| Diplomat | Alliance graph, recent actions of others | Negotiation proposals |
| Intel | Threat map, military readiness of others | Threat ranking, vulnerability assessment |
| **Leader** | The four briefs above | Final `ACTION / TARGET / REASONING` |

Each sub-agent gets only the narrow context it needs. The Leader synthesizes.

### What we drop
CAMEL is two agents in *direct* conversation; we use one-shot briefs into a Leader rather than free-form dialogue between sub-agents. Cheaper and the failure modes are easier to reason about.

---

## 2. AutoGen — Multi-Agent Conversation Framework

> Wu, Q., Bansal, G., Zhang, J., et al. (2023). *AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation Framework.* Microsoft Research.
> arXiv: [2308.08155](https://arxiv.org/abs/2308.08155) · Code: [microsoft/autogen](https://github.com/microsoft/autogen)

### Core idea
Build LLM applications as a network of **conversable agents** with customizable roles. Agents can call tools, ask each other for help, and a controller routes messages. v0.4 moved to a fully event-driven async architecture.

### What we adopt
- **Async event-driven flow.** Council members run in `Promise.all` — they don't block each other. The Leader awaits all briefs before deciding.
- **Structured handoff.** Each sub-agent emits a typed brief (`StrategistBrief`, `EconomistBrief`, …) rather than free text. Easier to render and to validate.
- **Mixed model tiers.** Sub-agents use a cheaper model (Gemini Flash); only the Leader uses the main model. This is the explicit AutoGen pattern of "use the right model for the right job."

### What we drop
We don't use AutoGen's GroupChat / manager-routes-everything pattern. For a turn-based game, deterministic role order is simpler and reproducible.

---

## 3. Generative Agents — Interactive Simulacra of Human Behavior

> Park, J.S., O'Brien, J.C., Cai, C.J., Morris, M.R., Liang, P., & Bernstein, M.S. (2023). *Generative Agents: Interactive Simulacra of Human Behavior.* UIST 2023.
> arXiv: [2304.03442](https://arxiv.org/abs/2304.03442) · Code: [joonspk-research/generative_agents](https://github.com/joonspk-research/generative_agents)

### Core idea
Agents in a sandbox town store experiences in a **memory stream**, periodically **reflect** on them to produce higher-level beliefs ("John has been avoiding me lately"), and retrieve relevant memories when planning. Crowdworkers judged the agents' behavior as *more believable than humans pretending to be those agents*.

### What we adopt
Each country gets a **memory stream**:
- Raw entries: every action they took, every action taken against them
- **Reflection passes** every N rounds: compress the stream into beliefs ("Russia is implacable on Ukraine", "China honors trade deals reliably")
- The Leader retrieves the top-k most relevant reflections when deciding

This is the mechanism that lets agents hold grudges, notice patterns, and *learn* without retraining.

### What we drop
The full Generative Agents paper has a spatial/scheduling layer (the Sims-like town). We don't need that — our world is discrete rounds, not continuous time.

---

## 4. Cicero — Human-Level Diplomacy

> Bakhtin, A., Brown, N., Dinan, E., et al. (FAIR Diplomacy Team) (2022). *Human-Level Play in the Game of Diplomacy by Combining Language Models with Strategic Reasoning.* Science.
> Paper: [Science](https://www.science.org/doi/10.1126/science.ade9097) · [Meta blog](https://ai.meta.com/research/cicero/) · Code: [diplomacy_cicero](https://github.com/facebookresearch/diplomacy_cicero)

### Core idea
Cicero plays the board game **Diplomacy** at human level by combining a language model (for negotiation in natural language) with a **strategic reasoning module** (piKL — iterative policy improvement balancing dialogue consistency with expected value). It inferred other players' beliefs from chat and generated dialogue aligned with its plans. Across 40 anonymous online games it scored 2× the human average and finished top 10%.

### What we adopt
A **negotiation phase before each action round**:
1. Diplomats from all active countries simultaneously generate proposals (`offer X to Y in exchange for Z`)
2. Proposals route to the targeted country's Diplomat
3. Targeted Diplomat replies `accept / counter / reject` with reasoning
4. Accepted deals become binding commitments — broken commitments compound threat scores irreversibly (Grim Trigger from the existing rule set)

The "intentions inferred from dialogue" part lands as: a country's Intel agent reads the negotiation log and updates the threat map based on tone + commitments kept/broken.

### What we drop
piKL itself — we don't have a known-good strategy distribution to anchor against. Cicero learned this from human game data. We rely on the role prompts to produce reasonable strategies instead.

### Caveat documented in follow-up work
"More Victories, Less Cooperation: Assessing Cicero's Diplomacy Play" (Wongkamjan et al., ACL 2024, [paper](https://aclanthology.org/2024.acl-long.672.pdf)) found Cicero **wins more but cooperates less** than expected — its dialogue and actions don't always align. Worth keeping in mind: a multi-agent system can look like it's negotiating in good faith while its actions tell a different story. We expose the full council briefs in the UI partly to let the player *see* that gap.

---

## 5. Richelieu — Self-Evolving LLM-Based Diplomacy Agents

> Guan, Z., et al. (2024). *Richelieu: Self-Evolving LLM-Based Agents for AI Diplomacy.* NeurIPS 2024.
> Paper: [NeurIPS proceedings](https://proceedings.neurips.cc/paper_files/paper/2024/file/df2d62b96a4003203450cf89cd338bb7-Paper-Conference.pdf)

### Core idea
A pure-LLM Diplomacy agent (no trained policy network) that **self-evolves** — at end of each game it reviews its decisions, updates its strategic priors, and uses those updates in subsequent games. The closest published example of "LLMs doing strategy without a separate RL stack."

### What we adopt
At end of each game we run a **post-mortem pass** per country: the Leader reviews its own decision log and emits a small update to its `systemPrompt` ("I was too quick to sanction in early rounds — consider diplomacy first when threat < 5"). These updates accumulate across games for repeated runs of the same scenario.

### What we drop
Richelieu evolves over many games; we expose it as an opt-in flag so a single session stays deterministic by default.

---

## Architecture map (where each paper lands)

```
┌──────────────────────────── Per Country, Per Round ─────────────────────────────┐
│                                                                                 │
│   [Memory Stream] ──── reflect ───► [Reflections]   ◄── Generative Agents       │
│         ▲                                  │                                    │
│         │                                  ▼                                    │
│   ┌─────┴───────────────────────────────────────────────┐                       │
│   │  Strategist │ Economist │ Diplomat │ Intel          │ ◄── CAMEL roles       │
│   │  (Flash)    │ (Flash)   │ (Flash)  │ (Flash)        │ ◄── AutoGen tiering   │
│   └────────────────────────┬────────────────────────────┘                       │
│                            │ briefs (parallel Promise.all) ◄── AutoGen async    │
│                            ▼                                                    │
│                       ┌─────────┐                                               │
│                       │ Leader  │ ◄── main model                                │
│                       └────┬────┘                                               │
│                            │                                                    │
└────────────────────────────┼────────────────────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              │   Pre-action negotiation    │ ◄── Cicero
              │   (Diplomat ↔ Diplomat)     │
              └──────────────┬──────────────┘
                             ▼
                     [ ACTION / TARGET ]
                             │
                             ▼
                    [ Engine resolves ]
                             │
                  ┌──────────┴──────────┐
                  │ Post-game self-edit │ ◄── Richelieu (opt-in)
                  └─────────────────────┘
```

---

## Cost estimate

For a 6-country, 20-round game with full council:

| Layer | Calls per round | Model | Per-game total |
|---|---|---|---|
| Sub-agents (4 × 6 countries) | 24 | Flash | 480 |
| Negotiation (avg 1 round-trip per country) | 12 | Flash | 240 |
| Leader (1 × 6) | 6 | Sonnet/Gemini Pro | 120 |
| Reflection (every 5 rounds, 1 × 6) | 1.2 | Flash | 24 |

~840 Flash calls + ~120 Pro calls per game. At current pricing this is on the order of a few cents per game — cheap enough to iterate freely.
