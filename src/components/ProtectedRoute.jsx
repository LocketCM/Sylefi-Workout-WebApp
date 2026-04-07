import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

// Wraps a route to require login. Optionally requires the coach role.
// Usage:
//   <ProtectedRoute><CoachDashboard /></ProtectedRoute>
//   <ProtectedRoute requireCoach><Clients /></ProtectedRoute>
export default function ProtectedRoute({ children, requireCoach = false }) {
  const { user, isCoach, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (requireCoach && !isCoach) return <Navigate to="/" replace />;

  return children;
}
