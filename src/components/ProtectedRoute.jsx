import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

// Wraps a route to require login. Optionally requires the coach role.
// Usage:
//   <ProtectedRoute><CoachDashboard /></ProtectedRoute>          → client area, sends to /signin
//   <ProtectedRoute requireCoach><Clients /></ProtectedRoute>    → coach area, sends to /login
export default function ProtectedRoute({ children, requireCoach = false }) {
  const { user, isCoach, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Coach routes bounce to the coach login; client routes bounce to the
  // returning-client sign-in page (where they enter their permanent code).
  if (!user) return <Navigate to={requireCoach ? '/login' : '/signin'} replace />;
  if (requireCoach && !isCoach) return <Navigate to="/" replace />;

  return children;
}
