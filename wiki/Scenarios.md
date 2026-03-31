# Scenarios

Detailed breakdown of each scenario — the historical events they model, the scripted event chains, cascading effects, and the game theory lessons each teaches.

---

## Free Play

| Property | Value |
|:---------|:------|
| **Rounds** | 100 |
| **Starting Stability** | 75 |
| **Agents** | 10 core geopolitical nations |
| **Scripted Events** | None |

### Overview

No scripted events. Pure geopolitical competition between 10 nations. Random events (cyber attacks, trade wars, arms treaties) may occur based on global stability — lower stability increases random event frequency.

### Game Theory Lessons

Free Play is the control scenario. Watch how agents behave without external shocks — do alliances hold? Does trade prevent war? Does nuclear deterrence work? Compare Free Play outcomes with scripted scenarios to see how exogenous events reshape the geopolitical landscape.

---

## COVID Cascade

| Property | Value |
|:---------|:------|
| **Rounds** | 100 |
| **Starting Stability** | 85 |
| **Agents** | 10 core geopolitical nations |
| **Scripted Events** | 13 |

### Overview

Models the period from pre-COVID stability (2019) through the pandemic, supply chain collapse, and the resulting geopolitical tensions (Russia-Ukraine, China-Taiwan flashpoints). The scenario asks: how did we get from a relatively stable world to the brink of nuclear war?

### Event Chain

```
Round 5:  Novel Virus Detected (Wuhan)
  ↓ cascade (90%)
Round 8:  WHO Declares Pandemic
  ↓ splits into two chains
  ├── Global Lockdowns → Vaccine Race → Post-COVID Tensions
  └── Supply Chain Collapse → Chip Crisis + Energy Crisis

Round 14: Vaccine Rollout Begins
  ↓
Round 18: Post-COVID Geopolitical Tensions (Russia masses troops, China flies sorties)
  ↓ splits into two chains
  ├── Russia Invades Ukraine → Sanctions Blitz + Energy Weaponization
  └── Taiwan Strait Crisis

Round 35: New World Order (multipolar, unstable, petrodollar weakens)
```

### Key Events in Detail

| Round | Event | Stability Impact | Description |
|:-----:|:------|:----------------:|:------------|
| 5 | Novel Virus Detected | -3 | Markets dip slightly |
| 8 | WHO Declares Pandemic | -10 | Borders close, markets crash |
| 8 | Global Lockdowns | -5 | Economic activity plummets |
| 10 | Supply Chain Collapse | -4 | Semiconductor shortage, energy prices spike |
| 14 | Vaccine Rollout | +4 | High-resource nations recover faster |
| 18 | Post-COVID Tensions | -8 | Russia masses troops, China flies sorties |
| 18 | Energy Crisis | -4 | Oil hits $120/barrel |
| 22 | Russia Invades Ukraine | -10 | Largest land war in Europe since 1945 |
| 22 | Sanctions Blitz | -3 | SWIFT ban, asset freezes |
| 22 | Energy Weaponization | -5 | Nord Stream shuts down |
| 25 | Taiwan Strait Crisis | -8 | Blockade exercises, US carrier group |
| 35 | New World Order | -5 | Multipolar, unstable, petrodollar weakens |

### Game Theory Lessons

- **Exogenous shocks amplify Prisoner's Dilemmas**: The pandemic forced nations to choose between cooperation (sharing medical supplies, coordinating responses) and defection (hoarding, blame-shifting)
- **Security dilemmas during crisis**: Weakened states postured militarily, triggering cascading threat perceptions
- **Event cascades model real contagion**: A virus → supply chain collapse → chip crisis → energy crisis → geopolitical tension demonstrates how interconnected systems propagate shocks

---

## China-Taiwan Flashpoint

| Property | Value |
|:---------|:------|
| **Rounds** | 80 |
| **Starting Stability** | 70 |
| **Agents** | 10 core geopolitical nations |
| **Scripted Events** | 5 |

### Overview

Models rising cross-strait tensions between China and Taiwan. China increases military pressure, the US responds with naval deployments, and the global semiconductor supply chain hangs in the balance.

### Event Chain

