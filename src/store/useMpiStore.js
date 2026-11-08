import { reactive, computed } from 'vue'
import { useAuth } from './useAuth.js'

const auth = useAuth()

/* ------------------------------------------------------------------ *
 * Field configuration (weights sum to 100 for the Data Integrity Score)
 * ------------------------------------------------------------------ */
export const FIELD_CONFIG = {
  firstName: { label: 'First name', required: true, weight: 10 },
  middleName: { label: 'Middle name', required: false, optional: true, weight: 2 },
  lastName: { label: 'Last name', required: true, weight: 10 },
  dob: { label: 'Date of birth', required: true, weight: 14 },
  sex: { label: 'Sex', required: true, weight: 6 },
  phone: { label: 'Phone', required: true, weight: 10 },
  email: { label: 'Email', required: false, weight: 4 },
  nationalId: { label: 'National ID', required: true, weight: 16 },
  address: { label: 'Address', required: true, weight: 8 },
  nokName: { label: 'Next of kin', required: true, weight: 8 },
  nokRelation: { label: 'Relationship', required: true, weight: 4 },
  nokPhone: { label: 'Next of kin phone', required: true, weight: 8 },
}

export const RELATIONS = ['Spouse', 'Parent', 'Child', 'Sibling', 'Friend', 'Guardian', 'Other']
const SEX_VALUES = ['F', 'M', 'X']
const NAME_RE = /^\p{L}[\p{L}'’\- ]*$/u
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */
export function normalizePhone(raw) {
  let s = String(raw ?? '').replace(/[\s\-().]/g, '')
  if (s.startsWith('00')) s = '+' + s.slice(2)
  return s
}

function parseDob(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return dt
}

const ok = (message) => ({ status: 'valid', empty: false, message })
const warn = (message) => ({ status: 'warning', empty: false, message })
const err = (message) => ({ status: 'error', empty: false, message })

export function validateField(name, raw, ctx = {}) {
  const cfg = FIELD_CONFIG[name]
  const value = String(raw ?? '').trim()

  if (!value) {
    if (cfg.optional) return { status: 'valid', empty: true, message: 'Optional' }
    return {
      status: 'warning',
      empty: true,
      message: cfg.required ? `${cfg.label} is missing` : `${cfg.label} recommended`,
    }
  }

  switch (name) {
    case 'firstName':
    case 'middleName':
    case 'lastName':
    case 'nokName': {
      if (!NAME_RE.test(value)) return err('Letters, spaces, hyphens and apostrophes only')
      if (value.replace(/[^\p{L}]/gu, '').length < 2) return warn('Looks too short, check spelling')
      if (value === value.toLowerCase() || value === value.toUpperCase()) return warn('Check capitalisation')
      return ok('Looks good')
    }
    case 'dob': {
      const dt = parseDob(value)
      if (!dt) return err('Use a real date (YYYY-MM-DD)')
      const now = new Date()
      if (dt > now) return err('Date of birth is in the future')
      const age = (now - dt) / (365.25 * 86400000)
      if (age > 120) return err('Age exceeds 120 years')
      return ok(`Age ${Math.floor(age)}`)
    }
    case 'sex':
      return SEX_VALUES.includes(value) ? ok('Recorded') : err('Select a valid option')
    case 'phone':
    case 'nokPhone': {
      const n = normalizePhone(value)
      if (!/^\+\d{9,15}$/.test(n)) return err('Use international format, e.g. +255 7XX XXX XXX')
      if (name === 'nokPhone' && ctx.phone && normalizePhone(ctx.phone) === n) {
        return warn('Same as the patient’s own phone')
      }
      return ok('Valid number')
    }
    case 'email':
      return EMAIL_RE.test(value) ? ok('Valid address') : err('Not a valid email address')
    case 'nationalId': {
      const digits = value.replace(/[\s-]/g, '')
      if (!/^\d{20}$/.test(digits)) return err('National ID must be 20 digits')
      if (ctx.dob && parseDob(ctx.dob) && digits.slice(0, 8) !== ctx.dob.replace(/-/g, '')) {
        return warn('Birth segment of the ID differs from date of birth')
      }
      return ok('Valid format')
    }
    case 'address':
      return value.length < 8 ? warn('Add street and locality') : ok('Recorded')
    case 'nokRelation':
      return RELATIONS.includes(value) ? ok('Recorded') : warn('Select a listed relationship')
    default:
      return ok('Recorded')
  }
}

function fieldCredit(name, res) {
  if (res.empty) return FIELD_CONFIG[name].optional ? 1 : 0
  if (res.status === 'valid') return 1
  if (res.status === 'warning') return 0.5
  return 0
}

export function scoreRecord(rec) {
  let total = 0
  for (const [name, cfg] of Object.entries(FIELD_CONFIG)) {
    total += cfg.weight * fieldCredit(name, validateField(name, rec[name], rec))
  }
  return Math.round(total)
}

export function scoreTone(score) {
  if (score >= 90) return 'emerald'
  if (score >= 75) return 'amber'
  return 'rose'
}

/* ------------------------------------------------------------------ *
 * Similarity & matching
 * ------------------------------------------------------------------ */
export function levenshtein(a, b) {
  const x = String(a)
  const y = String(b)
  if (!x.length) return y.length
  if (!y.length) return x.length
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i)
  for (let i = 1; i <= x.length; i++) {
    const cur = [i]
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    prev = cur
  }
  return prev[y.length]
}

