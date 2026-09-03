import { LlmChat, UserMessage } from 'emergentintegrations'
const chat = new LlmChat(process.env.EMERGENT_LLM_KEY, 'test-1', 'You return only strict JSON, no markdown fences.').withModel('openai', 'gpt-4o-mini').withParams({ temperature: 0, max_tokens: 200 })
const t = Date.now()
const reply = await chat.sendMessage(new UserMessage({ text: 'Return JSON {"ok":true,"model_note":"<one word>"}' }))
console.log(typeof reply, JSON.stringify(reply).slice(0, 400), Date.now()-t, 'ms')