```
Round 2:  Rising Cross-Strait Tensions
  ↓ cascade (80%)
Round 5:  Chinese Naval Buildup
  ↓ cascade (85%)
Round 8:  Chinese Blockade Announcement ("quarantine zone")
  ↓ splits into two chains
  ├── US Carrier Group Deployed
  └── Global Chip Shortage Catastrophe (TSMC output -70%)
```

### Key Events in Detail

| Round | Event | Stability Impact | Description |
|:-----:|:------|:----------------:|:------------|
| 2 | Rising Cross-Strait Tensions | -3 | China increases military flights |
| 5 | Chinese Naval Buildup | -5 | Massive naval deployment near Taiwan |
| 8 | Blockade Announcement | -10 | "Quarantine zone" — all shipping must submit |
| 8 | US Carrier Group Deployed | -2 | Two carrier groups to Western Pacific |
| 8 | Chip Shortage Catastrophe | -8 | TSMC output drops 70%, global recession |

### Game Theory Lessons

- **Chicken game at civilizational scale**: China and the US are playing chicken over Taiwan. Neither wants war but neither can afford to "swerve" first
- **Dependency chains as weapons**: Taiwan's semiconductor monopoly is both shield and noose — destroying the fabs is a credible threat
- **Economic interdependence prevents war**: The chip crisis hurts China too, creating mutual deterrence beyond nuclear weapons

---

## Water Wars

| Property | Value |
|:---------|:------|
| **Rounds** | 80 |
| **Starting Stability** | 65 |
| **Agents** | 10 core geopolitical nations |
| **Scripted Events** | 2 |

### Overview

Climate-driven water scarcity ignites conflict between nuclear-armed India and Pakistan. The Indus Water Treaty — a rare example of cooperation between bitter rivals — collapses under the strain of mega-drought.

### Event Chain

```
Round 3:  Mega-Drought Hits South Asia
  ↓ cascade (85%)
Round 8:  Indus Water Treaty Collapses
           India announces upstream dam construction
           Pakistan calls it an act of war
           Nuclear tensions spike
```

### Game Theory Lessons

- **Resource scarcity transforms cooperation into conflict**: The Indus Water Treaty survived wars and crises, but existential resource scarcity can override even the most durable cooperation
- **Nuclear chicken with higher stakes**: India and Pakistan have fought four wars. Water wars add existential stakes to an already volatile relationship
- **Climate as threat multiplier**: The initial shock is natural, but the escalation is purely game-theoretic — each side acts rationally given the other's actions

---

## Oil Wars

| Property | Value |
|:---------|:------|
| **Rounds** | 80 |
| **Starting Stability** | 70 |
| **Agents** | 10 core geopolitical nations |
| **Scripted Events** | 3 |

### Overview

Iran-backed forces disrupt shipping through the Strait of Hormuz — the chokepoint for 20% of global oil supply. Oil prices spike to $200/barrel. The petrodollar dominance is questioned. Energy-dependent nations scramble.

### Event Chain

```
Round 3:  Strait of Hormuz Blockage
  ↓ splits into two chains
  ├── Oil Hits $200/barrel (duration: 6 rounds)
  └── US Military Escort Operation (duration: 5 rounds)
```

### Game Theory Lessons

- **Chokepoints as leverage**: Iran's asymmetric strategy leverages geography — it doesn't need a navy to disrupt global oil, just drones and mines
- **Petrodollar fragility**: Oil priced in dollars is the foundation of US financial power. Threatening the Strait threatens the entire system
- **Escalation vs. restraint**: The US must choose between military confrontation (risking wider war) and economic pain (letting Iran coerce)

---

## Middle East Escalation

| Property | Value |
|:---------|:------|
| **Rounds** | 80 |
| **Starting Stability** | 60 |
| **Agents** | 14 nations (10 core + Hamas, Hezbollah, Houthis, UAE) |
| **Scripted Events** | 11 |

### Overview

Models the October 7 Hamas attack on Israel and its cascading aftermath: Gaza siege, Hezbollah's northern front, Houthi Red Sea disruptions, US carrier deployments, Israeli strikes on Iran, petrodollar weakening, and the emergence of a new Middle East order.

