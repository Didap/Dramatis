/*
 * Nuxt UI theme for "Il Libretto" (see DESIGN.md). Colours come from main.css; these overrides fix
 * the defaults that fail WCAG AA (solid hover at 75%, 25% focus outline) and raise floating layers.
 */
const floating = 'bg-(--ui-bg-floating) shadow-(--shadow-floating) ring-default'
/** Fields are 2.75rem tall where the pointer is a finger (DESIGN.md, Inputs). */
const touch = 'pointer-coarse:min-h-11'

export default defineAppConfig({
  ui: {
    colors: {
      primary: 'petrolio',
      neutral: 'grafite',
    },

    button: {
      slots: {
        base: 'font-medium transition-colors duration-150',
      },
      compoundVariants: [
        {
          color: 'primary',
          variant: 'solid',
          class: 'hover:bg-(--ui-primary-hover) active:bg-(--ui-primary-hover) outline-primary',
        },
        {
          color: 'neutral',
          variant: 'outline',
          class: 'ring-accented',
        },
      ],
      defaultVariants: {
        color: 'neutral',
        variant: 'ghost',
      },
    },

    input: {
      slots: { base: `max-sm:text-base ${touch}` },
      compoundVariants: [
        { color: 'primary', variant: 'outline', class: 'ring-accented focus-visible:ring-2 focus-visible:ring-primary' },
      ],
    },
    textarea: {
      slots: { base: 'max-sm:text-base' },
      compoundVariants: [
        { color: 'primary', variant: 'outline', class: 'ring-accented focus-visible:ring-2 focus-visible:ring-primary' },
      ],
    },
    select: {
      slots: { content: floating, base: `max-sm:text-base ${touch}` },
      compoundVariants: [
        { color: 'primary', variant: 'outline', class: 'ring-accented focus-visible:ring-2 focus-visible:ring-primary' },
      ],
    },
    selectMenu: {
      slots: { content: floating, base: `max-sm:text-base ${touch}`, input: `max-sm:text-base ${touch}` },
      compoundVariants: [
        { color: 'primary', variant: 'outline', class: 'ring-accented focus-visible:ring-2 focus-visible:ring-primary' },
      ],
    },
    inputMenu: {
      slots: { content: floating, base: `max-sm:text-base ${touch}` },
    },

    popover: { slots: { content: floating } },
    dropdownMenu: { slots: { content: floating } },
    contextMenu: { slots: { content: floating } },
    tooltip: { slots: { content: 'bg-(--ui-bg-floating) shadow-(--shadow-floating) ring-default text-default' } },
    toast: { slots: { root: floating } },
    drawer: { slots: { content: floating } },
    slideover: { slots: { content: floating } },
    modal: { slots: { content: floating } },

    link: {
      base: 'underline-offset-3',
    },

    badge: {
      defaultVariants: { color: 'neutral', variant: 'subtle' },
    },

    // The unchecked track must stand out from the page (WCAG 1.4.11, 3:1): the input outline colour.
    switch: {
      slots: { base: 'data-[state=unchecked]:bg-(--ui-border-accented)' },
    },

    dashboardSidebar: {
      slots: {
        root: 'bg-muted',
      },
    },
  },
})
