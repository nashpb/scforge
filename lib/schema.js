'use strict'
// Minimal JSON Schema subset: only the keywords config.schema.json uses.

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const clone = v => JSON.parse(JSON.stringify(v))
const deref = (s, root) => (s.$ref ? s.$ref.slice(2).split('/').reduce((n, k) => n[k], root) : s)

function validate(schema, data, root = schema, at = '') {
  const s = deref(schema, root)
  const errors = []
  const err = m => errors.push(`${at || '.'}: ${m}`)
  if (s.enum && !s.enum.includes(data)) return [`${at || '.'}: must be one of ${s.enum.join(', ')}`]
  if (s.type) {
    const ok = s.type === 'object' ? isObj(data)
      : s.type === 'array' ? Array.isArray(data)
      : s.type === 'integer' ? Number.isInteger(data)
      : s.type === 'number' ? typeof data === 'number' && Number.isFinite(data)
      : typeof data === s.type
    if (!ok) return [`${at || '.'}: must be ${s.type}`]
  }
  if (typeof data === 'number') {
    if (s.minimum !== undefined && data < s.minimum) err(`must be >= ${s.minimum}`)
    if (s.maximum !== undefined && data > s.maximum) err(`must be <= ${s.maximum}`)
    if (s.exclusiveMinimum !== undefined && data <= s.exclusiveMinimum) err(`must be > ${s.exclusiveMinimum}`)
  }
  if (typeof data === 'string') {
    if (s.minLength !== undefined && data.length < s.minLength) err(`must have at least ${s.minLength} characters`)
    if (s.pattern && !new RegExp(s.pattern).test(data)) err(`must match ${s.pattern}`)
  }
  if (Array.isArray(data)) {
    if (s.uniqueItems && new Set(data.map(x => JSON.stringify(x))).size !== data.length) err('items must be unique')
    if (s.items) data.forEach((x, i) => errors.push(...validate(s.items, x, root, `${at}[${i}]`)))
  }
  if (isObj(data)) {
    const props = s.properties || {}
    for (const [k, v] of Object.entries(data)) {
      const sub = `${at}.${k}`
      if (s.propertyNames && s.propertyNames.pattern && !new RegExp(s.propertyNames.pattern).test(k)) err(`key "${k}" must match ${s.propertyNames.pattern}`)
      if (k in props) errors.push(...validate(props[k], v, root, sub))
      else if (s.additionalProperties === false) errors.push(`${sub}: unknown key`)
      else if (isObj(s.additionalProperties)) errors.push(...validate(s.additionalProperties, v, root, sub))
    }
  }
  return errors
}

// Fills schema defaults into gaps; never overwrites a value that is present.
function withDefaults(schema, data, root = schema) {
  const s = deref(schema, root)
  if (s.type !== 'object' && !s.properties) return data
  const out = isObj(data) ? { ...data } : {}
  const props = s.properties || {}
  for (const [k, sub] of Object.entries(props)) {
    const ss = deref(sub, root)
    if (out[k] !== undefined) out[k] = withDefaults(ss, out[k], root)
    else if ('default' in ss) out[k] = clone(ss.default)
    else if (ss.type === 'object') out[k] = withDefaults(ss, undefined, root)
  }
  if (isObj(s.additionalProperties)) {
    for (const k of Object.keys(out)) if (!(k in props)) out[k] = withDefaults(s.additionalProperties, out[k], root)
  }
  return out
}

// Objects merge recursively; arrays and scalars in `over` replace `base`.
function deepMerge(base, over) {
  if (!isObj(base) || !isObj(over)) return over === undefined ? clone(base) : clone(over)
  const out = clone(base)
  for (const [k, v] of Object.entries(over)) out[k] = k in out ? deepMerge(out[k], v) : clone(v)
  return out
}

module.exports = { validate, withDefaults, deepMerge }