const norm = (s) => String(s ?? '').trim().toLowerCase()

export function strSim(a, b) {
  const x = norm(a)
  const y = norm(b)
  if (!x && !y) return 0
  if (x === y) return 1
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length)
}

export function dobRelation(a, b) {
  if (!a || !b) return { sim: 0, note: '' }
  if (a === b) return { sim: 1, note: '' }
  const pa = a.split('-')
  const pb = b.split('-')
  if (pa[0] === pb[0] && pa[1] === pb[2] && pa[2] === pb[1]) {
    return { sim: 0.72, note: 'Day and month are transposed' }
  }
  const sa = a.replace(/-/g, '').split('').sort().join('')
  const sb = b.replace(/-/g, '').split('').sort().join('')
  if (sa === sb) return { sim: 0.65, note: 'Same digits in a different order' }
  if (levenshtein(a, b) <= 1) return { sim: 0.7, note: 'Single-digit variation' }
  if (pa[0] === pb[0]) return { sim: 0.3, note: 'Same year, different day' }
  return { sim: 0, note: 'Birth dates do not agree' }
}

const MATCH_WEIGHTS = [
  { key: 'lastName', label: 'Last name', w: 20 },
  { key: 'firstName', label: 'First name', w: 20 },
  { key: 'dob', label: 'Date of birth', w: 25 },
  { key: 'nationalId', label: 'National ID', w: 15 },
  { key: 'phone', label: 'Phone', w: 10 },
  { key: 'sex', label: 'Sex', w: 5 },
  { key: 'address', label: 'Address', w: 5 },
]

export function matchScore(a, b) {
  const has = (r, k) => String(r[k] ?? '').trim() !== ''
  const direct = (strSim(a.firstName, b.firstName) + strSim(a.lastName, b.lastName)) / 2
  const swapped = (strSim(a.firstName, b.lastName) + strSim(a.lastName, b.firstName)) / 2
  const useSwap = swapped > direct + 0.1 && has(a, 'firstName') && has(b, 'firstName')

  const parts = []
  for (const { key, label, w } of MATCH_WEIGHTS) {
    if (!has(a, key) || !has(b, key)) continue
    let sim
    let note = ''
    if (key === 'firstName') sim = useSwap ? strSim(a.firstName, b.lastName) : strSim(a.firstName, b.firstName)
    else if (key === 'lastName') sim = useSwap ? strSim(a.lastName, b.firstName) : strSim(a.lastName, b.lastName)
    else if (key === 'dob') ({ sim, note } = dobRelation(a.dob, b.dob))
    else if (key === 'phone') sim = normalizePhone(a.phone) === normalizePhone(b.phone) ? 1 : 0.2
    else if (key === 'sex') sim = a.sex === b.sex ? 1 : 0
    else sim = strSim(a[key], b[key])
    parts.push({ key, label, w, sim, note })
  }
  const totalW = parts.reduce((n, p) => n + p.w, 0)
  const score = totalW ? Math.round((parts.reduce((n, p) => n + p.w * p.sim, 0) / totalW) * 100) : 0
  return { score, parts, swappedNames: useSwap }
}

export function diffChars(a = '', b = '') {
  const x = [...String(a)]
  const y = [...String(b)]
  const dp = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0))
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) {
      dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const ra = []
  const rb = []
  let i = 0
  let j = 0
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) {
      ra.push({ ch: x[i], diff: false })
      rb.push({ ch: y[j], diff: false })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ra.push({ ch: x[i++], diff: true })
    } else {
      rb.push({ ch: y[j++], diff: true })
    }
  }
  while (i < x.length) ra.push({ ch: x[i++], diff: true })
  while (j < y.length) rb.push({ ch: y[j++], diff: true })
  return { a: ra, b: rb }
}

