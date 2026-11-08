<script setup>
import { reactive, ref, computed } from 'vue'
import {
  useMpiStore,
  validateField,
  matchScore,
  scoreRecord,
  scoreTone,
  FIELD_CONFIG,
  RELATIONS,
} from '../store/useMpiStore.js'
import { useAuth } from '../store/useAuth.js'

const emit = defineEmits(['navigate'])
const { activePatients, registerPatient, toast } = useMpiStore()
const { can } = useAuth()

const steps = [
  {
    key: 'demographics',
    title: 'Demographics',
    subtitle: 'Who the patient is',
    fields: [
      { key: 'firstName', type: 'text', placeholder: 'e.g. Demo', autocomplete: 'given-name' },
      { key: 'middleName', type: 'text', placeholder: 'Optional', autocomplete: 'additional-name' },
      { key: 'lastName', type: 'text', placeholder: 'e.g. Patient', autocomplete: 'family-name' },
      { key: 'dob', type: 'date', placeholder: '' },
      {
        key: 'sex',
        type: 'select',
        options: [
          { value: 'F', label: 'Female' },
          { value: 'M', label: 'Male' },
          { value: 'X', label: 'Other / unspecified' },
        ],
      },
      { key: 'address', type: 'text', placeholder: 'Street, locality', wide: true, autocomplete: 'street-address' },
    ],
  },
  {
    key: 'identifiers',
    title: 'Identifiers',
    subtitle: 'How we verify them',
    fields: [
      { key: 'phone', type: 'tel', placeholder: '+255 7XX XXX XXX' },
      { key: 'email', type: 'email', placeholder: 'name@example.com' },
      {
        key: 'nationalId',
        type: 'text',
        placeholder: '20 digits, starts with YYYYMMDD',
        wide: true,
        hint: 'The first eight digits are cross-checked against the date of birth.',
      },
    ],
  },
  {
    key: 'kin',
    title: 'Next of kin',
    subtitle: 'Who we contact',
    fields: [
      { key: 'nokName', type: 'text', placeholder: 'Full name' },
      {
        key: 'nokRelation',
        type: 'select',
        options: RELATIONS.map((r) => ({ value: r, label: r })),
      },
      { key: 'nokPhone', type: 'tel', placeholder: '+255 7XX XXX XXX' },
    ],
  },
]

const blank = () => Object.fromEntries(Object.keys(FIELD_CONFIG).map((k) => [k, '']))
const form = reactive(blank())
const touched = reactive({})
const attempted = reactive({ 0: false, 1: false, 2: false })
const step = ref(0)
const acknowledged = ref(false)
const created = ref(null)

const results = computed(() =>
  Object.fromEntries(Object.keys(FIELD_CONFIG).map((k) => [k, validateField(k, form[k], form)])),
)

const score = computed(() => scoreRecord(form))
const tone = computed(() => scoreTone(score.value))
const toneText = { emerald: 'text-emerald-600', amber: 'text-amber-600', rose: 'text-rose-600' }
const toneStroke = { emerald: 'stroke-emerald-500', amber: 'stroke-amber-500', rose: 'stroke-rose-500' }

const R = 36
const C = 2 * Math.PI * R
const dashOffset = computed(() => C * (1 - score.value / 100))

function visible(key) {
  return form[key] !== '' || touched[key] || attempted[step.value]
}

function inputClass(key) {
  if (!visible(key)) return 'border-slate-200 focus:border-indigo-400 focus:ring-indigo-50'
  const s = results.value[key].status
  if (s === 'error') return 'border-rose-300 focus:border-rose-400 focus:ring-rose-50'
  if (s === 'warning') return 'border-amber-300 focus:border-amber-400 focus:ring-amber-50'
  return 'border-emerald-300 focus:border-emerald-400 focus:ring-emerald-50'
}

const textFor = { valid: 'text-emerald-600', warning: 'text-amber-600', error: 'text-rose-600' }
const dotFor = { valid: 'bg-emerald-500', warning: 'bg-amber-400', error: 'bg-rose-500' }

const stepHasError = (i) => steps[i].fields.some((f) => results.value[f.key].status === 'error')
const stepWarnings = (i) => steps[i].fields.filter((f) => results.value[f.key].status === 'warning').length

