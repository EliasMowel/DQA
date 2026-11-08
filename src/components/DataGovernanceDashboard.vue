<script setup>
import { ref, computed } from 'vue'
import { useMpiStore, formatMoney, timeAgo } from '../store/useMpiStore.js'
import { useAuth } from '../store/useAuth.js'

const emit = defineEmits(['navigate'])

const {
  anomalies,
  openAnomalies,
  pendingPairs,
  incompleteRecords,
  activePatients,
  integrityScore,
  fieldGaps,
  leakage,
  leakageTotal,
  auditLog,
  securityMetrics,
  recordName,
  scoreTone,
  resolveAnomaly,
} = useMpiStore()

const { can, user } = useAuth()

const filter = ref('all')
const selectedId = ref(null)
const note = ref('')

const filters = computed(() => [
  { key: 'all', label: 'Open', count: openAnomalies.value.length },
  { key: 'critical', label: 'Critical', count: openAnomalies.value.filter((a) => a.severity === 'critical').length },
  { key: 'warning', label: 'Attention', count: openAnomalies.value.filter((a) => a.severity === 'warning').length },
  { key: 'closed', label: 'Closed', count: anomalies.value.filter((a) => a.status !== 'open').length },
])

const rows = computed(() => {
  const list = anomalies.value
  if (filter.value === 'closed') return list.filter((a) => a.status !== 'open')
  const open = list.filter((a) => a.status === 'open')
  if (filter.value === 'all') return open
  return open.filter((a) => a.severity === filter.value)
})

const selected = computed(() => anomalies.value.find((a) => a.id === selectedId.value) || null)

const R = 42
const C = 2 * Math.PI * R
const dashOffset = computed(() => C * (1 - integrityScore.value / 100))
const tone = computed(() => scoreTone(integrityScore.value))

const toneText = { emerald: 'text-emerald-600', amber: 'text-amber-600', rose: 'text-rose-600' }
const toneStroke = { emerald: 'stroke-emerald-500', amber: 'stroke-amber-500', rose: 'stroke-rose-500' }
const toneLabel = { emerald: 'Healthy', amber: 'Needs attention', rose: 'At risk' }

const severityPill = {
  critical: 'bg-rose-50 text-rose-700 ring-rose-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
}
const statusPill = {
  open: 'bg-slate-100 text-slate-600',
  resolved: 'bg-emerald-50 text-emerald-700',
  escalated: 'bg-amber-50 text-amber-700',
}
const categoryDot = {
  merge: 'bg-indigo-500',
  escalation: 'bg-amber-500',
  security: 'bg-rose-500',
  registration: 'bg-emerald-500',
  review: 'bg-slate-400',
  access: 'bg-indigo-300',
}

const maxLeak = computed(() => Math.max(...leakage.value.map((l) => l.amount), 1))
const maxGap = computed(() => Math.max(...fieldGaps.value.map((g) => g.count), 1))

const seesAllAudit = computed(() => can('audit:all'))
const visibleAudit = computed(() =>
  seesAllAudit.value ? auditLog.value : auditLog.value.filter((e) => e.actor === user.value?.name),
)

const drawerMode = computed(() => {
  const a = selected.value
  if (!a) return 'none'
  if (a.status === 'open') return can('anomaly:resolve') ? 'work' : 'readonly'
  if (a.status === 'escalated') return can('escalation:decide') ? 'decide' : 'readonly'
  return 'none'
})

function open(a) {
  selectedId.value = a.id
  note.value = ''
}
function close() {
  selectedId.value = null
}
function act(status) {
  if (!selected.value) return
  resolveAnomaly(selected.value.id, status, note.value.trim())
  close()
}
function goToMpi() {
  close()
  emit('navigate', 'mpi')
}
</script>

