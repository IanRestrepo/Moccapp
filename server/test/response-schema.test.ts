import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generationSchema, isSchemaRejection } from '../src/ai/response-schema.js'
import { questionBankJsonSchema, GeneratedQuestionSchema } from '../src/ai/schemas.js'

test('el esquema de preguntas conserva campos y tipos sin límites combinatorios anidados', () => {
  const schema = generationSchema(questionBankJsonSchema) as any
  const raw = JSON.stringify(schema)
  assert.doesNotMatch(raw, /"(maxItems|minItems|maxLength|minLength|minimum|maximum|additionalProperties|\$schema)":/)
  assert.ok(schema.required.includes('questions'))
  const q = schema.properties.questions.items
  assert.equal(q.properties.prompt.type, 'string')
  assert.deepEqual(q.properties.type.enum, ['multiple_choice', 'true_false', 'matching', 'short_answer'])
  assert.equal(q.properties.distractorRationales.items.properties.why.type, 'string')
  assert.equal(GeneratedQuestionSchema.safeParse({ type: 'true_false', prompt: '' }).success, false)
  assert.match(JSON.stringify(questionBankJsonSchema), /maxItems/)
})
test('el rechazo del esquema no se confunde con cuota o archivos ilegibles', () => {
  assert.equal(isSchemaRejection(400, 'The specified schema produces a constraint that has too many states for serving.'), true)
  assert.equal(isSchemaRejection(400, 'Invalid responseJsonSchema'), true)
  assert.equal(isSchemaRejection(429, 'quota exceeded'), false)
  assert.equal(isSchemaRejection(400, 'Invalid file URI'), false)
})
