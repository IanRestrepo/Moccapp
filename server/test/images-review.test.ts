import assert from 'node:assert/strict'
import { test } from 'node:test'
process.env.GEMINI_API_KEY = 'test-key-1234567890'
process.env.DATABASE_URL = 'pglite://memory'
const { setLlm } = await import('../src/ai/gemini.js')
const { verifyGuideImage, findImages, broader } = await import('../src/services/images.js')
const image = { url: 'https://upload.wikimedia.org/example.png', width: 900, height: 600, credit: '', license: '', link: '' }
const fetchImage = async () => new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/png' } })
test('rechaza humanos fuera del contexto y rótulos en otros idiomas; falla cerrado', async () => {
  for (const verdict of [
    { relevant: true, speciesMatch: false, spanishOrUnlabelled: true, caption: 'Humano' },
    { relevant: true, speciesMatch: true, spanishOrUnlabelled: false, caption: 'Otro idioma' },
    { relevant: false, speciesMatch: true, spanishOrUnlabelled: true, caption: 'Otro órgano' },
    {},
  ]) {
    setLlm({ async generateJson(p) { assert.ok(p.source.some(s => s.inlineData)); return verdict }, async uploadFile() { throw Error() } })
    assert.equal(await verifyGuideImage(image, 'Ovario de la yegua, MVZ', fetchImage), null)
  }
  setLlm({ async generateJson() { return { relevant: true, speciesMatch: true, spanishOrUnlabelled: true, caption: 'Ovario equino' } }, async uploadFile() { throw Error() } })
  assert.equal(await verifyGuideImage(image, 'Ovario equino', fetchImage), 'Ovario equino')
  assert.equal(await verifyGuideImage({ ...image, url: 'http://localhost/image.png' }, 'Ovario', fetchImage), null)
})
test('nunca elimina la especie de la búsqueda ni muestra imágenes sin contexto verificable', async () => {
  assert.deepEqual(broader('mare ovary anatomy diagram'), ['mare ovary anatomy diagram'])
  assert.deepEqual(await findImages([{ images: [{ query: 'ovary', caption: 'Ovario' }] }], async () => { throw Error('No debe buscar sin contexto') }), [[]])
})
