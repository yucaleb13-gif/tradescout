// offline unit checks for the validator (no LLM call)
const src = await import('/app/app/lib/ai/grounded.js').catch(()=>null)
