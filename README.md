# Meridian MPI

A frontend prototype for patient identity management and data-quality governance. Meridian MPI demonstrates how a Master Patient Index (MPI) can help teams improve registration quality, review likely duplicate records, and track data-governance work.

> **Prototype only.** This project uses synthetic sample records and browser-side demo authentication. It is not connected to a clinical system, does not provide production access control, and must not be used to store or process real patient information.

## What it demonstrates

- **Guided patient registration** across demographics, identifiers, and next-of-kin details, with inline validation and a data-integrity score.
- **Record-quality checks** for required fields and common formats such as dates of birth, email addresses, phone numbers, and national identifiers.
- **Potential duplicate review** using weighted record similarity, match explanations, and side-by-side field comparisons.
- **Governance workflows** for reviewing anomalies and deciding whether to merge records, keep them separate, or escalate a case.
- **Governance dashboard** with data-quality indicators, open anomalies, and illustrative billing and resource leakage categories.
- **Role-based interface examples** for registrars, data stewards, and governance leads, with access and activity events shown in the UI.

## Technology

- Vue 3 with the Composition API and `<script setup>`
- Vite
- Tailwind CSS 4 via the Vite plugin
- Vue reactive composables for in-memory application state

## Run locally

### Prerequisites

- Node.js (an active LTS release is recommended)
- npm

### Install and start

```bash
npm install
npm run dev
```

Open the local URL printed by Vite in your terminal.

### Production build

```bash
npm run build
npm run preview
```

The production bundle is generated in `dist/`.

## Demo access

The sign-in screen provides clickable demo accounts for each role. Selecting an account fills in its demo credentials.

| Role | Demo email | Demo password |
|---|---|---|
| Registrar | `s.okafor@meridian.health` | `registrar123` |
| Data steward | `m.haidari@meridian.health` | `steward123` |
| Governance lead | `a.lwanga@meridian.health` | `governance123` |

These credentials are embedded in client-side source code for demonstration and are **not secrets or secure accounts**. The sign-in attempt lockout is also implemented in the browser and is not a security control.

## Application structure

```text
src/
├── App.vue
├── main.js
├── style.css
├── components/
│   ├── DataGovernanceDashboard.vue
│   ├── Login.vue
│   ├── MasterPatientIndex.vue
│   └── PatientRegistrationForm.vue
└── store/
    ├── useAuth.js
    └── useMpiStore.js
```

- `App.vue` provides the authenticated shell and role-filtered navigation.
- `Login.vue` presents the demo sign-in experience.
- `PatientRegistrationForm.vue` implements the guided registration workflow.
- `MasterPatientIndex.vue` presents duplicate candidates and resolution actions.
- `DataGovernanceDashboard.vue` summarizes data-quality and governance activity.
- `useAuth.js` contains the demo roles, capabilities, and browser-side authentication.
- `useMpiStore.js` contains validation, scoring, matching, synthetic seed data, and reactive demo workflows.

## Important limitations

- There is no backend, API, database, or durable patient-record storage. Application records and governance changes are held in client-side reactive state and are not saved to a server.
- Authentication, role checks, audit events, and lockout behavior are demonstration logic in the browser. They do not provide enforceable security or a trustworthy audit trail.
- Seed records and metrics are illustrative synthetic examples. Do not enter real, identifiable, or otherwise sensitive health information.
- Matching scores and validation rules are prototypes for demonstrating review workflows. They are not clinical identity decisions and should not be used to merge real records.
- A production deployment would require, at minimum, a secure backend, server-enforced authorization, audited persistence, privacy and security review, and validation against applicable health-data requirements.

## License

No license is currently specified in this repository. Contact the repository owner before redistributing or reusing the project.
