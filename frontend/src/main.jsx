import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

const originalRemoveChild = Node.prototype.removeChild;
Node.prototype.removeChild = function removeChild(child) {
  if (child.parentNode !== this) return child;
  return originalRemoveChild.call(this, child);
};

const originalInsertBefore = Node.prototype.insertBefore;
Node.prototype.insertBefore = function insertBefore(newNode, referenceNode) {
  if (referenceNode && referenceNode.parentNode !== this) return newNode;
  return originalInsertBefore.call(this, newNode, referenceNode);
};

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
