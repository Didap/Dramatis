/**
 * From xl the list of characters stays beside an open sheet (characters.vue). The author can fold it
 * away to give the sheet the room; it stays folded on this device until opened again.
 */
export function useCharacterListFolded() {
  return useLocalStorage('dramatis:characters:list-folded', false)
}
