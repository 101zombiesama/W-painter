let counter = 0

/** Short, session-unique id such as `layer-3f9a-12`. */
export function createId(prefix: string): string {
  counter += 1
  const random = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, '0')
  return `${prefix}-${random}-${counter}`
}
