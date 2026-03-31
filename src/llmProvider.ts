import OpenAI from 'openai'

export type ModelId = 'glm-4.7-flashx' | 'glm-4.6' | 'glm-4.6v'

export const MODEL_OPTIONS: { id: ModelId; label: string; desc: string }[] = [
  { id: 'glm-4.7-flashx', label: 'GLM-4.7-FlashX', desc: 'Fast & efficient (recommended)' },
  { id: 'glm-4.6', label: 'GLM-4.6', desc: 'Balanced performance' },
  { id: 'glm-4.6v', label: 'GLM-4.6V', desc: 'Vision-capable' },
]

const API_KEYS = [
  '92fac293a4d344fd93f62bf65eff3aed.b4GbKwALmYX60HPW',
  '90d4d13c7c014f1680362c65be2d8e2a.mVMLu50kYRbADzGU',
  '90d4d13c7c014f1680362c65be2d8e2a.mVMLu50kYRbADzGU',
]

const MAX_CONCURRENT_PER_KEY = 3

const BASE_URL = 'https://api.z.ai/api/paas/v4/'

let selectedModel: ModelId = 'glm-4.7-flashx'

interface KeySlot {
  client: OpenAI
  active: number
}

const keySlots: KeySlot[] = API_KEYS.map(key => ({
  client: new OpenAI({
    apiKey: key,
    baseURL: BASE_URL,
    dangerouslyAllowBrowser: true,
  }),
  active: 0,
}))

let slotIndex = 0

export const setModel = (model: ModelId) => {
  selectedModel = model
}

export const getModel = () => selectedModel

const acquireSlot = (): KeySlot => {
  const start = slotIndex
  for (let i = 0; i < keySlots.length; i++) {
    const idx = (start + i) % keySlots.length
    if (keySlots[idx].active < MAX_CONCURRENT_PER_KEY) {
      slotIndex = (idx + 1) % keySlots.length
      return keySlots[idx]
    }
  }
  slotIndex = (start + 1) % keySlots.length
  return keySlots[start]
}

export interface LLMCallOpts {
  systemPrompt: string
  userPrompt: string
  model?: ModelId
}

export const llmCall = async (opts: LLMCallOpts): Promise<string> => {
  const slot = acquireSlot()
  slot.active++
  try {
    const result = await slot.client.chat.completions.create({
      model: opts.model ?? selectedModel,
      messages: [
        { role: 'system', content: opts.systemPrompt },
        { role: 'user', content: opts.userPrompt },
      ],
    })
    return result.choices[0].message.content ?? ''
  } finally {
    slot.active--
  }
}
