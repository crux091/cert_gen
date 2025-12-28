/**
 * Variable Parser Utility
 * Detects and extracts bracketed variables from text content
 * Example: "I, [Name] do solemnly swear..." -> extracts "[Name]"
 */

export interface DetectedVariable {
  name: string // Variable name without brackets (e.g., "Name")
  fullMatch: string // Full match including brackets (e.g., "[Name]")
  startIndex: number // Character position where variable starts
  endIndex: number // Character position where variable ends
}

/**
 * Extracts all bracketed variables from text using case-sensitive matching
 * @param text - Text content to scan for variables
 * @returns Array of detected variables with positions
 */
export function extractVariables(text: string): DetectedVariable[] {
  const regex = /\[([^\]]+)\]/g
  const variables: DetectedVariable[] = []
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    variables.push({
      name: match[1], // Content inside brackets
      fullMatch: match[0], // Full match including brackets
      startIndex: match.index,
      endIndex: match.index + match[0].length
    })
  }

  return variables
}

/**
 * Gets unique variable names from text (case-sensitive)
 * @param text - Text content to scan
 * @returns Array of unique variable names without brackets
 */
export function getUniqueVariableNames(text: string): string[] {
  const variables = extractVariables(text)
  const uniqueNames = new Set(variables.map(v => v.name))
  return Array.from(uniqueNames)
}

/**
 * Checks if text contains any bracketed variables
 * @param text - Text content to check
 * @returns True if text contains at least one variable
 */
export function hasVariables(text: string): boolean {
  return /\[([^\]]+)\]/.test(text)
}

/**
 * Scans multiple text elements and returns all unique variables found
 * @param elements - Array of text content strings
 * @returns Array of unique variable names across all elements
 */
export function getAllUniqueVariables(elements: string[]): string[] {
  const allVariables = new Set<string>()
  
  elements.forEach(text => {
    const variables = getUniqueVariableNames(text)
    variables.forEach(v => allVariables.add(v))
  })
  
  return Array.from(allVariables).sort()
}

/**
 * Replaces a specific variable in text with a value while preserving formatting context
 * @param text - Original text containing variables
 * @param variableName - Variable name to replace (without brackets)
 * @param value - Value to replace with
 * @returns Text with variable replaced
 */
export function replaceVariable(text: string, variableName: string, value: string): string {
  // Case-sensitive replacement of [variableName] with value
  const bracketedVar = `[${variableName}]`
  return text.split(bracketedVar).join(value)
}

/**
 * Replaces all variables in text using a binding map
 * @param text - Original text containing variables
 * @param bindings - Map of variable names to values
 * @returns Text with all bound variables replaced
 */
export function replaceAllVariables(text: string, bindings: Record<string, string>): string {
  let result = text
  
  Object.entries(bindings).forEach(([variableName, value]) => {
    result = replaceVariable(result, variableName, value)
  })
  
  return result
}

/**
 * Validates that all variables in text have bindings
 * @param text - Text containing variables
 * @param bindings - Available variable bindings
 * @returns Array of unbound variable names
 */
export function getUnboundVariables(text: string, bindings: Record<string, string>): string[] {
  const variables = getUniqueVariableNames(text)
  return variables.filter(varName => !bindings[varName])
}
