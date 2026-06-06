import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  GraduationCap, Shield, BookOpen, User,
  Eye, EyeOff, ArrowLeft, CheckCircle,
} from 'lucide-react'
import { useLogin, useSignup } from '../hooks/useAuth'
import { Spinner } from '../components/ui/Spinner'
import { cn } from '../lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

type Role = 'admin' | 'professor' | 'student'
type Mode = 'select-role' | 'signin' | 'signup'

// ── Validation schemas ─────────────────────────────────────────────────────────

const signinSchema = z.object({
  email: z.string().min(1, 'Email or phone is required'),
  password: z.string().min(1, 'Password is required'),
})

const signupSchema = z.object({
  name: z.string().min(1, 'Full name is required').max(100),
  email: z.string().min(1, 'Email or phone is required').refine((v) => {
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const phoneRe = /^\+?\d{7,15}$/
    return emailRe.test(v) || phoneRe.test(v)
  }, 'Enter a valid email address or phone number'),
  password: z.string().min(8, 'At least 8 characters'),
  confirm_password: z.string().min(1, 'Please confirm your password'),
  roll_number: z.string().optional(),
}).refine((d) => d.password === d.confirm_password, {
  message: "Passwords don't match",
  path: ['confirm_password'],
})

type SigninForm = z.infer<typeof signinSchema>
type SignupForm = z.infer<typeof signupSchema>

// ── Role cards config ─────────────────────────────────────────────────────────

const ROLES: {
  key: Role
  label: string
  icon: React.ElementType
  description: string
  color: string
  iconBg: string
  border: string
  activeBg: string
}[] = [
  {
    key: 'admin',
    label: 'Administrator',
    icon: Shield,
    description: 'Manage users, semesters, and institution-wide reports',
    color: 'text-violet-700',
    iconBg: 'bg-violet-100',
    border: 'border-violet-200',
    activeBg: 'bg-violet-50 border-violet-400 ring-2 ring-violet-200',
  },
  {
    key: 'professor',
    label: 'Professor',
    icon: BookOpen,
    description: 'Create assignments, evaluate submissions, and track grades',
    color: 'text-blue-700',
    iconBg: 'bg-blue-100',
    border: 'border-blue-200',
    activeBg: 'bg-blue-50 border-blue-400 ring-2 ring-blue-200',
  },
  {
    key: 'student',
    label: 'Student',
    icon: User,
    description: 'View assignments, submit work, and check your results',
    color: 'text-emerald-700',
    iconBg: 'bg-emerald-100',
    border: 'border-emerald-200',
    activeBg: 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-200',
  },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('select-role')
  const [selectedRole, setSelectedRole] = useState<Role | null>(null)

  const handleRoleSelect = (role: Role, nextMode: Mode) => {
    setSelectedRole(role)
    setMode(nextMode)
  }

  const goBack = () => setMode('select-role')

  const selectedRoleCfg = ROLES.find((r) => r.key === selectedRole)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-primary-50 flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 px-6 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600 shadow-sm">
          <GraduationCap className="h-5 w-5 text-white" />
        </div>
        <span className="text-base font-bold text-gray-900">AI Academic Platform</span>
      </header>

      {/* Main */}
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-2xl">

          {/* ── Step 1: Role selection ── */}
          {mode === 'select-role' && (
            <div className="space-y-8">
              <div className="text-center">
                <h1 className="text-3xl font-bold text-gray-900">Welcome</h1>
                <p className="mt-2 text-gray-500">Choose your role to get started</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {ROLES.map((role) => (
                  <RoleCard
                    key={role.key}
                    role={role}
                    onSignIn={() => handleRoleSelect(role.key, 'signin')}
                    onSignUp={() => handleRoleSelect(role.key, 'signup')}
                  />
                ))}
              </div>

              <p className="text-center text-xs text-gray-400">
                Select your role to sign in or create a new account
              </p>
            </div>
          )}

          {/* ── Step 2: Sign In ── */}
          {mode === 'signin' && selectedRole && (
            <AuthCard
              title="Sign In"
              subtitle={`as ${selectedRoleCfg?.label}`}
              roleColor={selectedRoleCfg?.color ?? 'text-primary-700'}
              roleIconBg={selectedRoleCfg?.iconBg ?? 'bg-primary-100'}
              RoleIcon={selectedRoleCfg?.icon ?? User}
              onBack={goBack}
              footer={
                <p className="text-sm text-gray-500 text-center">
                  Don't have an account?{' '}
                  <button
                    className="font-semibold text-primary-600 hover:text-primary-700 underline-offset-2 hover:underline"
                    onClick={() => setMode('signup')}
                  >
                    Sign up
                  </button>
                </p>
              }
            >
              <SignInForm role={selectedRole} />
            </AuthCard>
          )}

          {/* ── Step 3: Sign Up ── */}
          {mode === 'signup' && selectedRole && (
            <AuthCard
              title="Create Account"
              subtitle={`as ${selectedRoleCfg?.label}`}
              roleColor={selectedRoleCfg?.color ?? 'text-primary-700'}
              roleIconBg={selectedRoleCfg?.iconBg ?? 'bg-primary-100'}
              RoleIcon={selectedRoleCfg?.icon ?? User}
              onBack={goBack}
              footer={
                <p className="text-sm text-gray-500 text-center">
                  Already have an account?{' '}
                  <button
                    className="font-semibold text-primary-600 hover:text-primary-700 underline-offset-2 hover:underline"
                    onClick={() => setMode('signin')}
                  >
                    Sign in
                  </button>
                </p>
              }
            >
              <SignUpForm role={selectedRole} />
            </AuthCard>
          )}
        </div>
      </main>
    </div>
  )
}

