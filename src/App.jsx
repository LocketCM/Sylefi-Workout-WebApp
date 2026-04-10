import { HashRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/lib/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import CoachLayout from '@/components/CoachLayout';
import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import JoinPage from '@/pages/JoinPage';
import ClientSignIn from '@/pages/ClientSignIn';
import CoachDashboard from '@/pages/CoachDashboard';
import Clients from '@/pages/Clients';
import Exercises from '@/pages/Exercises';
import Programs from '@/pages/Programs';
import NewProgram from '@/pages/NewProgram';
import ProgramEditor from '@/pages/ProgramEditor';
import ComingSoon from '@/pages/ComingSoon';
import ClientDashboard from '@/pages/ClientDashboard';
import ClientSettings from '@/pages/ClientSettings';
import CoachSettings from '@/pages/CoachSettings';
import WorkoutSession from '@/pages/WorkoutSession';
import CoachLogWorkout from '@/pages/CoachLogWorkout';
import WorkoutHistory from '@/pages/WorkoutHistory';
import Activity from '@/pages/Activity';
import Messages from '@/pages/Messages';
import ClientMessages from '@/pages/ClientMessages';
import ViewAsClient from '@/pages/ViewAsClient';

// Using HashRouter so GitHub Pages doesn't need a 404.html redirect trick.
// URLs will look like /#/coach, /#/login, etc. — works reliably on static hosts.
export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/join"   element={<JoinPage />} />
          <Route path="/signin" element={<ClientSignIn />} />

          {/* All coach pages share the sidebar shell + require admin role */}
          <Route
            element={
              <ProtectedRoute requireCoach>
                <CoachLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/coach"                 element={<CoachDashboard />} />
            <Route path="/coach/clients"         element={<Clients />} />
            <Route path="/coach/programs"        element={<Programs />} />
            <Route path="/coach/programs/new"    element={<NewProgram />} />
            <Route path="/coach/programs/:id"    element={<ProgramEditor />} />
            <Route path="/coach/exercises"       element={<Exercises />} />
            <Route path="/coach/clients/:clientId/history" element={<WorkoutHistory />} />
            <Route path="/coach/clients/:clientId/log/:workoutId" element={<CoachLogWorkout />} />
            <Route path="/coach/messages"        element={<Messages />} />
            <Route path="/coach/activity"        element={<Activity />} />
            <Route path="/coach/settings"        element={<CoachSettings />} />
            <Route path="/coach/view-as"             element={<ViewAsClient />} />
            <Route path="/coach/view-as/:clientId"   element={<ViewAsClient />} />
          </Route>

          <Route
            path="/client"
            element={
              <ProtectedRoute>
                <ClientDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/client/workout/:workoutId"
            element={
              <ProtectedRoute>
                <WorkoutSession />
              </ProtectedRoute>
            }
          />
          <Route
            path="/client/history"
            element={
              <ProtectedRoute>
                <WorkoutHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/client/messages"
            element={
              <ProtectedRoute>
                <ClientMessages />
              </ProtectedRoute>
            }
          />
          <Route
            path="/client/settings"
            element={
              <ProtectedRoute>
                <ClientSettings />
              </ProtectedRoute>
            }
          />
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}
