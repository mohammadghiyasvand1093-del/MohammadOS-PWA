import React from "react";
import { logger } from "../utils/logger";

/**
 * Global Error Boundary
 *
 * Prevents the entire React application from crashing
 * when an unexpected rendering error occurs.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error, errorInfo) {
    try {
      logger.error({
        source: "ErrorBoundary",
        message: "Global rendering error caught",
        stack: error.stack,
        context: { componentStack: errorInfo.componentStack },
      });
    } catch {
      // If logger itself fails, fallback to console
      console.error("Global Error Boundary:", error);
      console.error(errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            flexDirection: "column",
            padding: "24px",
            textAlign: "center",
            backgroundColor: "#0f172a",
            color: "#e2e8f0",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <h1 style={{ fontSize: "1.5rem", fontWeight: "bold", marginBottom: "12px", color: "#f59e0b" }}>
            ⚠️ خطای غیرمنتظره
          </h1>

          <p style={{ fontSize: "0.875rem", color: "#94a3b8", marginBottom: "24px", maxWidth: "400px" }}>
            مشکلی در سیستم رخ داد. لطفاً صفحه را دوباره بارگذاری کنید.
          </p>

          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 24px",
              borderRadius: "8px",
              border: "1px solid #f59e0b",
              backgroundColor: "rgba(245, 158, 11, 0.1)",
              color: "#f59e0b",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontFamily: "monospace",
            }}
          >
            ↻ بارگذاری مجدد سیستم
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;