/**
 * Character profile: the sections of a main character's sheet, each answered
 * as an interview (the questions below) or as free text.
 *
 * Sections are listed in display order, questions in interview order. Copy lives
 * in i18n/locales/<locale>/profile.json:
 *   profile.sections.<section>.title / .summary
 *   profile.sections.<section>.questions.<question>.label / .hint
 */

export type Medium = 'novel' | 'game'

export interface ProfileSectionDef {
  key: string
  icon: string
  media: readonly Medium[]
  questions: readonly string[]
}

export const PROFILE_SECTIONS = [
  {
    key: 'personal',
    icon: 'i-lucide-id-card',
    media: ['novel', 'game'],
    questions: [
      'full_name',
      'nickname',
      'name_origin',
      'gender',
      'age',
      'birth_date',
      'birthplace',
      'nationality',
      'home',
      'occupation',
      'education',
      'family_status',
      'languages',
      'money',
    ],
  },
  {
    key: 'physical',
    icon: 'i-lucide-scan-face',
    media: ['novel', 'game'],
    questions: [
      'first_impression',
      'apparent_age',
      'height_build',
      'face',
      'eyes',
      'hair',
      'skin',
      'distinguishing_marks',
      'clothing',
      'speaking_voice',
      'smell',
      'health',
      'fitness',
      'self_image',
    ],
  },
  {
    key: 'behavior',
    icon: 'i-lucide-footprints',
    media: ['novel', 'game'],
    questions: [
      'posture',
      'gait',
      'gestures',
      'tics',
      'way_of_speaking',
      'pet_phrases',
      'laugh',
      'with_strangers',
      'under_pressure',
      'when_angry',
      'when_lying',
      'habits',
      'typical_day',
      'when_alone',
    ],
  },
  {
    key: 'psychology',
    icon: 'i-lucide-brain',
    media: ['novel', 'game'],
    questions: [
      'temperament',
      'qualities',
      'flaws',
      'contradictions',
      'self_perception',
      'emotions',
      'decisions',
      'fears',
      'desires',
      'defenses',
      'shame',
      'secret',
      'the_lie',
    ],
  },
  {
    key: 'ideas',
    icon: 'i-lucide-flame',
    media: ['novel', 'game'],
    questions: [
      'beliefs',
      'faith',
      'politics',
      'red_line',
      'role_models',
      'passions',
      'talents',
      'hobbies',
      'favorites',
      'dislikes',
      'strong_opinions',
      'treasured_possession',
      'dreams',
    ],
  },
  {
    key: 'sociology',
    icon: 'i-lucide-users',
    media: ['novel', 'game'],
    questions: [
      'social_background',
      'social_position',
      'parents',
      'siblings',
      'family_role',
      'love_life',
      'friends',
      'enemies',
      'work_relationships',
      'communities',
      'reputation',
      'trust',
      'out_of_place',
    ],
  },
  {
    key: 'backstory',
    // Canonical name of the "history" glyph in current lucide.
    icon: 'i-lucide-rotate-ccw-clock',
    media: ['novel', 'game'],
    questions: [
      'upbringing',
      'earliest_memory',
      'childhood',
      'formative_people',
      'adolescence',
      'first_love',
      'defining_moment',
      'losses',
      'wound',
      'proudest_moment',
      'regret',
      'unfinished_business',
      'day_before',
    ],
  },
  {
    key: 'conflict',
    icon: 'i-lucide-swords',
    media: ['novel', 'game'],
    questions: [
      'want',
      'why_now',
      'need',
      'obstacle',
      'antagonist',
      'inner_obstacle',
      'stakes',
      'worst_case',
      'plan',
      'sacrifice',
      'dilemma',
      'victory',
    ],
  },
  {
    key: 'evolution',
    icon: 'i-lucide-trending-up',
    media: ['novel', 'game'],
    questions: [
      'arc_type',
      'arc_start',
      'catalyst',
      'resistance',
      'first_doubt',
      'turning_point',
      'darkest_moment',
      'decisive_choice',
      'cost_of_change',
      'arc_end',
      'what_remains',
      'seen_by_others',
      'final_image',
    ],
  },
  {
    key: 'gameplay',
    icon: 'i-lucide-gamepad-2',
    media: ['game'],
    questions: [
      'playable',
      'game_role',
      'first_encounter',
      'presence',
      'party_role',
      'abilities',
      'combat_style',
      'signature_move',
      'weaknesses',
      'equipment',
      'progression',
      'player_bond',
      'player_choices',
      'mechanics_and_character',
    ],
  },
  {
    key: 'voice',
    icon: 'i-lucide-mic',
    media: ['game'],
    questions: [
      'voice_type',
      'vocal_age',
      'accent',
      'delivery',
      'vocabulary',
      'catchphrase',
      'emotional_range',
      'sample_barks',
      'efforts',
      'voice_references',
      'localization_notes',
      'direction_notes',
    ],
  },
] as const satisfies readonly ProfileSectionDef[]

export type ProfileSectionKey = (typeof PROFILE_SECTIONS)[number]['key']

/** Main and secondary characters get the whole profile; minor ones a description (VRS-566). */
export function hasFullProfile(importance: 'main' | 'secondary' | 'minor'): boolean {
  return importance !== 'minor'
}
