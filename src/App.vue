<script setup>
import { ref, computed, watch } from 'vue'
import Login from './components/Login.vue'
import DataGovernanceDashboard from './components/DataGovernanceDashboard.vue'
import MasterPatientIndex from './components/MasterPatientIndex.vue'
import PatientRegistrationForm from './components/PatientRegistrationForm.vue'
import { useMpiStore } from './store/useMpiStore.js'
import { useAuth, CAPABILITY_ROWS } from './store/useAuth.js'

const { pendingPairs, openAnomalies, toasts, logEvent } = useMpiStore()
const { user, isAuthenticated, can, logout } = useAuth()

const VIEWS = [
  { key: 'dashboard', label: 'Governance', perm: 'view:dashboard' },
  { key: 'mpi', label: 'Patient index', perm: 'view:mpi' },
  { key: 'register', label: 'Registration', perm: 'view:register' },
]

const view = ref('register')
const menuOpen = ref(false)

const allowedViews = computed(() => VIEWS.filter((v) => can(v.perm)))

const nav = computed(() =>
  allowedViews.value.map((v) => ({
    ...v,
    badge: v.key === 'dashboard' ? openAnomalies.value.length : v.key === 'mpi' ? pendingPairs.value.length : 0,
  })),
)

watch(
  user,
  (u) => {
    if (u) view.value = allowedViews.value[0]?.key ?? 'register'
  },
  { immediate: true },
)

function go(key) {
  if (allowedViews.value.some((v) => v.key === key)) view.value = key
}

function signOut() {
  const u = user.value
  if (u) {
    logEvent({
      actor: u.name,
      role: u.roleLabel,
      action: 'Signed out',
      target: u.email,
      detail: 'Session ended',
      category: 'access',
    })
  }
  menuOpen.value = false
  logout()
}

const toastTone = {
  indigo: 'bg-slate-900 text-white',
  emerald: 'bg-emerald-600 text-white',
  amber: 'bg-amber-500 text-white',
}

const roleBadge = {
  registrar: 'bg-slate-100 text-slate-700',
  steward: 'bg-indigo-50 text-indigo-700',
  lead: 'bg-emerald-50 text-emerald-700',
}
</script>

<template>
  <div class="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
    <Login v-if="!isAuthenticated" />

    <template v-else>
      <header class="sticky top-0 z-30 border-b border-slate-200/80 bg-white/80 backdrop-blur">
        <div class="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-3">
          <div class="flex items-center gap-3">
            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a1 1 0 0 1 1 1v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H3a1 1 0 1 1 0-2h6V3a1 1 0 0 1 1-1Z" /></svg>
            </div>
            <div class="leading-tight">
              <p class="text-sm font-semibold tracking-tight">Meridian MPI</p>
              <p class="text-[11px] text-slate-400">Patient identity & data quality</p>
            </div>
          </div>

          <nav class="flex gap-1 rounded-lg bg-slate-100 p-1">
            <button
              v-for="n in nav"
              :key="n.key"
              type="button"
              class="flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-medium transition"
              :class="view === n.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'"
              @click="go(n.key)"
            >
              {{ n.label }}
              <span
                v-if="n.badge"
                class="rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
                :class="view === n.key ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-200 text-slate-600'"
              >
                {{ n.badge }}
              </span>
            </button>
          </nav>

          <div class="relative">
            <button
              type="button"
              class="flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-slate-100"
              @click="menuOpen = !menuOpen"
            >
              <span class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-medium text-white">{{ user.initials }}</span>
              <span class="hidden text-left leading-tight sm:block">
                <span class="block text-sm font-medium text-slate-800">{{ user.fullName }}</span>
                <span class="block text-[11px] text-slate-400">{{ user.roleLabel }}</span>
              </span>
            </button>

            <div v-if="menuOpen" class="fixed inset-0 z-40" @click="menuOpen = false" />
            <Transition
              enter-active-class="transition duration-150 ease-out"
              enter-from-class="opacity-0 -translate-y-1"
              leave-active-class="transition duration-100"
              leave-to-class="opacity-0"
            >
              <div v-if="menuOpen" class="absolute right-0 z-50 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-4 shadow-xl">
                <p class="text-sm font-medium text-slate-900">{{ user.fullName }}</p>
                <p class="text-xs text-slate-500">{{ user.email }}</p>
                <span class="mt-2 inline-block rounded-md px-2 py-0.5 text-[11px] font-medium" :class="roleBadge[user.role]">{{ user.roleLabel }}</span>

                <ul class="mt-4 space-y-2 border-t border-slate-100 pt-4">
                  <li v-for="row in CAPABILITY_ROWS" :key="row.perm" class="flex items-center gap-2 text-xs" :class="can(row.perm) ? 'text-slate-700' : 'text-slate-300'">
                    <span class="w-3 text-center" :class="can(row.perm) ? 'text-emerald-500' : ''">{{ can(row.perm) ? '✓' : '–' }}</span>
                    {{ row.label }}
                  </li>
                </ul>

                <button type="button" class="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50" @click="signOut">
                  Sign out
                </button>
              </div>
            </Transition>
          </div>
        </div>
      </header>

      <main class="mx-auto max-w-7xl px-6 py-10">
        <Transition
          mode="out-in"
          enter-active-class="transition duration-200 ease-out"
          enter-from-class="opacity-0 translate-y-1"
          leave-active-class="transition duration-100 ease-in"
          leave-to-class="opacity-0"
        >
          <DataGovernanceDashboard v-if="view === 'dashboard'" key="dashboard" @navigate="go" />
          <MasterPatientIndex v-else-if="view === 'mpi'" key="mpi" />
          <PatientRegistrationForm v-else key="register" @navigate="go" />
        </Transition>
      </main>
    </template>

    <div class="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      <TransitionGroup
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 translate-y-2"
        leave-active-class="transition duration-200 ease-in"
        leave-to-class="opacity-0 translate-x-4"
      >
        <div
          v-for="t in toasts"
          :key="t.id"
          class="rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg"
          :class="toastTone[t.tone] || toastTone.indigo"
        >
          {{ t.message }}
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>
