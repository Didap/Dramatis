declare module '#auth-utils' {
  interface User {
    id: string
    email: string
    name: string
    locale: string
    timezone: string
  }

  interface UserSession {
    loggedInAt: string
  }
}

export {}
