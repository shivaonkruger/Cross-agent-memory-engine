import { Routes, Route } from "react-router-dom";
import { SessionListPage } from "./routes/SessionListPage";
import { SessionViewPage } from "./routes/SessionViewPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<SessionListPage />} />
      <Route path="/session/:sessionId" element={<SessionViewPage />} />
    </Routes>
  );
}

export default App;
