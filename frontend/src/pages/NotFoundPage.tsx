import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-50">
      <p className="text-8xl font-bold text-gray-200">404</p>
      <p className="text-lg font-medium text-gray-600">Page not found</p>
      <p className="text-sm text-gray-400">The page you're looking for doesn't exist.</p>
      <Link to="/" className="btn-primary mt-2">Go home</Link>
    </div>
  )
}
