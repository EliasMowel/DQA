<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { useAuth, DEMO_ACCOUNTS, MAX_ATTEMPTS } from '../store/useAuth.js'
import { useMpiStore } from '../store/useMpiStore.js'

const { login } = useAuth()
const { logEvent } = useMpiStore()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const error = ref('')
const busy = ref(false)

const lockedUntil = ref(0)
const now = ref(Date.now())
let timer = null

const retryIn = computed(() => Math.max(0, Math.ceil((lockedUntil.value - now.value) / 1000)))
const locked = computed(() => retryIn.value > 0)

function startTimer() {
  if (timer) return
  timer = setInterval(() => {
    now.value = Date.now()
    if (now.value >= lockedUntil.value) {
      clearInterval(timer)
      timer = null
      error.value = ''
    }
  }, 500)
}

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

function fill(account) {
  email.value = account.email
  password.value = account.password
  error.value = ''
}

function submit() {
  if (busy.value || locked.value) return
  error.value = ''
  busy.value = true
  setTimeout(() => {
    const res = login(email.value, password.value)
    busy.value = false

    if (res.ok) {
      logEvent({
        actor: res.user.name,
        role: res.user.roleLabel,
        action: 'Signed in',
        target: res.user.email,
        detail: 'Session started',
        category: 'access',
      })
      return
    }

    const who = email.value.trim().toLowerCase() || 'unknown'
    if (res.reason === 'locked') {
      lockedUntil.value = Date.now() + res.retryIn * 1000
      now.value = Date.now()
      startTimer()
      error.value = 'Too many failed attempts.'
      if (res.justLocked) {
        logEvent({
          actor: 'Security',
          role: 'Automation',
          action: 'Account temporarily locked',
          target: who,
          detail: `${MAX_ATTEMPTS} failed sign-in attempts`,
          category: 'security',
        })
      }
    } else {
      error.value =
        res.attemptsLeft === 1
          ? 'Email or password is incorrect. One attempt left.'
          : 'Email or password is incorrect.'
      logEvent({
        actor: 'Security',
        role: 'Automation',
        action: 'Failed sign-in blocked',
        target: who,
        detail: `${MAX_ATTEMPTS - res.attemptsLeft} failed attempt(s)`,
        category: 'security',
      })
    }
  }, 350)
}

const roleBadge = {
  registrar: 'bg-slate-100 text-slate-700',
  steward: 'bg-indigo-50 text-indigo-700',
  lead: 'bg-emerald-50 text-emerald-700',
}
</script>

<template>
  <div class="grid min-h-screen bg-slate-50 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
    <aside class="relative hidden flex-col justify-between overflow-hidden bg-slate-900 p-12 text-white lg:flex">
      <div class="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-indigo-500/20 blur-3xl" />
      <div class="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />

      <div class="relative flex items-center gap-3">
        <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500">
          <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a1 1 0 0 1 1 1v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H3a1 1 0 1 1 0-2h6V3a1 1 0 0 1 1-1Z" /></svg>
        </div>
        <span class="text-sm font-semibold tracking-tight">Meridian MPI</span>
      </div>

      <div class="relative max-w-md">
        <h1 class="text-4xl font-semibold leading-tight tracking-tight">Clean identities, accountable changes.</h1>
        <ul class="mt-10 space-y-5 text-sm leading-relaxed text-slate-300">
          <li class="flex gap-3">
            <span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
            Every merge, edit and escalation is attributed to a named person.
          </li>
          <li class="flex gap-3">
            <span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
            Roles decide who can resolve, who can escalate and who makes the final call.
          </li>
          <li class="flex gap-3">
            <span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
            Failed sign-ins are logged, and accounts lock after three attempts.
          </li>
        </ul>
      </div>

      <p class="relative text-xs text-slate-500">Patient identity and data quality</p>
    </aside>

    <main class="flex items-center justify-center px-6 py-12">
      <div class="w-full max-w-md">
        <p class="text-xs font-medium uppercase tracking-[0.18em] text-indigo-600">Secure access</p>
        <h2 class="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Sign in</h2>
        <p class="mt-1 text-sm text-slate-500">Use your work account to continue.</p>

        <form class="mt-8 space-y-5" novalidate @submit.prevent="submit">
          <div>
            <label for="login-email" class="mb-1.5 block text-xs font-medium text-slate-600">Email</label>
            <input
              id="login-email"
              v-model="email"
              type="email"
              autocomplete="username"
              placeholder="name@meridian.health"
              class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-300 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
            />
          </div>
          <div>
            <div class="mb-1.5 flex items-center justify-between">
              <label for="login-password" class="text-xs font-medium text-slate-600">Password</label>
              <button type="button" class="text-xs text-slate-400 transition hover:text-slate-600" @click="showPassword = !showPassword">
                {{ showPassword ? 'Hide' : 'Show' }}
              </button>
            </div>
            <input
              id="login-password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
            />
          </div>

          <p v-if="error" class="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">
            {{ error }}
            <span v-if="locked" class="font-medium tabular-nums"> Try again in {{ retryIn }}s.</span>
          </p>

          <button
            type="submit"
            class="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="busy || locked || !email || !password"
          >
            {{ busy ? 'Signing in…' : locked ? `Locked for ${retryIn}s` : 'Sign in' }}
          </button>
        </form>

        <section class="mt-10">
          <div class="flex items-baseline justify-between">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400">Demo accounts</h3>
            <span class="text-[11px] text-slate-400">Click to fill</span>
          </div>
          <ul class="mt-3 space-y-2">
            <li v-for="a in DEMO_ACCOUNTS" :key="a.email">
              <button
                type="button"
                class="w-full rounded-lg border border-slate-200 bg-white p-3.5 text-left shadow-sm transition hover:border-indigo-200 hover:shadow-md"
                @click="fill(a)"
              >
                <div class="flex items-center justify-between gap-3">
                  <span class="text-sm font-medium text-slate-900">{{ a.name }}</span>
                  <span class="rounded-md px-2 py-0.5 text-[11px] font-medium" :class="roleBadge[a.role]">{{ a.roleLabel }}</span>
                </div>
                <p class="mt-1 text-xs leading-relaxed text-slate-500">{{ a.blurb }}</p>
                <p class="mt-2 font-mono text-[11px] text-slate-400">{{ a.email }} · {{ a.password }}</p>
              </button>
            </li>
          </ul>
          <p class="mt-4 text-[11px] leading-relaxed text-slate-400">
            Demo only: credentials are checked in the browser. A real deployment must authenticate on a server.
          </p>
        </section>
      </div>
    </main>
  </div>
</template>