<template>
  <div class="space-y-8">
    <header class="flex flex-col gap-1">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-indigo-600">Data governance</p>
      <h1 class="text-2xl font-semibold tracking-tight text-slate-900">Integrity overview</h1>
      <p class="max-w-2xl text-sm leading-relaxed text-slate-500">
        Quality of the patient index across {{ activePatients.length }} active records, updated as records are
        registered, reviewed and merged.
      </p>
    </header>

    <!-- Status cards -->
    <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
        <div class="flex items-center gap-4">
          <div class="relative h-24 w-24 shrink-0">
            <svg viewBox="0 0 100 100" class="h-24 w-24 -rotate-90">
              <circle cx="50" cy="50" :r="R" fill="none" class="stroke-slate-100" stroke-width="8" />
              <circle
                cx="50"
                cy="50"
                :r="R"
                fill="none"
                stroke-width="8"
                stroke-linecap="round"
                :class="[toneStroke[tone], 'transition-all duration-700 ease-out']"
                :stroke-dasharray="C"
                :stroke-dashoffset="dashOffset"
              />
            </svg>
            <div class="absolute inset-0 flex flex-col items-center justify-center">
              <span class="text-2xl font-semibold tabular-nums text-slate-900">{{ integrityScore }}</span>
            </div>
          </div>
          <div>
            <p class="text-xs font-medium uppercase tracking-wider text-slate-400">Data Integrity Score</p>
            <p class="mt-1 text-sm font-medium" :class="toneText[tone]">{{ toneLabel[tone] }}</p>
            <p class="mt-1 text-xs text-slate-400">Completeness, validity and duplicate pressure</p>
          </div>
        </div>
      </div>

      <button
        type="button"
        class="group rounded-lg border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-indigo-200 hover:shadow-md"
        @click="emit('navigate', 'mpi')"
      >
        <p class="text-xs font-medium uppercase tracking-wider text-slate-400">Pending duplicates</p>
        <p class="mt-3 text-4xl font-semibold tabular-nums text-slate-900">{{ pendingPairs.length }}</p>
        <p class="mt-2 text-xs text-slate-500">
          {{ pendingPairs.filter((p) => p.confidence >= 90).length }} at 90% confidence or higher
        </p>
        <p class="mt-4 text-xs font-medium text-indigo-600 transition group-hover:translate-x-0.5">
          Open resolution centre →
        </p>
      </button>

      <div class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
        <p class="text-xs font-medium uppercase tracking-wider text-slate-400">Incomplete records</p>
        <p class="mt-3 text-4xl font-semibold tabular-nums text-slate-900">{{ incompleteRecords.length }}</p>
        <p class="mt-2 text-xs text-slate-500">
          {{ Math.round((incompleteRecords.length / (activePatients.length || 1)) * 100) }}% of active records score
          below 90
        </p>
        <div class="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            class="h-full rounded-full bg-amber-400 transition-all duration-700"
            :style="{ width: Math.round((incompleteRecords.length / (activePatients.length || 1)) * 100) + '%' }"
          />
        </div>
      </div>

      <div class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
        <p class="text-xs font-medium uppercase tracking-wider text-slate-400">Estimated leakage</p>
        <p class="mt-3 text-4xl font-semibold tabular-nums text-slate-900">{{ formatMoney(leakageTotal) }}</p>
        <p class="mt-2 text-xs text-slate-500">Trailing 90 days, attributed to dirty data</p>
        <p class="mt-4 text-xs text-slate-400">{{ openAnomalies.length }} open anomalies feeding this figure</p>
      </div>
    </section>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <!-- Anomalies -->
      <section class="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-3 px-6 pt-5">
          <div>
            <h2 class="text-base font-semibold text-slate-900">Active anomalies</h2>
            <p class="text-xs text-slate-500">Select a row to review the suggested fix.</p>
          </div>
          <div class="flex gap-1 rounded-lg bg-slate-100 p-1">
            <button
              v-for="f in filters"
              :key="f.key"
              type="button"
              class="rounded-md px-3 py-1.5 text-xs font-medium transition"
              :class="filter === f.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
              @click="filter = f.key"
            >
              {{ f.label }}
              <span class="ml-1 tabular-nums text-slate-400">{{ f.count }}</span>
            </button>
          </div>
        </div>

        <ul class="mt-4 divide-y divide-slate-100">
          <li v-if="!rows.length" class="px-6 py-12 text-center text-sm text-slate-400">
            Nothing in this view. Records here are in good standing.
          </li>
          <li v-for="a in rows" :key="a.id">
            <button
              type="button"
              class="flex w-full items-center gap-4 px-6 py-4 text-left transition hover:bg-slate-50"
              @click="open(a)"
            >
              <span
                class="inline-flex w-[72px] shrink-0 justify-center rounded-md px-2 py-1 text-[11px] font-medium capitalize ring-1 ring-inset"
                :class="severityPill[a.severity]"
              >
                {{ a.severity === 'warning' ? 'attention' : a.severity }}
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium text-slate-900">{{ a.rule }}</span>
                <span class="block truncate text-xs text-slate-500">
                  {{ recordName(a.recordId) }} · {{ a.recordId }} · {{ timeAgo(a.detectedAt) }}
                </span>
              </span>
              <span v-if="a.status !== 'open'" class="rounded-md px-2 py-1 text-[11px] font-medium capitalize" :class="statusPill[a.status]">
                {{ a.status }}
              </span>
              <span v-else-if="a.impact" class="hidden text-xs tabular-nums text-slate-400 sm:block">
                {{ formatMoney(a.impact) }} at risk
              </span>
              <svg class="h-4 w-4 shrink-0 text-slate-300" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clip-rule="evenodd" />
              </svg>
            </button>
          </li>
        </ul>
      </section>

      <!-- Side column -->
      <div class="space-y-6">
        <section class="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 class="text-base font-semibold text-slate-900">Where dirty data costs money</h2>
          <p class="text-xs text-slate-500">Billing and resource leakage, last 90 days</p>
          <ul class="mt-5 space-y-5">
            <li v-for="l in leakage" :key="l.id">
              <div class="flex items-baseline justify-between gap-3">
                <span class="text-sm text-slate-700">{{ l.label }}</span>
                <span class="text-sm font-medium tabular-nums text-slate-900">{{ formatMoney(l.amount) }}</span>
              </div>
              <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  class="h-full rounded-full bg-indigo-500 transition-all duration-700"
                  :style="{ width: Math.round((l.amount / maxLeak) * 100) + '%' }"
                />
              </div>
              <p class="mt-1.5 text-[11px] text-slate-400">{{ l.cases }} cases · {{ l.hint }}</p>
            </li>
          </ul>
        </section>

        <section class="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 class="text-base font-semibold text-slate-900">Incomplete fields</h2>
          <p class="text-xs text-slate-500">Records with a missing or invalid value</p>
          <ul class="mt-5 space-y-3">
            <li v-for="g in fieldGaps" :key="g.key" class="flex items-center gap-3">
              <span class="w-28 shrink-0 text-xs text-slate-600">{{ g.label }}</span>
              <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div class="h-full rounded-full bg-amber-400 transition-all duration-700" :style="{ width: Math.round((g.count / maxGap) * 100) + '%' }" />
              </div>
              <span class="w-12 text-right text-xs tabular-nums text-slate-500">{{ g.count }} · {{ g.pct }}%</span>
            </li>
            <li v-if="!fieldGaps.length" class="text-sm text-emerald-600">Every required field is complete.</li>
          </ul>
        </section>
      </div>
    </div>

    <!-- Audit -->
    <section class="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 class="text-base font-semibold text-slate-900">Audit trail</h2>
          <p class="text-xs text-slate-500">
            {{ seesAllAudit ? 'Every data action is attributed and timestamped.' : 'Showing your own actions. Governance leads see the full trail.' }}
          </p>
        </div>
        <dl v-if="seesAllAudit" class="flex gap-6">
          <div v-for="m in securityMetrics" :key="m.label" class="text-right">
            <dd class="text-lg font-semibold tabular-nums text-slate-900">{{ m.value }}</dd>
            <dt class="text-[11px] uppercase tracking-wider text-slate-400">{{ m.label }}</dt>
          </div>
        </dl>
      </div>
      <ul class="mt-5 divide-y divide-slate-100">
        <li v-if="!visibleAudit.length" class="py-8 text-center text-sm text-slate-400">No actions recorded for you yet.</li>
        <li v-for="e in visibleAudit.slice(0, 7)" :key="e.id" class="flex items-start gap-4 py-3">
          <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full" :class="categoryDot[e.category] || 'bg-slate-400'" />
          <div class="min-w-0 flex-1">
            <p class="text-sm text-slate-800">
              <span class="font-medium">{{ e.action }}</span>
              <span class="text-slate-400"> · </span>
              <span class="text-slate-600">{{ e.target }}</span>
            </p>
            <p class="truncate text-xs text-slate-500">{{ e.detail }}</p>
          </div>
          <div class="shrink-0 text-right">
            <p class="text-xs text-slate-600">{{ e.actor }}</p>
            <p class="text-[11px] text-slate-400">{{ timeAgo(e.at) }}</p>
          </div>
        </li>
      </ul>
    </section>

    <!-- Detail drawer -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <div v-if="selected" class="fixed inset-0 z-40 flex justify-end bg-slate-900/20 backdrop-blur-[2px]" @click.self="close">
        <aside class="flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
          <div class="flex items-start justify-between border-b border-slate-100 px-6 py-5">
            <div>
              <p class="text-[11px] font-medium uppercase tracking-wider text-slate-400">{{ selected.id }}</p>
              <h3 class="mt-1 text-lg font-semibold text-slate-900">{{ selected.rule }}</h3>
            </div>
            <button type="button" class="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600" @click="close">
              <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
            </button>
          </div>

          <div class="flex-1 space-y-6 overflow-y-auto px-6 py-6">
            <dl class="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt class="text-[11px] uppercase tracking-wider text-slate-400">Patient</dt>
                <dd class="mt-1 text-slate-900">{{ recordName(selected.recordId) }}</dd>
                <dd class="text-xs text-slate-500">{{ selected.recordId }}</dd>
              </div>
              <div>
                <dt class="text-[11px] uppercase tracking-wider text-slate-400">Field</dt>
                <dd class="mt-1 capitalize text-slate-900">{{ selected.field.replace(/([A-Z])/g, ' $1') }}</dd>
              </div>
              <div>
                <dt class="text-[11px] uppercase tracking-wider text-slate-400">Severity</dt>
                <dd class="mt-1">
                  <span class="inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ring-1 ring-inset" :class="severityPill[selected.severity]">
                    {{ selected.severity === 'warning' ? 'attention' : selected.severity }}
                  </span>
                </dd>
              </div>
              <div>
                <dt class="text-[11px] uppercase tracking-wider text-slate-400">Detected</dt>
                <dd class="mt-1 text-slate-900">{{ timeAgo(selected.detectedAt) }}</dd>
              </div>
            </dl>

            <div class="rounded-lg bg-slate-50 p-4">
              <p class="text-[11px] font-medium uppercase tracking-wider text-slate-400">Suggested fix</p>
              <p class="mt-2 text-sm leading-relaxed text-slate-700">{{ selected.fix }}</p>
            </div>

            <div v-if="selected.status !== 'open'" class="rounded-lg border border-slate-200 p-4 text-sm text-slate-600">
              <span class="font-medium capitalize text-slate-800">{{ selected.status }}</span>
              <span v-if="selected.resolvedAt"> · {{ timeAgo(selected.resolvedAt) }}</span>
              <p v-if="selected.resolvedNote" class="mt-1 text-xs text-slate-500">{{ selected.resolvedNote }}</p>
            </div>

            <div v-else>
              <label class="text-[11px] font-medium uppercase tracking-wider text-slate-400" for="resolution-note">Resolution note</label>
              <textarea
                id="resolution-note"
                v-model="note"
                rows="3"
                placeholder="What was checked or changed?"
                class="mt-2 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-300 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
              />
            </div>
          </div>

          <p v-if="drawerMode === 'readonly'" class="border-t border-slate-100 px-6 py-4 text-xs text-slate-500">
            Your role can view this item but not act on it.
          </p>
          <div v-else-if="drawerMode === 'work' || drawerMode === 'decide'" class="flex flex-wrap gap-2 border-t border-slate-100 px-6 py-4">
            <button v-if="selected.link === 'mpi'" type="button" class="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700" @click="goToMpi">
              Open in index
            </button>
            <button v-else type="button" class="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700" @click="act('resolved')">
              Mark resolved
            </button>
            <button v-if="drawerMode === 'work'" type="button" class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800 transition hover:bg-amber-100" @click="act('escalated')">
              Escalate
            </button>
          </div>
        </aside>
      </div>
    </Transition>
  </div>
</template>
