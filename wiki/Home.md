# Wargames Wiki

Welcome to the Wargames project wiki — documentation for the Geopolitical AI Simulation Platform.

## Table of Contents

### Game Design

- **[Game Theory Concepts](Game-Theory-Concepts.md)** — Foundational game theory concepts implemented in the simulation: Prisoner's Dilemma, tit-for-tat, grim trigger, Pavlov strategy, chicken game, security dilemma, and MAD.

- **[Geopolitical Agents](Geopolitical-Agents.md)** — Deep dive into each nation agent: their personality, strategy, alliances, dependencies, and the real-world basis for their behavior.

- **[Scenarios](Scenarios.md)** — Detailed breakdown of each scenario: historical events modeled, scripted event chains, cascading effects, and game theory lessons.

### Technical

- **[Technical Architecture](Technical-Architecture.md)** — How the game engine works: immutable state, parallel agent execution, LLM integration, event cascade system, and React state management.

### Contributing

- **[Contributing](Contributing.md)** — How to set up the development environment, code style rules, and guides for adding new agents, scenarios, and game modes.

## Quick Links

| Resource | Description |
|:---------|:------------|
| [Main README](../README.md) | Project overview, quick start, and tech stack |
| [CLAUDE.md](../CLAUDE.md) | AI development guide (code style, architecture patterns) |
| [CLAUDE.md (wargames)](../wargames/CLAUDE.md) | Sub-project guide (color palette, UI conventions) |

## Project Overview

Wargames is a multi-agent AI simulation platform where LLM-powered agents compete in game theory scenarios and geopolitical simulations. Built with React 19, TypeScript 5.9, and Vite 7, the platform features:

- **3 game modes**: Prisoner's Dilemma, WarGames (military), and Geopolitical Simulation
- **8 scenarios**: Free Play, COVID Cascade, China-Taiwan, Water Wars, Oil Wars, Middle East Escalation, WW1, and WW2
- **30+ unique agents**: From interstellar factions to real-world nations with historically accurate personalities
- **Emergent gameplay**: Agents make decisions via LLM with game theory-informed prompts, producing emergent strategic behavior
