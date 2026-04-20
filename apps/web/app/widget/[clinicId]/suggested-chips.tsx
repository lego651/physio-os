'use client'
const CHIPS = [
  'Do you accept my insurance?',
  'I have back pain — who should I see?',
  'What are your hours?',
  'How do I book an appointment?',
]
export function SuggestedChips({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div>
      <div className="text-sm text-gray-600 mb-2">Ask me about:</div>
      <div className="flex flex-wrap gap-2">
        {CHIPS.map(c => (
          <button key={c} onClick={() => onPick(c)}
            className="rounded-full border px-3 py-1 text-sm hover:bg-gray-100">
            {c}
          </button>
        ))}
      </div>
    </div>
  )
}
