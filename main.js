"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
var react_1 = require("react");
var client_1 = require("react-dom/client");
var App_1 = require("./App");
var apiClient_1 = require("./services/apiClient");
require("./styles.css");
var rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('Root element not found');
}
var defaultApiBaseUrl = (_a = window.__AACP_API_BASE_URL__) !== null && _a !== void 0 ? _a : '';
(0, apiClient_1.setApiBaseUrl)(defaultApiBaseUrl);
client_1.default.createRoot(rootElement).render(<react_1.default.StrictMode>
    <App_1.App />
  </react_1.default.StrictMode>);