export const COMPARE_FIELDS = [
  { key: 'firstName', label: 'First name' },
  { key: 'middleName', label: 'Middle name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'dob', label: 'Date of birth' },
  { key: 'sex', label: 'Sex' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'nationalId', label: 'National ID' },
  { key: 'address', label: 'Address' },
  { key: 'facility', label: 'Registered at' },
  { key: 'lastVisit', label: 'Last visit' },
]

export function compareRecords(a, b) {
  return COMPARE_FIELDS.map(({ key, label }) => {
    const av = String(a[key] ?? '').trim()
    const bv = String(b[key] ?? '').trim()
    const plain = (v) => (v ? [{ ch: v, diff: false }] : [])
    if (!av && !bv) return { key, label, state: 'empty', a: [], b: [], note: '' }
    if (!av || !bv) {
      return { key, label, state: 'missing', a: plain(av), b: plain(bv), note: 'Present on one record only' }
    }
    const same = key === 'phone' ? normalizePhone(av) === normalizePhone(bv) : norm(av) === norm(bv)
    if (same) return { key, label, state: 'match', a: plain(av), b: plain(bv), note: '' }
    const d = diffChars(av, bv)
    let note = ''
    let state = strSim(av, bv) >= 0.8 ? 'variation' : 'conflict'
    if (key === 'dob') {
      note = dobRelation(av, bv).note
      state = 'conflict'
    }
    return { key, label, state, a: d.a, b: d.b, note }
  })
}

/* ------------------------------------------------------------------ *
 * Formatting helpers
 * ------------------------------------------------------------------ */
export function formatMoney(n) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

export function timeAgo(iso) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} h ago`
  const days = Math.round(hrs / 24)
  return `${days} d ago`
}

/* ------------------------------------------------------------------ *
 * Mock data
 * ------------------------------------------------------------------ */
const ago = (mins) => new Date(Date.now() - mins * 60000).toISOString()

const seedPatients = [
  {
    id: 'P-10021', firstName: 'Demo', middleName: 'Alpha', lastName: 'Patient', dob: '1990-01-01', sex: 'F',
    phone: '+000 0000 00000', email: 'patient01@example.com', nationalId: '00000000000000000000',
    address: 'Example Street, Demo District', nokName: 'Sample Contact', nokRelation: 'Spouse', nokPhone: '+00000000000',
    facility: 'Demo Facility A', lastVisit: '2026-01-01', createdAt: ago(60 * 24 * 400), status: 'active',
  },
  {
    id: 'P-10458', firstName: 'Demo', middleName: 'Alpha', lastName: 'Patient', dob: '1990-01-01', sex: 'F',
    phone: '+00000000000', email: '', nationalId: '00000000000000000000',
    address: 'Example Street, Demo District', nokName: 'Sample Contact', nokRelation: 'Spouse', nokPhone: '+00000000000',
    facility: 'Demo Facility B', lastVisit: '2026-01-01', createdAt: ago(60 * 24 * 90), status: 'active',
  },
  {
    id: 'P-10133', firstName: 'Demo', middleName: 'Bravo', lastName: 'Patient', dob: '1991-02-02', sex: 'M',
    phone: '+00000000000', email: 'patient03@example.com', nationalId: '00000000000000000000',
    address: 'Example Street, Demo District', nokName: 'Sample Contact', nokRelation: 'Parent', nokPhone: '+00000000000',
    facility: 'Demo Facility A', lastVisit: '2026-01-01', createdAt: ago(60 * 24 * 520), status: 'active',
  },
  {
    id: 'P-10790', firstName: 'Demo', middleName: 'Bravoo', lastName: 'Patient', dob: '1991-02-20', sex: 'M',
    phone: '+00000000000', email: '', nationalId: '',
    address: 'Example Street, Demo District', nokName: '', nokRelation: '', nokPhone: '',
    facility: 'Demo Facility C', lastVisit: '2026-01-01', createdAt: ago(60 * 24 * 12), status: 'active',
  },
  {
    id: 'P-10244', firstName: 'Demo', middleName: 'Charlie', lastName: 'Patient', dob: '1992-03-03', sex: 'F',
    phone: '+00000000000', email: 'patient05@example.com', nationalId: '00000000000000000000',
    address: 'Example Street, Demo District', nokName: 'Sample Contact', nokRelation: 'Parent', nokPhone: '+00000000000',
    facility: 'Demo Facility B', lastVisit: '2026-01-01', createdAt: ago(60 * 24 * 300), status: 'active',
  },
  {
    id: 'P-10911', firstName: 'Demo', middleName: 'Charli', lastName: 'Patient', dob: '1992-03-03', sex: 'F',
    phone: '+00000000000', email: '', nationalId: '',
    address: 'Example Street, Demo District', nokName: 'Sample Contact', nokRelation: 'Parent', nokPhone: '+00000000000',
    facility: 'Demo Facility A', lastVisit: '2026-01-01', createdAt: ago(60 * 24 * 4), status: 'active',
  },
  {
    id: 'P-10317', firstName: 'Demo', middleName: 'Delta', lastName: 'Patient', dob: '1993-04-04', sex: 'M',
    phone: '+00000000000', email: 'patient07@example.com', nationalId: '00000000000000000000',
    address: 'Example Street, Demo District', nokName: 'Sample Contact', nokRelation: 'Spouse', nokPhone: '+00000000000',
    facility: 'Demo Facility A', lastVisit: '2026-01-01', createdAt: ago(60 * 24 * 610), status: 'active',
  },
  {
    id: 'P-10652', firstName: 'Demo', middleName: 'Deltah', lastName: 'Patient', dob: '1993-04-14', sex: 'M',
    phone: '+00000000000', email: '', nationalId: '00000000000000000000',
    address: 'Example Street, Demo District', nokName: 'Sample Contact', nokRelation: 'Spouse', nokPhone: '+00000000000',
    facility: 'Demo Facility C', lastVisit: '2026-01-01', createdAt: ago(60 * 24 * 140), status: 'active',
  },
  {
    id: 'P-10502', firstName: 'Demo', middleName: 'Echo', lastName: 'Patient', dob: '1994-05-05', sex: 'F',
    phone: '+00000000000', email: 'patient09@example.com', nationalId: '00000000000000000000',
    address: 'Example Street, Demo District', nokName: 'Sample Contact', nokRelation: 'Parent', nokPhone: '+00000000000',
    facility: 'Demo Facility B', lastVisit: '2026-01-01', createdAt: ago(60 * 24 * 260), status: 'active',
  },
  {
    id: 'P-10873', firstName: 'Demo', middleName: 'Ecko', lastName: 'Patient', dob: '1994-05-15', sex: 'F',
    phone: '+00000000000', email: '', nationalId: '',
    address: 'Example Street, Demo District', nokName: 'Sample Contact', nokRelation: 'Parent', nokPhone: '+00000000000',
    facility: 'Demo Facility A', lastVisit: '2026-01-01', createdAt: ago(60 * 24 * 20), status: 'active',
  },
  {
    id: 'P-10066', firstName: 'Demo', middleName: 'Foxtrot', lastName: 'Patient', dob: '1995-06-06', sex: 'M',
    phone: '+00000000000', email: 'patient11@example.com', nationalId: '00000000000000000000',
    address: 'Example Street, Demo District', nokName: 'Sample Contact', nokRelation: 'Spouse', nokPhone: '+00000000000',
    facility: 'Demo Facility A', lastVisit: '2026-01-01', createdAt: ago(60 * 24 * 900), status: 'active',
  },
  {
    id: 'P-10599', firstName: 'Demo', middleName: 'Foxtrott', lastName: 'Patient', dob: '1995-06-06', sex: 'M',
    phone: '+00000000000', email: '', nationalId: '00000000000000000000',
    address: 'Example Street, Demo District', nokName: 'Sample Contact', nokRelation: 'Spouse', nokPhone: '+00000000000',
    facility: 'Demo Facility C', lastVisit: '2026-01-01', createdAt: ago(60 * 24 * 110), status: 'active',
  },
  {
    id: 'P-10388', firstName: 'Demo', middleName: 'Golf', lastName: 'Patient', dob: '1996-07-07', sex: 'F',
    phone: '+00000000000', email: 'patient13@example.com', nationalId: '00000000000000000000',
    address: 'Example Street, Demo District', nokName: 'Sample Contact', nokRelation: 'Parent', nokPhone: '+00000000000',
    facility: 'Demo Facility C', lastVisit: '2026-01-01', createdAt: ago(60 * 24 * 700), status: 'active',
  },
  {
    id: 'P-10967', firstName: 'Demo', middleName: 'Golff', lastName: 'Patient', dob: '1996-07-17', sex: 'F',
    phone: '+00000000000', email: '', nationalId: '',
    address: 'Example Street, Demo District', nokName: 'Sample Contact', nokRelation: 'Spouse', nokPhone: '+00000000000',
    facility: 'Demo Facility A', lastVisit: '2026-01-01', createdAt: ago(60 * 24 * 2), status: 'active',
  },
  {
    id: 'P-10705', firstName: 'Demo', middleName: 'Hotel', lastName: 'Patient', dob: '1997-08-08', sex: 'F',
    phone: '+00000000000', email: '', nationalId: '',
    address: 'Example Street, Demo District', nokName: '', nokRelation: '', nokPhone: '',
    facility: 'Demo Facility B', lastVisit: '2026-01-01', createdAt: ago(60 * 24 * 35), status: 'active',
  },
  {
    id: 'P-10810', firstName: 'Demo', middleName: 'India', lastName: 'Patient', dob: '1998-09-09', sex: 'M',
    phone: '00000000000', email: 'patient16@@example.com', nationalId: '00000000000000000000',
    address: 'Example Street, Demo District', nokName: 'Sample Contact', nokRelation: 'Spouse', nokPhone: '+00000000000',
    facility: 'Demo Facility A', lastVisit: '2026-01-01', createdAt: ago(60 * 24 * 25), status: 'active',
  },
]

const seedPairs = [
  ['P-10021', 'P-10458'],
  ['P-10133', 'P-10790'],
  ['P-10244', 'P-10911'],
  ['P-10317', 'P-10652'],
  ['P-10502', 'P-10873'],
  ['P-10066', 'P-10599'],
  ['P-10388', 'P-10967'],
]

const seedAnomalies = [
  { id: 'AN-2041', rule: 'Missing National Identification Info', field: 'nationalId', severity: 'critical', recordId: 'P-10790', detectedAt: ago(35), impact: 4200, status: 'open', fix: 'Request a government-issued ID at the next visit, or run a registry lookup.' },
  { id: 'AN-2040', rule: 'Formatting Conflict on Date of Birth', field: 'dob', severity: 'critical', recordId: 'P-10652', detectedAt: ago(90), impact: 3100, status: 'open', fix: 'The mock identifier conflicts with the date of birth. Verify against the source form.' },
  { id: 'AN-2039', rule: 'Invalid Phone Format', field: 'phone', severity: 'critical', recordId: 'P-10810', detectedAt: ago(140), impact: 1800, status: 'open', fix: 'Capture the full number in international format so appointment reminders can be delivered.' },
  { id: 'AN-2038', rule: 'Invalid Email Address', field: 'email', severity: 'warning', recordId: 'P-10810', detectedAt: ago(140), impact: 600, status: 'open', fix: 'Remove the duplicated @ sign or clear the field and re-capture.' },
  { id: 'AN-2037', rule: 'Missing National Identification Info', field: 'nationalId', severity: 'critical', recordId: 'P-10911', detectedAt: ago(260), impact: 4200, status: 'open', fix: 'Request a government-issued ID at the next visit, or run a registry lookup.' },
  { id: 'AN-2036', rule: 'Missing Next of Kin', field: 'nokName', severity: 'warning', recordId: 'P-10705', detectedAt: ago(420), impact: 900, status: 'open', fix: 'Collect a next-of-kin contact during the next encounter.' },
  { id: 'AN-2035', rule: 'Missing National Identification Info', field: 'nationalId', severity: 'critical', recordId: 'P-10705', detectedAt: ago(420), impact: 4200, status: 'open', fix: 'Request a government-issued ID at the next visit, or run a registry lookup.' },
  { id: 'AN-2034', rule: 'Missing National Identification Info', field: 'nationalId', severity: 'critical', recordId: 'P-10873', detectedAt: ago(600), impact: 4200, status: 'open', fix: 'Request a government-issued ID at the next visit, or run a registry lookup.' },
  { id: 'AN-2033', rule: 'Probable Duplicate Identity', field: 'identity', severity: 'warning', recordId: 'P-10066', detectedAt: ago(780), impact: 7800, status: 'open', fix: 'Review the candidate pair in the Master Patient Index and merge or separate.', link: 'mpi' },
  { id: 'AN-2030', rule: 'Formatting Conflict on Date of Birth', field: 'dob', severity: 'warning', recordId: 'P-10133', detectedAt: ago(60 * 40), impact: 2400, status: 'resolved', fix: 'Verified against the paper registration form.', resolvedAt: ago(60 * 30), resolvedNote: 'Verified against paper form.' },
]

const seedLeakage = [
  { id: 'dup-claims', label: 'Duplicate claims billed twice', amount: 64200, cases: 41, hint: 'Same patient registered under two identities' },
  { id: 'rejected', label: 'Claims rejected for missing identifiers', amount: 48750, cases: 63, hint: 'Payer cannot verify the insured person' },
  { id: 'unbilled', label: 'Encounters never matched to a bill', amount: 35900, cases: 52, hint: 'Visit filed under an unlinked record' },
  { id: 'labs', label: 'Diagnostics re-ordered unnecessarily', amount: 27300, cases: 88, hint: 'Prior results sit on a split chart' },
  { id: 'alloc', label: 'Bed and clinic slots held on stale records', amount: 18400, cases: 29, hint: 'Wrong or outdated contact details' },
]

const seedAudit = [
  { id: 'AU-9012', at: ago(22), actor: 'S. Okafor', role: 'Registrar', action: 'Registered patient', target: 'P-10967', detail: '2 validation warnings recorded', category: 'registration' },
  { id: 'AU-9011', at: ago(75), actor: 'System', role: 'Automation', action: 'Flagged probable duplicate', target: 'P-10388 / P-10967', detail: 'Match confidence computed on ingest', category: 'review' },
  { id: 'AU-9010', at: ago(190), actor: 'M. Haidari', role: 'Data steward', action: 'Resolved anomaly', target: 'AN-2030', detail: 'Verified against paper form', category: 'review' },
  { id: 'AU-9009', at: ago(360), actor: 'M. Haidari', role: 'Data steward', action: 'Merged records', target: 'P-10211 → P-10190', detail: 'Survivor P-10190', category: 'merge' },
  { id: 'AU-9008', at: ago(60 * 14), actor: 'A. Lwanga', role: 'Governance lead', action: 'Escalation reviewed', target: 'P-10440 / P-10451', detail: 'Committee decision: keep separate', category: 'escalation' },
  { id: 'AU-9007', at: ago(60 * 26), actor: 'Security', role: 'Automation', action: 'Failed sign-in blocked', target: 'user: reg-desk-3', detail: '3 attempts from unrecognised device', category: 'security' },
  { id: 'AU-9006', at: ago(60 * 30), actor: 'System', role: 'Automation', action: 'Nightly profiling run', target: 'All active records', detail: 'Integrity score recalculated', category: 'review' },
]

/* ------------------------------------------------------------------ *
 * Store
 * ------------------------------------------------------------------ */
const state = reactive({
  patients: seedPatients,
  duplicatePairs: [],
  anomalies: seedAnomalies,
  leakage: seedLeakage,
  auditLog: seedAudit,
  toasts: [],
  nextPatient: 11001,
  nextAnomaly: 2042,
  nextAudit: 9013,
  nextPair: 1,
  nextToast: 1,
})

function byId(id) {
  return state.patients.find((p) => p.id === id)
}

function buildSeedPairs() {
  return seedPairs.map(([aId, bId]) => {
    const { score, parts } = matchScore(byId(aId), byId(bId))
    return {
      id: `DP-${String(state.nextPair++).padStart(3, '0')}`,
      aId,
      bId,
      confidence: score,
      parts,
      status: 'pending',
      flaggedAt: ago(30 + state.nextPair * 47),
    }
  })
}
state.duplicatePairs = buildSeedPairs()

function addAudit(entry) {
  const u = auth.user.value
  state.auditLog.unshift({
    id: `AU-${state.nextAudit++}`,
    at: new Date().toISOString(),
    actor: u ? u.name : 'System',
    role: u ? u.roleLabel : 'Automation',
    ...entry,
  })
}

function toast(message, tone = 'indigo') {
  const id = state.nextToast++
  state.toasts.push({ id, message, tone })
  setTimeout(() => {
    const i = state.toasts.findIndex((t) => t.id === id)
    if (i >= 0) state.toasts.splice(i, 1)
  }, 3400)
}

function guard(permission, label) {
  if (auth.can(permission)) return true
  const u = auth.user.value
  toast(`Your role is not permitted to ${label}`, 'amber')
  addAudit({
    action: `Denied: ${label}`,
    target: u ? u.email : 'anonymous',
    detail: `Missing permission ${permission}`,
    category: 'security',
  })
  return false
}

function logEvent(entry) {
  addAudit(entry)
}

function recordName(id) {
  const p = byId(id)
  return p ? [p.firstName, p.lastName].filter(Boolean).join(' ') : id
}

function resolvePair(pairId, action, { survivorId = null, note = '' } = {}) {
  const pair = state.duplicatePairs.find((p) => p.id === pairId)
  if (!pair) return
  const decidingEscalation = pair.status === 'escalated'
  if (pair.status !== 'pending' && !decidingEscalation) return
  if (decidingEscalation) {
    if (action === 'escalate') return
    if (!guard('escalation:decide', 'decide escalated cases')) return
  } else {
    const needed = { merge: 'pair:merge', separate: 'pair:separate', escalate: 'pair:escalate' }[action]
    const labels = { merge: 'merge records', separate: 'keep records separate', escalate: 'escalate to the committee' }
    if (!needed || !guard(needed, labels[action])) return
  }
  const a = byId(pair.aId)
  const b = byId(pair.bId)
  const label = `${a.id} / ${b.id}`

  if (action === 'merge') {
    const survivor = survivorId === b.id ? b : a
    const loser = survivor === a ? b : a
    const inherited = []
    for (const key of Object.keys(FIELD_CONFIG)) {
      if (!String(survivor[key] ?? '').trim() && String(loser[key] ?? '').trim()) {
        survivor[key] = loser[key]
        inherited.push(FIELD_CONFIG[key].label)
      }
    }
    loser.status = 'merged'
    loser.mergedInto = survivor.id
    pair.status = 'merged'
    pair.survivorId = survivor.id
    pair.note = note
    state.duplicatePairs.forEach((p) => {
      if (p.status === 'pending' && (p.aId === loser.id || p.bId === loser.id)) p.status = 'superseded'
    })
    state.anomalies.forEach((an) => {
      if (an.recordId === loser.id && an.status === 'open') {
        an.status = 'resolved'
        an.resolvedAt = new Date().toISOString()
        an.resolvedNote = `Closed by merge into ${survivor.id}`
      }
    })
    addAudit({
      action: 'Merged records',
      target: `${loser.id} → ${survivor.id}`,
      detail: inherited.length ? `Survivor inherited: ${inherited.join(', ')}` : 'No fields inherited',
      category: 'merge',
    })
    toast(`Merged ${loser.id} into ${survivor.id}`, 'emerald')
  } else if (action === 'separate') {
    pair.status = 'separate'
    pair.note = note
    addAudit({ action: 'Marked as distinct patients', target: label, detail: note || 'No note provided', category: 'review' })
    toast('Records kept separate', 'indigo')
  } else if (action === 'escalate') {
    pair.status = 'escalated'
    pair.note = note
    state.anomalies.unshift({
      id: `AN-${state.nextAnomaly++}`,
      rule: 'Escalated Duplicate Review',
      field: 'identity',
      severity: 'warning',
      recordId: a.id,
      detectedAt: new Date().toISOString(),
      impact: 0,
      status: 'escalated',
      fix: `Awaiting governance committee decision on ${label}.`,
      pairId: pair.id,
      link: 'mpi',
    })
    addAudit({ action: 'Escalated to governance committee', target: label, detail: note || 'No reason provided', category: 'escalation' })
    toast('Escalated to the governance committee', 'amber')
  }

  if (decidingEscalation) {
    state.anomalies.forEach((an) => {
      if (an.pairId === pair.id && an.status === 'escalated') {
        an.status = 'resolved'
        an.resolvedAt = new Date().toISOString()
        an.resolvedNote = action === 'merge' ? 'Committee decision: merged' : 'Committee decision: kept separate'
      }
    })
  }
}

function resolveAnomaly(id, status, note = '') {
  const an = state.anomalies.find((x) => x.id === id)
  if (!an) return
  if (an.status === 'escalated') {
    if (!guard('escalation:decide', 'close escalated cases')) return
  } else if (!guard('anomaly:resolve', status === 'resolved' ? 'resolve anomalies' : 'escalate anomalies')) {
    return
  }
  an.status = status
  an.resolvedAt = new Date().toISOString()
  an.resolvedNote = note
  addAudit({
    action: status === 'resolved' ? 'Resolved anomaly' : 'Escalated anomaly',
    target: an.id,
    detail: note || an.rule,
    category: status === 'resolved' ? 'review' : 'escalation',
  })
  toast(status === 'resolved' ? `${an.id} marked resolved` : `${an.id} escalated`, status === 'resolved' ? 'emerald' : 'amber')
}

function registerPatient(form) {
  if (!guard('register:patient', 'register patients')) return null
  const id = `P-${state.nextPatient++}`
  const rec = {
    id,
    firstName: form.firstName.trim(),
    middleName: form.middleName.trim(),
    lastName: form.lastName.trim(),
    dob: form.dob,
    sex: form.sex,
    phone: normalizePhone(form.phone),
    email: form.email.trim(),
    nationalId: form.nationalId.replace(/[\s-]/g, ''),
    address: form.address.trim(),
    nokName: form.nokName.trim(),
    nokRelation: form.nokRelation,
    nokPhone: normalizePhone(form.nokPhone),
    facility: 'Central Hospital',
    lastVisit: new Date().toISOString().slice(0, 10),
    createdAt: new Date().toISOString(),
    status: 'active',
  }
  state.patients.push(rec)

  let gaps = 0
  for (const [key, cfg] of Object.entries(FIELD_CONFIG)) {
    const res = validateField(key, rec[key], rec)
    if (res.empty && cfg.required) {
      gaps++
      state.anomalies.unshift({
        id: `AN-${state.nextAnomaly++}`,
        rule: key === 'nationalId' ? 'Missing National Identification Info' : `Missing ${cfg.label}`,
        field: key,
        severity: key === 'nationalId' ? 'critical' : 'warning',
        recordId: id,
        detectedAt: new Date().toISOString(),
        impact: key === 'nationalId' ? 4200 : 900,
        status: 'open',
        fix: `Capture ${cfg.label.toLowerCase()} at the next encounter.`,
      })
    }
  }

  // Probable duplicates detected at the point of ingest enter the review queue.
  state.patients
    .filter((p) => p.id !== id && p.status === 'active')
    .map((p) => ({ p, ...matchScore(rec, p) }))
    .filter((m) => m.score >= 75)
    .forEach((m) => {
      state.duplicatePairs.push({
        id: `DP-${String(state.nextPair++).padStart(3, '0')}`,
        aId: m.p.id,
        bId: id,
        confidence: m.score,
        parts: m.parts,
        status: 'pending',
        flaggedAt: new Date().toISOString(),
      })
    })

  addAudit({
    action: 'Registered patient',
    target: id,
    detail: gaps ? `${gaps} required field(s) incomplete, tasks created` : 'Complete record',
    category: 'registration',
  })
  toast(`${id} registered`, 'emerald')
  return rec
}

const activePatients = computed(() => state.patients.filter((p) => p.status === 'active'))

const pendingPairs = computed(() =>
  state.duplicatePairs
    .filter((p) => p.status === 'pending' && byId(p.aId)?.status === 'active' && byId(p.bId)?.status === 'active')
    .sort((x, y) => y.confidence - x.confidence),
)

const recordScores = computed(() => activePatients.value.map((p) => ({ id: p.id, score: scoreRecord(p) })))

const integrityScore = computed(() => {
  if (!recordScores.value.length) return 100
  const avg = recordScores.value.reduce((n, r) => n + r.score, 0) / recordScores.value.length
  const dupPenalty = Math.min(100, pendingPairs.value.length * 8)
  return Math.round(avg * 0.8 + (100 - dupPenalty) * 0.2)
})

const incompleteRecords = computed(() => {
  const low = new Set(recordScores.value.filter((r) => r.score < 90).map((r) => r.id))
  return activePatients.value.filter((p) => low.has(p.id))
})

const openAnomalies = computed(() => state.anomalies.filter((a) => a.status === 'open'))

const fieldGaps = computed(() => {
  const total = activePatients.value.length || 1
  return Object.entries(FIELD_CONFIG)
    .filter(([, c]) => !c.optional)
    .map(([key, cfg]) => {
      const count = activePatients.value.filter((p) => validateField(key, p[key], p).status !== 'valid').length
      return { key, label: cfg.label, count, pct: Math.round((count / total) * 100) }
    })
    .filter((g) => g.count > 0)
    .sort((x, y) => y.count - x.count)
    .slice(0, 6)
})

const leakageTotal = computed(() => state.leakage.reduce((n, l) => n + l.amount, 0))

const securityMetrics = computed(() => {
  const count = (cat) => state.auditLog.filter((a) => a.category === cat).length
  return [
    { label: 'Merges logged', value: count('merge') },
    { label: 'Escalations', value: count('escalation') },
    { label: 'Security events', value: count('security') },
    { label: 'Registrations', value: count('registration') },
  ]
})

export function useMpiStore() {
  return {
    state,
    patients: computed(() => state.patients),
    activePatients,
    pendingPairs,
    duplicatePairs: computed(() => state.duplicatePairs),
    anomalies: computed(() => state.anomalies),
    openAnomalies,
    incompleteRecords,
    integrityScore,
    fieldGaps,
    leakage: computed(() => state.leakage),
    leakageTotal,
    auditLog: computed(() => state.auditLog),
    securityMetrics,
    toasts: computed(() => state.toasts),
    byId,
    recordName,
    scoreTone,
    resolvePair,
    resolveAnomaly,
    registerPatient,
    toast,
    logEvent,
  }
}
