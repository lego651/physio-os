export type SafetyCategory = 'safe' | 'emergency' | 'off_topic' | 'medical_advice_request' | 'adversarial'
export type SafetyAction = 'proceed' | 'escalate' | 'redirect' | 'block'

export interface SafetyResult {
  safe: boolean
  category: SafetyCategory
  action: SafetyAction
  reason?: string
}

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
  /(?:was|used\s+to\s+be|had\s+been|previously|last\s+(?:week|month|time)|before)\s+.*(?:pain|[89]|10)\s*(?:\/|out)/i,
  /(?:pain|[89]|10)\s*(?:\/|out).*(?:but\s+now|now\s+it'?s|currently|today)/i,
  /went\s+(?:down|from)\s+.*[89]/i,
]

const ADVERSARIAL_PATTERNS = [
  /ignore\s+(?:your|all|the|previous)\s+(?:instructions|rules|guidelines|prompt)/i,
  /forget\s+(?:your|all|the)\s+(?:rules|instructions|guidelines)/i,
  /you\s+are\s+now\s+(?:a\s+)?(?:doctor|physician|medical|therapist|DAN|evil|unrestricted|unfiltered|general\s+purpose|AI\s+assistant|chatbot|helpful\s+assistant)/i,
  /new\s+(?:instructions|rules|persona)/i,
  /pretend\s+(?:you\s+are|to\s+be)\s+(?:a\s+)?(?:doctor|physician|medical)/i,
  /system\s*(?:prompt|message)/i,
  /\bDAN\b/,
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

function isHistoricalPainReference(message: string): boolean {
  return HISTORICAL_PAIN_PATTERNS.some(pattern => pattern.test(message))
}

function matchesAny(message: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(message))
}

export function classifyInput(message: string): SafetyResult {
  const trimmed = message.trim()

  if (!trimmed) {
    return { safe: true, category: 'safe', action: 'proceed' }
  }

  // Check adversarial first (highest priority block)
  if (matchesAny(trimmed, ADVERSARIAL_PATTERNS)) {
    return {
      safe: false,
      category: 'adversarial',
      action: 'block',
      reason: 'Adversarial prompt detected',
    }
  }

  // Check emergency (but exclude historical references)
  if (matchesAny(trimmed, EMERGENCY_PATTERNS) && !isHistoricalPainReference(trimmed)) {
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
