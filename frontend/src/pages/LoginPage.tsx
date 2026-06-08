import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { GraduationCap, Shield, BookOpen, User, Building2, Eye, EyeOff, ArrowLeft } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import { useLogin } from '../hooks/useAuth'
import { useAuthStore } from '../store/authStore'
import { Spinner } from '../components/ui/Spinner'
import { cn } from '../lib/utils'
import api from '../lib/api'
import type { User as UserType } from '../types'

type RoleKey = 'org_admin' | 'college_admin' | 'professor' | 'student'
type Mode = 'signin' | 'signup'

const ROLES = [
  {
    key: 'org_admin' as RoleKey,
    label: 'Organisation Admin',
    sublabel: 'Platform / Service Provider',
    icon: Shield,
    iconBg: 'bg-violet-100', iconColor: 'text-violet-700',
    border: 'border-violet-200 hover:border-violet-400',
    btnClass: 'bg-violet-600 hover:bg-violet-700 text-white',
    outlineClass: 'border-violet-300 text-violet-700 hover:bg-violet-50',
    headingColor: 'text-violet-700',
    canSignup: true,
  },
  {
    key: 'college_admin' as RoleKey,
    label: 'College Admin',
    sublabel: 'Manages one college',
    icon: Building2,
    iconBg: 'bg-blue-100', iconColor: 'text-blue-700',
    border: 'border-blue-200 hover:border-blue-400',
    btnClass: 'bg-blue-600 hover:bg-blue-700 text-white',
    outlineClass: '',
    headingColor: 'text-blue-700',
    canSignup: false,
  },
  {
    key: 'professor' as RoleKey,
    label: 'Professor',
    sublabel: 'Faculty member',
    icon: BookOpen,
    iconBg: 'bg-emerald-100', iconColor: 'text-emerald-700',
    border: 'border-emerald-200 hover:border-emerald-400',
    btnClass: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    outlineClass: '',
    headingColor: 'text-emerald-700',
    canSignup: false,
  },
  {
    key: 'student' as RoleKey,
    label: 'Student',
    sublabel: 'Enrolled learner',
    icon: User,
    iconBg: 'bg-orange-100', iconColor: 'text-orange-700',
    border: 'border-orange-200 hover:border-orange-400',
    btnClass: 'bg-orange-600 hover:bg-orange-700 text-white',
    outlineClass: '',
    headingColor: 'text-orange-700',
    canSignup: false,
  },
]

const signinSchema = z.object({
  email: z.string().min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
})
const signupSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Min 8 characters'),
  confirm_password: z.string().min(1, 'Confirm your password'),
}).refine(d => d.password === d.confirm_password, { message: "Passwords don't match", path: ['confirm_password'] })

type SigninForm = z.infer<typeof signinSchema>
type SignupForm = z.infer<typeof signupSchema>