// ── Role Card ─────────────────────────────────────────────────────────────────

function RoleCard({
  role,
  onSignIn,
  onSignUp,
}: {
  role: (typeof ROLES)[number]
  onSignIn: () => void
  onSignUp: () => void
}) {
  return (
    <div
      className={cn(
        'flex flex-col rounded-2xl border bg-white p-5 shadow-sm transition-all hover:shadow-md',
        role.border
      )}
    >
      {/* Icon */}
      <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl', role.iconBg)}>
        <role.icon className={cn('h-6 w-6', role.color)} />
      </div>

      {/* Text */}
      <div className="mt-4 flex-1">
        <h3 className={cn('font-semibold', role.color)}>{role.label}</h3>
        <p className="mt-1 text-xs text-gray-400 leading-relaxed">{role.description}</p>
      </div>

      {/* Actions */}
      <div className="mt-5 flex flex-col gap-2">
        <button
          onClick={onSignIn}
          className={cn(
            'w-full rounded-lg py-2 text-sm font-semibold transition-colors',
            role.key === 'admin'
              ? 'bg-violet-600 text-white hover:bg-violet-700'
              : role.key === 'professor'
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-emerald-600 text-white hover:bg-emerald-700'
          )}
        >
          Sign In
        </button>
        <button
          onClick={onSignUp}
          className={cn(
            'w-full rounded-lg border py-2 text-sm font-semibold transition-colors',
            role.key === 'admin'
              ? 'border-violet-200 text-violet-700 hover:bg-violet-50'
              : role.key === 'professor'
              ? 'border-blue-200 text-blue-700 hover:bg-blue-50'
              : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
          )}
        >
          Sign Up
        </button>
      </div>
    </div>
  )
}

// ── Auth Card wrapper ─────────────────────────────────────────────────────────

function AuthCard({
  title,
  subtitle,
  roleColor,
  roleIconBg,
  RoleIcon,
  onBack,
  children,
  footer,
}: {
  title: string
  subtitle: string
  roleColor: string
  roleIconBg: string
  RoleIcon: React.ElementType
  onBack: () => void
  children: React.ReactNode
  footer: React.ReactNode
}) {
  return (
    <div className="mx-auto max-w-md">
      {/* Back */}
      <button
        onClick={onBack}
        className="mb-6 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Choose a different role
      </button>

      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', roleIconBg)}>
            <RoleIcon className={cn('h-5 w-5', roleColor)} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">{title}</h2>
            <p className={cn('text-sm font-medium', roleColor)}>{subtitle}</p>
          </div>
        </div>

        {children}

        <div className="mt-5 pt-4 border-t border-gray-100">
          {footer}
        </div>
      </div>
    </div>
  )
}

// ── Sign In Form ──────────────────────────────────────────────────────────────

