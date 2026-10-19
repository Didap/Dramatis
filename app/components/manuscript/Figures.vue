<script lang="ts">
import { defineComponent, h } from 'vue'

/*
 * A computed count ("2.354 parole") in tabular figures, so numbers line up from row to row, with the
 * thousands separator kept at its own width: in Schibsted Grotesk the tabular period is as wide as a
 * digit and would read "2 . 354".
 */
export default defineComponent({
  name: 'ManuscriptFigures',
  props: {
    text: { type: String, required: true },
  },
  setup(props) {
    return () => {
      // Odd items are the separators found between two digits.
      const parts = props.text.split(/(?<=\d)([.,'’  ])(?=\d)/)
      return h('span', { class: 'tabular' }, parts.map((part, i) => (i % 2 ? h('span', { class: 'manuscript-figures-sep' }, part) : part)))
    }
  },
})
</script>

<style>
.manuscript-figures-sep {
  font-variant-numeric: normal;
}
</style>
