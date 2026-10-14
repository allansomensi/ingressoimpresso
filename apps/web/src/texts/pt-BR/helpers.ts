/** The sentence's first letter in upper case ("o 0042" → "O 0042"). */
export function capital(text: string): string {
  return text.charAt(0).toLocaleUpperCase("pt-BR") + text.slice(1);
}
