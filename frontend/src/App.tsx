import WorkoutGeneratorPage from "./pages/WorkoutGeneratorPage.js";
import { AccountProvider } from "./context/AccountContext.js";
export default function App() {
  return <AccountProvider><WorkoutGeneratorPage /></AccountProvider>;
}
