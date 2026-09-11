import { Routes, Route } from "react-router-dom";
import { SessionListPage } from "./routes/SessionListPage";
import { SessionViewPage } from "./routes/SessionViewPage";
import { SignInPage } from "./routes/SignInPage";
import { SignUpPage } from "./routes/SignUpPage";
import { ProtectedRoute } from "./components/ProtectedRoute";

function App() {
  return (
    <Routes>
      <Route path="/signin" element={<SignInPage />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <SessionListPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/session/:sessionId"
        element={
          <ProtectedRoute>
            <SessionViewPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;
