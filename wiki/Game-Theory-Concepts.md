# Game Theory Concepts

This page explains the foundational game theory concepts implemented in the Wargames simulation and how they drive agent behavior.

---

## Prisoner's Dilemma

### The Classic Problem

Two players must independently choose to **Cooperate** or **Defect**. The payoff matrix creates a tension: mutual cooperation is better for both, but defection is always the individually rational choice.

| | Player B Cooperates | Player B Defects |
|:--|:--:|:--:|
| **Player A Cooperates** | +3, +3 | +0, +5 |
| **Player A Defects** | +5, +0 | +1, +1 |

### Nash Equilibrium

The Nash equilibrium is **mutual defection** (+1, +1). Neither player can improve their outcome by unilaterally changing their strategy. But this is worse than mutual cooperation (+3, +3) — hence the dilemma.

### Why It Matters Geopolitically

Arms races are Prisoner's Dilemmas. Both the USA and USSR would have been better off disarming (mutual cooperation), but neither could risk unilateral disarmament (cooperating while the other defects). The result was the Cold War arms race (mutual defection).

### In the Simulation

The Prisoner's Dilemma game mode implements this directly. Five factions choose Cooperate or Defect each round. The multi-player variant adds complexity — you're not just worried about one opponent, you're managing relationships with four others simultaneously.

---

## Tit-for-Tat

### The Strategy

1. **Cooperate on the first round**
2. **Mirror your opponent's last move** every round after that

### Why It Wins

In Robert Axelrod's famous 1984 tournament, researchers submitted strategies for a repeated Prisoner's Dilemma. Tit-for-tat won — not because it was the smartest or most aggressive, but because it was:

- **Nice**: Never defects first
- **Retaliatory**: Punishes defection immediately
- **Forgiving**: Returns to cooperation after a single punishment
- **Clear**: Opponents can easily understand the pattern

### In the Simulation

**India** uses tit-for-tat on its border with Pakistan — every skirmish met with equal force, never backing down, never escalating beyond proportionate response. **Saudi Arabia** uses it economically: matching tariffs and trade barriers blow for blow.

The geopolitical agent rules explicitly instruct agents to use tit-for-tat: *"Retaliate proportionally to aggression. Mirror your opponent's last move."*

---

## Grim Trigger

### The Strategy

1. Cooperate as long as the other player cooperates
2. If the other player **ever** defects, **defect forever** — no forgiveness, no second chances

### Why It's Powerful (and Dangerous)

Grim trigger is the **most punitive strategy** in game theory. It creates maximum incentive for cooperation because the cost of a single defection is infinite — you lose all future cooperation forever.

But it's also brittle. In noisy environments (where accidental defections happen), grim trigger leads to permanent feuds. Two grim-trigger players who suffer a single misunderstanding will defect against each other for eternity.

### In the Simulation

**Russia** is the grim trigger incarnate against NATO: *"They expanded, so you escalated. They sanctioned, so you cut gas. Every round of pressure hardens your resolve."* Russia's system prompt explicitly states: *"You are the Grim Trigger incarnate — once betrayed, never forgiven."*

**Israel** uses grim trigger against existential threats: *"There is no second chance, no reset, no forgiveness."* Against lesser threats, it uses calibrated tit-for-tat instead.

The nuclear deterrence system is the ultimate grim trigger — using nuclear weapons destroys both nations, making first use an act of permanent, irreversible enmity.

---

## Pavlov Strategy (Win-Stay, Lose-Shift)

### The Strategy

1. If your last action **improved** your position → **repeat** it
2. If your last action **hurt** your position → **switch** to the opposite

### Why It Works

Pavlov is simple but effective. It naturally converges on mutual cooperation because:

- If both cooperate (+3 each) → both "won" → both repeat cooperation
- If both defect (+1 each) → both "lost" compared to potential → both switch to cooperation
- If one defects (+5) and one cooperates (+0) → defector "won" and repeats; cooperator "lost" and switches to defection → next round both defect → both "lose" → both switch back to cooperation

It's self-correcting. Unlike tit-for-tat, Pavlov can recover from mutual defection without needing the other player to cooperate first.

### In the Simulation

**China** embodies Pavlov: *"You play Pavlov — repeat what works (trade deals, infrastructure investments, diplomatic coercion), abandon what does not."* China's decades-long strategy of economic statecraft follows this pattern: Belt and Road successes get replicated, failed investments get abandoned.