function SignInForm({ role }: { role: Role }) {
  const { mutate: login, isPending } = useLogin()
  const [showPw, setShowPw] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<SigninForm>({
    resolver: zodResolver(signinSchema),
  })

  return (
    <form
      onSubmit={handleSubmit((d) => login({ email: d.email, password: d.password }))}
      className="space-y-4"
      noValidate
    >
      <div>
        <label htmlFor="si-email" className="label">Email or Phone</label>
        <input
          id="si-email"
          type="text"
          autoComplete="username"
          className="input"
          placeholder="you@example.com or +1234567890"
          {...register('email')}
          aria-invalid={!!errors.email}
        />
        {errors.email && (
          <p className="mt-1 text-xs text-red-600" role="alert">{errors.email.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="si-password" className="label">Password</label>
        <div className="relative">
          <input
            id="si-password"
            type={showPw ? 'text' : 'password'}
            autoComplete="current-password"
            className="input pr-10"
            placeholder="••••••••"
            {...register('password')}
            aria-invalid={!!errors.password}
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            onClick={() => setShowPw((p) => !p)}
            aria-label={showPw ? 'Hide password' : 'Show password'}
          >
            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.password && (
          <p className="mt-1 text-xs text-red-600" role="alert">{errors.password.message}</p>
        )}
      </div>

      <button type="submit" className="btn-primary w-full py-2.5 mt-2" disabled={isPending}>
        {isPending && <Spinner className="h-4 w-4" />}
        Sign In
      </button>
    </form>
  )
}

// ── Sign Up Form ──────────────────────────────────────────────────────────────

function SignUpForm({ role }: { role: Role }) {
  const { mutate: signup, isPending } = useSignup()
  const [showPw, setShowPw] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
  })

  const onSubmit = (d: SignupForm) => {
    signup({
      name: d.name,
      email: d.email,
      password: d.password,
      role,
      roll_number: d.roll_number || undefined,
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div>
        <label htmlFor="su-name" className="label">Full Name</label>
        <input
          id="su-name"
          type="text"
          autoComplete="name"
          className="input"
          placeholder="Jane Smith"
          {...register('name')}
          aria-invalid={!!errors.name}
        />
        {errors.name && (
          <p className="mt-1 text-xs text-red-600" role="alert">{errors.name.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="su-email" className="label">Email or Phone</label>
        <input
          id="su-email"
          type="text"
          autoComplete="username"
          className="input"
          placeholder="you@example.com or +1234567890"
          {...register('email')}
          aria-invalid={!!errors.email}
        />
        {errors.email && (
          <p className="mt-1 text-xs text-red-600" role="alert">{errors.email.message}</p>
        )}
      </div>

      {/* Roll number only for students */}
      {role === 'student' && (
        <div>
          <label htmlFor="su-roll" className="label">Roll Number</label>
          <input
            id="su-roll"
            type="text"
            className="input"
            placeholder="e.g. CS2024001"
            {...register('roll_number')}
            aria-invalid={!!errors.roll_number}
          />
          {errors.roll_number && (
            <p className="mt-1 text-xs text-red-600" role="alert">{errors.roll_number.message}</p>
          )}
        </div>
      )}

      <div>
        <label htmlFor="su-password" className="label">Password</label>
        <div className="relative">
          <input
            id="su-password"
            type={showPw ? 'text' : 'password'}
            autoComplete="new-password"
            className="input pr-10"
            placeholder="Min 8 characters"
            {...register('password')}
            aria-invalid={!!errors.password}
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            onClick={() => setShowPw((p) => !p)}
            aria-label={showPw ? 'Hide password' : 'Show password'}
          >
            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.password && (
          <p className="mt-1 text-xs text-red-600" role="alert">{errors.password.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="su-confirm" className="label">Confirm Password</label>
        <div className="relative">
          <input
            id="su-confirm"
            type={showConfirm ? 'text' : 'password'}
            autoComplete="new-password"
            className="input pr-10"
            placeholder="Repeat password"
            {...register('confirm_password')}
            aria-invalid={!!errors.confirm_password}
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            onClick={() => setShowConfirm((p) => !p)}
            aria-label={showConfirm ? 'Hide' : 'Show'}
          >
            {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.confirm_password && (
          <p className="mt-1 text-xs text-red-600" role="alert">{errors.confirm_password.message}</p>
        )}
      </div>

      {/* No-verification notice */}
      <div className="flex items-start gap-2 rounded-lg bg-green-50 border border-green-100 px-3 py-2.5 text-xs text-green-700">
        <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
        Account is activated instantly — no email verification needed.
      </div>

      <button type="submit" className="btn-primary w-full py-2.5 mt-1" disabled={isPending}>
        {isPending && <Spinner className="h-4 w-4" />}
        Create Account
      </button>
    </form>
  )
}
