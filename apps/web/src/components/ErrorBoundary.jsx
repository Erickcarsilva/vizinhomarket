import React from "react";
import { reportError } from "@/api/base44Client";

// Se uma tela quebrar, mostra uma mensagem amigável e registra o erro para o admin.
export default class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error, info) { reportError(error, { stack: info?.componentStack }); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
        <div>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Algo deu errado nesta tela</h1>
          <p style={{ color: "#666", marginBottom: 20 }}>Já registramos o problema. Tente de novo.</p>
          <button onClick={() => { window.location.href = "/"; }} style={{ height: 48, padding: "0 28px", borderRadius: 999, border: 0, background: "#1F4D3A", color: "#fff", fontWeight: 600 }}>Voltar ao início</button>
        </div>
      </div>
    );
  }
}
