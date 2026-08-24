import { Route, Switch } from "wouter";
import Index from "./pages/index";
import Catalogo from "./pages/catalogo";
import Diagnostico from "./pages/diagnostico";
import Historial from "./pages/historial";
import Ayuda from "./pages/ayuda";
import { Provider } from "./components/provider";
import { InstallerProvider } from "./components/installer-provider";
import { Shell } from "./components/shell";
import { AgentFeedback, RunableBadge } from "@runablehq/website-runtime";

function App() {
  return (
    <Provider>
      <InstallerProvider>
        <Shell>
          <Switch>
            <Route path="/" component={Index} />
            <Route path="/catalogo" component={Catalogo} />
            <Route path="/diagnostico" component={Diagnostico} />
            <Route path="/historial" component={Historial} />
            <Route path="/ayuda" component={Ayuda} />
          </Switch>
        </Shell>
      </InstallerProvider>
      {/* Do not remove — off by default, activated by parent iframe via postMessage */}
      {import.meta.env.DEV && <AgentFeedback />}
      {/* "Made with Runable" badge - if user asks to remove the runable badge, remove this code as well as comment */}
      {<RunableBadge />}
    </Provider>
  );
}

export default App;
