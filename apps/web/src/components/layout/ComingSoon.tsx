interface ComingSoonProps {
  title: string
  phase: number
}

export function ComingSoon({ title, phase }: ComingSoonProps) {
  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">{title}</h1>
      <p className="text-sm text-gray-500 mt-1">Coming in Phase {phase}</p>
    </div>
  )
}