/* Duplicate detection runs while the user types. */
const candidates = computed(() => {
  const hasName = form.firstName.trim().length >= 2 && form.lastName.trim().length >= 2
  const hasDob = results.value.dob.status === 'valid' && !results.value.dob.empty
  if (!hasName || !hasDob) return []
  const probe = {
    firstName: form.firstName,
    lastName: form.lastName,
    dob: form.dob,
    sex: results.value.sex.status === 'valid' ? form.sex : '',
    phone: results.value.phone.status === 'valid' ? form.phone : '',
    nationalId: results.value.nationalId.status !== 'error' ? form.nationalId.replace(/[\s-]/g, '') : '',
    address: '',
  }
  return activePatients.value
    .map((p) => ({ patient: p, ...matchScore(probe, p) }))
    .filter((m) => m.score >= 75)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
})

const topMatch = computed(() => candidates.value[0] || null)
const needsAck = computed(() => !!topMatch.value && topMatch.value.score >= 90)

const minimumMet = computed(() =>
  ['firstName', 'lastName', 'dob', 'sex'].every((k) => !results.value[k].empty && results.value[k].status !== 'error'),
)
const anyError = computed(() => Object.values(results.value).some((r) => r.status === 'error'))
const totalWarnings = computed(() => Object.values(results.value).filter((r) => r.status === 'warning').length)

const blockers = computed(() => {
  const list = []
  if (!minimumMet.value) list.push('Name, date of birth and sex are required')
  if (anyError.value) list.push('Fix the fields marked in red')
  if (needsAck.value && !acknowledged.value) list.push('Confirm this is not the existing patient')
  return list
})

function next() {
  if (stepHasError(step.value)) {
    attempted[step.value] = true
    toast('Fix the highlighted fields to continue', 'amber')
    return
  }
  attempted[step.value] = false
  step.value = Math.min(2, step.value + 1)
}

function back() {
  step.value = Math.max(0, step.value - 1)
}

function submit() {
  if (blockers.value.length) {
    Object.keys(attempted).forEach((k) => (attempted[k] = true))
    toast(blockers.value[0], 'amber')
    return
  }
  const rec = registerPatient(form)
  if (!rec) return
  created.value = { rec, score: score.value, warnings: totalWarnings.value }
}

function reset() {
  Object.assign(form, blank())
  Object.keys(touched).forEach((k) => delete touched[k])
  Object.keys(attempted).forEach((k) => (attempted[k] = false))
  acknowledged.value = false
  created.value = null
  step.value = 0
}

function loadSample() {
  Object.assign(form, {
    firstName: 'Demo',
    middleName: 'Alfa',
    lastName: 'Patient',
    dob: '1990-01-01',
    sex: 'F',
    address: 'Example Street, Demo District',
    phone: '+000 0000 00000',
    email: 'patient01@example.com',
    nationalId: '00000000000000000000',
    nokName: '',
    nokRelation: '',
    nokPhone: '',
  })
  acknowledged.value = false
  step.value = 0
  toast('Sample loaded: close to an existing record', 'indigo')
}

function useExisting() {
  const id = topMatch.value.patient.id
  reset()
  toast(`Continue with existing record ${id}`, 'emerald')
}

const statusOrder = ['firstName', 'lastName', 'dob', 'sex', 'address', 'phone', 'email', 'nationalId', 'nokName', 'nokRelation', 'nokPhone']
</script>

