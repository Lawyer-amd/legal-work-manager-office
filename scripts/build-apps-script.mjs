import { readFile, writeFile } from 'node:fs/promises'

const html = await readFile('dist/index.html', 'utf8')
const cssMatch = html.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/i)
const jsMatch = html.match(/<script[^>]+src="([^"]+\.js)"[^>]*><\/script>/i)
if (!cssMatch || !jsMatch) throw new Error('تعذر العثور على ملفات CSS/JS الناتجة من Vite.')

const css = await readFile(`dist/${cssMatch[1].replace(/^\.\//, '')}`, 'utf8')
const js = await readFile(`dist/${jsMatch[1].replace(/^\.\//, '')}`, 'utf8')
const bundled = html
  .replace(cssMatch[0], `<style>${css}</style>`)
  .replace(jsMatch[0], `<script type="module">${js}</script>`)
  .replace('<head>', '<head><base target="_top">')

await writeFile('apps-script/Index.html', bundled)
console.log('Generated apps-script/Index.html')
