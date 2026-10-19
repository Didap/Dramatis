#!/usr/bin/env node
// Lists lucide icons referenced in the code that do not exist. Exit 1 if any.
import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const icons = require('@iconify-json/lucide/icons.json')
const names = new Set([...Object.keys(icons.icons), ...Object.keys(icons.aliases ?? {})])
const out = execSync('grep -rhoE "i-lucide-[a-z0-9-]+" app shared server i18n || true', { encoding: 'utf8' })
const used = [...new Set(out.split('\n').filter(Boolean).map(s => s.slice('i-lucide-'.length)))]
const missing = used.filter(n => !names.has(n))
console.log(`check-icons: ${used.length} used, ${missing.length} missing${missing.length ? `: ${missing.join(' ')}` : ''}`)
process.exit(missing.length ? 1 : 0)
