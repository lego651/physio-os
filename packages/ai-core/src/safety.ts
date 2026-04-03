export type SafetyCategory = 'safe' | 'emergency' | 'off_topic' | 'medical_advice_request' | 'adversarial'
export type SafetyAction = 'proceed' | 'escalate' | 'redirect' | 'block'

export interface SafetyResult {
  safe: boolean
  category: SafetyCategory
  action: SafetyAction
  reason?: string
}

const MAX_MESSAGE_LENGTH = 5000

const EMERGENCY_PATTERNS = [
  // Severe pain (current, not historical)
  /\bpain\s*(?:is|at|of|level|:)?\s*(?:a\s+)?([89]|10)\b/i,
  /\b([89]|10)\s*(?:\/|out\s*of)\s*10\b/i,
  /\bworst\s+pain\b/i,
  /\bcan'?t\s+move\b/i,
  /\bemergency\b/i,
  /\bneed\s+(?:an?\s+)?ambulance\b/i,
  /\bcall\s+911\b/i,
  // Crisis indicators
  /\bsuicidal\b/i,
  /\bwant\s+to\s+die\b/i,
  /\bself[- ]?harm\b/i,
  /\bkill\s+myself\b/i,
  /\bhurt\s+myself\b/i,
  /\bend\s+(?:my\s+)?(?:it|life)\b/i,
  // Chinese emergency phrases
  /痛死/,
  /受不了/,
  /疼死/,
  /不想活/,
  /自杀/,
  /想死/,
  // Numeric pain in Chinese
  /pain\s*[89]级/i,
  /疼痛\s*[89]/,
]

const HISTORICAL_PAIN_PATTERNS = [
  /(?:was|used\s+to\s+be|had\s+been|previously|last\s+(?:week|month|time)|before)\s+[^.]{0,200}(?:pain|[89]|10)\s*(?:\/|out)/i,
  /(?:pain|[89]|10)\s*(?:\/|out)[^.]{0,200}(?:but\s+now|now\s+it'?s|currently|today)/i,
  /went\s+(?:down|from)\s+[^.]{0,50}[89]/i,
]

const ADVERSARIAL_PATTERNS = [
  /ignore\s+(?:your|all|the|previous)\s+(?:instructions|rules|guidelines|prompt)/i,
  /forget\s+(?:your|all|the)\s+(?:rules|instructions|guidelines)/i,
  /you\s+are\s+now\s+(?:a\s+)?(?:doctor|physician|medical|therapist|DAN|evil|unrestricted|unfiltered|general\s+purpose|AI\s+assistant|chatbot|helpful\s+assistant)/i,
  /new\s+(?:instructions|rules|persona)/i,
  /pretend\s+(?:you\s+are|to\s+be)\s+(?:a\s+)?(?:doctor|physician|medical)/i,
  // Require adversarial context near "system prompt/message"
  /(?:ignore|override|forget|reveal|show|print|output)\s+[^.]{0,50}system\s*(?:prompt|message)/i,
  /system\s*(?:prompt|message)\s+[^.]{0,50}(?:ignore|override|forget|reveal|show|print|output)/i,
  // DAN must be followed by "mode" to avoid matching the name Dan
  /\bDAN\s+mode\b/i,
  /jailbreak/i,
  /bypass\s+(?:your|the)\s+(?:rules|safety|filters)/i,
]

const OFF_TOPIC_PATTERNS = [
  /\b(?:stock\s+market|bitcoin|crypto|weather\s+(?:today|forecast)|recipe|cooking\s+tips)\b/i,
  /\b(?:news\s+(?:today|about)|politics|sports\s+scores?|movie\s+recommend)/i,
  /\b(?:tell\s+me\s+a\s+(?:joke|story)|write\s+(?:me\s+)?(?:an?\s+)?(?:email|essay|poem))\b/i,
  /\b(?:help\s+me\s+with\s+(?:my\s+)?(?:homework|code|programming))\b/i,
]

const MEDICAL_ADVICE_PATTERNS = [
  /\bshould\s+I\s+take\b/i,
  /\bwhat\s+(?:dosage|medication|drug|pill|medicine)\b/i,
  /\bis\s+(?:my|this)\s+.*(?:getting\s+worse|serious|dangerous)\b/i,
  /\bdo\s+I\s+(?:need|have)\s+(?:surgery|an?\s+(?:MRI|x-?ray|scan|operation))\b/i,
  /\bdiagnos(?:e|is)\b/i,
  /\bprescri(?:be|ption)\b/i,
  /\bwhat\s+(?:exercises?|stretches?)\s+should\s+I\s+(?:do|add|try)\b/i,
]

// Require "pain" within proximity of the number to avoid false positives like "8 out of 10 reps"
const PAIN_PROXIMITY_PATTERN = /\bpain\b/i

function isHistoricalPainReference(message: string): boolean {
  return HISTORICAL_PAIN_PATTERNS.some(pattern => pattern.test(message))
}

function matchesAny(message: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(message))
}

function isEmergencyPainScore(message: string): boolean {
  // Check if a high numeric score (8-10 out of 10) is pain-related, not exercise-related
  const hasHighScore = /\b([89]|10)\s*(?:\/|out\s*of)\s*10\b/i.test(message)
  if (!hasHighScore) return false
  return PAIN_PROXIMITY_PATTERN.test(message)
}

export function classifyInput(message: string, recentHistory?: string[]): SafetyResult {
  const trimmed = message.trim()

  if (!trimmed) {
    return { safe: true, category: 'safe', action: 'proceed' }
  }

  // Reject overly long messages before regex processing (ReDoS mitigation)
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return {
      safe: false,
      category: 'adversarial',
      action: 'block',
      reason: 'Message exceeds maximum length',
    }
  }

  // Build combined text for multi-turn analysis (cheap mitigation)
  const combinedText = recentHistory
    ? [...recentHistory.slice(-2), trimmed].join(' ')
    : trimmed

  // Check adversarial first (highest priority block) — check both single and combined
  if (matchesAny(trimmed, ADVERSARIAL_PATTERNS) || (recentHistory && matchesAny(combinedText, ADVERSARIAL_PATTERNS))) {
    return {
      safe: false,
      category: 'adversarial',
      action: 'block',
      reason: 'Adversarial prompt detected',
    }
  }

  // Check emergency (but exclude historical references)
  // For numeric scores (8-10/10), require pain context to avoid "8 out of 10 exercises"
  const hasEmergencyPattern = EMERGENCY_PATTERNS.some((pattern, index) => {
    if (index === 1) return isEmergencyPainScore(trimmed) // "X out of 10" pattern
    return pattern.test(trimmed)
  })

  if (hasEmergencyPattern && !isHistoricalPainReference(trimmed)) {
    return {
      safe: false,
      category: 'emergency',
      action: 'escalate',
      reason: 'Emergency situation detected',
    }
  }

  // Check medical advice requests
  if (matchesAny(trimmed, MEDICAL_ADVICE_PATTERNS)) {
    return {
      safe: true,
      category: 'medical_advice_request',
      action: 'redirect',
      reason: 'Medical advice request — defer to practitioner',
    }
  }

  // Check off-topic
  if (matchesAny(trimmed, OFF_TOPIC_PATTERNS)) {
    return {
      safe: true,
      category: 'off_topic',
      action: 'redirect',
      reason: 'Off-topic message detected',
    }
  }

  return { safe: true, category: 'safe', action: 'proceed' }
}
