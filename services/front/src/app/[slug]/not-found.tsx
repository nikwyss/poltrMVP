import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="not-found">
      <h1>Seite nicht gefunden</h1>
      <p>Die angeforderte Seite existiert nicht.</p>
      <Link href="/">Zurück zur Startseite</Link>
    </div>
  )
}
