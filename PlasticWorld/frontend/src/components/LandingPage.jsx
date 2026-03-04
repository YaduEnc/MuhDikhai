import { Link } from 'react-router-dom';
import { isAuthenticated } from '../services/authService';
import './LandingPage.css';

function LandingPage() {
  const authenticated = isAuthenticated();

  return (
    <div className="app">
      <header className="header">
        <div className="container">
          <div className="logo">PlasticWorld</div>
          <nav className="nav">
            <a href="#features">Features</a>
            <a href="#about">About</a>
            {authenticated ? (
              <Link to="/dashboard" className="btn-primary">
                Dashboard
              </Link>
            ) : (
              <Link to="/signin" className="btn-primary">
                Get Started
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="main">
        <section className="hero">
          <div className="container">
            <h1 className="hero-title">
              Secure Messaging
              <br />
              <span className="accent">Reimagined</span>
            </h1>
            <p className="hero-description">
              End-to-end encrypted conversations with real-time delivery.
              Built for privacy, designed for simplicity.
            </p>
            <div className="hero-actions">
              {authenticated ? (
                <Link to="/dashboard" className="btn-black">
                  Go to Dashboard
                </Link>
              ) : (
                <>
                  <Link to="/signin" className="btn-black">
                    Start Messaging
                  </Link>
                  <button className="btn-outline">Learn More</button>
                </>
              )}
            </div>
          </div>
        </section>

        <section className="features" id="features">
          <div className="container">
            <div className="features-grid">
              <div className="feature-card">
                <div className="feature-icon">🔐</div>
                <h3>End-to-End Encryption</h3>
                <p>Your messages are encrypted before they leave your device</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">⚡</div>
                <h3>Real-Time Delivery</h3>
                <p>Instant messaging with WebSocket technology</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">🔒</div>
                <h3>Privacy First</h3>
                <p>We never see your messages. Ever.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="about" id="about">
          <div className="container">
            <h2 className="section-title">Built for Developers</h2>
            <p className="section-description">
              Open-source backend API ready to power your messaging application.
              Production-ready, scalable, and secure.
            </p>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container">
          <p>&copy; 2024 PlasticWorld. Open Source.</p>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