### Event Chain

```
Round 2:  October 7 Attack
  ↓ cascade (95%)
Round 2:  Siege of Gaza
  ↓ cascade (85%)
Round 6:  Hezbollah Opens Northern Front
  ↓ cascade (80%)
Round 8:  Houthi Red Sea Disruptions
  ↓ cascade (85%)
Round 10: US Carrier Strike Group Deployed
  ↓ cascade (70%)
Round 12: Iran-Backed Militias Strike US Bases
  ↓ cascade (80%)
Round 15: Israeli Strike on Iranian Facilities
  ↓ cascade (90%)
Round 18: Petrodollar Weakens (Gulf states accept non-dollar payments)
  ↓ cascade (70%)
Round 20: Drone Strikes on Gulf Energy Infrastructure
  ↓ cascade (60%)
Round 25: Regional War or Ceasefire (tipping point)
  ↓
Round 30: New Middle East Order
```

### Key Events in Detail

| Round | Event | Stability Impact | Description |
|:-----:|:------|:----------------:|:------------|
| 2 | October 7 Attack | -15 | Surprise attack, heavy casualties, hostages |
| 2 | Siege of Gaza | -5 | Total siege — no food, water, fuel |
| 6 | Hezbollah Northern Front | -4 | Daily rocket attacks, second front opens |
| 8 | Houthi Red Sea Disruptions | -4 | Cargo ships attacked, global shipping reroutes |
| 10 | US Carrier Deployed | +2 | Massive show of force |
| 12 | Militias Strike US Bases | -3 | Drone attacks on Iraq/Syria bases |
| 15 | Israeli Strike on Iran | -10 | Shadow war erupts into the open |
| 18 | Petrodollar Weakens | -3 | Gulf states accept yuan payments |
| 20 | Gulf Drone Strikes | -8 | Aramco + UAE desalination plants hit |
| 25 | War or Ceasefire | -5 | Regional tipping point |
| 30 | New Middle East Order | -5 | New balance of power emerges |

### Game Theory Lessons

- **Proxy warfare as repeated Prisoner's Dilemma**: Iran uses proxies to create plausible deniability — each proxy attack is a "defection" that Iran can technically disavow
- **Grim trigger escalation**: Israel's preemptive doctrine means every perceived threat triggers disproportionate response, which triggers more threats
- **Alliance chains**: US defends Israel → militias attack US → US strikes militias → Iran escalates → Israel strikes Iran → Gulf states hedge toward China → petrodollar weakens
- **The tipping point**: Round 25's "War or Ceasefire" event is a genuine branch point — the simulation can go either way based on accumulated agent decisions

---

## WW1 — The Great War (1914)

| Property | Value |
|:---------|:------|
| **Rounds** | 35 |
| **Starting Stability** | 55 |
| **Agents** | 8 historical empires |
| **Scripted Events** | 14 |

### Historical Agents

| Agent | Personality | Resources | Military |
|:------|:------------|:---------:|:--------:|
| British Empire | Naval Hegemon | 90 | 90 |
| German Empire | Rising Aggressor | 85 | 95 |
| French Republic | Revanchist Defender | 70 | 80 |
| Russian Empire | Slavic Giant | 75 | 75 |
| Austro-Hungarian Empire | Declining Multi-Ethnic Empire | 65 | 65 |
| Ottoman Empire | Sick Man of Europe | 50 | 55 |
| United States | Reluctant Power | 95 | 50 |
| Italy | Opportunistic Defector | 55 | 60 |

### Event Chain

```
Round 1:  Assassination of Archduke Franz Ferdinand
  ↓ (95%)
Round 2:  Austrian Ultimatum to Serbia
  ↓ (90%)
Round 3:  Russian Mobilization
  ↓ (95%)
Round 4:  Schlieffen Plan Activated
  ↓ (95%)
Round 5:  Britain Declares War
  ↓ (85%)
Round 6:  Battle of the Marne (Schlieffen Plan fails)
  ↓ (80%)
Round 7:  Ottoman Empire Enters the War
Round 8:  Trench Warfare Stalemate (duration: 6 rounds)
Round 10: Italy Joins the Entente (defects from Triple Alliance!)
Round 15: United States Enters the War
Round 17: Russian Revolution (Russia exits!)
  ↓ (90%)
Round 20: German Spring Offensive (last gamble)
  ↓ (80%)
Round 23: Hundred Days Offensive (Allied counteroffensive)
  ↓ (85%)
Round 28: Armistice Signed
```

