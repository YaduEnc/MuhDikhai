import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithGoogle } from '../services/authService';
import './SignIn.css';

function SignIn() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);

    try {
      await signInWithGoogle();
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Sign in failed');
      console.error('Sign in error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signin-container">
      <div className="signin-card">
        <div className="logo">PlasticWorld</div>
        <h1>Welcome Back</h1>
        <p>Sign in to continue to your secure messaging</p>

        {error && <div className="error-message">{error}</div>}

        <button
          className="btn-google"
          onClick={handleGoogleSignIn}
          disabled={loading}
        >
          {loading ? 'Signing in...' : 'Sign in with Google'}
        </button>

        <div className="signin-footer">
          <p>By signing in, you agree to our Terms of Service</p>
        </div>
      </div>
    </div>
  );
}

export default SignIn;
