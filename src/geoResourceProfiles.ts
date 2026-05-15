import type { ResourceFlow, ResourceVector } from './geoTypes.ts'
import { zeroVector } from './geoTypes.ts'

// IRL-grounded production / consumption / stockpile per nation.
//
// Scale convention:
//   production / consumption: 0–20 per round (small = scarce, large = export-grade)
//   stockpile: 0–60 (≈ 3–6 rounds of buffer for healthy commodities)
//
// Net flow (production − consumption) signals dependency:
//   strongly positive → exporter
//   strongly negative → import-dependent, leverage point for adversaries
//
// Sources used informally to calibrate (no claim of precision):
// EIA energy data, Our World in Data agriculture, USGS rare earth survey,
// World Bank capital flows, Stockholm International Water Institute.

const flow = (
  production: Partial<ResourceVector>,
  consumption: Partial<ResourceVector>,
  stockpile: Partial<ResourceVector>,
): ResourceFlow => ({
  production: { ...zeroVector(), ...production },
  consumption: { ...zeroVector(), ...consumption },
  stockpile: { ...zeroVector(), ...stockpile },
})

export const RESOURCE_PROFILES: Record<string, ResourceFlow> = {
  // USA — diversified powerhouse. Critical vulnerability: rare earth imports from China.
  usa: flow(
    { oil: 14, gas: 16, water: 12, food: 16, rareEarth: 2, capital: 18, science: 18, manpower: 10 },
    { oil: 16, gas: 12, water: 10, food: 12, rareEarth: 9, capital: 12, science: 12, manpower: 10 },
    { oil: 30, gas: 40, water: 35, food: 45, rareEarth: 8, capital: 60, science: 60, manpower: 35 },
  ),

  // Russia — petrostate with food and rare earth depth; capital-starved under sanctions.
  russia: flow(
    { oil: 16, gas: 18, water: 16, food: 12, rareEarth: 10, capital: 4, science: 5, manpower: 6 },
    { oil: 7, gas: 9, water: 8, food: 9, rareEarth: 6, capital: 11, science: 11, manpower: 9 },
    { oil: 55, gas: 60, water: 50, food: 30, rareEarth: 30, capital: 12, science: 14, manpower: 20 },
  ),

  // China — manufacturing + rare earth dominance; oil and food import-dependent.
  china: flow(
    { oil: 5, gas: 7, water: 10, food: 16, rareEarth: 18, capital: 16, science: 16, manpower: 18 },
    { oil: 20, gas: 16, water: 14, food: 18, rareEarth: 12, capital: 12, science: 16, manpower: 16 },
    { oil: 28, gas: 32, water: 28, food: 32, rareEarth: 55, capital: 45, science: 45, manpower: 45 },
  ),

  // India — manpower + grain self-sufficient; energy and tech material importer.
  india: flow(
    { oil: 2, gas: 3, water: 10, food: 16, rareEarth: 3, capital: 7, science: 10, manpower: 18 },
    { oil: 16, gas: 9, water: 14, food: 14, rareEarth: 7, capital: 10, science: 10, manpower: 12 },
    { oil: 14, gas: 12, water: 28, food: 32, rareEarth: 10, capital: 22, science: 24, manpower: 40 },
  ),

  // Pakistan — chronically resource-poor, large young population. Indus water is critical.
  pakistan: flow(
    { oil: 1, gas: 5, water: 5, food: 9, rareEarth: 1, capital: 2, science: 3, manpower: 11 },
    { oil: 7, gas: 7, water: 9, food: 9, rareEarth: 4, capital: 6, science: 6, manpower: 9 },
    { oil: 5, gas: 10, water: 12, food: 16, rareEarth: 3, capital: 6, science: 7, manpower: 20 },
  ),

  // Ukraine — breadbasket of Europe + emerging critical metals (titanium, lithium).
  ukraine: flow(
    { oil: 1, gas: 3, water: 7, food: 16, rareEarth: 6, capital: 1, science: 4, manpower: 4 },
    { oil: 5, gas: 7, water: 5, food: 7, rareEarth: 4, capital: 7, science: 5, manpower: 7 },
    { oil: 5, gas: 10, water: 20, food: 28, rareEarth: 14, capital: 5, science: 9, manpower: 9 },
  ),

  // Iran — abundant oil + wheat self-sufficient, but capital, science, rare earth, and
  // especially water are choke points. Mirrors user-specified IRL profile.
  iran: flow(
    { oil: 14, gas: 12, water: 4, food: 9, rareEarth: 1, capital: 2, science: 4, manpower: 9 },
    { oil: 7, gas: 9, water: 10, food: 9, rareEarth: 6, capital: 6, science: 7, manpower: 9 },
    { oil: 40, gas: 38, water: 7, food: 16, rareEarth: 5, capital: 6, science: 7, manpower: 20 },
  ),

  // Israel — disproportionate science + capital output; water-stressed, food-dependent.
  israel: flow(
    { oil: 0, gas: 7, water: 4, food: 4, rareEarth: 1, capital: 11, science: 16, manpower: 3 },
    { oil: 6, gas: 5, water: 5, food: 7, rareEarth: 5, capital: 7, science: 9, manpower: 4 },
    { oil: 6, gas: 16, water: 9, food: 9, rareEarth: 5, capital: 25, science: 32, manpower: 9 },
  ),

  // Saudi Arabia — pure petrostate + sovereign wealth, structurally short on food, water,
  // science, and labor (relies on guest workers).
  saudi: flow(
    { oil: 20, gas: 10, water: 1, food: 1, rareEarth: 1, capital: 16, science: 2, manpower: 3 },
    { oil: 6, gas: 7, water: 7, food: 9, rareEarth: 4, capital: 9, science: 7, manpower: 14 },
    { oil: 55, gas: 28, water: 5, food: 5, rareEarth: 2, capital: 45, science: 4, manpower: 9 },
  ),

  // Taiwan — semiconductor monopoly, almost everything else imported. Single-point-of-failure
  // of the global tech supply chain.
  taiwan: flow(
    { oil: 0, gas: 0, water: 4, food: 4, rareEarth: 1, capital: 9, science: 20, manpower: 3 },
    { oil: 7, gas: 5, water: 5, food: 7, rareEarth: 7, capital: 7, science: 11, manpower: 4 },
    { oil: 5, gas: 5, water: 9, food: 9, rareEarth: 5, capital: 20, science: 40, manpower: 9 },
  ),
}

// Fallback for any agent without a defined profile.
export const defaultFlow = (): ResourceFlow => flow(
  { oil: 4, gas: 4, water: 6, food: 6, rareEarth: 3, capital: 6, science: 6, manpower: 6 },
  { oil: 5, gas: 5, water: 6, food: 6, rareEarth: 4, capital: 6, science: 6, manpower: 6 },
  { oil: 15, gas: 15, water: 15, food: 15, rareEarth: 10, capital: 20, science: 20, manpower: 20 },
)
