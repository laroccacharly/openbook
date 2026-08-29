export function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function validNewPassword(password: string): boolean {
  return password.length >= 8 && password.length <= 128
}
