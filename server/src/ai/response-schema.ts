/** Limita la complejidad del esquema enviado a Gemini. Zod conserva la validación completa al recibir. */
const LOCAL_CONSTRAINTS = new Set([
  '$schema', 'additionalProperties', 'minLength', 'maxLength', 'pattern', 'format',
  'minItems', 'maxItems', 'uniqueItems', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
])
export function generationSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(generationSchema)
  if (!node || typeof node !== 'object') return node
  return Object.fromEntries(Object.entries(node)
    .filter(([key]) => !LOCAL_CONSTRAINTS.has(key))
    .map(([key, value]) => [key, generationSchema(value)]))
}

export function isSchemaRejection(status: number, message: string): boolean {
  return status === 400 && /schema|too many states|too much branching|response[_ ]?json[_ ]?schema|response[_ ]?schema/i.test(message)
}
