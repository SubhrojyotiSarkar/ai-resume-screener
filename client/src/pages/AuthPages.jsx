import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { getErrorMessage, getFieldErrors } from '../api/client.js';
import { Button } from '../components/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';

function AuthCard({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mb-6 flex items-center gap-2 text-lg font-semibold text-slate-900">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-600 text-sm text-white">RS</span>
        Resume Screener
      </div>
      <div className="card w-full max-w-sm p-6 sm:p-8">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>
      <p className="mt-6 text-sm text-slate-600">{footer}</p>
    </div>
  );
}

function Field({ id, label, error, ...inputProps }) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <input
        id={id}
        name={id}
        className={`input ${error ? 'input-error' : ''}`}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...inputProps}
      />
      {error && <p id={`${id}-error`} className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

/** Shared submit handling: server field errors go under inputs, other errors in a banner. */
function useAuthForm(submit) {
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event, values) {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});
    setFormError('');
    try {
      await submit(values);
    } catch (error) {
      const fields = getFieldErrors(error);
      setErrors(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v[0]])));
      if (Object.keys(fields).length === 0) setFormError(getErrorMessage(error));
      setSubmitting(false);
    }
  }

  return { errors, formError, submitting, handleSubmit };
}

function FormError({ message }) {
  if (!message) return null;
  return (
    <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
      {message}
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState({ email: '', password: '' });
  const { errors, formError, submitting, handleSubmit } = useAuthForm(async (v) => {
    await login(v);
    navigate(location.state?.from?.pathname ?? '/', { replace: true });
  });

  const set = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }));

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Log in to review your candidates."
      footer={
        <>
          New here? <Link to="/register" className="font-medium text-indigo-600 hover:text-indigo-500">Create an account</Link>
        </>
      }
    >
      <form onSubmit={(e) => handleSubmit(e, values)} className="space-y-4" noValidate>
        <FormError message={formError} />
        <Field id="email" label="Email" type="email" autoComplete="email" required value={values.email} onChange={set('email')} error={errors.email} />
        <Field id="password" label="Password" type="password" autoComplete="current-password" required value={values.password} onChange={set('password')} error={errors.password} />
        <Button type="submit" loading={submitting} className="w-full">Log in</Button>
      </form>
    </AuthCard>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const { errors, formError, submitting, handleSubmit } = useAuthForm(async (v) => {
    await register(v);
    navigate('/', { replace: true });
  });

  const set = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }));

  return (
    <AuthCard
      title="Create your account"
      subtitle="Post jobs and rank candidates in minutes."
      footer={
        <>
          Already have an account? <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500">Log in</Link>
        </>
      }
    >
      <form onSubmit={(e) => handleSubmit(e, values)} className="space-y-4" noValidate>
        <FormError message={formError} />
        <Field id="name" label="Full name" autoComplete="name" required value={values.name} onChange={set('name')} error={errors.name} />
        <Field id="email" label="Work email" type="email" autoComplete="email" required value={values.email} onChange={set('email')} error={errors.email} />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={values.password}
          onChange={set('password')}
          error={errors.password}
          placeholder="At least 8 characters"
        />
        <Button type="submit" loading={submitting} className="w-full">Create account</Button>
      </form>
    </AuthCard>
  );
}
