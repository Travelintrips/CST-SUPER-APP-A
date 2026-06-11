import { Route, Switch, Redirect } from "wouter";
import { isLoggedIn } from "./lib/auth";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import DevicePage from "./pages/DevicePage";
import ApiKeysPage from "./pages/ApiKeysPage";
import DocsPage from "./pages/DocsPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn()) return <Redirect to="/wa-gateway/login" />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Switch>
      <Route path="/wa-gateway/login" component={LoginPage} />
      <Route path="/wa-gateway/register" component={RegisterPage} />
      <Route path="/wa-gateway/devices/:id">
        {(params) => (
          <RequireAuth>
            <DevicePage id={Number(params.id)} />
          </RequireAuth>
        )}
      </Route>
      <Route path="/wa-gateway/apikeys">
        <RequireAuth><ApiKeysPage /></RequireAuth>
      </Route>
      <Route path="/wa-gateway/docs">
        <RequireAuth><DocsPage /></RequireAuth>
      </Route>
      <Route path="/wa-gateway/">
        <RequireAuth><DashboardPage /></RequireAuth>
      </Route>
      <Route path="/wa-gateway">
        <Redirect to="/wa-gateway/" />
      </Route>
      <Route>
        <Redirect to="/wa-gateway/" />
      </Route>
    </Switch>
  );
}
