<script lang="ts">
/** The server's rule, zod's z.email() pattern as is: the form accepts exactly the addresses the server does. */
const EMAIL_RE = /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim())
}
</script>

<script setup lang="ts">
/**
 * The email field of sign-in and sign-up: the phone's keyboard for addresses, no capitals or
 * corrections, and the browser's saved account. Id, name and handlers go to the input.
 */
const model = defineModel<string>({ default: '' })
</script>

<template>
  <UInput
    v-model="model"
    type="email"
    inputmode="email"
    autocomplete="username"
    autocapitalize="none"
    autocorrect="off"
    spellcheck="false"
    maxlength="254"
    size="lg"
    class="w-full"
    :ui="{ base: 'min-h-11 sm:min-h-9' }"
  />
</template>
