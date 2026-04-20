export function HandoffButtons({ phone }: { phone: string }) {
  return (
    <div className="flex gap-2 border-t px-3 py-2 text-sm">
      <a href={`sms:${phone}`} className="rounded bg-gray-100 px-3 py-1 hover:bg-gray-200">Text us</a>
      <a href={`tel:${phone}`} className="rounded bg-gray-100 px-3 py-1 hover:bg-gray-200">Call us</a>
    </div>
  )
}