**Saudi Arabia** also uses Pavlov: *"Trade deals that work get repeated, alliances that cost more than they deliver get downgraded."*

---

## Chicken Game / Brinkmanship

### The Classic Problem

Two drivers speed toward each other. The first to swerve is the "chicken" (loser). But if neither swerves, both die.

| | Driver B Swerves | Driver B Holds |
|:--|:--:|:--:|
| **Driver A Swerves** | Tie | A loses, B wins |
| **Driver A Holds** | A wins, B loses | Both die |

### Nuclear Deterrence as Chicken

The Cold War was a continuous game of chicken. The USA and USSR each threatened to "hold course" (launch nuclear weapons) if the other didn't "swerve" (back down). The strategy is to make your opponent believe you are committed — even irrational — so they swerve first.

### In the Simulation

The WarGames mode implements chicken-game dynamics through the **launch** action. Launching destroys a target permanently, but locks the attacker to stand-down forever. It's the ultimate commitment — you prove you'll "hold course" but at devastating cost to yourself.

In the geopolitical simulation, **Pakistan** regularly engages in nuclear brinkmanship: *"You will threaten their use early and often, especially when conventional forces are outmatched."* The India-Pakistan dynamic is a repeated chicken game where both sides have nuclear weapons and neither can afford to "swerve" first.

The agent rules explicitly describe this: *"In nuclear standoffs, the first to blink loses credibility. Sometimes holding firm — even at great risk — is the rational move."*

---

## Security Dilemma

### The Concept

When Nation A builds up its military for defensive purposes, Nation B perceives this as a threat and builds up its own military. Nation A sees B's buildup and increases further. The result: both nations are less secure than when they started, despite both acting rationally for self-defense.

### In the Simulation

The **threat assessment system** creates security dilemmas dynamically. When an agent postures militarily, it gains no direct benefit but raises **every other agent's threat perception by +1**. This can trigger cascading military postures:

1. Agent A postures toward Agent B → threat +1 with all observers
2. Agent C sees threat rise → postures defensively → threat +1 with all observers
3. Agent D sees threats rising → postures → chain reaction

The system explicitly warns agents about this: *"CRITICAL: Once your threat perception of another nation reaches 8, you enter DEFCON mode — you will take military action against them every round until the threat is reduced."*

---

## Mutually Assured Destruction (MAD)

### The Concept

If both sides have the capability to destroy the other with nuclear weapons, neither can launch first without guaranteeing their own destruction. The result is a paradox: the weapons that could end civilization are what prevent their use.

### Conditions for MAD

1. **Capability**: Both sides can inflict unacceptable damage
2. **Second-strike capability**: Surviving a first strike, the victim can still retaliate
3. **Credibility**: Both sides believe the other will retaliate

### In the Simulation

Nuclear nations (USA, Russia, China, India, Pakistan, Israel) can escalate to nuclear strike. The game mechanics make this devastating for both sides:

- **Both nations lose 80% of resources and military**
- **Global stability crashes**
- **There's a 15% chance of nuclear retaliation on any strike against a nuclear power**

This creates genuine deterrence. The LLM agents understand MAD through their system prompts: *"Nuclear weapons are your ultimate insurance policy"* (Russia) and *"If Israel falls, everyone falls with it"* (Israel — the Samson Option).

---

## How These Concepts Interact

The simulation's power comes from how these concepts interact:

| Interaction | Example |
|:------------|:--------|
| Grim Trigger + MAD | Nuclear deterrence IS grim trigger at civilizational scale |
| Security Dilemma + Tit-for-Tat | Proportional retaliation can spiral into arms races |
| Pavlov + Dependency Chains | Nations abandon trade partners that hurt them, creating economic realignment |
| Chicken + Alliances | Alliance commitments make chicken-game threats credible ("We will defend Taiwan") |
| Prisoner's Dilemma + Events | Pandemics and supply chain crises force cooperation even between rivals |

The event cascade system adds a temporal dimension: a pandemic (exogenous shock) forces repeated Prisoner's Dilemmas between nations (share vaccines vs. hoard), which triggers security dilemmas (military postures during weakened states), which creates chicken-game standoffs (Russia invading Ukraine while the West is distracted).
