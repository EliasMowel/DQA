<script setup>
import { ref, computed, watch } from 'vue'
import { useMpiStore, compareRecords, scoreRecord, timeAgo } from '../store/useMpiStore.js'
import { useAuth } from '../store/useAuth.js'

const { pendingPairs, duplicatePairs, byId, resolvePair } = useMpiStore()
const { can } = useAuth()

const bandFilter = ref('all')
const threshold = ref(60)
const search = ref('')
const showHistory = ref(false)
const selectedId = ref(null)

const modal = ref(null) // 'merge' | 'separate' | 'escalate' | null
const survivor = ref('A')
const note = ref('')

const BANDS = [
  { key: 'high', label: 'High confidence', range: '90–100%', min: 90, max: 101, accent: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  { key: 'medium', label: 'Probable', range: '75–89%', min: 75, max: 90, accent: 'bg-indigo-500', pill: 'bg-indigo-50 text-indigo-700 ring-indigo-200' },
  { key: 'review', label: 'Needs review', range: '60–74%', min: 0, max: 75, accent: 'bg-amber-400', pill: 'bg-amber-50 text-amber-700 ring-amber-200' },
]

function nameOf(id) {
  const p = byId(id)
  return p ? [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ') : id
}

const visiblePairs = computed(() => {
  const q = search.value.trim().toLowerCase()
  return pendingPairs.value.filter((p) => {
    if (p.confidence < threshold.value) return false
    if (!q) return true
    return [nameOf(p.aId), nameOf(p.bId), p.aId, p.bId].join(' ').toLowerCase().includes(q)
  })
})

const groups = computed(() =>
  BANDS.filter((b) => bandFilter.value === 'all' || bandFilter.value === b.key)
    .map((b) => ({ ...b, pairs: visiblePairs.value.filter((p) => p.confidence >= b.min && p.confidence < b.max) }))
    .filter((g) => g.pairs.length),
)

const bandCounts = computed(() =>
  Object.fromEntries(BANDS.map((b) => [b.key, pendingPairs.value.filter((p) => p.confidence >= b.min && p.confidence < b.max).length])),
)

const history = computed(() => duplicatePairs.value.filter((p) => !['pending', 'superseded', 'escalated'].includes(p.status)))
const escalated = computed(() => duplicatePairs.value.filter((p) => p.status === 'escalated'))

const flatVisible = computed(() => groups.value.flatMap((g) => g.pairs))

watch(
  flatVisible,
  (list) => {
    if (!list.length) {
      if (!showHistory.value) selectedId.value = null
      return
    }
    if (!list.some((p) => p.id === selectedId.value)) selectedId.value = list[0].id
  },
  { immediate: true },
)

const pair = computed(() => duplicatePairs.value.find((p) => p.id === selectedId.value) || null)
const recA = computed(() => (pair.value ? byId(pair.value.aId) : null))
const recB = computed(() => (pair.value ? byId(pair.value.bId) : null))
const rows = computed(() => (recA.value && recB.value ? compareRecords(recA.value, recB.value) : []))
const isPending = computed(() => pair.value?.status === 'pending')
const isEscalated = computed(() => pair.value?.status === 'escalated')
const canMerge = computed(() => (isPending.value && can('pair:merge')) || (isEscalated.value && can('escalation:decide')))
const canSeparate = computed(() => (isPending.value && can('pair:separate')) || (isEscalated.value && can('escalation:decide')))
const canEscalate = computed(() => isPending.value && can('pair:escalate'))
const canAct = computed(() => canMerge.value || canSeparate.value || canEscalate.value)

const diffCount = computed(() => rows.value.filter((r) => ['variation', 'conflict', 'missing'].includes(r.state)).length)
const matchCount = computed(() => rows.value.filter((r) => r.state === 'match').length)

const bandOf = (c) => BANDS.find((b) => c >= b.min && c < b.max) || BANDS[2]

const stateStyle = {
  match: { row: '', chip: 'text-emerald-600', label: 'Match' },
  variation: { row: 'bg-amber-50/60', chip: 'text-amber-600', label: 'Variation' },
  conflict: { row: 'bg-rose-50/50', chip: 'text-rose-600', label: 'Conflict' },
  missing: { row: 'bg-slate-50', chip: 'text-slate-400', label: 'One-sided' },
  empty: { row: '', chip: 'text-slate-300', label: 'Empty' },
}

const statusLabel = {
  merged: 'Merged',
  separate: 'Kept separate',
  escalated: 'Escalated',
}
const statusPill = {
  merged: 'bg-emerald-50 text-emerald-700',
  separate: 'bg-slate-100 text-slate-600',
  escalated: 'bg-amber-50 text-amber-700',
}

const inheritedFields = computed(() => {
  if (!recA.value || !recB.value) return []
  const keep = survivor.value === 'A' ? recA.value : recB.value
  const drop = survivor.value === 'A' ? recB.value : recA.value
  return rows.value.filter((r) => r.state !== 'empty' && !String(keep[r.key] ?? '').trim() && String(drop[r.key] ?? '').trim()).map((r) => r.label)
})

const modalCopy = computed(() => {
  if (modal.value === 'merge') return { title: 'Merge records', cta: 'Confirm merge', tone: 'bg-indigo-600 hover:bg-indigo-700', hint: 'Optional note for the audit trail' }
  if (modal.value === 'escalate') return { title: 'Escalate to governance committee', cta: 'Escalate', tone: 'bg-amber-500 hover:bg-amber-600', hint: 'Why does this need committee review?' }
  return { title: 'Keep records separate', cta: 'Confirm', tone: 'bg-slate-800 hover:bg-slate-900', hint: 'What distinguishes these two patients?' }
})

function openModal(kind) {
  note.value = ''
  survivor.value = recA.value && recB.value && scoreRecord(recB.value) > scoreRecord(recA.value) ? 'B' : 'A'
  modal.value = kind
}

function confirm() {
  if (!pair.value) return
  const id = pair.value.id
  if (modal.value === 'merge') {
    resolvePair(id, 'merge', { survivorId: survivor.value === 'A' ? pair.value.aId : pair.value.bId, note: note.value.trim() })
  } else if (modal.value === 'separate') {
    resolvePair(id, 'separate', { note: note.value.trim() })
  } else if (modal.value === 'escalate') {
    resolvePair(id, 'escalate', { note: note.value.trim() })
  }
  modal.value = null
}

function selectPair(id) {
  selectedId.value = id
}

const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
</script>

<template>
  <div class="space-y-6">
    <header class="flex flex-col gap-1">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-indigo-600">Master Patient Index</p>
      <h1 class="text-2xl font-semibold tracking-tight text-slate-900">Duplicate resolution</h1>
      <p class="max-w-2xl text-sm leading-relaxed text-slate-500">
        Candidate identities are scored on name, birth date, identifiers and contact details. Review each pair and
        decide whether it is one person or two.
      </p>
    </header>

    <div class="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <!-- Queue -->
      <aside class="space-y-4">
        <div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <input
            v-model="search"
            type="search"
            placeholder="Search name or MRN"
            class="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-50"
          />
          <div class="mt-4 flex flex-wrap gap-1.5">
            <button
              type="button"
              class="rounded-md px-2.5 py-1 text-xs font-medium transition"
              :class="bandFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
              @click="bandFilter = 'all'"
            >
              All {{ pendingPairs.length }}
            </button>
            <button
              v-for="b in BANDS"
              :key="b.key"
              type="button"
              class="rounded-md px-2.5 py-1 text-xs font-medium transition"
              :class="bandFilter === b.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
              @click="bandFilter = b.key"
            >
              {{ b.label }} {{ bandCounts[b.key] }}
            </button>
          </div>
          <div class="mt-4">
            <div class="flex items-center justify-between text-xs text-slate-500">
              <label for="threshold">Matching threshold</label>
              <span class="font-medium tabular-nums text-slate-800">{{ threshold }}%</span>
            </div>
            <input id="threshold" v-model.number="threshold" type="range" min="50" max="95" step="5" class="mt-2 w-full accent-indigo-600" />
          </div>
        </div>

        <div v-if="!groups.length" class="rounded-lg border border-dashed border-slate-300 px-4 py-10 text-center">
          <p class="text-sm font-medium text-slate-700">Queue is clear</p>
          <p class="mt-1 text-xs text-slate-500">No pending pairs at or above {{ threshold }}%.</p>
        </div>

        <section v-for="g in groups" :key="g.key">
          <div class="mb-2 flex items-center gap-2 px-1">
            <span class="h-2 w-2 rounded-full" :class="g.accent" />
            <h2 class="text-xs font-semibold uppercase tracking-wider text-slate-500">{{ g.label }}</h2>
            <span class="text-xs text-slate-400">{{ g.range }}</span>
          </div>
          <ul class="space-y-2">
            <li v-for="p in g.pairs" :key="p.id">
              <button
                type="button"
                class="w-full rounded-lg border bg-white p-3.5 text-left shadow-sm transition hover:shadow-md"
                :class="selectedId === p.id ? 'border-indigo-300 ring-4 ring-indigo-50' : 'border-slate-200 hover:border-slate-300'"
                @click="selectPair(p.id)"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium text-slate-900">{{ nameOf(p.aId) }}</p>
                    <p class="truncate text-sm text-slate-500">{{ nameOf(p.bId) }}</p>
                  </div>
                  <span class="rounded-md px-2 py-1 text-xs font-semibold tabular-nums ring-1 ring-inset" :class="g.pill">{{ p.confidence }}%</span>
                </div>
                <p class="mt-2 text-[11px] text-slate-400">{{ p.aId }} · {{ p.bId }} · flagged {{ timeAgo(p.flaggedAt) }}</p>
              </button>
            </li>
          </ul>
        </section>

        <div v-if="escalated.length">
          <h2 class="px-1 text-xs font-semibold uppercase tracking-wider text-amber-600">Awaiting committee ({{ escalated.length }})</h2>
          <ul class="mt-2 space-y-2">
            <li v-for="p in escalated" :key="p.id">
              <button
                type="button"
                class="w-full rounded-lg border bg-amber-50/50 p-3 text-left transition hover:bg-amber-50"
                :class="selectedId === p.id ? 'border-amber-300 ring-4 ring-amber-50' : 'border-amber-200'"
                @click="selectPair(p.id)"
              >
                <span class="block truncate text-sm text-slate-800">{{ nameOf(p.aId) }} ↔ {{ nameOf(p.bId) }}</span>
                <span class="block text-[11px] text-amber-700">{{ p.confidence }}% match{{ can('escalation:decide') ? ' · your decision' : '' }}</span>
              </button>
            </li>
          </ul>
        </div>

        <div v-if="history.length">
          <button type="button" class="flex w-full items-center justify-between px-1 text-xs font-semibold uppercase tracking-wider text-slate-400 transition hover:text-slate-600" @click="showHistory = !showHistory">
            <span>Resolved ({{ history.length }})</span>
            <span>{{ showHistory ? 'Hide' : 'Show' }}</span>
          </button>
          <ul v-if="showHistory" class="mt-2 space-y-2">
            <li v-for="p in history" :key="p.id">
              <button type="button" class="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-left transition hover:bg-white" @click="selectPair(p.id)">
                <div class="flex items-center justify-between gap-2">
                  <span class="truncate text-sm text-slate-700">{{ nameOf(p.aId) }} ↔ {{ nameOf(p.bId) }}</span>
                  <span class="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium" :class="statusPill[p.status]">{{ statusLabel[p.status] }}</span>
                </div>
              </button>
            </li>
          </ul>
        </div>
      </aside>

      <!-- Comparison -->
      <section v-if="pair && recA && recB" class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <p class="text-[11px] font-medium uppercase tracking-wider text-slate-400">{{ pair.id }}</p>
            <h2 class="mt-1 text-lg font-semibold text-slate-900">Are these the same person?</h2>
            <p class="mt-1 text-xs text-slate-500">
              {{ matchCount }} fields agree · {{ diffCount }} differ
              <span v-if="pair.status !== 'pending'"> · <span class="font-medium text-slate-700">{{ statusLabel[pair.status] }}</span></span>
            </p>
          </div>
          <div class="flex items-center gap-3">
            <div class="text-right">
              <p class="text-3xl font-semibold tabular-nums text-slate-900">{{ pair.confidence }}<span class="text-lg text-slate-400">%</span></p>
              <p class="text-[11px] uppercase tracking-wider text-slate-400">match confidence</p>
            </div>
            <span class="h-10 w-1 rounded-full" :class="bandOf(pair.confidence).accent" />
          </div>
        </div>

        <!-- Score breakdown -->
        <div class="grid grid-cols-2 gap-x-6 gap-y-3 border-b border-slate-100 bg-slate-50/60 px-6 py-4 sm:grid-cols-4">
          <div v-for="part in pair.parts" :key="part.key">
            <div class="flex items-center justify-between text-[11px] text-slate-500">
              <span>{{ part.label }}</span>
              <span class="tabular-nums">{{ Math.round(part.sim * 100) }}</span>
            </div>
            <div class="mt-1 h-1 overflow-hidden rounded-full bg-slate-200">
              <div
                class="h-full rounded-full transition-all duration-500"
                :class="part.sim >= 0.9 ? 'bg-emerald-500' : part.sim >= 0.6 ? 'bg-amber-400' : 'bg-rose-400'"
                :style="{ width: Math.round(part.sim * 100) + '%' }"
              />
            </div>
          </div>
        </div>

        <!-- Split view -->
        <div class="px-6 py-5">
          <div class="grid grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)] gap-x-4 pb-3">
            <div />
            <div class="rounded-lg bg-slate-900 px-4 py-3 text-white">
              <p class="text-[10px] uppercase tracking-wider text-slate-400">Record A</p>
              <p class="truncate text-sm font-medium">{{ recA.id }}</p>
              <p class="text-[11px] text-slate-400">Created {{ fmtDate(recA.createdAt) }} · {{ scoreRecord(recA) }} quality</p>
            </div>
            <div class="rounded-lg bg-indigo-600 px-4 py-3 text-white">
              <p class="text-[10px] uppercase tracking-wider text-indigo-200">Record B</p>
              <p class="truncate text-sm font-medium">{{ recB.id }}</p>
              <p class="text-[11px] text-indigo-200">Created {{ fmtDate(recB.createdAt) }} · {{ scoreRecord(recB) }} quality</p>
            </div>
          </div>

          <ul class="space-y-1">
            <li
              v-for="r in rows"
              :key="r.key"
              class="grid grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)] items-start gap-x-4 rounded-lg px-1 py-2.5 transition"
              :class="stateStyle[r.state].row"
            >
              <div class="pl-2">
                <p class="text-xs font-medium text-slate-600">{{ r.label }}</p>
                <p class="text-[10px] font-medium uppercase tracking-wider" :class="stateStyle[r.state].chip">{{ stateStyle[r.state].label }}</p>
              </div>
              <p class="min-w-0 break-words px-3 text-sm text-slate-900">
                <template v-if="r.a.length">
                  <span
                    v-for="(seg, i) in r.a"
                    :key="i"
                    class="whitespace-pre-wrap"
                    :class="seg.diff ? 'rounded-sm bg-amber-200/80 px-px font-semibold text-amber-950' : ''"
                  >{{ seg.ch }}</span>
                </template>
                <span v-else class="text-slate-300">—</span>
              </p>
              <div class="min-w-0 px-3">
                <p class="break-words text-sm text-slate-900">
                  <template v-if="r.b.length">
                    <span
                      v-for="(seg, i) in r.b"
                      :key="i"
                      class="whitespace-pre-wrap"
                      :class="seg.diff ? 'rounded-sm bg-amber-200/80 px-px font-semibold text-amber-950' : ''"
                    >{{ seg.ch }}</span>
                  </template>
                  <span v-else class="text-slate-300">—</span>
                </p>
                <p v-if="r.note" class="mt-1 text-[11px] font-medium text-rose-600">{{ r.note }}</p>
              </div>
            </li>
          </ul>
        </div>

        <!-- Actions -->
        <div class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
          <template v-if="canAct">
            <p class="text-xs text-slate-500">
              {{ isEscalated ? 'Escalated: awaiting your committee decision.' : 'Every decision is written to the audit trail.' }}
            </p>
            <div class="flex flex-wrap gap-2">
              <button v-if="canEscalate" type="button" class="rounded-lg border border-amber-200 bg-white px-4 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-50" @click="openModal('escalate')">
                Escalate to Governance Committee
              </button>
              <button v-if="canSeparate" type="button" class="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100" @click="openModal('separate')">
                Keep Separate
              </button>
              <button v-if="canMerge" type="button" class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 active:scale-[0.98]" @click="openModal('merge')">
                Merge Records
              </button>
            </div>
          </template>
          <template v-else>
            <p class="text-sm text-slate-600">
              <span class="font-medium">{{ statusLabel[pair.status] || 'Pending review' }}</span>
              <span v-if="isPending || isEscalated" class="text-slate-400"> · Your role can review this pair but not decide it.</span>
              <span v-if="pair.survivorId"> into {{ pair.survivorId }}</span>
              <span v-if="pair.note" class="text-slate-400"> · “{{ pair.note }}”</span>
            </p>
          </template>
        </div>
      </section>

      <section v-else class="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white">
        <div class="text-center">
          <p class="text-sm font-medium text-slate-700">No pair selected</p>
          <p class="mt-1 text-xs text-slate-500">Lower the matching threshold or choose a pair from the queue.</p>
        </div>
      </section>
    </div>

    <!-- Confirmation modal -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <div v-if="modal && pair" class="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px]" @click.self="modal = null">
        <div class="w-full max-w-lg rounded-lg bg-white shadow-2xl">
          <div class="border-b border-slate-100 px-6 py-5">
            <h3 class="text-lg font-semibold text-slate-900">{{ modalCopy.title }}</h3>
            <p class="mt-1 text-xs text-slate-500">{{ nameOf(pair.aId) }} ↔ {{ nameOf(pair.bId) }}</p>
          </div>

          <div class="space-y-5 px-6 py-5">
            <div v-if="modal === 'merge'">
              <p class="text-xs font-medium uppercase tracking-wider text-slate-400">Surviving record</p>
              <div class="mt-2 grid grid-cols-2 gap-3">
                <label
                  v-for="opt in [{ k: 'A', rec: recA }, { k: 'B', rec: recB }]"
                  :key="opt.k"
                  class="cursor-pointer rounded-lg border p-3 transition"
                  :class="survivor === opt.k ? 'border-indigo-400 bg-indigo-50/50 ring-4 ring-indigo-50' : 'border-slate-200 hover:border-slate-300'"
                >
                  <input v-model="survivor" type="radio" :value="opt.k" class="sr-only" />
                  <p class="text-[11px] uppercase tracking-wider text-slate-400">Record {{ opt.k }}</p>
                  <p class="mt-0.5 text-sm font-medium text-slate-900">{{ opt.rec.id }}</p>
                  <p class="text-xs text-slate-500">{{ scoreRecord(opt.rec) }} quality score</p>
                </label>
              </div>
              <p class="mt-3 text-xs leading-relaxed text-slate-500">
                <template v-if="inheritedFields.length">
                  The surviving record will inherit: <span class="font-medium text-slate-700">{{ inheritedFields.join(', ') }}</span>.
                </template>
                <template v-else>The surviving record already holds every populated field.</template>
                The other record is retired and remains traceable through the audit trail.
              </p>
            </div>

            <div>
              <label class="text-xs font-medium uppercase tracking-wider text-slate-400" for="decision-note">Note</label>
              <textarea
                id="decision-note"
                v-model="note"
                rows="3"
                :placeholder="modalCopy.hint"
                class="mt-2 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-300 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
              />
            </div>
          </div>

          <div class="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
            <button type="button" class="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100" @click="modal = null">Cancel</button>
            <button
              type="button"
              class="rounded-lg px-4 py-2 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-40"
              :class="modalCopy.tone"
              :disabled="modal === 'escalate' && !note.trim()"
              @click="confirm"
            >
              {{ modalCopy.cta }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
