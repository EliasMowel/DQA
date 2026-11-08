import { reactive, computed } from 'vue'

/*
 * Demo authentication.
 * Credentials are checked in the browser only, so this shows the role model and
 * the UX. A real deployment must authenticate on a server and issue sessions there.
 */

export const MAX_ATTEMPTS = 3
export const LOCK_SECONDS = 30

export const CAPABILITY_ROWS = [
  { perm: 'view:register', label: 'Register patients' },
  { perm: 'view:dashboard', label: 'View the governance dashboard' },
  { perm: 'anomaly:resolve', label: 'Resolve or escalate anomalies' },
  { perm: 'pair:merge', label: 'Merge or separate duplicates' },
  { perm: 'pair:escalate', label: 'Escalate to the committee' },
  { perm: 'escalation:decide', label: 'Decide escalated cases' },
  { perm: 'audit:all', label: 'See the full audit trail' },
]

export const ROLES = {
  registrar: {
    key: 'registrar',
    label: 'Registrar',
    blurb: 'Front-desk registration only. Governance data is hidden.',
    permissions: ['view:register', 'register:patient'],
  },
  steward: {
    key: 'steward',
    label: 'Data steward',
    blurb: 'Resolves anomalies and duplicates. Can escalate, but cannot decide escalations.',
    permissions: [
      'view:register',
      'register:patient',
      'view:dashboard',
      'view:mpi',
      'anomaly:resolve',
      'pair:merge',
      'pair:separate',
      'pair:escalate',
    ],
  },
  lead: {
    key: 'lead',
    label: 'Governance lead',
    blurb: 'Full access. Decides escalated cases and sees the complete audit trail.',
    permissions: [
      'view:register',
      'register:patient',
      'view:dashboard',
      'view:mpi',
      'anomaly:resolve',
      'pair:merge',
      'pair:separate',
      'pair:escalate',
      'escalation:decide',
      'audit:all',
    ],
  },
}

const USERS = [
  { id: 'u-okafor', email: 's.okafor@meridian.health', password: 'registrar123', name: 'S. Okafor', fullName: 'Sade Okafor', role: 'registrar' },
  { id: 'u-haidari', email: 'm.haidari@meridian.health', password: 'steward123', name: 'M. Haidari', fullName: 'Mariam Haidari', role: 'steward' },
  { id: 'u-lwanga', email: 'a.lwanga@meridian.health', password: 'governance123', name: 'A. Lwanga', fullName: 'Amos Lwanga', role: 'lead' },
]

export const DEMO_ACCOUNTS = USERS.map((u) => ({
  email: u.email,
  password: u.password,
  name: u.fullName,
  role: u.role,
  roleLabel: ROLES[u.role].label,
  blurb: ROLES[u.role].blurb,
}))

const SESSION_KEY = 'mpi.session'

function readSession() {
  try {
    return sessionStorage.getItem(SESSION_KEY)
  } catch {
    return null
  }
}

function writeSession(value) {
  try {
    if (value) sessionStorage.setItem(SESSION_KEY, value)
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* storage can be unavailable; the session then lasts until reload */
  }
}

const restored = readSession()

const state = reactive({
  userId: USERS.some((u) => u.id === restored) ? restored : null,
  attempts: {},
  lockedUntil: {},
})

const user = computed(() => {
  const u = USERS.find((x) => x.id === state.userId)
  if (!u) return null
  const initials = u.fullName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    fullName: u.fullName,
    role: u.role,
    roleLabel: ROLES[u.role].label,
    initials,
  }
})

function can(permission) {
  const u = user.value
  return !!u && ROLES[u.role].permissions.includes(permission)
}

function login(email, password) {
  const key = String(email ?? '').trim().toLowerCase()
  const until = state.lockedUntil[key] || 0
  if (until > Date.now()) {
    return { ok: false, reason: 'locked', retryIn: Math.ceil((until - Date.now()) / 1000), email: key }
  }

  const match = USERS.find((u) => u.email === key)
  if (match && match.password === password) {
    state.attempts[key] = 0
    delete state.lockedUntil[key]
    state.userId = match.id
    writeSession(match.id)
    return { ok: true, user: user.value }
  }

  const count = (state.attempts[key] || 0) + 1
  if (count >= MAX_ATTEMPTS) {
    state.attempts[key] = 0
    state.lockedUntil[key] = Date.now() + LOCK_SECONDS * 1000
    return { ok: false, reason: 'locked', retryIn: LOCK_SECONDS, email: key, justLocked: true }
  }
  state.attempts[key] = count
  return { ok: false, reason: 'invalid', attemptsLeft: MAX_ATTEMPTS - count, email: key }
}

function logout() {
  state.userId = null
  writeSession(null)
}

export function useAuth() {
  return {
    user,
    isAuthenticated: computed(() => !!user.value),
    can,
    login,
    logout,
  }
}
