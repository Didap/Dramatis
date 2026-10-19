<script setup lang="ts">
/** A scene of the example novel in the editor: prose, two mentions, the caret where the author stopped. */
const { t } = useI18n()
const { words } = useFormat()
</script>

<template>
  <LandingEditorFrame
    :caption="t('landing.specimen.novel.caption')"
    :chapter="t('landing.specimen.novel.chapter')"
    :position="t('landing.specimen.novel.position')"
    :title="t('landing.specimen.novel.title')"
    :count="words(412)"
    :today="1240"
  >
    <p>{{ t('landing.specimen.novel.p1') }}</p>
    <i18n-t keypath="landing.specimen.novel.p2" tag="p" class="indent-[1.5em]" scope="global">
      <template #teresa><span class="mention">{{ t('landing.specimen.novel.teresa') }}</span></template>
      <template #pen><span class="mention">{{ t('landing.specimen.novel.pen') }}</span></template>
    </i18n-t>
    <p class="indent-[1.5em]">{{ t('landing.specimen.novel.p3') }}</p>
    <p class="indent-[1.5em]">{{ t('landing.specimen.novel.p4') }}<span class="landing-caret" aria-hidden="true" /></p>
  </LandingEditorFrame>
</template>

<style scoped>
/* The caret, in the accent, after the last word (DESIGN.md: the accent is the caret and the selection). */
.landing-caret {
  display: inline-block;
  width: 2px;
  height: 1.15em;
  margin-inline-start: 2px;
  vertical-align: -0.2em;
  background: var(--ui-primary);
  /* A few blinks, then still: under five seconds (WCAG 2.2.2). */
  animation: landing-caret 1.1s steps(1) 4;
}
@keyframes landing-caret {
  50% {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .landing-caret {
    animation: none;
  }
}
</style>