<template>
  <div class="space-y-8">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div class="flex flex-col gap-1">
        <p class="text-xs font-medium uppercase tracking-[0.18em] text-indigo-600">Patient registration</p>
        <h1 class="text-2xl font-semibold tracking-tight text-slate-900">Register a patient</h1>
        <p class="max-w-2xl text-sm leading-relaxed text-slate-500">
          Fields are checked as you type, and the index is searched for existing people before a new record is
          created.
        </p>
      </div>
      <button v-if="!created" type="button" class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50" @click="loadSample">
        Load sample entry
      </button>
    </header>

    <!-- Success -->
    <section v-if="created" class="mx-auto max-w-xl rounded-lg border border-emerald-200 bg-white p-10 text-center shadow-sm">
      <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <svg class="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z" clip-rule="evenodd" /></svg>
      </div>
      <h2 class="mt-5 text-xl font-semibold text-slate-900">{{ created.rec.firstName }} {{ created.rec.lastName }} registered</h2>
      <p class="mt-1 text-sm text-slate-500">Medical record number <span class="font-medium text-slate-800">{{ created.rec.id }}</span></p>
      <div class="mt-6 flex justify-center gap-8">
        <div>
          <p class="text-2xl font-semibold tabular-nums text-slate-900">{{ created.score }}</p>
          <p class="text-[11px] uppercase tracking-wider text-slate-400">Integrity score</p>
        </div>
        <div>
          <p class="text-2xl font-semibold tabular-nums text-slate-900">{{ created.warnings }}</p>
          <p class="text-[11px] uppercase tracking-wider text-slate-400">Open follow-ups</p>
        </div>
      </div>
      <div class="mt-8 flex justify-center gap-3">
        <button v-if="can('view:dashboard')" type="button" class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50" @click="emit('navigate', 'dashboard')">View governance</button>
        <button type="button" class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700" @click="reset">Register another</button>
      </div>
    </section>

    <div v-else class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div class="space-y-5">
        <!-- Stepper -->
        <ol class="flex gap-2">
          <li v-for="(s, i) in steps" :key="s.key" class="flex-1">
            <button
              type="button"
              class="group w-full text-left"
              @click="i <= step || !stepHasError(step) ? (step = i) : next()"
            >
              <div class="h-1 rounded-full transition-all duration-300" :class="i < step ? 'bg-emerald-500' : i === step ? 'bg-indigo-600' : 'bg-slate-200'" />
              <p class="mt-2 text-xs font-medium" :class="i === step ? 'text-slate-900' : 'text-slate-400'">
                {{ i + 1 }}. {{ s.title }}
              </p>
              <p class="hidden text-[11px] text-slate-400 sm:block">{{ s.subtitle }}</p>
            </button>
          </li>
        </ol>

        <!-- Duplicate badge -->
        <Transition
          enter-active-class="transition duration-300 ease-out"
          enter-from-class="opacity-0 -translate-y-1"
          leave-active-class="transition duration-150"
          leave-to-class="opacity-0"
        >
          <div v-if="topMatch" class="rounded-lg border border-amber-200 bg-amber-50/70 p-4">
            <div class="flex items-start gap-3">
              <svg class="mt-0.5 h-5 w-5 shrink-0 text-amber-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.49 2.88a1.75 1.75 0 0 1 3.02 0l6.25 10.75A1.75 1.75 0 0 1 16.25 16.25H3.75a1.75 1.75 0 0 1-1.51-2.62L8.49 2.88ZM10 7a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 7Zm0 7.5a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8Z" clip-rule="evenodd" /></svg>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-amber-900">
                  Possible existing patient · {{ topMatch.score }}% match
                </p>
                <ul class="mt-2 space-y-1.5">
                  <li v-for="c in candidates" :key="c.patient.id" class="flex flex-wrap items-center gap-x-2 text-xs text-amber-900/80">
                    <span class="font-medium">{{ c.patient.firstName }} {{ c.patient.middleName }} {{ c.patient.lastName }}</span>
                    <span>· {{ c.patient.id }}</span>
                    <span>· born {{ c.patient.dob }}</span>
                    <span class="rounded bg-amber-100 px-1.5 py-0.5 font-medium tabular-nums">{{ c.score }}%</span>
                    <span v-if="c.parts.find((p) => p.key === 'dob' && p.note)" class="text-rose-600">
                      {{ c.parts.find((p) => p.key === 'dob').note }}
                    </span>
                  </li>
                </ul>
                <div class="mt-3 flex flex-wrap items-center gap-3">
                  <button type="button" class="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-600" @click="useExisting">
                    Use existing record
                  </button>
                  <label v-if="needsAck" class="flex cursor-pointer items-center gap-2 text-xs text-amber-900">
                    <input v-model="acknowledged" type="checkbox" class="h-3.5 w-3.5 rounded border-amber-300 accent-amber-600" />
                    This is a different person
                  </label>
                </div>
              </div>
            </div>
          </div>
        </Transition>

        <!-- Fields -->
        <form class="rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8" novalidate @submit.prevent="step === 2 ? submit() : next()">
          <div class="mb-6">
            <h2 class="text-lg font-semibold text-slate-900">{{ steps[step].title }}</h2>
            <p class="text-sm text-slate-500">{{ steps[step].subtitle }}</p>
          </div>

          <div class="grid gap-x-5 gap-y-6 sm:grid-cols-2">
            <div v-for="f in steps[step].fields" :key="f.key" :class="f.wide ? 'sm:col-span-2' : ''">
              <div class="mb-1.5 flex items-center justify-between">
                <label :for="f.key" class="text-xs font-medium text-slate-600">
                  {{ FIELD_CONFIG[f.key].label }}
                  <span v-if="FIELD_CONFIG[f.key].required" class="text-slate-300">*</span>
                </label>
                <span v-if="visible(f.key)" class="flex items-center gap-1.5 text-[11px] font-medium" :class="textFor[results[f.key].status]">
                  <span class="h-1.5 w-1.5 rounded-full" :class="dotFor[results[f.key].status]" />
                  {{ results[f.key].status === 'valid' ? 'Valid' : results[f.key].status === 'warning' ? 'Check' : 'Error' }}
                </span>
              </div>

              <select
                v-if="f.type === 'select'"
                :id="f.key"
                v-model="form[f.key]"
                class="w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:ring-4"
                :class="inputClass(f.key)"
                @blur="touched[f.key] = true"
              >
                <option value="" disabled>Select</option>
                <option v-for="o in f.options" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
              <input
                v-else
                :id="f.key"
                v-model="form[f.key]"
                :type="f.type"
                :placeholder="f.placeholder"
                :autocomplete="f.autocomplete || 'off'"
                class="w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-300 outline-none transition focus:ring-4"
                :class="inputClass(f.key)"
                @blur="touched[f.key] = true"
              />

              <p v-if="visible(f.key)" class="mt-1.5 text-xs" :class="textFor[results[f.key].status]">{{ results[f.key].message }}</p>
              <p v-else-if="f.hint" class="mt-1.5 text-xs text-slate-400">{{ f.hint }}</p>
            </div>
          </div>

          <div class="mt-8 flex items-center justify-between border-t border-slate-100 pt-5">
            <button
              type="button"
              class="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:invisible"
              :disabled="step === 0"
              @click="back"
            >
              Back
            </button>
            <div class="flex items-center gap-4">
              <p v-if="stepWarnings(step)" class="hidden text-xs text-amber-600 sm:block">
                {{ stepWarnings(step) }} to review
              </p>
              <button
                v-if="step < 2"
                type="submit"
                class="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 active:scale-[0.98]"
              >
                Continue
              </button>
              <button
                v-else
                type="submit"
                class="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                :disabled="blockers.length > 0"
              >
                Register patient
              </button>
            </div>
          </div>
          <ul v-if="step === 2 && blockers.length" class="mt-4 space-y-1">
            <li v-for="b in blockers" :key="b" class="text-xs text-rose-600">{{ b }}</li>
          </ul>
        </form>
      </div>

      <!-- Live integrity panel -->
      <aside class="lg:sticky lg:top-6 lg:self-start">
        <div class="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p class="text-[11px] font-medium uppercase tracking-wider text-slate-400">Live integrity score</p>
          <div class="mt-4 flex items-center gap-5">
            <div class="relative h-20 w-20 shrink-0">
              <svg viewBox="0 0 90 90" class="h-20 w-20 -rotate-90">
                <circle cx="45" cy="45" :r="R" fill="none" class="stroke-slate-100" stroke-width="7" />
                <circle
                  cx="45"
                  cy="45"
                  :r="R"
                  fill="none"
                  stroke-width="7"
                  stroke-linecap="round"
                  :class="[toneStroke[tone], 'transition-all duration-500 ease-out']"
                  :stroke-dasharray="C"
                  :stroke-dashoffset="dashOffset"
                />
              </svg>
              <span class="absolute inset-0 flex items-center justify-center text-xl font-semibold tabular-nums" :class="toneText[tone]">{{ score }}</span>
            </div>
            <p class="text-xs leading-relaxed text-slate-500">
              Rises as required fields are completed and validated.
            </p>
          </div>

          <ul class="mt-6 space-y-2.5">
            <li v-for="k in statusOrder" :key="k" class="flex items-center justify-between text-xs">
              <span class="text-slate-600">{{ FIELD_CONFIG[k].label }}</span>
              <span class="flex items-center gap-1.5">
                <span v-if="results[k].empty" class="text-slate-300">empty</span>
                <span v-else :class="textFor[results[k].status]">{{ results[k].status }}</span>
                <span class="h-1.5 w-1.5 rounded-full" :class="results[k].empty ? 'bg-slate-200' : dotFor[results[k].status]" />
              </span>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  </div>
</template>
