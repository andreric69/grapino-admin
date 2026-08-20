import { useState } from 'react';
import { getToken } from './lib/apiClient';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';

export function App() {
  const [loggedIn, setLoggedIn] = useState(() => !!getToken());

  if (!loggedIn) {
    return <LoginPage onLoggedIn={() => setLoggedIn(true)} />;
  }
  return <DashboardPage onLoggedOut={() => setLoggedIn(false)} />;
}