export default function LoginPage() {
  const [selectedRole, setSelectedRole] = useState<RoleKey | null>(null)
  const [mode, setMode] = useState<Mode>('signin')
  const role = ROLES.find(r => r.key === selectedRole)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-primary-50 flex flex-col">
      <header className="flex items-center gap-3 px-6 py-5 border-b border-gray-100 bg-white/80 backdrop-blur-sm">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600 shadow-sm">
          <GraduationCap className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-base font-bold text-gray-900">AI Academic Platform</p>
          <p className="text-[11px] text-gray-400 leading-none">Powered by Gemini 2.5 Flash</p>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-3xl">

          {/* Role selection */}
          {!selectedRole && (
            <div className="space-y-8">
              <div className="text-center">
                <h1 className="text-3xl font-bold text-gray-900">Welcome</h1>
                <p className="mt-2 text-sm text-gray-500">Choose your role to continue</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {ROLES.map(r => (
                  <div key={r.key}
                    className={cn('flex flex-col rounded-2xl border-2 bg-white p-5 shadow-sm transition-all hover:shadow-md', r.border)}>
                    <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', r.iconBg)}>
                      <r.icon className={cn('h-5 w-5', r.iconColor)} />
                    </div>
                    <div className="mt-3 flex-1">
                      <p className={cn('font-semibold text-sm', r.headingColor)}>{r.label}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{r.sublabel}</p>
                    </div>
                    <div className="mt-4 flex flex-col gap-2">
                      <button onClick={() => { setSelectedRole(r.key); setMode('signin') }}
                        className={cn('w-full rounded-lg py-2 text-xs font-semibold transition-colors', r.btnClass)}>
                        Sign In
                      </button>
                      {r.canSignup && (
                        <button onClick={() => { setSelectedRole(r.key); setMode('signup') }}
                          className={cn('w-full rounded-lg border py-2 text-xs font-semibold transition-colors', r.outlineClass)}>
                          Create Account
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-center text-xs text-gray-400">
                College Admin, Professor and Student accounts are created by authorised admins.
              </p>
            </div>
          )}

          {/* Form */}
          {selectedRole && role && (
            <div className="mx-auto max-w-sm">
              <button onClick={() => setSelectedRole(null)}
                className="mb-6 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', role.iconBg)}>
                    <role.icon className={cn('h-5 w-5', role.iconColor)} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      {mode === 'signup' ? 'Create Account' : 'Sign In'}
                    </h2>
                    <p className={cn('text-sm font-medium', role.headingColor)}>{role.label}</p>
                  </div>
                </div>

                {mode === 'signin'
                  ? <SignInForm btnClass={role.btnClass} />
                  : <OrgAdminSignupForm btnClass={role.btnClass} />}

                {role.canSignup && (
                  <div className="mt-5 pt-4 border-t border-gray-100 text-center text-sm text-gray-500">
                    {mode === 'signin' ? (
                      <>Don't have an account?{' '}
                        <button onClick={() => setMode('signup')}
                          className="font-semibold text-primary-600 hover:underline">Create one</button></>
                    ) : (
                      <>Already have an account?{' '}
                        <button onClick={() => setMode('signin')}
                          className="font-semibold text-primary-600 hover:underline">Sign in</button></>
                    )}
                  </div>
                )}
                {!role.canSignup && (
                  <p className="mt-5 text-center text-xs text-gray-400">
                    Contact your administrator for credentials.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function SignInForm({ btnClass }: { btnClass: string }) {
  const { mutate: login, isPending } = useLogin()
  const [showPw, setShowPw] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<SigninForm>({ resolver: zodResolver(signinSchema) })

  return (
    <form onSubmit={handleSubmit(d => login(d))} className="space-y-4" noValidate>
      <div>
        <label className="label">Email</label>
        <input type="email" className="input" autoComplete="username" placeholder="you@email.com" {...register('email')} />
        {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
      </div>
      <div>
        <label className="label">Password</label>
        <div className="relative">
          <input type={showPw ? 'text' : 'password'} className="input pr-10" autoComplete="current-password"
            placeholder="••••••••" {...register('password')} />
          <button type="button" onClick={() => setShowPw(p => !p)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            aria-label={showPw ? 'Hide' : 'Show'}>
            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
      </div>
      <button type="submit" disabled={isPending}
        className={cn('w-full rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-2 transition-colors mt-2', btnClass)}>
        {isPending && <Spinner className="h-4 w-4" />} Sign In
      </button>
    </form>
  )
}

function OrgAdminSignupForm({ btnClass }: { btnClass: string }) {
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()
  const [showPw, setShowPw] = useState(false)
  const [showCf, setShowCf] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<SignupForm>({ resolver: zodResolver(signupSchema) })

  const signup = useMutation({
    mutationFn: async (d: SignupForm) => {
      const res = await api.post('/auth/org/signup', { name: d.name, email: d.email, password: d.password })
      return res.data as { access_token: string; user: UserType }
    },
    onSuccess: ({ access_token, user }) => {
      setAuth(user, access_token)
      toast.success(`Welcome, ${user.name}!`)
      navigate('/org')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Signup failed'),
  })

  return (
    <form onSubmit={handleSubmit(d => signup.mutate(d))} className="space-y-4" noValidate>
      <div>
        <label className="label">Full Name</label>
        <input type="text" className="input" autoComplete="name" placeholder="Jane Smith" {...register('name')} />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
      </div>
      <div>
        <label className="label">Email</label>
        <input type="email" className="input" autoComplete="username" placeholder="admin@platform.com" {...register('email')} />
        {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
      </div>
      <div>
        <label className="label">Password</label>
        <div className="relative">
          <input type={showPw ? 'text' : 'password'} className="input pr-10" autoComplete="new-password"
            placeholder="Min 8 characters" {...register('password')} />
          <button type="button" onClick={() => setShowPw(p => !p)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
      </div>
      <div>
        <label className="label">Confirm Password</label>
        <div className="relative">
          <input type={showCf ? 'text' : 'password'} className="input pr-10" autoComplete="new-password"
            placeholder="Repeat password" {...register('confirm_password')} />
          <button type="button" onClick={() => setShowCf(p => !p)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            {showCf ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.confirm_password && <p className="mt-1 text-xs text-red-600">{errors.confirm_password.message}</p>}
      </div>
      <button type="submit" disabled={signup.isPending}
        className={cn('w-full rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-2 transition-colors mt-2', btnClass)}>
        {signup.isPending && <Spinner className="h-4 w-4" />} Create Account
      </button>
    </form>
  )
}
