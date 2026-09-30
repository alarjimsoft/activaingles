import React from "react";
import ReactDOM from "react-dom/client";

import "./index.css";

import AppRouter from "./router/AppRouter";
import OfflineBanner from "./components/ui/OfflineBanner";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OfflineBanner />
    <AppRouter />
  </React.StrictMode>,
);
