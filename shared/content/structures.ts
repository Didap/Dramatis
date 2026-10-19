/**
 * Story structures offered when a project starts: each one suggests parts
 * (acts or movements), chapters (beats) and narrative strands.
 *
 * Copy lives in i18n/locales/<locale>/structures.json:
 *   structures.<structure>.name / .description
 *   structures.<structure>.parts.<part>
 *   structures.<structure>.chapters.<chapter>.title / .reason
 *   structures.<structure>.strands.<strand>.name / .description
 * Chapter keys are unique within a structure.
 */

import type { Medium } from './profile'

export interface StructureDef {
  key: string
  media: readonly Medium[]
  parts: readonly { key: string, chapters: readonly string[] }[]
  strands: readonly { key: string, kind: 'plot' | 'subplot' | 'arc' | 'quest' | 'side_quest' }[]
}

export const STRUCTURES = [
  // Novel structures
  {
    key: 'three_acts',
    media: ['novel'],
    parts: [
      { key: 'act_1', chapters: ['hook', 'setup', 'inciting_incident', 'first_turning_point'] },
      { key: 'act_2', chapters: ['rising_action', 'midpoint', 'escalation', 'crisis'] },
      { key: 'act_3', chapters: ['climax', 'resolution'] },
    ],
    strands: [
      { key: 'main_plot', kind: 'plot' },
      { key: 'relationship_subplot', kind: 'subplot' },
      { key: 'protagonist_arc', kind: 'arc' },
    ],
  },
  {
    // Christopher Vogler's twelve stages. Widely used by game writers too.
    key: 'heros_journey',
    media: ['novel', 'game'],
    parts: [
      { key: 'departure', chapters: ['ordinary_world', 'call_to_adventure', 'refusal_of_the_call', 'meeting_the_mentor', 'crossing_the_threshold'] },
      { key: 'initiation', chapters: ['tests_allies_enemies', 'approach', 'ordeal', 'reward'] },
      { key: 'return', chapters: ['road_back', 'resurrection', 'return_with_elixir'] },
    ],
    strands: [
      { key: 'outer_journey', kind: 'plot' },
      { key: 'inner_journey', kind: 'arc' },
      { key: 'mentor_bond', kind: 'subplot' },
    ],
  },
  {
    // Blake Snyder's fifteen beats.
    key: 'save_the_cat',
    media: ['novel'],
    parts: [
      { key: 'thesis', chapters: ['opening_image', 'theme_stated', 'setup', 'catalyst', 'debate'] },
      { key: 'antithesis', chapters: ['break_into_two', 'b_story', 'fun_and_games', 'midpoint', 'bad_guys_close_in', 'all_is_lost', 'dark_night_of_the_soul'] },
      { key: 'synthesis', chapters: ['break_into_three', 'finale', 'final_image'] },
    ],
    strands: [
      { key: 'a_story', kind: 'plot' },
      { key: 'b_story', kind: 'subplot' },
      { key: 'transformation', kind: 'arc' },
    ],
  },
  {
    // Dan Wells's seven-point structure.
    key: 'seven_point',
    media: ['novel'],
    parts: [
      { key: 'beginning', chapters: ['hook', 'plot_turn_1'] },
      { key: 'middle', chapters: ['pinch_1', 'midpoint', 'pinch_2'] },
      { key: 'end', chapters: ['plot_turn_2', 'resolution'] },
    ],
    strands: [
      { key: 'main_plot', kind: 'plot' },
      { key: 'protagonist_arc', kind: 'arc' },
      { key: 'secondary_plot', kind: 'subplot' },
    ],
  },
  {
    // Gustav Freytag's pyramid: five acts and three crises.
    key: 'freytag',
    media: ['novel'],
    parts: [
      { key: 'act_1', chapters: ['introduction', 'exciting_force'] },
      { key: 'act_2', chapters: ['complications', 'escalation'] },
      { key: 'act_3', chapters: ['climax', 'reversal'] },
      { key: 'act_4', chapters: ['tragic_force', 'final_suspense'] },
      { key: 'act_5', chapters: ['catastrophe', 'denouement'] },
    ],
    strands: [
      { key: 'main_action', kind: 'plot' },
      { key: 'counter_action', kind: 'subplot' },
      { key: 'tragic_arc', kind: 'arc' },
    ],
  },
  {
    key: 'kishotenketsu',
    media: ['novel'],
    parts: [
      { key: 'ki', chapters: ['world', 'routine'] },
      { key: 'sho', chapters: ['deepening', 'bonds'] },
      { key: 'ten', chapters: ['twist', 'new_perspective'] },
      { key: 'ketsu', chapters: ['convergence', 'new_harmony'] },
    ],
    strands: [
      { key: 'everyday_thread', kind: 'plot' },
      { key: 'unexpected_thread', kind: 'subplot' },
      { key: 'new_understanding', kind: 'arc' },
    ],
  },

  // Game structures
  {
    key: 'game_three_acts',
    media: ['game'],
    parts: [
      { key: 'act_1', chapters: ['cold_open', 'tutorial', 'inciting_incident', 'leaving_home'] },
      { key: 'act_2', chapters: ['exploration', 'companions', 'revelation', 'great_loss'] },
      { key: 'act_3', chapters: ['point_of_no_return', 'final_confrontation', 'ending', 'epilogue'] },
    ],
    strands: [
      { key: 'main_quest', kind: 'quest' },
      { key: 'companion_quests', kind: 'side_quest' },
      { key: 'world_side_quests', kind: 'side_quest' },
    ],
  },
  {
    key: 'hub_and_quests',
    media: ['game'],
    parts: [
      { key: 'arrival', chapters: ['first_sight', 'meet_the_residents', 'first_assignment'] },
      { key: 'questline', chapters: ['mission_one', 'return_to_hub', 'mission_two', 'hub_under_threat', 'mission_three'] },
      { key: 'finale', chapters: ['final_preparations', 'final_mission', 'changed_hub'] },
    ],
    strands: [
      { key: 'main_questline', kind: 'quest' },
      { key: 'hub_stories', kind: 'side_quest' },
      { key: 'contracts', kind: 'side_quest' },
    ],
  },
  {
    // A shared trunk, one fork, three branches with an ending each.
    key: 'branching_endings',
    media: ['game'],
    parts: [
      { key: 'trunk', chapters: ['prologue', 'early_choices', 'convergence', 'fork'] },
      { key: 'hope_branch', chapters: ['hope_path', 'hope_ending'] },
      { key: 'compromise_branch', chapters: ['compromise_path', 'compromise_ending'] },
      { key: 'fall_branch', chapters: ['fall_path', 'fall_ending'] },
    ],
    strands: [
      { key: 'main_quest', kind: 'quest' },
      { key: 'companions_fate', kind: 'side_quest' },
      { key: 'hidden_truth', kind: 'side_quest' },
    ],
  },
] as const satisfies readonly StructureDef[]

export type StructureKey = (typeof STRUCTURES)[number]['key']