### Game Theory Lessons

- **Alliance chains as cascade mechanisms**: One assassination triggered five alliance activations in five rounds — a masterclass in how alliance commitments can turn a regional crisis into global war
- **Italy's defection**: Italy was nominally allied with Germany and Austria-Hungary but defected to the Entente because they offered more territory. Pure game theory — maximize payoff regardless of prior commitments
- **The security dilemma spiral**: Each mobilization triggered counter-mobilization. Russia mobilized to defend Serbia → Germany mobilized against Russia → France mobilized against Germany → Britain mobilized against Germany. All rational, all catastrophic

---

## WW2 — World War II (1939)

| Property | Value |
|:---------|:------|
| **Rounds** | 35 |
| **Starting Stability** | 50 |
| **Agents** | 8 historical nations |
| **Scripted Events** | 10 |

### Historical Agents

| Agent | Personality | Resources | Military |
|:------|:------------|:---------:|:--------:|
| Nazi Germany | Expansionist Ideologue | 85 | 95 |
| British Empire | Defiant Island Nation | 80 | 80 |
| Soviet Union | Paranoid Colossus | 85 | 85 |
| United States | Arsenal of Democracy | 100 | 65 |
| Imperial Japan | Island Empire on the March | 60 | 85 |
| Fascist Italy | Inadequate Axis Partner | 50 | 55 |
| Vichy France | Broken Collaborator | 35 | 30 |
| Republic of China | Enduring Under Siege | 45 | 55 |

### Event Chain

```
Round 1:  German Remilitarization of the Rhineland
  ↓ (80%)
Round 3:  Anschluss and Czech Crisis (appeasement)
  ↓ (85%)
Round 5:  Invasion of Poland
  ↓ (95%)
Round 8:  Fall of France (6 weeks)
  ↓ (90%)
Round 10: Battle of Britain (duration: 4 rounds)
Round 12: Operation Barbarossa (invasion of USSR)
  ↓ splits into two chains
  ├── Attack on Pearl Harbor (Round 14)
  └── Battle of Stalingrad (Round 18)
        ↓
Round 23: D-Day — Normandy Landings
  ↓ (90%)
Round 27: Fall of Berlin
```

### Game Theory Lessons

- **Appeasement as a failed strategy**: The Rhineland → Anschluss → Czech → Poland sequence shows how failing to punish early defection (grim trigger not activated) encourages further aggression
- **Two-front war as Prisoner's Dilemma**: Germany faced the same dilemma in both World Wars — a two-front war is unwinnable, but striking first (Schlieffen Plan / Barbarossa) seems rational in the moment
- **Industrial capacity as the ultimate resource**: The US (resources: 100, military: 65) starts weak militarily but its industrial base makes it the decisive factor. Once fully mobilized, it outproduces all other nations combined
- **Ideology vs. rationality**: Nazi Germany's ideological commitment to Lebensraum overrode the strategic calculation that invading the Soviet Union was suicidal — a reminder that agents don't always play optimal game theory

---

## Design Principles for Scenarios

### Event Cascade Mechanics

Each event has:
- **Trigger round**: When the event fires
- **Cascade chance**: Probability of triggering follow-up events (modified by global stability)
- **Follow-up events**: Which events chain from this one
- **Duration**: How many rounds the effects persist
- **Target nations**: Which nations are affected

Lower stability increases cascade probability, creating positive feedback loops — bad events beget more bad events, just like real geopolitical crises.

### Stability Feedback

| Stability Level | Effect |
|:----------------|:-------|
| 0–10 | Global Crisis — all nations lose 5 resources per round |
| 95–100 | Global Prosperity — all nations gain 3 resources per round |

This creates collective stakes — even nations not directly involved in a conflict suffer from global instability.
