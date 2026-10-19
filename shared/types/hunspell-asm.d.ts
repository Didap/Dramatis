// The editor's spell check loads the CommonJS build of hunspell-asm (see app/utils/spelling.ts): same API.
declare module 'hunspell-asm/dist/cjs/index.js' {
  export * from 'hunspell-asm'
}
