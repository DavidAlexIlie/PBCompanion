import type { Route } from '../store'

/**
 * The onboarding tour is a list of STAGES (the "1/7" number). A stage has one
 * or more PHASES — "Mai departe" steps through phases, and the number only
 * changes between stages. A phase can move focus, switch route, keep pbinfo
 * visible to spotlight it, or trigger a small demo action.
 */
export interface TourPhase {
  text: string
  title?: string
  targets?: string[] // data-tour selectors; omit to centre
  route?: Route
  showWebview?: boolean // keep pbinfo visible and spotlight it (don't dim it)
  center?: boolean // centred (no targets): plain blur
  action?: 'open-problem' | 'type-code' | 'move-token'
}

export interface TourStage {
  phases: TourPhase[]
}

export const TOUR: TourStage[] = [
  // 1/7
  {
    phases: [
      {
        center: true,
        route: 'home',
        title: 'Bun venit 👋',
        text: 'Haide să începem un tur scurt al aplicației!'
      }
    ]
  },
  // 2/7
  {
    phases: [
      {
        targets: ['[data-tour="browse"]'],
        route: 'home',
        text: 'De aici poți deschide oricând ai nevoie pagina web.'
      },
      { targets: ['[data-tour="browse-card"]'], route: 'home', text: 'Sau de aici.' }
    ]
  },
  // 3/7
  {
    phases: [
      {
        action: 'open-problem',
        route: 'workspace',
        targets: ['[data-tour="nav-workspace"]'],
        text: 'Aici rezolvi problemele propriu-zis.'
      },
      {
        route: 'workspace',
        showWebview: true,
        targets: ['[data-tour="webview"]'],
        text: 'Aici poți citi enunțul problemei.'
      },
      {
        route: 'workspace',
        action: 'type-code',
        targets: ['[data-tour="ws-editor"]'],
        text: 'Aici te apuci să rezolvi problema.'
      },
      {
        route: 'workspace',
        targets: ['[data-tour="ws-actions"]'],
        text: 'După ce ți-ai testat codul, îl poți trimite la verificare.'
      }
    ]
  },
  // 4/7
  {
    phases: [
      {
        targets: ['[data-tour="nav-board"]'],
        route: 'board',
        text: 'Aici îți poți ordona problemele în funcție de progresul la fiecare.'
      },
      {
        route: 'board',
        targets: ['[data-tour="board-col"]'],
        action: 'move-token',
        text: 'Le muți între coloane pe măsură ce avansezi.'
      }
    ]
  },
  // 5/7
  {
    phases: [
      {
        targets: ['[data-tour="nav-groups"]'],
        route: 'groups',
        text: 'Aici îți poți organiza temele, capitolele etc.'
      },
      {
        route: 'groups',
        targets: ['[data-tour="group-card"]'],
        text: 'Care va arăta cam așa!'
      }
    ]
  },
  // 6/7
  {
    phases: [
      {
        targets: ['[data-tour="nav-settings"]'],
        route: 'settings',
        text: 'Aici poți customiza aplicația în orice fel îți convine...'
      }
    ]
  },
  // 7/7
  {
    phases: [{ center: true, route: 'home', title: 'Spor la lucru!', text: '' }]
  }
]

export const TOUR_DONE_KEY = 'pbcompanion.tutorialDone'
